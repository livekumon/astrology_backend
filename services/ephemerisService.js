const sweph = require('sweph')
const { DateTime } = require('luxon')

const SIGNS = [
  'Aries',
  'Taurus',
  'Gemini',
  'Cancer',
  'Leo',
  'Virgo',
  'Libra',
  'Scorpio',
  'Sagittarius',
  'Capricorn',
  'Aquarius',
  'Pisces',
]

const PLANET_BODIES = [
  { code: 'sun', id: sweph.constants.SE_SUN },
  { code: 'moon', id: sweph.constants.SE_MOON },
  { code: 'mars', id: sweph.constants.SE_MARS },
  { code: 'mercury', id: sweph.constants.SE_MERCURY },
  { code: 'jupiter', id: sweph.constants.SE_JUPITER },
  { code: 'venus', id: sweph.constants.SE_VENUS },
  { code: 'saturn', id: sweph.constants.SE_SATURN },
  { code: 'rahu', id: sweph.constants.SE_MEAN_NODE },
]

const CALC_FLAGS = sweph.constants.SEFLG_SWIEPH | sweph.constants.SEFLG_SIDEREAL

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360
}

function signIndexFromLongitude(longitude) {
  return Math.floor(normalizeDegrees(longitude) / 30)
}

function signFromLongitude(longitude) {
  return SIGNS[signIndexFromLongitude(longitude)]
}

function buildJulianDayUtc(dateOfBirth, timeOfBirth, timezoneId) {
  const [hour, minute] = timeOfBirth.split(':').map(Number)
  const localBirth = DateTime.fromISO(dateOfBirth, { zone: timezoneId }).set({
    hour,
    minute,
    second: 0,
    millisecond: 0,
  })

  if (!localBirth.isValid) {
    throw new Error(`Invalid birth datetime: ${dateOfBirth} ${timeOfBirth} (${timezoneId})`)
  }

  const utc = localBirth.toUTC()
  const jd = sweph.julday(
    utc.year,
    utc.month,
    utc.day,
    utc.hour + utc.minute / 60 + utc.second / 3600,
    sweph.constants.SE_GREG_CAL,
  )

  return { jd, utcIso: utc.toISO(), localIso: localBirth.toISO() }
}

function calculateAscendantLongitude(jd, latitude, longitude) {
  const result = sweph.houses_ex(jd, CALC_FLAGS, latitude, longitude, 'P')
  return result.data.points[0]
}

function getWholeSignHouse(planetLongitude, ascendantLongitude) {
  const planetSign = signIndexFromLongitude(planetLongitude)
  const ascSign = signIndexFromLongitude(ascendantLongitude)
  return (planetSign - ascSign + 12) % 12
}

function groupPlanetsByHouse(planetResults, ascendantLongitude) {
  const houseMap = new Map()

  for (const planet of planetResults) {
    const house = getWholeSignHouse(planet.longitude, ascendantLongitude)
    if (!houseMap.has(house)) {
      houseMap.set(house, [])
    }
    houseMap.get(house).push(planet.code)
  }

  return Array.from(houseMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([house, codes]) => ({ house, codes }))
}

function calculateKetu(longitude) {
  return normalizeDegrees(longitude + 180)
}

function calculateVedicChart({ dateOfBirth, timeOfBirth, birthLocation }) {
  if (!birthLocation?.timezoneId || birthLocation.latitude == null || birthLocation.longitude == null) {
    throw new Error('Birth location with timezone and coordinates is required for chart calculation')
  }

  sweph.set_sid_mode(sweph.constants.SE_SIDM_LAHIRI, 0, 0)

  const { jd, utcIso, localIso } = buildJulianDayUtc(
    dateOfBirth,
    timeOfBirth,
    birthLocation.timezoneId,
  )

  const ascendantLongitude = calculateAscendantLongitude(
    jd,
    birthLocation.latitude,
    birthLocation.longitude,
  )

  const planetResults = PLANET_BODIES.map(({ code, id }) => {
    const result = sweph.calc_ut(jd, id, CALC_FLAGS)
    return {
      code,
      longitude: result.data[0],
      sign: signFromLongitude(result.data[0]),
    }
  })

  const rahu = planetResults.find((planet) => planet.code === 'rahu')
  const ketuLongitude = calculateKetu(rahu.longitude)
  planetResults.push({
    code: 'ketu',
    longitude: ketuLongitude,
    sign: signFromLongitude(ketuLongitude),
  })

  const sun = planetResults.find((planet) => planet.code === 'sun')
  const moon = planetResults.find((planet) => planet.code === 'moon')

  const planets = groupPlanetsByHouse(planetResults, ascendantLongitude)

  return {
    sunSign: sun.sign,
    moonSign: moon.sign,
    ascSign: signFromLongitude(ascendantLongitude),
    ascendantLongitude,
    planets,
    planetDetails: planetResults,
    ayanamsa: 'Lahiri',
    julianDay: jd,
    utcIso,
    localIso,
  }
}

module.exports = {
  SIGNS,
  calculateVedicChart,
  signFromLongitude,
}
