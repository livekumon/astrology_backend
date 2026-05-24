const express = require('express')
const { generateChartData } = require('../services/chartService')
const { GeminiError } = require('../services/geminiService')
const { optionalAuth } = require('../middleware/auth')

const router = express.Router()

function normalizeGender(value) {
  if (!value) return undefined
  const normalized = String(value).toLowerCase().trim()
  if (normalized === 'male' || normalized === 'female') return normalized
  return undefined
}

router.post('/', optionalAuth, async (req, res) => {
  const { system, dateOfBirth, timeOfBirth, placeOfBirth, language, gender } = req.body

  if (!system || !dateOfBirth || !timeOfBirth || !placeOfBirth) {
    return res.status(400).json({
      message: 'system, dateOfBirth, timeOfBirth, and placeOfBirth are required',
    })
  }

  try {
    const chart = await generateChartData({
      system,
      dateOfBirth,
      timeOfBirth,
      placeOfBirth,
      gender: normalizeGender(gender),
      language: language || 'en',
      userId: req.user?._id,
    })
    res.json(chart)
  } catch (error) {
    const status = error instanceof GeminiError ? error.status : 500
    res.status(status).json({
      message: error.message || 'Failed to generate chart',
    })
  }
})

module.exports = router
