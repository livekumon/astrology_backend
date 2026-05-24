const fs = require('fs')
const path = require('path')
const { GoogleGenAI } = require('@google/genai')

const BACKEND_ROOT = path.resolve(__dirname, '..')
const LEGACY_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
const DEFAULT_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'
const GLOBAL_LOCATION = process.env.GEMINI_GLOBAL_LOCATION || 'global'

const TASK_PROFILES = {
  chat: {
    primary: process.env.GEMINI_MODEL_CHAT || LEGACY_MODEL,
    fallbacks: parseModelList(
      process.env.GEMINI_MODEL_CHAT_FALLBACKS,
      ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
    ),
    maxOutputTokens: parsePositiveInt(process.env.GEMINI_CHAT_MAX_OUTPUT, 8192),
    thinkingBudget: parseThinkingBudget(process.env.GEMINI_CHAT_THINKING_BUDGET, -1),
  },
  welcome: {
    primary: process.env.GEMINI_MODEL_WELCOME || 'gemini-2.5-flash',
    fallbacks: parseModelList(
      process.env.GEMINI_MODEL_WELCOME_FALLBACKS,
      ['gemini-2.5-flash-lite'],
    ),
    maxOutputTokens: parsePositiveInt(process.env.GEMINI_WELCOME_MAX_OUTPUT, 1024),
    thinkingBudget: parseThinkingBudget(process.env.GEMINI_WELCOME_THINKING_BUDGET, 0),
  },
  summary: {
    primary: process.env.GEMINI_MODEL_SUMMARY || 'gemini-2.5-flash-lite',
    fallbacks: parseModelList(
      process.env.GEMINI_MODEL_SUMMARY_FALLBACKS,
      ['gemini-2.5-flash'],
    ),
    maxOutputTokens: parsePositiveInt(process.env.GEMINI_SUMMARY_MAX_OUTPUT, 512),
    thinkingBudget: parseThinkingBudget(process.env.GEMINI_SUMMARY_THINKING_BUDGET, 0),
  },
}

class GeminiError extends Error {
  constructor(message, status = 500) {
    super(message)
    this.name = 'GeminiError'
    this.status = status
  }
}

const vertexClients = new Map()

function parseModelList(value, defaults = []) {
  if (!value || !String(value).trim()) {
    return [...defaults]
  }
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseThinkingBudget(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback
  }
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function uniqueModels(models) {
  return [...new Set(models.filter(Boolean))]
}

function parseCredentialsJson(raw) {
  let value = String(raw).trim()
  if (!value) return null

  if (
    (value.startsWith("'") && value.endsWith("'"))
    || (value.startsWith('"') && value.endsWith('"'))
  ) {
    value = value.slice(1, -1)
  }

  try {
    const parsed = JSON.parse(value)
    if (parsed?.type !== 'service_account' || !parsed.private_key) {
      throw new Error('expected a Google service account JSON object')
    }
    return parsed
  } catch (error) {
    throw new GeminiError(
      `Invalid GOOGLE_APPLICATION_CREDENTIALS_JSON: ${error.message}`,
      500,
    )
  }
}

function resolveCredentialsPath() {
  const configured = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(BACKEND_ROOT, configured)
  }

  const jsonFiles = fs
    .readdirSync(BACKEND_ROOT)
    .filter((file) => file.endsWith('.json') && file !== 'package.json' && file !== 'package-lock.json')

  for (const file of jsonFiles) {
    const fullPath = path.join(BACKEND_ROOT, file)
    try {
      const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'))
      if (parsed.type === 'service_account') {
        return fullPath
      }
    } catch {
      // ignore invalid JSON files
    }
  }

  return null
}

function resolveServiceAccountCredentials() {
  const jsonEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
  if (jsonEnv) {
    const credentials = parseCredentialsJson(jsonEnv)
    return {
      credentials,
      projectId: credentials.project_id || null,
      source: 'json',
      path: null,
    }
  }

  const credentialsPath = resolveCredentialsPath()
  if (credentialsPath && fs.existsSync(credentialsPath)) {
    try {
      const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'))
      if (credentials?.type === 'service_account' && credentials.private_key) {
        return {
          credentials,
          projectId: credentials.project_id || null,
          source: 'file',
          path: credentialsPath,
        }
      }
    } catch {
      // fall through
    }
  }

  return null
}

function getProjectId(resolved = resolveServiceAccountCredentials()) {
  return (
    process.env.GOOGLE_CLOUD_PROJECT ||
    resolved?.projectId ||
    null
  )
}

function requiresGlobalEndpoint(model) {
  return /^gemini-3(\.|$)/i.test(model)
}

function locationForModel(model) {
  return requiresGlobalEndpoint(model) ? GLOBAL_LOCATION : DEFAULT_LOCATION
}

function getConfig() {
  const resolved = resolveServiceAccountCredentials()
  return {
    credentialsPath: resolved?.path || null,
    credentialsSource: resolved?.source || null,
    hasCredentials: Boolean(resolved),
    project: getProjectId(resolved),
    location: DEFAULT_LOCATION,
    globalLocation: GLOBAL_LOCATION,
    model: TASK_PROFILES.chat.primary,
  }
}

