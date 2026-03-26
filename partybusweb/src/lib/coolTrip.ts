import type { DrivingRoute, LatLng } from './types'
import { collectCoolPOIsAroundPoint } from './poi'
import { fetchDrivingRoute } from './routing'

/**
 * Picks a sightseeing POI reachable within maxTravelSeconds; maximizes drive time under the cap.
 */
export async function findCoolDestinationWithinBudget(
  start: LatLng,
  maxTravelSeconds: number
): Promise<{ name: string; destination: LatLng; route: DrivingRoute }> {
  if (maxTravelSeconds <= 0) throw new Error('Enter a drive time greater than zero.')

  const hours = maxTravelSeconds / 3600
  const radiusMeters = Math.min(Math.max(hours * 65_000, 5000), 45_000)

  let candidates = await collectCoolPOIsAroundPoint(start, radiusMeters)
  if (candidates.length < 8) {
    const wider = await collectCoolPOIsAroundPoint(start, 45_000)
    const seen = new Set(candidates.map((c) => `${c.name}|${c.lat.toFixed(4)}|${c.lng.toFixed(4)}`))
    for (const c of wider) {
      const k = `${c.name}|${c.lat.toFixed(4)}|${c.lng.toFixed(4)}`
      if (!seen.has(k)) {
        seen.add(k)
        candidates.push(c)
      }
    }
  }

  candidates.sort((a, b) => {
    const da =
      Math.hypot(a.lat - start.lat, a.lng - start.lng)
    const db =
      Math.hypot(b.lat - start.lat, b.lng - start.lng)
    return da - db
  })

  let best: { name: string; destination: LatLng; route: DrivingRoute } | null = null
  const limit = Math.min(candidates.length, 32)

  for (let i = 0; i < limit; i++) {
    const c = candidates[i]
    const dest = { lat: c.lat, lng: c.lng }
    try {
      const route = await fetchDrivingRoute(start, dest)
      if (route.durationSeconds <= maxTravelSeconds && route.durationSeconds > 0) {
        if (
          !best ||
          route.durationSeconds > best.route.durationSeconds
        ) {
          best = { name: c.name, destination: dest, route }
        }
      }
    } catch {
      continue
    }
  }

  if (!best) {
    throw new Error(
      'No interesting place turned up within that drive time. Try a longer limit or a different starting point.'
    )
  }
  return best
}
