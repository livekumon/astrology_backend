const express = require('express')
const { generateChartData } = require('../services/chartService')
const { GeminiError } = require('../services/geminiService')

const router = express.Router()

function normalizeGender(value) {
  if (!value) return undefined
  const normalized = String(value).toLowerCase().trim()
  if (normalized === 'male' || normalized === 'female') return normalized
  return undefined
}

router.post('/', async (req, res) => {
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
