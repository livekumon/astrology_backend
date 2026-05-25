const express = require('express')
const { ObjectId, col } = require('../db/connection')
const {
  signAdminToken,
  verifyAdminCredentials,
  requireAdmin,
} = require('../middleware/adminAuth')
const {
  getGlobalStats,
  listUsersWithStats,
  getUserConversations,
  getUserTokenBreakdown,
  getConversationTokenUsage,
} = require('../services/tokenUsageService')
const { getGeoStats } = require('../services/geoStatsService')

const router = express.Router()

router.post('/login', (req, res) => {
  const { email, password } = req.body
  if (!verifyAdminCredentials(email, password)) {
    return res.status(401).json({ message: 'Invalid admin credentials' })
  }
  res.json({
    token: signAdminToken(),
    admin: { email: String(email).toLowerCase().trim() },
  })
})

router.get('/me', requireAdmin, (req, res) => {
  res.json({ admin: req.admin })
})

router.get('/stats', requireAdmin, async (_req, res) => {
  const stats = await getGlobalStats()
  res.json(stats)
})

router.get('/users', requireAdmin, async (_req, res) => {
  const users = await listUsersWithStats()
  res.json({ users, count: users.length })
})

router.get('/geo-stats', requireAdmin, async (_req, res) => {
  const geoStats = await getGeoStats()
  res.json(geoStats)
})

router.get('/users/:id', requireAdmin, async (req, res) => {
  let oid
  try {
    oid = new ObjectId(req.params.id)
  } catch {
    return res.status(400).json({ message: 'Invalid user id' })
  }

  const user = await col('users').findOne({ _id: oid }, { projection: { password: 0 } })
  if (!user) return res.status(404).json({ message: 'User not found' })

  const [conversations, tokenBreakdown, conversationTokenUsage] = await Promise.all([
    getUserConversations(user._id),
    getUserTokenBreakdown(user._id),
    getConversationTokenUsage(user._id),
  ])

  const usersWithStats = await listUsersWithStats()
  const summary = usersWithStats.find((u) => String(u._id) === String(user._id))

  const conversationsWithUsage = conversations.map((conv) => ({
    ...conv,
    tokenUsage: conversationTokenUsage[String(conv._id)] || {
      totalTokens: 0,
      promptTokens: 0,
      outputTokens: 0,
      thinkingTokens: 0,
      requestCount: 0,
      cost: { costInr: 0, costUsd: 0, currency: 'INR' },
    },
  }))

  res.json({
    user: summary || user,
    conversations: conversationsWithUsage,
    tokenBreakdown,
  })
})

router.get('/users/:id/conversations', requireAdmin, async (req, res) => {
  let oid
  try {
    oid = new ObjectId(req.params.id)
  } catch {
    return res.status(400).json({ message: 'Invalid user id' })
  }

  const conversations = await getUserConversations(oid)
  res.json({ conversations })
})

router.get('/users/:id/tokens', requireAdmin, async (req, res) => {
  let oid
  try {
    oid = new ObjectId(req.params.id)
  } catch {
    return res.status(400).json({ message: 'Invalid user id' })
  }

  const tokenBreakdown = await getUserTokenBreakdown(oid)
  res.json(tokenBreakdown)
})

module.exports = router
