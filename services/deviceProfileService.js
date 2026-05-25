const VALID_DEVICE_TYPES = new Set(['desktop', 'mobile', 'tablet', 'unknown'])

function sanitizeString(value, maxLength) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, maxLength)
}

function sanitizeLocation(location) {
  if (!location || typeof location !== 'object') return null

  const latitude = Number(location.latitude)
  const longitude = Number(location.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null

  const accuracy = Number(location.accuracy)
  const now = new Date()

  return {
    latitude,
    longitude,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
    updatedAt: now,
  }
}

function parseDeviceProfileFromBody(body = {}) {
  const now = new Date()
  const result = {}

  const deviceType = sanitizeString(body.deviceType, 20)
  if (deviceType && VALID_DEVICE_TYPES.has(deviceType)) {
    result.deviceProfile = {
      deviceType,
      userAgent: sanitizeString(body.userAgent, 500),
      platform: sanitizeString(body.platform, 100),
      updatedAt: now,
    }
  }

  const location = sanitizeLocation(body.location)
  if (location) {
    result.location = location
  }

  return result
}

function buildDeviceProfileUpdate(body = {}) {
  const parsed = parseDeviceProfileFromBody(body)
  const $set = { updatedAt: new Date() }

  if (parsed.deviceProfile) $set.deviceProfile = parsed.deviceProfile
  if (parsed.location) $set.location = parsed.location

  return $set
}

function formatDeviceProfileForAdmin(user) {
  if (!user) return null

  return {
    deviceType: user.deviceProfile?.deviceType || null,
    userAgent: user.deviceProfile?.userAgent || null,
    platform: user.deviceProfile?.platform || null,
    deviceUpdatedAt: user.deviceProfile?.updatedAt || null,
    location: user.location
      ? {
          latitude: user.location.latitude,
          longitude: user.location.longitude,
          accuracy: user.location.accuracy ?? null,
          updatedAt: user.location.updatedAt || null,
        }
      : null,
  }
}

module.exports = {
  parseDeviceProfileFromBody,
  buildDeviceProfileUpdate,
  formatDeviceProfileForAdmin,
}
