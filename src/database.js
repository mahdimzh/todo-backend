const { MongoClient } = require('mongodb');
const config = require('config');

const database = module.exports;

const DB_HOST = config.get('dbConfig.host');
const MONGOPORT = config.get('dbConfig.port');
const MONGO_COLLECTION = config.get('dbConfig.dbCollection');
const MONGO_URI = `mongodb://${DB_HOST}:${MONGOPORT}/${MONGO_COLLECTION}`;

database.connect = async function connect() {
  database.client = await MongoClient.connect(MONGO_URI, { useUnifiedTopology: true });
};
