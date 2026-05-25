const { DateTime } = require('luxon')
const { generateForTask, GeminiError } = require('./geminiService')
const { recordTokenUsage } = require('./tokenUsageService')
const { getLanguageInstruction } = require('./languageService')
const { buildWelcomePromptBlock, buildTraditionScopeBlock } = require('./promptGuardService')
const { getTraditionConfig } = require('../constants/traditions')

const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
]

const PLANET_CODES = new Set([
  'sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'rahu', 'ketu',
])

const DASHA_PLANETS = new Set([
  'ketu', 'venus', 'sun', 'moon', 'mars', 'rahu', 'jupiter', 'saturn', 'mercury',
])

const PLANET_COLORS = {
  ketu: '#c1715a',
  venus: '#d4976a',
  sun: '#e8b84a',
  moon: '#7eb8da',
  mars: '#c45c5c',
  rahu: '#8a7a9a',
  jupiter: '#daa520',
  saturn: '#9a8878',
  mercury: '#2dd4bf',
}

const CHART_JSON_SCHEMA = {
  sunSign: 'Aries',
  moonSign: 'Cancer',
  ascSign: 'Leo',
  ayanamsa: 'Lahiri',
  planets: [{ house: 0, codes: ['sun', 'mercury'] }],
  dashas: [{
    planet: 'moon',
    period: 'Jan 1990 – Dec 2000',
    startIso: '1990-01-01T00:00:00.000+05:30',
    endIso: '2000-01-01T00:00:00.000+05:30',
    progress: 100,
    isCurrent: false,
    isPast: true,
    color: '#7eb8da',
  }],
  navamsa: {
    sunSign: 'Leo',
    moonSign: 'Pisces',
    ascSign: 'Gemini',
    wheelPlanets: [{ code: 'sun', segment: 4, slot: 0.28 }],
  },
  dasamsa: {
    sunSign: 'Leo',
    moonSign: 'Pisces',
    ascSign: 'Gemini',
    wheelPlanets: [{ code: 'sun', segment: 4, slot: 0.28 }],
  },
  transit: {
    referenceDate: '2026-05-24',
    summary: 'Brief note on current transits relative to natal chart.',
    wheelPlanets: [{ code: 'jupiter', segment: 8, slot: 0.35 }],
  },
  welcomeMessage: '2-3 sentence welcome in the user language.',
}

function signIndex(name) {
  const normalized = normalizeSign(name)
  return SIGNS.indexOf(normalized)
}

function normalizeSign(value) {
  if (!value) return SIGNS[0]
  const trimmed = String(value).trim()
  const match = SIGNS.find((sign) => sign.toLowerCase() === trimmed.toLowerCase())
  return match || SIGNS[0]
}

function normalizePlanetCode(value) {
  const code = String(value || '').trim().toLowerCase()
  return PLANET_CODES.has(code) ? code : null
}

function normalizeDashaPlanet(value) {
  const code = String(value || '').trim().toLowerCase()
  return DASHA_PLANETS.has(code) ? code : null
}

function clampHouse(value) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(11, parsed))
}

function clampSegment(value) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(11, parsed))
}

function clampSlot(value, fallback = 0.35) {
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0.15, Math.min(0.85, parsed))
}

function normalizePlanets(planets) {
  if (!Array.isArray(planets)) return []

  const grouped = new Map()

  for (const entry of planets) {
    const house = clampHouse(entry?.house)
    const rawCodes = Array.isArray(entry?.codes)
      ? entry.codes
      : entry?.code
        ? [entry.code]
        : []
    const codes = rawCodes.map(normalizePlanetCode).filter(Boolean)
    if (!codes.length) continue

    if (!grouped.has(house)) {
      grouped.set(house, new Set())
    }
    for (const code of codes) {
      grouped.get(house).add(code)
    }
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a - b)
    .map(([house, codesSet]) => ({
      house,
      codes: [...codesSet],
    }))
}

function formatPeriod(start, end) {
  const startLabel = start.toFormat('MMM yyyy')
  const endLabel = end.minus({ days: 1 }).toFormat('MMM yyyy')
  return `${startLabel} – ${endLabel}`
}

