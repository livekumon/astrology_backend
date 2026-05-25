const {
  formatLifeStageSection,
  formatDashaTimelineWithAges,
  formatMarriageIndicators,
} = require('./lifecycleTiming')

const PLANET_LABELS = {
  sun: 'Sun',
  moon: 'Moon',
  mars: 'Mars',
  mercury: 'Mercury',
  jupiter: 'Jupiter',
  venus: 'Venus',
  saturn: 'Saturn',
  rahu: 'Rahu',
  ketu: 'Ketu',
}

function formatPlanetCodes(codes = []) {
  return codes.map((code) => PLANET_LABELS[code] || code).join(', ')
}

function formatPlanetPlacements(planets = []) {
  if (!planets.length) {
    return 'Planetary placements not available.'
  }

  return planets
    .map((placement) => {
      const houseNumber = placement.house + 1
      const codes = placement.codes || []
      const legacyLabel = placement.label

      if (codes.length) {
        return `House ${houseNumber}: ${formatPlanetCodes(codes)}`
      }

      if (legacyLabel) {
        return `House ${houseNumber}: ${legacyLabel}`
      }

      return `House ${houseNumber}: unknown`
    })
    .join('\n')
}

function formatDashaTimeline(dashas = []) {
  if (!dashas.length) {
    return 'Dasha timeline not available.'
  }

  return dashas
    .map((dasha) => {
      const planet = PLANET_LABELS[dasha.planet] || dasha.planet
      const current = dasha.isCurrent ? ' [CURRENT MAHADASHA]' : ''
      const progress =
        dasha.isCurrent && dasha.progress > 0
          ? ` — ${dasha.progress}% of this period elapsed`
          : ''
      return `${planet}: ${dasha.period}${current}${progress}`
    })
    .join('\n')
}

function formatBirthLocation(chartContext = {}) {
  const birthLocation = chartContext.birthLocation
  if (!birthLocation) {
    return [
      'Birth place entered by user: ' + (chartContext.placeOfBirth || 'unknown'),
      'Treat date and time as local civil time at the stated birth place.',
    ].join('\n')
  }

  const lines = [
    `Birth place entered by user: ${birthLocation.inputPlace || chartContext.placeOfBirth}`,
    `Resolved birth location: ${birthLocation.resolvedPlace}`,
  ]

  if (birthLocation.country) lines.push(`Country/region: ${birthLocation.country}`)
  if (birthLocation.latitude != null && birthLocation.longitude != null) {
    lines.push(
      `Coordinates: ${birthLocation.latitude.toFixed(4)}, ${birthLocation.longitude.toFixed(4)}`,
    )
  }

  lines.push(`Timezone: ${birthLocation.timezoneId} (${birthLocation.timezoneLabel || birthLocation.timezoneId}, UTC${birthLocation.utcOffset})`)
  lines.push(
    `Local birth datetime: ${birthLocation.localBirthDisplay} — this is LOCAL time at the birth place, not UTC`,
  )
  if (birthLocation.localBirthIso) {
    lines.push(`Local birth datetime (ISO): ${birthLocation.localBirthIso}`)
  }
  if (birthLocation.timezoneInstruction) {
    lines.push(`Timezone rule for interpretation: ${birthLocation.timezoneInstruction}`)
  }

  return lines.join('\n')
}

