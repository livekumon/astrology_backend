const { generateForTask } = require('./geminiService')
const { getLanguageInstruction } = require('./languageService')
const { buildWelcomePromptBlock } = require('./promptGuardService')
const { resolveBirthLocation } = require('./locationService')
const { calculateVedicChart, SIGNS } = require('./ephemerisService')
const { calculateVimshottariDashas } = require('./dashaService')

function buildWelcomeSystem(language = 'en', system = 'Vedic / Jyotish') {
  return [
    buildWelcomePromptBlock(system),
    'IMPORTANT: Write primarily in the user\'s selected language as instructed below — English only minimally for unavoidable terms if needed.',
    getLanguageInstruction(language),
  ].join(' ')
}

function buildFallbackWelcomeMessage(system, ascSign, moonSign, language = 'en') {
  if (language === 'hi') {
    return (
      `नमस्ते। आपकी कुंडली ${system} परंपरा से तैयार की गई है। ` +
      `आपका व्यक्तित्व ${ascSign} जैसा स्थिर और गहरा है, और आपकी भावनात्मक प्रकृति ${moonSign} की ऊर्जा से प्रभावित है। ` +
      'आप क्या जानना चाहेंगे?'
    )
  }

  if (language === 'te') {
    return (
      `నమస్తే. మీ జాతకం ${system} సంప్రదాయంతో రూపొందించబడింది. ` +
      `మీ వ్యక్తిత్వం ${ascSign} లాగా స్థిరమైనది, మరియు మీ భావోద్వేగ స్వభావం ${moonSign} ప్రభావంతో ఉంటుంది. ` +
      'మీరు ఏమి తెలుసుకోవాలనుకుంటున్నారు?'
    )
  }

  return (
    `Namaste. Your chart has been cast using the ${system} tradition. ` +
    `Your personality comes across as steady and grounded like ${ascSign}, with emotional depth shaped by ${moonSign} qualities. ` +
    'What would you like to explore?'
  )
}

async function buildWelcomeMessage({
  system,
  ascSign,
  moonSign,
  sunSign,
  dateOfBirth,
  timeOfBirth,
  placeOfBirth,
  gender,
  language = 'en',
  planets,
  dashas,
  birthLocation,
  chartCalculation,
}) {
  const { formatChartContext } = require('./chartContextFormatter')

  const prompt = [
    'Write a welcome message for this newly cast chart:',
    formatChartContext({
      system,
      dateOfBirth,
      timeOfBirth,
      placeOfBirth,
      gender,
      sunSign,
      moonSign,
      ascSign,
      planets,
      dashas,
      birthLocation,
      chartCalculation,
    }),
  ].join('\n')

  try {
    const result = await generateForTask('welcome', prompt, {
      systemInstruction: buildWelcomeSystem(language, system),
    })
    return result.text
  } catch {
    return buildFallbackWelcomeMessage(system, ascSign, moonSign, language)
  }
}

async function generateChartData({
  system,
  dateOfBirth,
  timeOfBirth,
  placeOfBirth,
  gender,
  language = 'en',
}) {
  const birthLocation = await resolveBirthLocation({
    placeOfBirth,
    dateOfBirth,
    timeOfBirth,
  })

  const chartCalculation = calculateVedicChart({
    dateOfBirth,
    timeOfBirth,
    birthLocation,
  })

  const { sunSign, moonSign, ascSign, planets, planetDetails, localIso } = chartCalculation

  const moonDetail = planetDetails.find((planet) => planet.code === 'moon')
  const dashas = calculateVimshottariDashas({
    moonLongitude: moonDetail?.longitude,
    birthLocalIso: localIso,
    timezoneId: birthLocation.timezoneId,
  })

  const welcomeMessage = await buildWelcomeMessage({
    system,
    ascSign,
    moonSign,
    sunSign,
    dateOfBirth,
    timeOfBirth,
    placeOfBirth,
    gender,
    language,
    planets,
    dashas,
    birthLocation,
    chartCalculation,
  })

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
    chartCalculation: {
      ayanamsa: chartCalculation.ayanamsa,
      utcIso: chartCalculation.utcIso,
      localIso: chartCalculation.localIso,
      ascendantLongitude: chartCalculation.ascendantLongitude,
      planetDetails: chartCalculation.planetDetails,
    },
    welcomeMessage,
  }
}

module.exports = { generateChartData, SIGNS }
