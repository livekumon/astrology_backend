const express = require('express')
const bcrypt = require('bcryptjs')
const { col, ObjectId } = require('../db/connection')
const { signToken, requireAuth } = require('../middleware/auth')
const { sanitizeLanguage, DEFAULT_LANGUAGE } = require('../constants/languages')

const router = express.Router()

function formatUser(user) {
  if (!user) return null
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    language: sanitizeLanguage(user.language),
  }
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { name, email, password, language } = req.body
  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ message: 'name, email and password are required' })
  }
  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' })
  }

  const existing = await col('users').findOne({ email: email.toLowerCase().trim() })
  if (existing) {
    return res.status(409).json({ message: 'An account with this email already exists' })
  }

  const hashed = await bcrypt.hash(password, 10)
  const userLanguage = sanitizeLanguage(language)
  const result = await col('users').insertOne({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password: hashed,
    language: userLanguage,
    createdAt: new Date(),
  })

  const token = signToken(result.insertedId)
  res.status(201).json({
    token,
    user: formatUser({
      _id: result.insertedId,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      language: userLanguage,
    }),
  })
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!email?.trim() || !password) {
    return res.status(400).json({ message: 'email and password are required' })
  }

  const user = await col('users').findOne({ email: email.toLowerCase().trim() })
  if (!user) {
    return res.status(401).json({ message: 'Invalid email or password' })
  }

  const match = await bcrypt.compare(password, user.password)
  if (!match) {
    return res.status(401).json({ message: 'Invalid email or password' })
  }

  const token = signToken(user._id)
  res.json({
    token,
    user: formatUser(user),
  })
})

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: formatUser(req.user) })
})

// PATCH /api/auth/me — update profile fields (language)
router.patch('/me', requireAuth, async (req, res) => {
  const { language } = req.body
  if (language === undefined) {
    return res.status(400).json({ message: 'language is required' })
  }

  const userLanguage = sanitizeLanguage(language)
  await col('users').updateOne(
    { _id: new ObjectId(req.user._id) },
    { $set: { language: userLanguage, updatedAt: new Date() } },
  )

  res.json({
    user: formatUser({ ...req.user, language: userLanguage }),
  })
})

module.exports = router
