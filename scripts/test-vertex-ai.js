require('dotenv').config()

const fs = require('fs')
const { generateText, getModelChain, getTaskProfiles, getVertexConfig } = require('../services/geminiService')

const PASS = 'PASS'
const FAIL = 'FAIL'

function logStep(label, status, detail = '') {
  const icon = status === PASS ? '✓' : '✗'
  console.log(`  ${icon} ${label}${detail ? `: ${detail}` : ''}`)
}

async function runVertexAiTest() {
  console.log('Vertex AI integration test')
  console.log('='.repeat(50))

  const vertexConfig = getVertexConfig()
  let failed = false

  console.log('\nConfiguration')
  console.log('-'.repeat(50))
  console.log(`  Project:     ${vertexConfig.project || '(missing)'}`)
  console.log(`  Location:    ${vertexConfig.location}`)
  console.log(`  Global:      ${vertexConfig.globalLocation}`)
  console.log(`  Credentials: ${vertexConfig.credentialsSource || 'missing'}${vertexConfig.credentialsPath ? ` (${vertexConfig.credentialsPath})` : ''}`)
  console.log(`  Chat chain:  ${getModelChain().join(' -> ')}`)
  const profiles = getTaskProfiles()
  for (const [task, profile] of Object.entries(profiles)) {
    console.log(`  ${task.padEnd(8)} ${profile.chain.join(' -> ')}`)
  }

  console.log('\nChecks')
  console.log('-'.repeat(50))

  if (!vertexConfig.hasCredentials) {
    logStep('Vertex AI credentials configured', FAIL)
    failed = true
  } else if (vertexConfig.credentialsSource === 'file' && !fs.existsSync(vertexConfig.credentialsPath)) {
    logStep('Service account JSON exists on disk', FAIL, vertexConfig.credentialsPath)
    failed = true
  } else {
    logStep('Vertex AI credentials configured', PASS, vertexConfig.credentialsSource)
  }

  if (!vertexConfig.project) {
    logStep('GOOGLE_CLOUD_PROJECT configured', FAIL)
    failed = true
  } else {
    logStep('GOOGLE_CLOUD_PROJECT configured', PASS, vertexConfig.project)
  }

  if (failed) {
    console.log('\nResult: FAIL — fix configuration in backend/.env')
    process.exit(1)
  }

  console.log('\nLive API test')
  console.log('-'.repeat(50))

  try {
    const started = Date.now()
    const ping = await generateText('Reply with exactly: OK')
    const ms = Date.now() - started

    if (ping.trim().toUpperCase().includes('OK')) {
      logStep('Basic generateContent call', PASS, `${ms}ms — "${ping.trim()}"`)
    } else {
      logStep('Basic generateContent call', PASS, `${ms}ms — unexpected text: "${ping.trim()}"`)
    }
  } catch (error) {
    logStep('Basic generateContent call', FAIL, error.message.split('\n')[0])
    console.log('\nResult: FAIL — Vertex AI is not reachable')
    process.exit(1)
  }

  try {
    const started = Date.now()
    const answer = await generateText(
      'User question: What is my moon sign?\nChart context: Moon sign is Leo, Sun sign is Scorpio, Ascendant is Aquarius.',
      {
        systemInstruction:
          'You are a Vedic astrologer. Answer in one short sentence and mention the moon sign.',
      },
    )
    const ms = Date.now() - started

    if (answer && answer.length > 10) {
      logStep('Astrologer-style prompt', PASS, `${ms}ms`)
      console.log(`    Sample: ${answer.replace(/\s+/g, ' ').slice(0, 120)}...`)
    } else {
      logStep('Astrologer-style prompt', FAIL, 'empty or too short response')
      process.exit(1)
    }
  } catch (error) {
    logStep('Astrologer-style prompt', FAIL, error.message.split('\n')[0])
    console.log('\nResult: FAIL — astrologer prompt failed')
    process.exit(1)
  }

  console.log('\nResult: PASS — Vertex AI Gemini is working.')
  process.exit(0)
}

runVertexAiTest().catch((error) => {
  console.error('\nUnexpected error:', error)
  process.exit(1)
})
