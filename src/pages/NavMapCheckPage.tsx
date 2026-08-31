import { useEffect, useState } from 'react'
import { RealLiveMap, type MapPoint } from '../components/RealLiveMap'
import type { GeoCoords } from '../types'

// A bench for the heading-up trip map.
//
// Getting a real ongoing trip on screen means booking one, accepting it on a
// second account and driving to the pickup — which is right for the two-phone
// road test and far too slow for checking that the map turns the right way.
// This drives the same component from a synthetic ride around CLSU so the
// camera can be watched turning corners in a few seconds.
const START: GeoCoords = { lat: 15.7318, lng: 120.9367 }

// A rough loop of the campus roads: four legs, four corners.
const LEGS: GeoCoords[] = [
  { lat: 15.7318, lng: 120.9367 },
  { lat: 15.7318, lng: 120.9425 },
  { lat: 15.7365, lng: 120.9425 },
  { lat: 15.7365, lng: 120.9367 },
]

function lerp(a: number, b: number, k: number) {
  return a + (b - a) * k
}

function bearingDegrees(from: GeoCoords, to: GeoCoords): number {
  const toRad = Math.PI / 180
  const y = Math.sin((to.lng - from.lng) * toRad) * Math.cos(to.lat * toRad)
  const x =
    Math.cos(from.lat * toRad) * Math.sin(to.lat * toRad) -
    Math.sin(from.lat * toRad) * Math.cos(to.lat * toRad) * Math.cos((to.lng - from.lng) * toRad)
  return (Math.atan2(y, x) * 180) / Math.PI
}

export function NavMapCheckPage() {
  const [t, setT] = useState(0)
  const [running, setRunning] = useState(true)
  const [speed, setSpeed] = useState(8)

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setT((v) => (v + 0.012) % LEGS.length), 250)
    return () => window.clearInterval(id)
  }, [running])

  const i = Math.floor(t) % LEGS.length
  const k = t - Math.floor(t)
  const a = LEGS[i]
  const b = LEGS[(i + 1) % LEGS.length]
  const here: GeoCoords = { lat: lerp(a.lat, b.lat, k), lng: lerp(a.lng, b.lng, k) }
  const heading = bearingDegrees(a, b)

  const points: MapPoint[] = [
    { id: 'pickup', gps: START, color: '#0d9488', label: 'Pickup' },
    { id: 'dropoff', gps: LEGS[2], color: '#e11d48', label: 'Destination' },
    { id: 'driver', gps: here, color: '#2563eb', label: 'Tricycle', icon: 'tricycle', pulse: true },
  ]

  return (
    <main className="mx-auto max-w-md space-y-3 p-4">
      <h1 className="text-lg font-bold text-navy-900">Heading-up map check</h1>
      <p className="text-xs text-slate-500">
        A synthetic ride round a square. Not part of the app — a bench for watching the camera turn.
      </p>

      <RealLiveMap
        points={points}
        routeLine={LEGS}
        routeIsReal
        height="420px"
        nav={{ center: here, heading, speedMps: speed, rotatePointId: 'driver' }}
      />

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => setRunning((v) => !v)}
          className="rounded-lg bg-navy-900 px-3 py-1.5 font-semibold text-white"
        >
          {running ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          onClick={() => setSpeed((v) => (v > 1 ? 0.3 : 8))}
          className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold"
        >
          {speed > 1 ? 'Simulate stopped' : 'Simulate moving'}
        </button>
        <span className="text-slate-500">
          heading {Math.round(heading)}° · {speed} m/s
        </span>
      </div>
    </main>
  )
}
