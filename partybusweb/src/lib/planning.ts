import type { LatLng, PlannedStop, POICandidate } from './types'

function toRad(d: number): number {
  return (d * Math.PI) / 180
}

/** Geodesic distance in meters (WGS84 sphere). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function cumulativeDistances(coordinates: LatLng[]): number[] {
  if (coordinates.length === 0) return []
  const acc: number[] = [0]
  let total = 0
  for (let i = 1; i < coordinates.length; i++) {
    total += distanceMeters(coordinates[i - 1], coordinates[i])
    acc.push(total)
  }
  return acc
}

export function sampleCoordinates(coordinates: LatLng[], count: number): LatLng[] {
  if (coordinates.length < 2 || count < 1) return coordinates
  const cum = cumulativeDistances(coordinates)
  const total = cum[cum.length - 1]
  if (total <= 0) return [coordinates[Math.floor(coordinates.length / 2)]]
  const result: LatLng[] = []
  for (let k = 0; k < count; k++) {
    const target = (total * (k + 0.5)) / count
    const c = pointAlongPolyline(coordinates, cum, target)
    if (c) result.push(c)
  }
  return result.length ? result : [coordinates[Math.floor(coordinates.length / 2)]]
}

function pointAlongPolyline(coordinates: LatLng[], cumulative: number[], distanceAlong: number): LatLng | null {
  const total = cumulative[cumulative.length - 1]
  const d = Math.min(Math.max(distanceAlong, 0), total)
  const idx = cumulative.findIndex((x) => x >= d)
  if (idx <= 0) return coordinates[0] ?? null
  const i = Math.max(idx, 1)
  const segStart = cumulative[i - 1]
  const segEnd = cumulative[i]
  const t = segEnd > segStart ? (d - segStart) / (segEnd - segStart) : 0
  const a = coordinates[i - 1]
  const b = coordinates[i]
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  }
}

function projectOnSegment(p: LatLng, a: LatLng, b: LatLng): { proj: LatLng; t: number } {
  const ax = a.lat
  const ay = a.lng
  const bx = b.lat
  const by = b.lng
  const px = p.lat
  const py = p.lng
  const abx = bx - ax
  const aby = by - ay
  const apx = px - ax
  const apy = py - ay
  const abLenSq = abx * abx + aby * aby
  if (abLenSq < 1e-18) return { proj: a, t: 0 }
  let t = (apx * abx + apy * aby) / abLenSq
  t = Math.min(1, Math.max(0, t))
  return {
    proj: { lat: ax + t * abx, lng: ay + t * aby },
    t,
  }
}

export function routeProgressMeters(point: LatLng, polyline: LatLng[], cumulative: number[]): number {
  if (polyline.length < 2 || cumulative.length !== polyline.length) return 0
  let bestDist = Number.POSITIVE_INFINITY
  let bestProgress = 0
  for (let i = 1; i < polyline.length; i++) {
    const a = polyline[i - 1]
    const b = polyline[i]
    const { proj, t } = projectOnSegment(point, a, b)
    const segStart = cumulative[i - 1]
    const segLen = cumulative[i] - cumulative[i - 1]
    const along = segStart + t * segLen
    const d = distanceMeters(point, proj)
    if (d < bestDist) {
      bestDist = d
      bestProgress = along
    }
  }
  return bestProgress
}

export function distanceFromRouteMeters(point: LatLng, polyline: LatLng[]): number {
  if (polyline.length < 2) return 0
  let best = Number.POSITIVE_INFINITY
  for (let i = 1; i < polyline.length; i++) {
    const a = polyline[i - 1]
    const b = polyline[i]
    const { proj } = projectOnSegment(point, a, b)
    best = Math.min(best, distanceMeters(point, proj))
  }
  return best
}

export function detourMinutes(offRouteMeters: number, assumedKmh = 45): number {
  const km = offRouteMeters / 1000
  if (assumedKmh <= 0) return 0
  return 2 * (km / assumedKmh) * 60
}

export function packStops(
  candidates: POICandidate[],
  budgetMinutes: number,
  defaultDwell: number
): PlannedStop[] {
  const sorted = [...candidates].sort((a, b) => {
    if (a.routeProgressMeters !== b.routeProgressMeters) {
      return a.routeProgressMeters - b.routeProgressMeters
    }
    return a.detourMinutes - b.detourMinutes
  })
  let used = 0
  const result: PlannedStop[] = []
  let order = 1
  for (const c of sorted) {
    const dwell = defaultDwell
    const cost = c.detourMinutes + dwell
    if (used + cost <= budgetMinutes) {
      result.push({
        id: crypto.randomUUID(),
        name: c.name,
        lat: c.lat,
        lng: c.lng,
        dwellMinutes: dwell,
        detourMinutes: c.detourMinutes,
        listOrder: order,
      })
      used += cost
      order += 1
    }
  }
  return result
}
