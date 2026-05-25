const { find: findTimezone } = require('geo-tz')
const { DateTime } = require('luxon')

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'JyotishAstrologyApp/1.0 (birth-chart-poc)'

const PLACE_FALLBACKS = [
  {
    pattern: /eluru/i,
    latitude: 16.7107,
    longitude: 81.0952,
    resolvedPlace: 'Eluru, Andhra Pradesh, India',
    country: 'India',
  },
  {
    pattern: /parvatipuram/i,
    latitude: 18.783,
    longitude: 83.266,
    resolvedPlace: 'Parvatipuram, Andhra Pradesh, India',
    country: 'India',
  },
  {
    pattern: /india/i,
    latitude: 20.5937,
    longitude: 78.9629,
    resolvedPlace: null,
    country: 'India',
  },
]

async function geocodePlace(placeOfBirth) {
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(placeOfBirth)}&format=json&limit=1&addressdetails=1`

  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Geocoding failed (${response.status})`)
  }

  const results = await response.json()
  if (!results?.length) {
    return null
  }

  const hit = results[0]
  return {
    resolvedPlace: hit.display_name,
    country: hit.address?.country || null,
    latitude: Number.parseFloat(hit.lat),
    longitude: Number.parseFloat(hit.lon),
  }
}

function matchFallback(placeOfBirth) {
  for (const fallback of PLACE_FALLBACKS) {
    if (fallback.pattern.test(placeOfBirth)) {
      return {
        resolvedPlace: fallback.resolvedPlace || placeOfBirth,
        country: fallback.country,
        latitude: fallback.latitude,
        longitude: fallback.longitude,
        source: 'fallback',
      }
    }
  }

  return null
}

function buildLocalBirthDateTime(dateOfBirth, timeOfBirth, timezoneId) {
  const [hour, minute] = timeOfBirth.split(':').map(Number)
  const localBirth = DateTime.fromISO(dateOfBirth, { zone: timezoneId }).set({
    hour,
    minute,
    second: 0,
    millisecond: 0,
  })

  if (!localBirth.isValid) {
    throw new Error(`Invalid local birth datetime for ${timezoneId}`)
  }

  return localBirth
}

async function resolveBirthLocation({ placeOfBirth, dateOfBirth, timeOfBirth }) {
  let geo = null

  try {
    geo = await geocodePlace(placeOfBirth)
  } catch {
    geo = null
  }

  if (!geo) {
    geo = matchFallback(placeOfBirth)
  }

  if (!geo) {
    const timezoneId = 'UTC'
    const localBirth = buildLocalBirthDateTime(dateOfBirth, timeOfBirth, timezoneId)

    return {
      inputPlace: placeOfBirth,
      resolvedPlace: placeOfBirth,
      country: null,
      latitude: null,
      longitude: null,
      timezoneId,
      timezoneLabel: 'UTC',
      utcOffset: localBirth.toFormat('ZZ'),
      localBirthIso: localBirth.toISO(),
      localBirthDisplay: `${dateOfBirth} ${timeOfBirth}`,
      geocodeSource: 'unknown',
      timezoneInstruction:
        `Birth date ${dateOfBirth} and time ${timeOfBirth} should be treated as local civil time at ${placeOfBirth}. ` +
        'Exact timezone could not be resolved — use the stated place carefully when inferring rashi/lagna.',
    }
  }

  const timezones = findTimezone(geo.latitude, geo.longitude)
  const timezoneId = timezones[0] || (geo.country === 'India' ? 'Asia/Kolkata' : 'UTC')
  const localBirth = buildLocalBirthDateTime(dateOfBirth, timeOfBirth, timezoneId)
  const timezoneLabel = getTimezoneLabel(timezoneId, localBirth)

  return {
    inputPlace: placeOfBirth,
    resolvedPlace: geo.resolvedPlace || placeOfBirth,
    country: geo.country,
    latitude: geo.latitude,
    longitude: geo.longitude,
    timezoneId,
    timezoneLabel,
    utcOffset: localBirth.toFormat('ZZ'),
    localBirthIso: localBirth.toISO(),
    localBirthDisplay: `${dateOfBirth} ${timeOfBirth}`,
    geocodeSource: geo.source || 'nominatim',
    timezoneInstruction:
      `IMPORTANT: Birth date ${dateOfBirth} and time ${timeOfBirth} are LOCAL civil time at ${geo.resolvedPlace || placeOfBirth}. ` +
      `Timezone: ${timezoneId} (${timezoneLabel}, UTC${localBirth.toFormat('ZZ')}). ` +
      'Do NOT interpret this as UTC, server time, or the user’s current timezone. ' +
      'Use this birth location and local timezone when determining rashi, nakshatra, lagna, and house placements.',
  }
}

function getTimezoneLabel(timezoneId, localBirth) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezoneId,
      timeZoneName: 'longGeneric',
    }).formatToParts(localBirth.toJSDate())

    return parts.find((part) => part.type === 'timeZoneName')?.value || timezoneId
  } catch {
    return timezoneId
  }
}

async function reverseGeocodeCoordinates(latitude, longitude) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&format=json&addressdetails=1`

  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    return null
  }

  const hit = await response.json()
  const address = hit.address || {}

  return {
    label: hit.display_name || null,
    country: address.country || null,
    countryCode: address.country_code ? String(address.country_code).toUpperCase() : null,
    region: address.state || address.region || address.state_district || null,
    city: address.city || address.town || address.village || address.county || null,
    geocodedAt: new Date(),
  }
}

module.exports = {
  resolveBirthLocation,
  reverseGeocodeCoordinates,
}
