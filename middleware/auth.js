const jwt = require('jsonwebtoken')
const { col, ObjectId } = require('../db/connection')

const JWT_SECRET = process.env.JWT_SECRET || 'jyotish-dev-secret-change-in-prod'

function signToken(userId) {
  return jwt.sign({ sub: userId.toString() }, JWT_SECRET, { expiresIn: '30d' })
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required' })
  }

  const token = header.slice(7)
  let payload
  try {
    payload = jwt.verify(token, JWT_SECRET)
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' })
  }

  try {
    const user = await col('users').findOne(
      { _id: new ObjectId(payload.sub) },
      { projection: { password: 0 } },
    )
    if (!user) return res.status(401).json({ message: 'User not found' })
    req.user = user
    next()
  } catch {
    return res.status(500).json({ message: 'Auth lookup failed' })
  }
}

function optionalAuth(req, _res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) return next()
  const token = header.slice(7)
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.userId = payload.sub
  } catch {
    // ignore — optional
  }
  next()
}

module.exports = { signToken, requireAuth, optionalAuth }
