const LOCAL_ORIGINS = ['http://localhost:5173', 'http://localhost:5175']

function parseOriginList(...values) {
  const origins = new Set()

  for (const value of values) {
    if (!value) continue
    String(value)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((origin) => origins.add(origin))
  }

  return [...origins]
}

function getAllowedOrigins() {
  return parseOriginList(
    process.env.CORS_ALLOWED_ORIGINS,
    process.env.FRONTEND_URL,
    process.env.ADMIN_URL,
    ...LOCAL_ORIGINS,
  )
}

function createCorsOptions() {
  const allowedOrigins = getAllowedOrigins()

  return {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
        return
      }

      callback(null, false)
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }
}

module.exports = {
  getAllowedOrigins,
  createCorsOptions,
}
