const express = require('express')
const { getChatAnswer } = require('../services/chatService')
const { GeminiError } = require('../services/geminiService')
const { optionalAuth } = require('../middleware/auth')
const { sanitizeUserText, MAX_USER_QUESTION_LENGTH } = require('../services/promptGuardService')

const router = express.Router()

router.post('/', optionalAuth, async (req, res) => {
  const { question, chartContext, language, history, compressedContext } = req.body

  const safeQuestion = sanitizeUserText(question, MAX_USER_QUESTION_LENGTH)
  if (!safeQuestion) {
    return res.status(400).json({ message: 'question is required' })
  }

  try {
    const result = await getChatAnswer(
      safeQuestion,
      chartContext || {},
      language ?? chartContext?.language ?? 'en',
      Array.isArray(history) ? history : [],
      typeof compressedContext === 'string' ? compressedContext : '',
      {
        userId: req.user?._id,
        conversationId: req.body.conversationId,
      },
    )
    res.json(result)
  } catch (error) {
    const status = error instanceof GeminiError ? error.status : 500
    const safeMessage =
      status === 429 || status === 503
        ? 'The astrologer service is temporarily busy. Please try again in a minute.'
        : error.message || 'Failed to generate astrologer response'

    res.status(status).json({
      message: safeMessage,
    })
  }
})

module.exports = router
