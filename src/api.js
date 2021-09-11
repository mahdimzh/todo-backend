const express = require('express');
const { v4: generateId } = require('uuid');
const database = require('./database');

const app = express();

const COMPLETE_TASK_ACTION = 'COMPLETE_TASK'
const SET_DUE_TO_DATE_ACTION = 'SET_DUE_TO_DATE'
const REORDER_ACTION = 'REORDER'

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

app.get('/', async (req, res) => {
  const { pageNumber, nPerPage } = req.query;
  const todos = database.client.db('todos').collection('todos');
  const cursor = await todos
    .find({})
    .sort({ seq: 1 })
    .skip(parseInt(pageNumber) > 0 ? ((pageNumber - 1) * parseInt(nPerPage)) : 0)
    .limit(parseInt(nPerPage));
  //  .lean();

  res.status(200);
  res.json({
    data: await cursor.toArray(),
    count: await cursor.count() // this will give count of all the documents before .skip() and limit()

  });
});

app.post('/', async (req, res) => {
  const { text } = req.body;

  if (typeof text !== 'string') {
    res.status(400);
    res.json({ message: "invalid 'text' expected string" });
    return;
  }
  const maxSeq = await database.client.db('todos').collection('todos').find().sort({ "seq": -1 }).limit(1).toArray();

  const todo = { id: generateId(), text, completed: false, seq: maxSeq.length > 0 ? maxSeq[0].seq + 1 : 1 };

  await database.client.db('todos').collection('todos').insertOne(todo);
  res.status(201);
  res.json(todo);
});

app.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { action } = req.body;
  if (action === COMPLETE_TASK_ACTION) {
    const { completed } = req.body;
    if (typeof completed !== 'boolean') {
      res.status(400);
      res.json({ message: "invalid 'completed' expected boolean" });
      return;
    }
    await database.client.db('todos').collection('todos').updateOne({ id },
      { $set: { completed } });
    res.status(200);
    res.end();

  } else if (action === SET_DUE_TO_DATE_ACTION) {
    const { dueDate } = req.body;
    console.log(dueDate)
    await database.client.db('todos').collection('todos').updateOne({ id },
      { $set: { dueDate } });
    res.status(200);
    res.end();

  } else if (action === REORDER_ACTION) {

  } else {
    res.status(400);
    res.json({ message: "action is not defined" });
  }


});

app.post('/reorder', async (req, res) => {
  const { sourceId, destinationId } = req.body;

  const query = {
    $or: [
      { id: sourceId },
      { id: destinationId },
    ],
  };

  const reorderList = await database.client.db('todos').collection('todos').find(query).toArray();
  if (reorderList.length === 2) {
    await database.client.db('todos').collection('todos').updateOne({ id: reorderList[0].id },
      { $set: { seq: reorderList[1].seq } });
    await database.client.db('todos').collection('todos').updateOne({ id: reorderList[1].id },
      { $set: { seq: reorderList[0].seq } });
  }

  res.status(200);
  res.json(reorderList);

  //res.end();
});

app.delete('/:id', async (req, res) => {
  const { id } = req.params;
  await database.client.db('todos').collection('todos').deleteOne({ id });
  res.status(203);
  res.end();
});

module.exports = app;
