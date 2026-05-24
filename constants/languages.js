const ALLOWED_LANGUAGE_CODES = [
  'en',
  'hi',
  'te',
  'ta',
  'bn',
  'mr',
  'pa',
  'es',
  'fr',
  'zh',
]

const DEFAULT_LANGUAGE = 'en'

function sanitizeLanguage(code) {
  const normalized = String(code || DEFAULT_LANGUAGE).toLowerCase().trim()
  return ALLOWED_LANGUAGE_CODES.includes(normalized) ? normalized : DEFAULT_LANGUAGE
}

module.exports = {
  ALLOWED_LANGUAGE_CODES,
  DEFAULT_LANGUAGE,
  sanitizeLanguage,
}
