const { OAuth2Client } = require('google-auth-library')
const { col, ObjectId } = require('../db/connection')
const { signToken } = require('../middleware/auth')
const { sanitizeLanguage, DEFAULT_LANGUAGE } = require('../constants/languages')
const { buildDeviceProfileUpdateAsync } = require('./deviceProfileService')

function getGoogleClientId() {
  return process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || ''
}

function formatUser(user) {
  if (!user) return null
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    language: sanitizeLanguage(user.language),
    avatarUrl: user.avatarUrl || null,
    authProvider: user.googleId ? 'google' : 'password',
  }
}

async function verifyGoogleCredential(credential) {
  const clientId = getGoogleClientId()
  if (!clientId) {
    throw new Error('Google OAuth is not configured on the server')
  }

  const client = new OAuth2Client(clientId)
  const ticket = await client.verifyIdToken({
    idToken: credential,
    audience: clientId,
  })

  const payload = ticket.getPayload()
  if (!payload?.email || !payload.sub) {
    throw new Error('Google account did not return a valid email')
  }

  if (payload.email_verified === false) {
    throw new Error('Google email address is not verified')
  }

  return payload
}

async function authenticateWithGoogle(credential, language, profileBody = {}) {
  const payload = await verifyGoogleCredential(credential)
  const email = payload.email.toLowerCase().trim()
  const googleId = payload.sub
  const name = (payload.name || email.split('@')[0] || 'User').trim()
  const avatarUrl = payload.picture || null
  const userLanguage = sanitizeLanguage(language)
  const deviceFields = await buildDeviceProfileUpdateAsync(profileBody)

  let user = await col('users').findOne({
    $or: [{ googleId }, { email }],
  })

  if (user) {
    const updates = { ...deviceFields }
    if (!user.googleId) {
      updates.googleId = googleId
      updates.authProvider = 'google'
    }
    if (avatarUrl && user.avatarUrl !== avatarUrl) {
      updates.avatarUrl = avatarUrl
    }
    if (!user.name && name) {
      updates.name = name
    }

    if (Object.keys(updates).length > 0) {
      await col('users').updateOne({ _id: user._id }, { $set: updates })
      user = { ...user, ...updates }
    }
  } else {
    const result = await col('users').insertOne({
      name,
      email,
      googleId,
      avatarUrl,
      authProvider: 'google',
      language: userLanguage,
      createdAt: new Date(),
      ...deviceFields,
    })

    user = {
      _id: result.insertedId,
      name,
      email,
      googleId,
      avatarUrl,
      authProvider: 'google',
      language: userLanguage,
      ...deviceFields,
    }
  }

  return {
    token: signToken(user._id),
    user: formatUser(user),
  }
}

module.exports = {
  authenticateWithGoogle,
  formatUser,
  getGoogleClientId,
}
