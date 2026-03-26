import type { DrivingRoute, LatLng } from './types'

export async function fetchDrivingRoute(from: LatLng, to: LatLng): Promise<DrivingRoute> {
  const { lng: lon1, lat: lat1 } = from
  const { lng: lon2, lat: lat2 } = to
  const url = `/api/osrm/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=full&geometries=geojson`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Routing failed (${res.status}).`)
  const data = (await res.json()) as {
    routes?: { duration: number; distance: number; geometry: { coordinates: [number, number][] } }[]
    code?: string
  }
  const route = data.routes?.[0]
  if (!route) throw new Error('No driving route found between those places.')

  const coords = route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }))
  return {
    durationSeconds: route.duration,
    distanceMeters: route.distance,
    coordinates: coords,
  }
}