function formatChartContext(chartContext = {}) {
  const sections = []

  sections.push('=== Birth Location & Local Time (read carefully) ===')
  sections.push(formatBirthLocation(chartContext))

  sections.push('')
  sections.push('=== Birth Details ===')
  if (chartContext.system) sections.push(`Tradition: ${chartContext.system}`)
  if (chartContext.dateOfBirth) {
    sections.push(`Date of birth (local at birth place): ${chartContext.dateOfBirth}`)
  }
  if (chartContext.timeOfBirth) {
    sections.push(`Time of birth (local at birth place): ${chartContext.timeOfBirth}`)
  }
  if (chartContext.placeOfBirth) {
    sections.push(`Place of birth selected by user: ${chartContext.placeOfBirth}`)
  }
  if (chartContext.gender) {
    sections.push(
      `Gender provided by user: ${chartContext.gender} — apply tradition-appropriate conventions where relevant (e.g. marriage and life-area readings).`,
    )
  }

  sections.push('')
  sections.push('=== Life Stage (age from birth — use holistically) ===')
  sections.push(formatLifeStageSection(chartContext))

  sections.push('')
  sections.push('=== Key Signs (Lahiri sidereal, from birth time & location) ===')
  if (chartContext.sunSign) sections.push(`Sun sign (Ravi): ${chartContext.sunSign}`)
  if (chartContext.moonSign) sections.push(`Moon sign (Chandra): ${chartContext.moonSign}`)
  if (chartContext.ascSign) sections.push(`Ascendant (Lagna): ${chartContext.ascSign}`)
  if (chartContext.chartCalculation?.ayanamsa) {
    sections.push(`Ayanamsa used: ${chartContext.chartCalculation.ayanamsa}`)
  }

  sections.push('')
  sections.push('=== Rasi / Natal Chart — Planetary House Placements ===')
  sections.push(formatPlanetPlacements(chartContext.planets))

  sections.push('')
  sections.push('=== Vimshottari Dasha Timeline (full life from birth — PAST / CURRENT / FUTURE) ===')
  sections.push(formatDashaTimelineWithAges(chartContext.dashas, chartContext.dateOfBirth))

  sections.push('')
  sections.push('=== Marriage & Partnership Timing Notes ===')
  sections.push(formatMarriageIndicators(chartContext))

  sections.push('')
  sections.push('=== Available Chart Divisions ===')
  sections.push(
    'Rasi/Natal (D1), Navamsa (D9 — marriage/soul), Dasamsa (D10 — career), transits, and dasha timeline are part of this reading.',
  )

  if (chartContext.navamsa) {
    sections.push('')
    sections.push('=== Navamsa (D9) ===')
    sections.push(`Lagna: ${chartContext.navamsa.ascSign}`)
    sections.push(`Sun: ${chartContext.navamsa.sunSign}, Moon: ${chartContext.navamsa.moonSign}`)
  }

  if (chartContext.dasamsa) {
    sections.push('')
    sections.push('=== Dasamsa (D10) ===')
    sections.push(`Lagna: ${chartContext.dasamsa.ascSign}`)
    sections.push(`Sun: ${chartContext.dasamsa.sunSign}, Moon: ${chartContext.dasamsa.moonSign}`)
  }

  if (chartContext.transit?.summary) {
    sections.push('')
    sections.push('=== Current Transits ===')
    sections.push(`As of ${chartContext.transit.referenceDate || 'today'}: ${chartContext.transit.summary}`)
  }

  if (chartContext.chartCalculation?.source === 'gemini') {
    sections.push('')
    sections.push('=== Chart computation ===')
    sections.push('Placements and timing cycles were computed by Gemini from birth data and location.')
    if (chartContext.chartCalculation.model) {
      sections.push(`Model: ${chartContext.chartCalculation.model}`)
    }
  }

  if (chartContext.welcomeMessage) {
    sections.push('')
    sections.push('=== Initial Chart Reading Given To User ===')
    sections.push(stripHtml(chartContext.welcomeMessage))
  }

  return sections.join('\n')
}

function stripHtml(text = '') {
  return text.replace(/<\/?em>/g, '').replace(/<[^>]+>/g, '')
}

function formatConversationHistory(history = []) {
  if (!history.length) {
    return ''
  }

  const lines = history.map((entry) => {
    const speaker = entry.role === 'user' ? 'User' : 'Guide'
    return `${speaker}: ${stripHtml(entry.text || entry.content || '')}`
  })

  return [
    '=== Previous conversation ===',
    ...lines,
    '=== End previous conversation ===',
  ].join('\n')
}

module.exports = {
  formatChartContext,
  formatConversationHistory,
}
