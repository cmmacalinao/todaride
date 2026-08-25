import { useEffect, useRef, useState } from 'react'
import { haversineDistanceMeters } from './geo'
import type { GeoCoords } from '../types'

// A device standing perfectly still keeps reporting coordinates that wander a
// few metres apart — ordinary GPS noise, and worse indoors or on a laptop
// positioning by wifi. Fed straight to a map marker at street zoom, that
// wander is several pixels of constant twitching. A reading has to beat this
// distance from the last accepted one to count as movement; anything smaller
// is treated as the same spot and the marker holds still.
//
// 8m is under a tricycle-length of travel, so genuine movement is never
// swallowed, while the noise almost always is.
const MIN_MOVE_METERS = 8

// Wifi/cell fixes come back with accuracy in the hundreds of metres and can
// place you in the next barangay. Once a decent fix exists, a much vaguer one
// is not an update — it is a worse guess about the same place.
const MAX_ACCURACY_METERS = 150

// Continuously watches the device's real GPS while enabled — the driver/
// passenger opt-in toggles this on, at which point their actual movement
// (not a simulation) drives their marker on the real map.
export function useWatchPosition(enabled: boolean): { position: GeoCoords | null; error: string | null } {
  const [position, setPosition] = useState<GeoCoords | null>(null)
  const [error, setError] = useState<string | null>(null)
  const watchIdRef = useRef<number | null>(null)
  // What the marker is currently showing. Kept in a ref, not state, so the
  // comparison below reads the latest accepted value without re-subscribing
  // the watch on every reading.
  const acceptedRef = useRef<GeoCoords | null>(null)

  useEffect(() => {
    if (!enabled) {
      setPosition(null)
      acceptedRef.current = null
      return
    }
    if (!navigator.geolocation) {
      setError('Location services are not available on this device/browser.')
      return
    }
    setError(null)
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setError(null)
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        const last = acceptedRef.current
        if (last) {
          // A wildly imprecise reading tells us less than what we already
          // have, and moving the marker to it would be a lie about position.
          if (pos.coords.accuracy > MAX_ACCURACY_METERS) return
          if (haversineDistanceMeters(last, next) < MIN_MOVE_METERS) return
        }
        acceptedRef.current = next
        setPosition(next)
      },
      (err) => setError(err.message || 'Could not get your location.'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    )
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [enabled])

  return { position, error }
}

// Re-renders on an interval so time-based conditions (see
// forgotToStartTrip) come true on their own, on a screen where nothing else
// is changing.
export function useNow(intervalMs: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs, active])
  return now
}

// Straight-line interpolation between two real coordinates — used as the map
// fallback for whichever side (driver/passenger) hasn't opted in to live GPS
// sharing, driven by the same legProgress that already animates the abstract
// simulation grid.
export function interpolateGps(a: GeoCoords, b: GeoCoords, t: number): GeoCoords {
  const clamped = Math.max(0, Math.min(1, t))
  return { lat: a.lat + (b.lat - a.lat) * clamped, lng: a.lng + (b.lng - a.lng) * clamped }
}