function getTaskProfile(task = 'chat') {
  return TASK_PROFILES[task] || TASK_PROFILES.chat
}

function getTaskModelChain(task = 'chat') {
  const profile = getTaskProfile(task)
  return uniqueModels([profile.primary, ...profile.fallbacks])
}

function getVertexClient(location = DEFAULT_LOCATION) {
  if (vertexClients.has(location)) {
    return vertexClients.get(location)
  }

  const resolved = resolveServiceAccountCredentials()
  const project = getProjectId(resolved)

  if (!resolved) {
    throw new GeminiError(
      'Vertex AI credentials not found. Set GOOGLE_APPLICATION_CREDENTIALS_JSON or GOOGLE_APPLICATION_CREDENTIALS',
      500,
    )
  }

  if (!project) {
    throw new GeminiError(
      'GOOGLE_CLOUD_PROJECT is not configured and could not be read from the service account JSON',
      500,
    )
  }

  const client = new GoogleGenAI({
    vertexai: true,
    project,
    location,
    googleAuthOptions: {
      credentials: resolved.credentials,
    },
  })

  vertexClients.set(location, client)
  return client
}

function getModelChain() {
  return getTaskModelChain('chat')
}

function getFallbackModels() {
  return getTaskProfile('chat').fallbacks
}

function isQuotaOrRateLimitError(error) {
  if (error instanceof GeminiError) {
    return (
      error.status === 429 ||
      error.status === 503 ||
      /quota|rate limit|resource exhausted|too many requests/i.test(error.message)
    )
  }

  return (
    error?.status === 429 ||
    error?.status === 503 ||
    /quota|rate limit|resource exhausted|too many requests/i.test(error?.message || '')
  )
}

function toGeminiError(error, fallbackMessage) {
  if (error instanceof GeminiError) {
    return error
  }

  const status = error?.status || 500
  const message = error?.message || fallbackMessage
  return new GeminiError(message, status)
}

function buildGenerationConfig({
  systemInstruction,
  jsonResponse,
  maxOutputTokens,
  thinkingBudget,
} = {}) {
  const config = {}

  if (systemInstruction) {
    config.systemInstruction = systemInstruction
  }
  if (jsonResponse) {
    config.responseMimeType = 'application/json'
  }
  if (Number.isFinite(maxOutputTokens) && maxOutputTokens > 0) {
    config.maxOutputTokens = maxOutputTokens
  }
  if (Number.isFinite(thinkingBudget)) {
    config.thinkingConfig = { thinkingBudget }
  }

  return Object.keys(config).length > 0 ? config : undefined
}

async function generateTextWithModel(model, prompt, options = {}) {
  const location = locationForModel(model)
  const ai = getVertexClient(location)

  const request = {
    model,
    contents: prompt,
  }

  const config = buildGenerationConfig(options)
  if (config) {
    request.config = config
  }

  try {
    const response = await ai.models.generateContent(request)
    const text = response.text?.trim()

    if (!text) {
      throw new GeminiError('Gemini returned no text', 502)
    }

    const { extractUsageFromMetadata } = require('./tokenUsageService')
    const usage = extractUsageFromMetadata(response.usageMetadata)

    return { text, usage }
  } catch (error) {
    throw toGeminiError(error, `Could not reach Vertex AI (${location}): ${error.message}`)
  }
}

async function generateForTask(task, prompt, options = {}) {
  const profile = getTaskProfile(task)
  const models = uniqueModels([profile.primary, ...profile.fallbacks])
  let lastError = null

  const mergedOptions = {
    maxOutputTokens: options.maxOutputTokens ?? profile.maxOutputTokens,
    thinkingBudget: options.thinkingBudget ?? profile.thinkingBudget,
    systemInstruction: options.systemInstruction,
    jsonResponse: options.jsonResponse,
  }

  for (const model of models) {
    try {
      const result = await generateTextWithModel(model, prompt, mergedOptions)
      return {
        text: result.text,
        model,
        task,
        location: locationForModel(model),
        usage: result.usage,
      }
    } catch (error) {
      lastError = error
      if (!isQuotaOrRateLimitError(error)) {
        throw error
      }
    }
  }

  throw lastError || new GeminiError(`All ${task} models are unavailable on Vertex AI`, 503)
}

async function generateText(prompt, options = {}) {
  const result = await generateForTask(options.task || 'chat', prompt, options)
  return result.text
}

function getTaskProfiles() {
  return Object.fromEntries(
    Object.entries(TASK_PROFILES).map(([task, profile]) => [
      task,
      {
        primary: profile.primary,
        fallbacks: [...profile.fallbacks],
        maxOutputTokens: profile.maxOutputTokens,
        thinkingBudget: profile.thinkingBudget,
        chain: getTaskModelChain(task),
      },
    ]),
  )
}

module.exports = {
  generateText,
  generateForTask,
  generateTextWithModel,
  GeminiError,
  getModel: () => getTaskProfile('chat').primary,
  getModelChain,
  getFallbackModels,
  getTaskModelChain,
  getTaskProfiles,
  getVertexConfig: () => getConfig(),
  isQuotaOrRateLimitError,
  locationForModel,
  requiresGlobalEndpoint,
}
