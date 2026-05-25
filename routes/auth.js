const express = require('express')
const bcrypt = require('bcryptjs')
const { col, ObjectId } = require('../db/connection')
const { signToken, requireAuth } = require('../middleware/auth')
const { sanitizeLanguage } = require('../constants/languages')
const { authenticateWithGoogle, formatUser } = require('../services/googleAuthService')
const { buildDeviceProfileUpdate } = require('../services/deviceProfileService')

const router = express.Router()

async function applyDeviceProfileUpdate(userId, body) {
  const $set = buildDeviceProfileUpdate(body)
  if (!$set.deviceProfile && !$set.location) return

  await col('users').updateOne({ _id: new ObjectId(String(userId)) }, { $set })
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

  const normalizedEmail = email.toLowerCase().trim()
  const existing = await col('users').findOne({ email: normalizedEmail })
  if (existing) {
    if (existing.googleId && !existing.password) {
      return res.status(409).json({ message: 'This email is registered with Google. Please sign in with Google.' })
    }
    return res.status(409).json({ message: 'An account with this email already exists' })
  }

  const hashed = await bcrypt.hash(password, 10)
  const userLanguage = sanitizeLanguage(language)
  const deviceFields = buildDeviceProfileUpdate(req.body)
  const result = await col('users').insertOne({
    name: name.trim(),
    email: normalizedEmail,
    password: hashed,
    authProvider: 'password',
    language: userLanguage,
    createdAt: new Date(),
    ...deviceFields,
  })

  const token = signToken(result.insertedId)
  res.status(201).json({
    token,
    user: formatUser({
      _id: result.insertedId,
      name: name.trim(),
      email: normalizedEmail,
      language: userLanguage,
      authProvider: 'password',
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

  if (!user.password) {
    return res.status(401).json({ message: 'Please sign in with Google for this account' })
  }

  const match = await bcrypt.compare(password, user.password)
  if (!match) {
    return res.status(401).json({ message: 'Invalid email or password' })
  }

  const token = signToken(user._id)
  await applyDeviceProfileUpdate(user._id, req.body)

  res.json({
    token,
    user: formatUser(user),
  })
})

// POST /api/auth/google — sign in or register with Google SSO
router.post('/google', async (req, res) => {
  const { credential, language } = req.body
  if (!credential) {
    return res.status(400).json({ message: 'Google credential is required' })
  }

  try {
    const result = await authenticateWithGoogle(credential, language, req.body)
    res.json({
      token: result.token,
      user: result.user,
    })
  } catch (error) {
    res.status(401).json({ message: error.message || 'Google sign-in failed' })
  }
})

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: formatUser(req.user) })
})

// PATCH /api/auth/me — update profile fields (language)
router.patch('/me', requireAuth, async (req, res) => {
  const { language } = req.body
  const $set = buildDeviceProfileUpdate(req.body)

  if (language !== undefined) {
    $set.language = sanitizeLanguage(language)
  }

  if (Object.keys($set).length === 0) {
    return res.status(400).json({ message: 'No supported profile fields were provided' })
  }

  await col('users').updateOne(
    { _id: new ObjectId(req.user._id) },
    { $set },
  )

  const updatedUser = { ...req.user, ...$set }

  res.json({
    user: formatUser(updatedUser),
  })
})

// POST /api/auth/device-profile — refresh device type and location for signed-in users
router.post('/device-profile', requireAuth, async (req, res) => {
  await applyDeviceProfileUpdate(req.user._id, req.body)
  res.json({ ok: true })
})

module.exports = router
