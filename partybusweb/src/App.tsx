import { useMemo, useState } from 'react'
import { MapPane } from './components/MapPane'
import { geocode } from './lib/geocoding'
import { fetchDrivingRoute } from './lib/routing'
import { collectPOICandidatesAlongRoute } from './lib/poi'
import { packStops } from './lib/planning'
import { findCoolDestinationWithinBudget } from './lib/coolTrip'
import type { LatLng, PlannedStop } from './lib/types'

type TripMode = 'road' | 'cool'

const DEFAULT_DWELL = 10

export default function App() {
  const [mode, setMode] = useState<TripMode>('road')

  function switchMode(next: TripMode) {
    if (next === mode) return
    setMode(next)
    setRoute([])
    setStops([])
    setDayDest(null)
    setBaseDuration(null)
    setBaseDistance(null)
    setError(null)
  }

  const [fromQ, setFromQ] = useState('')
  const [toQ, setToQ] = useState('')
  const [budgetText, setBudgetText] = useState('30')

  const [coolStart, setCoolStart] = useState('')
  const [coolMaxMin, setCoolMaxMin] = useState('45')

  const [route, setRoute] = useState<LatLng[]>([])
  const [baseDuration, setBaseDuration] = useState<number | null>(null)
  const [baseDistance, setBaseDistance] = useState<number | null>(null)
  const [stops, setStops] = useState<PlannedStop[]>([])
  const [dayDest, setDayDest] = useState<{ lat: number; lng: number; name: string } | null>(null)

  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [error, setError] = useState<string | null>(null)

  const parsedBudget = useMemo(() => parseFloat(budgetText.replace(',', '.')) || 0, [budgetText])
  const parsedCoolMax = useMemo(() => parseFloat(coolMaxMin.replace(',', '.')) || 0, [coolMaxMin])

  const usedTotal = useMemo(
    () => stops.reduce((a, s) => a + s.detourMinutes + s.dwellMinutes, 0),
    [stops]
  )

  function formatDuration(sec: number): string {
    const m = Math.round(sec / 60)
    if (m >= 60) {
      const h = Math.floor(m / 60)
      const r = m % 60
      return r > 0 ? `${h} hr ${r} min` : `${h} hr`
    }
    return `${m} min`
  }

  function formatDistance(m: number): string {
    if (m >= 1000) return `${(m / 1000).toFixed(1)} km`
    return `${Math.round(m)} m`
  }

  async function runRoadTrip() {
    setError(null)
    setLoadingMsg('Planning route…')
    setLoading(true)
    try {
      const budget = parsedBudget
      if (budget <= 0) throw new Error('Enter a time budget greater than zero.')
      if (!fromQ.trim() || !toQ.trim()) throw new Error('Enter both origin and destination.')

      setDayDest(null)
      const [a, b] = await Promise.all([geocode(fromQ), geocode(toQ)])
      const driving = await fetchDrivingRoute(a, b)
      const candidates = await collectPOICandidatesAlongRoute(driving.coordinates)
      const packed = packStops(candidates, budget, DEFAULT_DWELL)

      setRoute(driving.coordinates)
      setBaseDuration(driving.durationSeconds)
      setBaseDistance(driving.distanceMeters)
      setStops(
        packed.map((s, i) => ({
          ...s,
          listOrder: i + 1,
        }))
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function runDayTrip() {
    setError(null)
    setLoadingMsg('Finding a cool spot…')
    setLoading(true)
    try {
      const maxMin = parsedCoolMax
      if (maxMin <= 0) throw new Error('Enter a drive time greater than zero.')
      if (!coolStart.trim()) throw new Error('Enter a starting point.')

      setStops([])
      const start = await geocode(coolStart)
      const result = await findCoolDestinationWithinBudget(start, maxMin * 60)

      setRoute(result.route.coordinates)
      setBaseDuration(result.route.durationSeconds)
      setBaseDistance(result.route.distanceMeters)
      setDayDest({ lat: result.destination.lat, lng: result.destination.lng, name: result.name })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  function updateDwell(id: string, delta: number) {
    setStops((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, dwellMinutes: Math.min(240, Math.max(0, s.dwellMinutes + delta)) }
          : s
      )
    )
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0' }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Partybus</h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: '#64748b' }}>
          Web preview · OSM + OSRM (dev proxy). No API keys.
        </p>
      </header>

      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => switchMode('road')}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 8,
              border: mode === 'road' ? '2px solid #2563eb' : '1px solid #cbd5e1',
              background: mode === 'road' ? '#eff6ff' : '#fff',
              cursor: 'pointer',
              fontWeight: mode === 'road' ? 600 : 400,
            }}
          >
            Along route
          </button>
          <button
            type="button"
            onClick={() => switchMode('cool')}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 8,
              border: mode === 'cool' ? '2px solid #2563eb' : '1px solid #cbd5e1',
              background: mode === 'cool' ? '#eff6ff' : '#fff',
              cursor: 'pointer',
              fontWeight: mode === 'cool' ? 600 : 400,
            }}
          >
            Somewhere cool
          </button>
        </div>

        {mode === 'road' ? (
          <>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>From</label>
            <input
              value={fromQ}
              onChange={(e) => setFromQ(e.target.value)}
              placeholder="City or address"
              style={{ width: '100%', padding: 8, marginBottom: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}
            />
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>To</label>
            <input
              value={toQ}
              onChange={(e) => setToQ(e.target.value)}
              placeholder="City or address"
              style={{ width: '100%', padding: 8, marginBottom: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <label style={{ fontSize: 13 }}>Stops time budget (min)</label>
              <input
                value={budgetText}
                onChange={(e) => setBudgetText(e.target.value)}
                inputMode="decimal"
                style={{ width: 72, padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}
              />
              <button
                type="button"
                onClick={runRoadTrip}
                disabled={loading}
                style={{
                  marginLeft: 'auto',
                  padding: '8px 16px',
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  cursor: loading ? 'wait' : 'pointer',
                  fontWeight: 600,
                }}
              >
                {loading ? '…' : 'Plan'}
              </button>
            </div>
          </>
        ) : (
          <>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Starting point</label>
            <input
              value={coolStart}
              onChange={(e) => setCoolStart(e.target.value)}
              placeholder="City or address"
              style={{ width: '100%', padding: 8, marginBottom: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <label style={{ fontSize: 13 }}>Max drive time (min)</label>
              <input
                value={coolMaxMin}
                onChange={(e) => setCoolMaxMin(e.target.value)}
                inputMode="decimal"
                style={{ width: 72, padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}
              />
              <button
                type="button"
                onClick={runDayTrip}
                disabled={loading}
                style={{
                  marginLeft: 'auto',
                  padding: '8px 16px',
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  cursor: loading ? 'wait' : 'pointer',
                  fontWeight: 600,
                }}
              >
                {loading ? '…' : 'Suggest'}
              </button>
            </div>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 0 }}>
              Finds a landmark, park, or similar POI you can reach within that one-way drive time.
            </p>
          </>
        )}

        {baseDuration != null && baseDistance != null && (
          <p style={{ fontSize: 13, color: '#475569', marginBottom: 8 }}>
            {mode === 'cool' && dayDest
              ? `Suggested: ${dayDest.name} · ${formatDuration(baseDuration)} · ${formatDistance(baseDistance)}`
              : `Base route: ${formatDuration(baseDuration)} · ${formatDistance(baseDistance)}`}
          </p>
        )}

        <div style={{ position: 'relative' }}>
          <MapPane route={route} stops={stops} dayDestination={dayDest} />
          {loading ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(255,255,255,0.65)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: 8,
                borderRadius: 8,
              }}
            >
              <span style={{ fontSize: 14 }}>{loadingMsg}</span>
            </div>
          ) : null}
        </div>

        {error ? (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              background: '#fef2f2',
              color: '#991b1b',
              borderRadius: 8,
              fontSize: 14,
            }}
          >
            {error}
          </div>
        ) : null}

        {mode === 'road' ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <strong>Stops</strong>
              {route.length >= 2 ? (
                <span style={{ fontVariantNumeric: 'tabular-nums', color: usedTotal > parsedBudget ? '#b91c1c' : '#64748b' }}>
                  {Math.round(usedTotal)} / {Math.round(parsedBudget)} min
                </span>
              ) : null}
            </div>
            {stops.length === 0 && route.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: 14 }}>Plan a route to see suggested stops.</p>
            ) : null}
            {stops.length === 0 && route.length >= 2 ? (
              <p style={{ color: '#64748b', fontSize: 14 }}>No stops fit the budget. Try a larger time budget.</p>
            ) : null}
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {stops.map((s, idx) => {
                const usedAfter = stops.slice(0, idx + 1).reduce((a, x) => a + x.detourMinutes + x.dwellMinutes, 0)
                const left = Math.max(0, parsedBudget - usedAfter)
                return (
                  <li
                    key={s.id}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: 8,
                      padding: 10,
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>
                      {s.listOrder}. {s.name}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      Detour ≈ {Math.round(s.detourMinutes)} min · dwell {Math.round(s.dwellMinutes)} min
                    </div>
                    <div style={{ fontSize: 12, color: left <= 0 ? '#b91c1c' : '#64748b' }}>
                      After this stop: {Math.round(left)} min left in budget
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12 }}>Dwell</span>
                      <button type="button" onClick={() => updateDwell(s.id, -5)}>
                        −
                      </button>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(s.dwellMinutes)} min</span>
                      <button type="button" onClick={() => updateDwell(s.id, 5)}>
                        +
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : (
          <div style={{ marginTop: 12, fontSize: 14, color: '#64748b' }}>
            {dayDest ? (
              <p>Green marker: suggested destination. Route uses OSRM driving directions.</p>
            ) : (
              <p>Enter a start and max drive time, then tap Suggest.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