function normalizeDashas(dashas, timezoneId = 'UTC') {
  if (!Array.isArray(dashas)) return []

  const now = DateTime.now().setZone(timezoneId || 'UTC')

  return dashas
    .map((entry) => {
      const planet = normalizeDashaPlanet(entry?.planet)
      if (!planet) return null

      const start = DateTime.fromISO(String(entry?.startIso || ''), { setZone: true })
      const end = DateTime.fromISO(String(entry?.endIso || ''), { setZone: true })
      if (!start.isValid || !end.isValid || end <= start) return null

      const isCurrent = now >= start && now < end
      const isPast = now >= end

      let progress = 0
      if (isCurrent) {
        const totalMs = end.toMillis() - start.toMillis()
        const elapsedMs = now.toMillis() - start.toMillis()
        progress = totalMs > 0 ? Math.min(100, Math.round((elapsedMs / totalMs) * 100)) : 0
      } else if (isPast) {
        progress = 100
      }

      return {
        planet,
        period: entry?.period && String(entry.period).trim()
          ? String(entry.period).trim()
          : formatPeriod(start, end),
        startIso: start.toISO(),
        endIso: end.toISO(),
        progress,
        isCurrent,
        isPast,
        color: PLANET_COLORS[planet] || entry?.color || '#9a8878',
      }
    })
    .filter(Boolean)
}

function normalizeWheelPlanets(wheelPlanets) {
  if (!Array.isArray(wheelPlanets)) return []

  return wheelPlanets
    .map((entry, index) => {
      const code = normalizePlanetCode(entry?.code)
      if (!code) return null

      return {
        code,
        segment: clampSegment(entry?.segment ?? signIndex(entry?.sign)),
        slot: clampSlot(entry?.slot, 0.28 + (index % 4) * 0.11),
      }
    })
    .filter(Boolean)
}

function normalizeDivisionalChart(raw) {
  if (!raw || typeof raw !== 'object') return null

  return {
    sunSign: normalizeSign(raw.sunSign),
    moonSign: normalizeSign(raw.moonSign),
    ascSign: normalizeSign(raw.ascSign),
    wheelPlanets: normalizeWheelPlanets(raw.wheelPlanets),
  }
}

function normalizeTransitChart(raw) {
  if (!raw || typeof raw !== 'object') return null

  return {
    referenceDate: String(raw.referenceDate || DateTime.now().toISODate()),
    summary: String(raw.summary || '').trim(),
    wheelPlanets: normalizeWheelPlanets(raw.wheelPlanets),
  }
}

function buildChartSystemInstruction(system, language) {
  const tradition = getTraditionConfig(system)

  return [
    `You are ${tradition.expertRole} computing a complete ${tradition.label} birth chart.`,
    buildTraditionScopeBlock(system),
    'Use Lahiri ayanamsa for Vedic/Jyotish traditions unless the selected tradition explicitly uses tropical zodiac.',
    'Compute placements from the birth date, LOCAL civil time, latitude, longitude, and timezone provided — never treat birth time as UTC.',
    'Return ONLY valid JSON matching the requested schema — no markdown fences, no commentary.',
    buildWelcomePromptBlock(system),
    getLanguageInstruction(language),
    'The welcomeMessage field must be in the user\'s selected language.',
  ].join('\n')
}

