const express = require('express')
const { col, ObjectId } = require('../db/connection')
const { requireAuth } = require('../middleware/auth')
const { generateForTask } = require('../services/geminiService')
const { recordTokenUsage } = require('../services/tokenUsageService')
const { buildSummarizerSystemInstruction, sanitizeUserText } = require('../services/promptGuardService')

const router = express.Router()

// All conversation routes require auth
router.use(requireAuth)

// GET /api/conversations — list user's conversations (newest first, no messages)
router.get('/', async (req, res) => {
  const convs = await col('conversations')
    .find(
      { userId: req.user._id },
      {
        projection: {
          name: 1,
          chartData: 1,
          language: 1,
          compressedContext: 1,
          messageCount: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    )
    .sort({ updatedAt: -1 })
    .limit(50)
    .toArray()

  res.json({ conversations: convs })
})

// POST /api/conversations — create a new conversation
router.post('/', async (req, res) => {
  const { name, chartData, language } = req.body
  if (!chartData) {
    return res.status(400).json({ message: 'chartData is required' })
  }

  const now = new Date()
  const result = await col('conversations').insertOne({
    userId: req.user._id,
    name: (name || 'New Reading').trim(),
    chartData,
    language: language || 'en',
    messages: [],
    compressedContext: '',
    messageCount: 0,
    createdAt: now,
    updatedAt: now,
  })

  const conv = await col('conversations').findOne({ _id: result.insertedId })
  res.status(201).json({ conversation: conv })
})

// GET /api/conversations/:id — full conversation with messages
router.get('/:id', async (req, res) => {
  let oid
  try {
    oid = new ObjectId(req.params.id)
  } catch {
    return res.status(400).json({ message: 'Invalid conversation id' })
  }

  const conv = await col('conversations').findOne({ _id: oid, userId: req.user._id })
  if (!conv) return res.status(404).json({ message: 'Conversation not found' })

  res.json({ conversation: conv })
})

// PATCH /api/conversations/:id — rename
router.patch('/:id', async (req, res) => {
  let oid
  try {
    oid = new ObjectId(req.params.id)
  } catch {
    return res.status(400).json({ message: 'Invalid conversation id' })
  }

  const { name } = req.body
  if (!name?.trim()) return res.status(400).json({ message: 'name is required' })

  const result = await col('conversations').findOneAndUpdate(
    { _id: oid, userId: req.user._id },
    { $set: { name: name.trim(), updatedAt: new Date() } },
    { returnDocument: 'after' },
  )
  if (!result) return res.status(404).json({ message: 'Conversation not found' })

  res.json({ conversation: result })
})

// DELETE /api/conversations/:id
router.delete('/:id', async (req, res) => {
  let oid
  try {
    oid = new ObjectId(req.params.id)
  } catch {
    return res.status(400).json({ message: 'Invalid conversation id' })
  }

  const result = await col('conversations').deleteOne({ _id: oid, userId: req.user._id })
  if (result.deletedCount === 0) return res.status(404).json({ message: 'Conversation not found' })

  res.json({ ok: true })
})

// POST /api/conversations/:id/messages — append a user+assistant message pair
router.post('/:id/messages', async (req, res) => {
  let oid
  try {
    oid = new ObjectId(req.params.id)
  } catch {
    return res.status(400).json({ message: 'Invalid conversation id' })
  }

  const { userMessage, assistantMessage } = req.body
  if (!userMessage || !assistantMessage) {
    return res.status(400).json({ message: 'userMessage and assistantMessage are required' })
  }

  const now = new Date()
  const newMessages = [
    { role: 'user', content: userMessage, timestamp: now },
    {
      role: 'assistant',
      summary: assistantMessage.summary,
      clearExplanation: assistantMessage.clearExplanation || '',
      detailedExplanation: assistantMessage.detailedExplanation,
      timestamp: now,
    },
  ]

  const conv = await col('conversations').findOne({ _id: oid, userId: req.user._id })
  if (!conv) return res.status(404).json({ message: 'Conversation not found' })

  const updatedMessages = [...(conv.messages || []), ...newMessages]
  const newCount = updatedMessages.length / 2 // pairs

  // Re-compress context every 5 exchanges (10 messages) or on first message
  let compressedContext = conv.compressedContext || ''
  if (newCount === 1 || newCount % 5 === 0) {
    compressedContext = await buildCompressedContext(
      updatedMessages,
      conv.chartData,
      conv.language,
      req.user._id,
      conv._id,
    )
  }

  await col('conversations').updateOne(
    { _id: oid },
    {
      $set: {
        messages: updatedMessages,
        compressedContext,
        messageCount: Math.floor(updatedMessages.length / 2),
        updatedAt: now,
      },
    },
  )

  res.json({ ok: true, compressedContext })
})

async function buildCompressedContext(messages, chartData, language, userId, conversationId) {
  if (!messages || messages.length === 0) return ''

  const recentPairs = messages.slice(-10) // last 5 exchanges
  const lines = recentPairs.map((m) => {
    if (m.role === 'user') return `User: ${m.content}`
    return `Astrologer: ${m.summary || ''}`
  })

  const traditionId = chartData?.system || 'Vedic / Jyotish'
  const prompt = [
    `Summarise this ${traditionId} reading conversation in 3-4 sentences, capturing KEY chart-based insights only.`,
    'This summary helps continue the same reading in the same tradition.',
    'Be concise — max 250 words.',
    '',
    sanitizeUserText(lines.join('\n'), 3000),
  ].join('\n')

  try {
    const result = await generateForTask('summary', prompt, {
      systemInstruction: buildSummarizerSystemInstruction(traditionId),
    })
    await recordTokenUsage({
      userId,
      task: 'summary',
      model: result.model,
      usage: result.usage,
      conversationId,
      source: 'conversation_summary',
    })
    return result.text.trim().slice(0, 600)
  } catch {
    // If Gemini fails, build a simple text fallback
    const userQuestions = recentPairs
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .join('; ')
    return `Topics discussed so far: ${userQuestions}`.slice(0, 400)
  }
}

module.exports = router
