const { DateTime } = require('luxon')

function parseDateOfBirth(dateOfBirth) {
  if (!dateOfBirth) return null
  const dt = DateTime.fromISO(String(dateOfBirth).slice(0, 10))
  return dt.isValid ? dt : null
}

function computeLifeStage(dateOfBirth, referenceDate = new Date()) {
  const dob = parseDateOfBirth(dateOfBirth)
  if (!dob) return null

  const now = DateTime.fromJSDate(referenceDate)
  const years = Math.floor(now.diff(dob, 'years').years)
  const months = Math.floor(now.diff(dob, 'months').months % 12)

  return {
    dateOfBirth: dob.toISODate(),
    referenceDate: now.toISODate(),
    ageYears: Math.max(0, years),
    ageMonthsRemainder: Math.max(0, months),
    ageLabel: months > 0 ? `${years} years, ${months} months` : `${years} years`,
  }
}

function ageAtIso(isoDate, dateOfBirth) {
  const dob = parseDateOfBirth(dateOfBirth)
  const point = isoDate ? DateTime.fromISO(isoDate) : null
  if (!dob?.isValid || !point?.isValid) return null
  const years = Math.floor(point.diff(dob, 'years').years)
  return Math.max(0, years)
}

function formatLifeStageSection(chartContext = {}) {
  const stage = computeLifeStage(chartContext.dateOfBirth)
  if (!stage) {
    return 'Life stage: date of birth not available — infer timing from dasha periods when present.'
  }

  return [
    `Date of birth: ${stage.dateOfBirth}`,
    `Today's date (reference): ${stage.referenceDate}`,
    `Current age: ${stage.ageLabel} (${stage.ageYears} years old)`,
    'Always interpret the user\'s life holistically from birth to present and into future periods — not only the current moment.',
  ].join('\n')
}

function formatDashaTimelineWithAges(dashas = [], dateOfBirth) {
  if (!dashas.length) {
    return 'Dasha timeline not available.'
  }

  return dashas
    .map((dasha) => {
      const planet = dasha.planet
      const startAge = ageAtIso(dasha.startIso, dateOfBirth)
      const endAge = dasha.endIso ? ageAtIso(dasha.endIso, dateOfBirth) : null
      const ageRange =
        startAge != null && endAge != null
          ? ` (approx. ages ${startAge}–${Math.max(startAge, endAge - 1)})`
          : startAge != null
            ? ` (from approx. age ${startAge})`
            : ''

      let phase = '[FUTURE]'
      if (dasha.isPast) phase = '[PAST]'
      else if (dasha.isCurrent) phase = '[CURRENT MAHADASHA]'

      const progress =
        dasha.isCurrent && dasha.progress > 0
          ? ` — ${dasha.progress}% of this period elapsed`
          : ''

      return `${planet}: ${dasha.period}${ageRange} ${phase}${progress}`.trim()
    })
    .join('\n')
}

function formatMarriageIndicators(chartContext = {}) {
  const planets = chartContext.planets || []
  const seventh = planets.find((p) => p.house === 6)
  const lines = [
    'Marriage / partnership timing indicators (use with full dasha timeline from birth):',
    '- 7th house (partnerships): ' + (seventh?.codes?.length
      ? seventh.codes.join(', ')
      : seventh?.label || 'see chart placements'),
    '- Navamsa (D9) is relevant for marriage and spouse themes in Jyotish traditions.',
    '- Venus and Jupiter mahadasha/antardasha periods are commonly weighed for marriage timing.',
    '- Scan PAST, CURRENT, and FUTURE dasha periods — not only the active mahadasha.',
  ]

  const venusHouse = planets.find((p) => (p.codes || []).includes('venus'))
  if (venusHouse) {
    lines.push(`- Venus occupies house ${venusHouse.house + 1} in the natal chart.`)
  }

  return lines.join('\n')
}

function buildLifecycleTimingInstruction(systemId) {
  const isVedic = /vedic|jyotish|south indian|north indian/i.test(systemId || '')
  const isNumerology = /numerology/i.test(systemId || '')
  const isWestern = /western|sidereal|hellenistic|persian|arabic/i.test(systemId || '')
  const isBaZi = /bazi|chinese/i.test(systemId || '')

  const shared = [
    'LIFECYCLE & TIMING (mandatory for all answers):',
    '1. Compute the user\'s current age from their date of birth and today\'s reference date in the chart context.',
    '2. Read their life as a continuous arc FROM BIRTH — consider childhood, youth, past phases, where they are now, and what lies ahead. Do not answer as if only the present moment matters.',
    '3. When the question involves timing (marriage, career change, children, relocation, health phases, accidents, loss, etc.), provide a TIMELINE using the tradition\'s cycle system from birth.',
    '4. In summary (1-2 sentences) state the key timing answer; in clearExplanation expand with ages and calendar periods in plain language.',
    '5. In detailedExplanation.chartReasoning, cite the specific dasha/cycle periods, houses, and planets that support each window — including past windows if relevant ("may have been favorable earlier around age X").',
  ]

  if (isVedic) {
    shared.push(
      '6. VEDIC TIMING: Use the full Vimshottari dasha timeline from birth. For marriage questions, weigh 7th house, 7th lord, Venus, Jupiter, Moon, Navamsa (D9), and relevant yogas. List favorable marriage windows across past, current, and future mahadasha/antardasha periods with ages and dates.',
    )
  } else if (isNumerology) {
    shared.push(
      '6. NUMEROLOGY TIMING: Derive life path and personal year/month cycles from the birth date. For marriage or major life events, map personal years and pinnacle/challenge cycles across the full lifespan, not only the current year.',
    )
  } else if (isBaZi) {
    shared.push(
      '6. BAZI TIMING: Use luck pillars and element cycles from birth through the full life. For marriage or partnerships, identify favorable pillar periods across past, present, and future with approximate ages.',
    )
  } else if (isWestern) {
    shared.push(
      '6. WESTERN TIMING: Use natal placements plus transits, progressions, and profections from birth. For marriage, weigh 7th house, Venus, lunar nodes, and Saturn cycles. Give age-linked windows across the life span.',
    )
  } else {
    shared.push(
      '6. Use the tradition\'s standard timing techniques from birth through the full lifespan. For marriage or partnership questions, identify multiple favorable windows with approximate ages and periods.',
    )
  }

  return shared.join('\n')
}

module.exports = {
  computeLifeStage,
  formatLifeStageSection,
  formatDashaTimelineWithAges,
  formatMarriageIndicators,
  buildLifecycleTimingInstruction,
}