function buildChartPrompt({
  system,
  dateOfBirth,
  timeOfBirth,
  placeOfBirth,
  gender,
  language,
  birthLocation,
}) {
  const today = DateTime.now().setZone(birthLocation?.timezoneId || 'UTC').toISODate()

  return [
    'Compute the full chart package below and return JSON only.',
    '',
    'BIRTH INPUT:',
    `- Tradition: ${system}`,
    `- Date of birth (local calendar): ${dateOfBirth}`,
    `- Time of birth (local civil time at birth place): ${timeOfBirth}`,
    `- Place: ${placeOfBirth}`,
    `- Gender: ${gender || 'not specified'}`,
    `- User language code: ${language}`,
    '',
    'RESOLVED LOCATION (use these coordinates and timezone):',
    `- Latitude: ${birthLocation?.latitude}`,
    `- Longitude: ${birthLocation?.longitude}`,
    `- Timezone: ${birthLocation?.timezoneId}`,
    `- Display label: ${birthLocation?.displayName || placeOfBirth}`,
    `- Country: ${birthLocation?.country || 'unknown'}`,
    '',
    'OUTPUT RULES:',
    '1. sunSign, moonSign, ascSign: English sign names from this list only:',
    `   ${SIGNS.join(', ')}`,
    '2. planets (Rasi / D1): array of { house, codes }.',
    '   - house: integer 0–11 whole-sign house where 0 = first house (lagna sign), 1 = second house, … 11 = twelfth house.',
    '   - codes: planet codes in that house — each from: sun, moon, mercury, venus, mars, jupiter, saturn, rahu, ketu.',
    '   - Group all planets sharing a house into one entry.',
    '3. dashas: full Vimshottari mahadasha sequence from birth through ~120 years.',
    '   - planet: ketu, venus, sun, moon, mars, rahu, jupiter, saturn, or mercury.',
    '   - startIso / endIso: ISO-8601 with birth-place timezone offset.',
    '   - period: human-readable like "Jan 1990 – Dec 2000".',
    '   - Set isCurrent true for the dasha active on today (' + today + ' in birth timezone).',
    '   - progress: 0–100 (100 for past dashas, partial for current, 0 for future).',
    '   - color: use these hex values —',
    `     ${JSON.stringify(PLANET_COLORS)}`,
    '4. navamsa (D9): { sunSign, moonSign, ascSign, wheelPlanets }.',
    '5. dasamsa (D10): { sunSign, moonSign, ascSign, wheelPlanets }.',
    '6. transit: current gochar for today (' + today + ') relative to natal chart.',
    '   - referenceDate: ISO date string.',
    '   - summary: 1–2 sentences on key transits.',
    '   - wheelPlanets: current positions of sun, moon, mercury, venus, mars, jupiter, saturn, rahu, ketu.',
    '7. wheelPlanets (navamsa, dasamsa, transit):',
    '   - code: planet code from the list above.',
    '   - segment: integer 0–11 where 0 = Aries wedge (top), 1 = Taurus, … 11 = Pisces.',
    '   - slot: optional 0.15–0.85 angular position within the wedge (use different slots if multiple planets share a sign).',
    '8. welcomeMessage: 2–3 warm sentences using chart highlights; user\'s language; no tradition labels.',
    '9. ayanamsa: name used (e.g. "Lahiri").',
    '',
    'JSON SCHEMA EXAMPLE (structure only — compute real values):',
    JSON.stringify(CHART_JSON_SCHEMA, null, 2),
  ].join('\n')
}

function parseChartResponse(rawText) {
  let parsed
  try {
    parsed = JSON.parse(rawText)
  } catch (error) {
    throw new GeminiError(`Gemini chart response was not valid JSON: ${error.message}`, 502)
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new GeminiError('Gemini chart response was empty or not an object', 502)
  }

  return parsed
}

function normalizeChartPayload(raw, timezoneId) {
  const sunSign = normalizeSign(raw.sunSign)
  const moonSign = normalizeSign(raw.moonSign)
  const ascSign = normalizeSign(raw.ascSign)
  const planets = normalizePlanets(raw.planets)
  const dashas = normalizeDashas(raw.dashas, timezoneId)

  if (!planets.length) {
    throw new GeminiError('Gemini chart response did not include planet placements', 502)
  }

  if (!dashas.length) {
    throw new GeminiError('Gemini chart response did not include dasha periods', 502)
  }

  const welcomeMessage = String(raw.welcomeMessage || '').trim()
  if (!welcomeMessage) {
    throw new GeminiError('Gemini chart response did not include a welcome message', 502)
  }

  return {
    sunSign,
    moonSign,
    ascSign,
    planets,
    dashas,
    navamsa: normalizeDivisionalChart(raw.navamsa),
    dasamsa: normalizeDivisionalChart(raw.dasamsa),
    transit: normalizeTransitChart(raw.transit),
    welcomeMessage,
    ayanamsa: String(raw.ayanamsa || 'Lahiri').trim(),
  }
}

async function generateChartWithGemini({
  system,
  dateOfBirth,
  timeOfBirth,
  placeOfBirth,
  gender,
  language = 'en',
  birthLocation,
  userId,
}) {
  const prompt = buildChartPrompt({
    system,
    dateOfBirth,
    timeOfBirth,
    placeOfBirth,
    gender,
    language,
    birthLocation,
  })

  const result = await generateForTask('chart', prompt, {
    jsonResponse: true,
    systemInstruction: buildChartSystemInstruction(system, language),
  })

  await recordTokenUsage({
    userId,
    task: 'chart',
    model: result.model,
    usage: result.usage,
    source: 'chart',
  })

  const normalized = normalizeChartPayload(
    parseChartResponse(result.text),
    birthLocation?.timezoneId,
  )

  return {
    ...normalized,
    meta: {
      source: 'gemini',
      model: result.model,
      location: result.location,
    },
  }
}

module.exports = {
  generateChartWithGemini,
  SIGNS,
  normalizeChartPayload,
}
