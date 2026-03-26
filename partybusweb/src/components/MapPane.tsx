import { useEffect } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { LatLng, PlannedStop } from '../lib/types'

const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const attribution = '&copy; OpenStreetMap contributors'

function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length < 1) return
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 12)
      return
    }
    const b = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]))
    if (b.isValid()) map.fitBounds(b, { padding: [36, 36], maxZoom: 14 })
  }, [map, points])
  return null
}

export function MapPane(props: {
  route: LatLng[]
  stops: PlannedStop[]
  dayDestination: { lat: number; lng: number; name: string } | null
}) {
  const { route, stops, dayDestination } = props
  const allPoints: LatLng[] = [...route]
  if (dayDestination) allPoints.push({ lat: dayDestination.lat, lng: dayDestination.lng })
  for (const s of stops) allPoints.push({ lat: s.lat, lng: s.lng })

  const center: [number, number] =
    route.length >= 1 ? [route[0].lat, route[0].lng] : [37.7749, -122.4194]

  if (route.length < 2 && !dayDestination && stops.length === 0) {
    return (
      <div
        style={{
          height: 320,
          width: '100%',
          background: 'linear-gradient(180deg, #e8eef5 0%, #dde5f0 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#64748b',
          fontSize: 14,
        }}
      >
        Plan a route to see the map
      </div>
    )
  }

  return (
    <div style={{ height: 320, width: '100%', borderRadius: 8, overflow: 'hidden' }}>
      <MapContainer center={center} zoom={11} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer attribution={attribution} url={tileUrl} />
        {allPoints.length >= 2 ? <FitBounds points={allPoints} /> : null}
        {route.length >= 2 ? (
          <Polyline
            positions={route.map((p) => [p.lat, p.lng] as [number, number])}
            pathOptions={{ color: '#2563eb', weight: 5 }}
          />
        ) : null}
        {stops.map((s, i) => (
          <CircleMarker
            key={s.id}
            center={[s.lat, s.lng]}
            radius={12}
            pathOptions={{ color: '#c2410c', fillColor: '#ea580c', fillOpacity: 1 }}
          >
            <Tooltip direction="top" permanent>
              {i + 1}. {s.name}
            </Tooltip>
          </CircleMarker>
        ))}
        {dayDestination ? (
          <CircleMarker
            center={[dayDestination.lat, dayDestination.lng]}
            radius={14}
            pathOptions={{ color: '#15803d', fillColor: '#22c55e', fillOpacity: 1 }}
          >
            <Tooltip direction="top" permanent>
              {dayDestination.name}
            </Tooltip>
          </CircleMarker>
        ) : null}
      </MapContainer>
    </div>
  )
}
