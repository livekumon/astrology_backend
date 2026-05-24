require('dotenv').config()

const { generateText, getModelChain, getTaskProfiles, getVertexConfig } = require('../services/geminiService')

async function testGeminiApi() {
  const vertexConfig = getVertexConfig()
  const profiles = getTaskProfiles()

  console.log('Testing Vertex AI Gemini...')
  console.log(`Project: ${vertexConfig.project || '(missing)'}`)
  console.log(`Location: ${vertexConfig.location}`)
  console.log(`Global location: ${vertexConfig.globalLocation}`)
  console.log(`Credentials: ${vertexConfig.credentialsPath || '(missing)'}`)
  console.log(`Chat chain: ${getModelChain().join(' -> ')}`)
  console.log('Task profiles:')
  for (const [task, profile] of Object.entries(profiles)) {
    console.log(`  ${task}: ${profile.chain.join(' -> ')}`)
  }

  if (!vertexConfig.credentialsPath) {
    console.error('\nFAIL: Vertex AI credentials JSON not found in backend/')
    process.exit(1)
  }

  if (!vertexConfig.project) {
    console.error('\nFAIL: GOOGLE_CLOUD_PROJECT is missing')
    process.exit(1)
  }

  try {
    const text = await generateText('Reply with exactly: Vertex AI Gemini is working.')
    console.log('\nSUCCESS: Vertex AI Gemini is working.')
    console.log(`Response: ${text}`)
    process.exit(0)
  } catch (error) {
    console.error('\nFAIL:', error.message)
    process.exit(1)
  }
}

testGeminiApi()
