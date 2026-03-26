import type { LatLng, POICandidate } from './types'
import {
  cumulativeDistances,
  detourMinutes,
  distanceFromRouteMeters,
  routeProgressMeters,
  sampleCoordinates,
} from './planning'

function dedupeKey(name: string, lat: number, lng: number): string {
  return `${name}|${lat.toFixed(4)}|${lng.toFixed(4)}`
}

function buildOverpassQuery(lat: number, lon: number, radius: number): string {
  return `
[out:json][timeout:25];
(
  node["tourism"](around:${radius},${lat},${lon});
  node["historic"](around:${radius},${lat},${lon});
  node["amenity"="restaurant"](around:${radius},${lat},${lon});
  node["amenity"="cafe"](around:${radius},${lat},${lon});
  node["amenity"="fuel"](around:${radius},${lat},${lon});
);
out center;
`.trim()
}

type OverpassElement = {
  type: string
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

async function fetchOverpassAround(lat: number, lon: number, radius: number): Promise<OverpassElement[]> {
  const body = `data=${encodeURIComponent(buildOverpassQuery(lat, lon, radius))}`
  const res = await fetch('/api/overpass/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) return []
  const data = (await res.json()) as { elements?: OverpassElement[] }
  return data.elements ?? []
}

function elementLatLon(el: OverpassElement): { lat: number; lng: number } | null {
  if (el.lat != null && el.lon != null) return { lat: el.lat, lng: el.lon }
  if (el.center) return { lat: el.center.lat, lng: el.center.lon }
  return null
}

export function mockPOIsAlongRoute(polyline: LatLng[], cumulative: number[]): POICandidate[] {
  if (polyline.length < 2) return []
  const samples = sampleCoordinates(polyline, 5)
  const out: POICandidate[] = []
  let i = 0
  for (const s of samples) {
    const lat = s.lat + 0.002 * Math.sin(i)
    const lng = s.lng + 0.002 * Math.cos(i)
    const p = { lat, lng }
    const det = detourMinutes(distanceFromRouteMeters(p, polyline))
    const progress = routeProgressMeters(p, polyline, cumulative)
    out.push({
      id: `mock-${i}`,
      name: `Demo stop ${i + 1}`,
      lat,
      lng,
      routeProgressMeters: progress,
      detourMinutes: det,
    })
    i += 1
  }
  return out
}

export async function collectPOICandidatesAlongRoute(
  polyline: LatLng[]
): Promise<POICandidate[]> {
  const cumulative = cumulativeDistances(polyline)
  const samples = sampleCoordinates(polyline, 10)
  const seen = new Set<string>()
  const candidates: POICandidate[] = []

  const maxQueries = 10
  for (let idx = 0; idx < Math.min(samples.length, maxQueries); idx++) {
    const center = samples[idx]
    let elements: OverpassElement[] = []
    try {
      elements = await fetchOverpassAround(center.lat, center.lng, 4000)
    } catch {
      continue
    }
    for (const el of elements) {
      const ll = elementLatLon(el)
      if (!ll) continue
      const name =
        el.tags?.name ?? el.tags?.['name:en'] ?? el.tags?.tourism ?? el.tags?.amenity ?? 'Point of interest'
      const key = dedupeKey(name, ll.lat, ll.lng)
      if (seen.has(key)) continue
      seen.add(key)
      const p = { lat: ll.lat, lng: ll.lng }
      const det = detourMinutes(distanceFromRouteMeters(p, polyline))
      const progress = routeProgressMeters(p, polyline, cumulative)
      candidates.push({
        id: `${key}-${candidates.length}`,
        name,
        lat: ll.lat,
        lng: ll.lng,
        routeProgressMeters: progress,
        detourMinutes: det,
      })
    }
  }

  if (candidates.length === 0) {
    return mockPOIsAlongRoute(polyline, cumulative)
  }
  return candidates
}

export async function collectCoolPOIsAroundPoint(
  center: LatLng,
  radiusMeters: number
): Promise<{ name: string; lat: number; lng: number }[]> {
  const capped = Math.min(Math.max(radiusMeters, 2000), 45000)
  const seen = new Set<string>()
  const out: { name: string; lat: number; lng: number }[] = []

  try {
    const elements = await fetchOverpassAround(center.lat, center.lng, capped)
    for (const el of elements) {
      const ll = elementLatLon(el)
      if (!ll) continue
      const name =
        el.tags?.name ?? el.tags?.['name:en'] ?? el.tags?.tourism ?? el.tags?.historic ?? 'Place'
      const key = dedupeKey(name, ll.lat, ll.lng)
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ name, lat: ll.lat, lng: ll.lng })
    }
  } catch {
    /* empty */
  }

  if (out.length < 4) {
    try {
      const wider = await fetchOverpassAround(center.lat, center.lng, 45000)
      for (const el of wider) {
        const ll = elementLatLon(el)
        if (!ll) continue
        const name =
          el.tags?.name ?? el.tags?.['name:en'] ?? el.tags?.tourism ?? el.tags?.historic ?? 'Place'
        const key = dedupeKey(name, ll.lat, ll.lng)
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ name, lat: ll.lat, lng: ll.lng })
      }
    } catch {
      /* empty */
    }
  }

  return out
}
