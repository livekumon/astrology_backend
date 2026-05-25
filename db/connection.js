const { MongoClient, ObjectId } = require('mongodb')

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017'
const DB_NAME = process.env.MONGO_DB || 'jyotish'

let client = null
let db = null

async function connectDB() {
  if (db) return db

  client = new MongoClient(MONGO_URI, {
    maxPoolSize: 10,
    minPoolSize: 2,
    maxIdleTimeMS: 30000,
    connectTimeoutMS: 5000,
    serverSelectionTimeoutMS: 5000,
  })

  await client.connect()
  db = client.db(DB_NAME)

  await ensureIndexes(db)

  console.log(`MongoDB connected → ${DB_NAME}`)
  return db
}

async function ensureIndexes(database) {
  const users = database.collection('users')
  await users.createIndex({ email: 1 }, { unique: true })
  await users.createIndex({ googleId: 1 }, { unique: true, sparse: true })

  const convs = database.collection('conversations')
  await convs.createIndex({ userId: 1, updatedAt: -1 })

  const usage = database.collection('token_usage')
  await usage.createIndex({ userId: 1, createdAt: -1 })
  await usage.createIndex({ createdAt: -1 })
}

function getDB() {
  if (!db) throw new Error('Database not connected. Call connectDB() first.')
  return db
}

function col(name) {
  return getDB().collection(name)
}

module.exports = { connectDB, getDB, col, ObjectId }
