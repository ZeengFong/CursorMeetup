import type { LatLng } from './types'

const UA = 'PartybusWeb/0.1 (demo; contact: local)'

export async function geocode(query: string): Promise<LatLng> {
  const q = query.trim()
  if (!q) throw new Error('Enter a place name.')

  const url = `/api/nominatim/search?q=${encodeURIComponent(q)}&format=json&limit=1`
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'en',
    },
  })
  if (!res.ok) throw new Error(`Geocoding failed (${res.status}).`)
  const data = (await res.json()) as { lat: string; lon: string }[]
  if (!data.length) throw new Error(`Could not find “${q}”. Try a more specific name.`)

  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
}
