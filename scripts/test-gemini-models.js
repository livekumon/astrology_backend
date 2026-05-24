require('dotenv').config()

const {
  generateText,
  generateForTask,
  generateTextWithModel,
  GeminiError,
  getModelChain,
  getFallbackModels,
  getTaskProfiles,
  getVertexConfig,
  isQuotaOrRateLimitError,
  locationForModel,
} = require('../services/geminiService')

const TEST_PROMPT = 'Reply with exactly: OK'

function classifyError(error) {
  if (!(error instanceof GeminiError)) {
    return { status: 'error', kind: 'unknown', message: error.message }
  }

  if (error.status === 404 || /not found|does not exist/i.test(error.message)) {
    return { status: 'invalid', kind: 'not_found', message: error.message }
  }

  if (error.status === 401 || error.status === 403) {
    return { status: 'invalid', kind: 'auth', message: error.message }
  }

  if (isQuotaOrRateLimitError(error)) {
    return { status: 'limited', kind: 'quota', message: error.message }
  }

  return { status: 'error', kind: 'api', message: error.message }
}

async function testSingleModel(model) {
  const started = Date.now()

  try {
    const text = await generateTextWithModel(model, TEST_PROMPT)
    return {
      model,
      ok: true,
      ms: Date.now() - started,
      response: text.slice(0, 80),
    }
  } catch (error) {
    const classified = classifyError(error)
    return {
      model,
      ok: false,
      ms: Date.now() - started,
      ...classified,
    }
  }
}

async function testFallbackChain() {
  const started = Date.now()

  try {
    const text = await generateText(TEST_PROMPT)
    return {
      ok: true,
      ms: Date.now() - started,
      response: text.slice(0, 80),
    }
  } catch (error) {
    const classified = classifyError(error)
    return {
      ok: false,
      ms: Date.now() - started,
      ...classified,
    }
  }
}

function printModelResult(result) {
  if (result.ok) {
    const where = result.location ? ` @ ${result.location}` : ''
    console.log(`  ✓ ${result.model}${where} — working (${result.ms}ms)`)
    console.log(`    Response: ${result.response}`)
    return
  }

  const icon = result.kind === 'quota' ? '⚠' : '✗'
  console.log(`  ${icon} ${result.model} — ${result.status} (${result.kind}, ${result.ms}ms)`)
  console.log(`    ${result.message.split('\n')[0]}`)
}

async function main() {
  const profiles = getTaskProfiles()
  const vertexConfig = getVertexConfig()

  console.log('Vertex AI Gemini tiered model test')
  console.log('='.repeat(50))
  console.log(`Provider: Vertex AI`)
  console.log(`Project: ${vertexConfig.project || '(missing)'}`)
  console.log(`Location: ${vertexConfig.location}`)
  console.log(`Global: ${vertexConfig.globalLocation}`)
  console.log(`Credentials: ${vertexConfig.credentialsPath || '(missing)'}`)
  for (const [task, profile] of Object.entries(profiles)) {
    console.log(`  ${task.padEnd(8)} ${profile.chain.join(' -> ')}`)
  }
  console.log('')

  if (!vertexConfig.credentialsPath) {
    console.error('FAIL: Vertex AI service account JSON not found in backend/')
    process.exit(1)
  }

  if (!vertexConfig.project) {
    console.error('FAIL: GOOGLE_CLOUD_PROJECT is missing and not found in credentials JSON')
    process.exit(1)
  }

  const chain = getModelChain()
  console.log('1) Test chat models individually')
  console.log('-'.repeat(50))

  const individualResults = []
  for (const model of chain) {
    const result = await testSingleModel(model)
    individualResults.push(result)
    printModelResult({ ...result, location: locationForModel(model) })
  }

  console.log('')
  console.log('2) Test generateForTask("chat") routing')
  console.log('-'.repeat(50))

  try {
    const started = Date.now()
    const routed = await generateForTask('chat', TEST_PROMPT)
    console.log(`  ✓ chat task succeeded (${Date.now() - started}ms)`)
    console.log(`    model=${routed.model} location=${routed.location}`)
    console.log(`    response=${routed.text.slice(0, 80)}`)
  } catch (error) {
    console.log(`  ✗ chat task failed: ${error.message.split('\n')[0]}`)
  }

  console.log('')
  console.log('3) Test generateText() fallback chain')
  console.log('-'.repeat(50))

  const chainResult = await testFallbackChain()
  if (chainResult.ok) {
    console.log(`  ✓ Fallback chain succeeded (${chainResult.ms}ms)`)
    console.log(`    Response: ${chainResult.response}`)
  } else {
    console.log(`  ✗ Fallback chain failed (${chainResult.kind}, ${chainResult.ms}ms)`)
    console.log(`    ${chainResult.message.split('\n')[0]}`)
  }

  console.log('')
  console.log('Summary')
  console.log('-'.repeat(50))

  const working = individualResults.filter((r) => r.ok)
  const quotaLimited = individualResults.filter((r) => r.kind === 'quota')
  const invalid = individualResults.filter((r) => r.kind === 'not_found' || r.kind === 'auth')

  console.log(`  Working models: ${working.length}/${chain.length}`)
  if (working.length) {
    console.log(`    ${working.map((r) => r.model).join(', ')}`)
  }

  if (quotaLimited.length) {
    console.log(`  Quota/rate-limited: ${quotaLimited.map((r) => r.model).join(', ')}`)
  }

  if (invalid.length) {
    console.log(`  Invalid/auth errors: ${invalid.map((r) => r.model).join(', ')}`)
  }

  if (chainResult.ok) {
    console.log('\nPASS: Vertex AI fallback chain is working.')
    process.exit(0)
  }

  if (quotaLimited.length === chain.length) {
    console.log('\nWARN: All models exist but are quota/rate-limited right now.')
    process.exit(2)
  }

  console.log('\nFAIL: No working model in the Vertex AI fallback chain.')
  process.exit(1)
}

main().catch((error) => {
  console.error('\nUnexpected error:', error)
  process.exit(1)
})
