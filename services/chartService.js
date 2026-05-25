const { resolveBirthLocation } = require('./locationService')
const { generateChartWithGemini, SIGNS } = require('./geminiChartService')

async function generateChartData({
  system,
  dateOfBirth,
  timeOfBirth,
  placeOfBirth,
  gender,
  language = 'en',
  userId,
}) {
  const birthLocation = await resolveBirthLocation({
    placeOfBirth,
    dateOfBirth,
    timeOfBirth,
  })

  const geminiChart = await generateChartWithGemini({
    system,
    dateOfBirth,
    timeOfBirth,
    placeOfBirth,
    gender,
    language,
    birthLocation,
    userId,
  })

  const {
    sunSign,
    moonSign,
    ascSign,
    planets,
    dashas,
    navamsa,
    dasamsa,
    transit,
    welcomeMessage,
    ayanamsa,
    meta,
  } = geminiChart

  return {
    system,
    language,
    dateOfBirth,
    timeOfBirth,
    placeOfBirth,
    gender: gender || null,
    birthLocation,
    sunSign,
    moonSign,
    ascSign,
    planets,
    dashas,
    navamsa,
    dasamsa,
    transit,
    welcomeMessage,
    chartCalculation: {
      source: 'gemini',
      model: meta?.model,
      ayanamsa,
    },
  }
}

module.exports = { generateChartData, SIGNS }
