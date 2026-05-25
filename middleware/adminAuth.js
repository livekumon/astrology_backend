const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET || 'jyotish-dev-secret-change-in-prod'
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin').toLowerCase()
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123456'

function signAdminToken() {
  return jwt.sign({ role: 'admin', email: ADMIN_EMAIL }, JWT_SECRET, { expiresIn: '8h' })
}

function verifyAdminCredentials(email, password) {
  return (
    String(email || '').toLowerCase().trim() === ADMIN_EMAIL
    && String(password || '') === ADMIN_PASSWORD
  )
}

function requireAdmin(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Admin authentication required' })
  }

  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET)
    if (payload.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access only' })
    }
    req.admin = { email: payload.email }
    next()
  } catch {
    return res.status(401).json({ message: 'Invalid or expired admin token' })
  }
}

module.exports = {
  signAdminToken,
  verifyAdminCredentials,
  requireAdmin,
  ADMIN_EMAIL,
}
