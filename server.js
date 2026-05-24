require('dotenv').config()

const express = require('express')
const cors = require('cors')
const { connectDB } = require('./db/connection')
const chartRoutes = require('./routes/chart')
const chatRoutes = require('./routes/chat')
const authRoutes = require('./routes/auth')
const conversationRoutes = require('./routes/conversations')
const adminRoutes = require('./routes/admin')

const app = express()
const PORT = process.env.PORT || 3001
const ADMIN_URL = process.env.ADMIN_URL || 'http://localhost:5175'
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

app.use(
  cors({
    origin: [FRONTEND_URL, ADMIN_URL, 'http://localhost:5173', 'http://localhost:5175'],
    credentials: true,
  }),
)
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'jyotish-backend' })
})

app.use('/api/auth', authRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/conversations', conversationRoutes)
app.use('/api/chart', chartRoutes)
app.use('/api/chat', chatRoutes)

app.use((_req, res) => {
  res.status(404).json({ message: 'Route not found' })
})

async function start() {
  await connectDB()
  app.listen(PORT, () => {
    console.log(`Jyotish backend running on http://localhost:${PORT}`)
  })
}

start().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
