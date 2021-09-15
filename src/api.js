const express = require('express');
const { v4: generateId } = require('uuid');
const database = require('./database');
const moment = require('moment')
const { body, validationResult } = require('express-validator');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'user-service' },
  transports: [
    //
    // - Write all logs with level `error` and below to `error.log`
    // - Write all logs with level `info` and below to `combined.log`
    //
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}

const app = express();

const COMPLETE_TASK_ACTION = 'COMPLETE_TASK'
const SET_DUE_TO_DATE_ACTION = 'SET_DUE_TO_DATE'

function requestLogger(req, res, next) {
  res.once('finish', () => {
    const log = [req.method, req.path];
    if (req.body && Object.keys(req.body).length > 0) {
      log.push(JSON.stringify(req.body));
    }
    if (req.query && Object.keys(req.query).length > 0) {
      log.push(JSON.stringify(req.query));
    }
    log.push('->', res.statusCode);
    // eslint-disable-next-line no-console
    console.log(log.join(' '));
  });
  next();
}


app.use(requestLogger);
app.use(require('cors')());

app.use(express.json());
app.use(express.urlencoded({ extended: false }));


app.get('/',
  body('pageNumber').isEmpty(),
  body('nPerPage').isEmpty(),
//  body('sortOrder').isEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { pageNumber, nPerPage, query } = req.query;

    const queries = query.split(',');
    const todos = database.client.db('todos').collection('todos');
    let sort = {};
    let q = {}
    if (queries.includes('dueToday')) {
      let start = moment().set({ hour: 0, minute: 0, second: 0, millisecond: 0 }).toDate()
      let end = moment().set({ hour: 23, minute: 59, second: 59, millisecond: 999 }).toDate()

      q["dueDate"] = { '$gte': start, '$lt': end }
    }

    sort['seq'] = -1;//parseInt(sortOrder) === 1 || parseInt(sortOrder) === -1 ? parseInt(sortOrder) : -1;
    const cursor = await todos
      .find(q)
      .sort(sort)
      .skip(parseInt(pageNumber) > 0 ? ((pageNumber - 1) * parseInt(nPerPage)) : 0)
      .limit(parseInt(nPerPage) > 0 ? parseInt(nPerPage) : 20);
    //  .lean();

    res.status(200);
    res.json({
      data: await cursor.toArray(),
      count: await cursor.count() // this will give count of all the documents before .skip() and limit()

    });
  });

app.post('/',
  async (req, res) => {
    const { text } = req.body;

    if (typeof text !== 'string') {
      res.status(400);
      res.json({ message: "invalid 'text' expected string" });
      return;
    }

    const maxSeq = await database.client.db('todos').collection('todos').find().sort({ "seq": -1 }).limit(1).toArray();
    logger.log('info', "finding doc with max seq", maxSeq);

    const todo = { id: generateId(), text, completed: false, seq: maxSeq.length > 0 ? maxSeq[0].seq + 1 : parseFloat("1")  };

    await database.client.db('todos').collection('todos').insertOne(todo);
    res.status(201);
    res.json(todo);
  });

app.put('/:id',
  // body('id').isEmpty(),
  body('action').notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { action } = req.body;
    logger.log('info', "action is ", action);

    if (action === COMPLETE_TASK_ACTION) {
      const { completed } = req.body;
      if (typeof completed !== 'boolean') {
        res.status(400);
        res.json([{ msg: "invalid 'completed' expected boolean" }]);
        return;
      }
      logger.log('info', "completed is ", completed);

      await database.client.db('todos').collection('todos').updateOne({ id },
        { $set: { completed } });
      res.status(200);
      res.end();

    } else if (action === SET_DUE_TO_DATE_ACTION) {
      const { dueDate } = req.body;
      logger.log('info', "dueDate is ", dueDate);

      if (!moment(dueDate).isValid()) {
        res.status(400);
        res.json([{ msg: "Due date is not correct" }]);
        return;
      }
      await database.client.db('todos').collection('todos').updateOne({ id },
        { $set: { dueDate: moment(dueDate).toDate() } });
      res.status(200);
      res.end();

    } else {
      res.status(400);
      res.json([{ msg: "action is not defined" }]);
    }


  });

app.post('/reorder',
  body('sourceId').isEmpty(),
  body('destinationId').isEmpty(),
  async (req, res) => {
    const { sourceId, destinationId } = req.body;


    const source = await database.client.db('todos').collection('todos').findOne({ id: sourceId });
    const destincation = await database.client.db('todos').collection('todos').findOne({ id: destinationId });
    if(source && destincation) {
      let operand = source.seq >= destincation.seq ? '$lte' : '$gte';
   //   let operandValue = source.seq >= destincation.seq ? source.seq : destincation.seq;
     // let id1 = reorder[1].seq <= reorder[0].seq ? reorder[1].id : reorder[0].id;
      let seq = {};
      seq[operand] = destincation.seq
      let q = {};
      q["seq"] = seq
      
      const list = await database.client.db('todos').collection('todos').find(q).limit(2).toArray();
      if(list.length == 1 || list.length == 2) {
        let newSequence = list.length == 2 ? ((list[0].seq + list[1].seq) / 2) : (operand === '$gte' ? (list[0].seq + 1) : (list[0].seq - 1) )
        await database.client.db('todos').collection('todos').updateOne({ id: source.id },
          { $set: { seq: newSequence} });
    
      }

      logger.log('info', "reordering done");
      res.json({ message: "Done" });
      res.status(200);
      return;
    }

    logger.log('info', "an error happen in reordering");
    res.status(400);
    res.json({ message: "Item could not be found" });
  });

app.delete('/:id', async (req, res) => {
  const { id } = req.params;
  await database.client.db('todos').collection('todos').deleteOne({ id });
  logger.log('info', " deleting document with it ", id);

  res.status(203);
  res.end();
});

module.exports = app;
