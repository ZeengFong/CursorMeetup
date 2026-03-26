export type LatLng = { lat: number; lng: number }

export interface PlannedStop {
  id: string
  name: string
  lat: number
  lng: number
  dwellMinutes: number
  detourMinutes: number
  listOrder: number
}

export interface POICandidate {
  id: string
  name: string
  lat: number
  lng: number
  routeProgressMeters: number
  detourMinutes: number
}

export interface DrivingRoute {
  durationSeconds: number
  distanceMeters: number
  coordinates: LatLng[]
}
