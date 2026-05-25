const { col } = require('../db/connection')
const { reverseGeocodeCoordinates } = require('./locationService')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function aggregateGeoStats(users) {
  const countryMap = new Map()
  const regionMap = new Map()
  let locatedUsers = 0

  for (const user of users) {
    const location = user.location
    if (!location?.latitude && !location?.countryCode) continue

    locatedUsers += 1
    const countryCode = location.countryCode
    const countryName = location.country

    if (countryCode) {
      const existing = countryMap.get(countryCode) || { code: countryCode, name: countryName, count: 0 }
      existing.count += 1
      if (!existing.name && countryName) existing.name = countryName
      countryMap.set(countryCode, existing)
    }

    if (countryCode && location.region) {
      const key = `${countryCode}|${location.region}`
      const existing = regionMap.get(key) || {
        countryCode,
        country: countryName,
        region: location.region,
        count: 0,
      }
      existing.count += 1
      regionMap.set(key, existing)
    }
  }

  return {
    locatedUsers,
    countries: [...countryMap.values()].sort((a, b) => b.count - a.count),
    regions: [...regionMap.values()].sort((a, b) => b.count - a.count),
  }
}

async function backfillMissingGeo(users, { maxLookups = 12 } = {}) {
  let lookups = 0

  for (const user of users) {
    if (lookups >= maxLookups) break

    const location = user.location
    if (!location?.latitude || !location?.longitude || location.countryCode) continue

    try {
      const geo = await reverseGeocodeCoordinates(location.latitude, location.longitude)
      lookups += 1

      if (geo) {
        const enriched = { ...location, ...geo }
        await col('users').updateOne({ _id: user._id }, { $set: { location: enriched, updatedAt: new Date() } })
        user.location = enriched
      }

      if (lookups < maxLookups) {
        await sleep(1100)
      }
    } catch {
      // Skip failed reverse geocode lookups
    }
  }
}

async function getGeoStats() {
  const users = await col('users')
    .find(
      {
        $or: [
          { 'location.latitude': { $exists: true } },
          { 'location.countryCode': { $exists: true } },
        ],
      },
      { projection: { location: 1 } },
    )
    .toArray()

  await backfillMissingGeo(users)

  const stats = aggregateGeoStats(users)

  return {
    ...stats,
    totalUsers: users.length,
    pendingGeocode: users.filter(
      (user) => user.location?.latitude && !user.location?.countryCode,
    ).length,
  }
}

module.exports = {
  getGeoStats,
  aggregateGeoStats,
}
