const { DateTime } = require('luxon')

const NAKSHATRA_SPAN = 360 / 27
const DASHA_ORDER = ['ketu', 'venus', 'sun', 'moon', 'mars', 'rahu', 'jupiter', 'saturn', 'mercury']
const DASHA_YEARS = {
  ketu: 7,
  venus: 20,
  sun: 6,
  moon: 10,
  mars: 7,
  rahu: 18,
  jupiter: 16,
  saturn: 19,
  mercury: 17,
}
const TOTAL_CYCLE_YEARS = 120

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

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360
}

function addYears(date, years) {
  return date.plus({ days: years * 365.25 })
}

function formatPeriod(start, end) {
  const startLabel = start.toFormat('MMM yyyy')
  const endLabel = end.minus({ days: 1 }).toFormat('MMM yyyy')
  return `${startLabel} – ${endLabel}`
}

function buildDashaEntry(planet, start, end, now) {
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
    period: formatPeriod(start, end),
    startIso: start.toISO(),
    endIso: end.toISO(),
    progress,
    isCurrent,
    isPast,
    color: PLANET_COLORS[planet] || '#9a8878',
  }
}

function calculateVimshottariDashas({ moonLongitude, birthLocalIso, timezoneId, referenceDate }) {
  if (moonLongitude == null || !birthLocalIso || !timezoneId) {
    return []
  }

  const birth = DateTime.fromISO(birthLocalIso, { zone: timezoneId })
  if (!birth.isValid) {
    return []
  }

  const now = referenceDate
    ? DateTime.fromJSDate(referenceDate).setZone(timezoneId)
    : DateTime.now().setZone(timezoneId)

  const siderealMoon = normalizeDegrees(moonLongitude)
  const nakshatraIndex = Math.floor(siderealMoon / NAKSHATRA_SPAN)
  const positionInNakshatra = (siderealMoon % NAKSHATRA_SPAN) / NAKSHATRA_SPAN

  let lordIndex = nakshatraIndex % DASHA_ORDER.length
  const firstLord = DASHA_ORDER[lordIndex]
  const firstDuration = (1 - positionInNakshatra) * DASHA_YEARS[firstLord]

  const dashas = []
  let cursor = birth
  let elapsedYears = 0

  dashas.push(buildDashaEntry(firstLord, cursor, addYears(cursor, firstDuration), now))
  cursor = addYears(cursor, firstDuration)
  elapsedYears += firstDuration
  lordIndex = (lordIndex + 1) % DASHA_ORDER.length

  while (elapsedYears < TOTAL_CYCLE_YEARS - 0.001) {
    const lord = DASHA_ORDER[lordIndex]
    const duration = Math.min(DASHA_YEARS[lord], TOTAL_CYCLE_YEARS - elapsedYears)
    const end = addYears(cursor, duration)

    dashas.push(buildDashaEntry(lord, cursor, end, now))

    cursor = end
    elapsedYears += duration
    lordIndex = (lordIndex + 1) % DASHA_ORDER.length
  }

  return dashas
}

module.exports = {
  calculateVimshottariDashas,
  DASHA_ORDER,
  DASHA_YEARS,
}
