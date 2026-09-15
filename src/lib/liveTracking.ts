import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import { haversineDistanceMeters } from './geo'
import type { GeoCoords } from '../types'

// A device standing perfectly still keeps reporting coordinates that wander a
// few metres apart — ordinary GPS noise, and worse indoors or on a laptop
// positioning by wifi. Fed straight to a map marker at street zoom, that
// wander is several pixels of constant twitching. A reading has to beat this
// distance from the last accepted one to count as movement; anything smaller
// is treated as the same spot and the marker holds still.
//
// 3m is about four paces. Low enough that walking redraws the marker often
// enough to read as movement rather than as a series of jumps, and still
// above the wander a stationary phone produces on a good fix. Anything
// larger and a person walking to the corner never sees the dot leave.
const MIN_MOVE_METERS = 3

// Above this, a reading is not a position — it is a glitch.
//
// 40 m/s is about 144 km/h, far beyond anything a tricycle does and beyond
// most vehicles a passenger could be in, so nothing real is thrown away. What
// it catches is the fix that places a phone in the next town for one reading
// and back again on the next: a jump that flows straight into the recorded
// trip, the distance shown to the passenger, and the boarding rule that
// decides which tricycle they are sitting in.
const MAX_PLAUSIBLE_SPEED_MPS = 40

// Continuously watches the device's real GPS while enabled — the driver/
// passenger opt-in toggles this on, at which point their actual movement
// (not a simulation) drives their marker on the real map.
export function useWatchPosition(enabled: boolean): {
  position: GeoCoords | null
  error: string | null
  // How wide the fix is, in metres. Surfaced so a caller can say "your phone
  // is only sure to within 2 km" rather than drawing that as a pin and
  // letting somebody believe it.
  accuracy: number | null
  // The device's own speed and direction, when it reports them.
  //
  // Both arrive in every position event and were being discarded. They matter
  // because the boarding rule derives its own from consecutive fixes, and a
  // derived value is only as good as the two points behind it — two fixes 8m
  // apart with 30m of error can imply almost any speed and any heading. The
  // phone's own figures come from the GNSS chip and are steadier.
  //
  // Null when the device declines to say, which Android does routinely below
  // walking pace. Callers must fall back rather than treat null as zero.
  speedMps: number | null
  headingDegrees: number | null
} {
  const [position, setPosition] = useState<GeoCoords | null>(null)
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [speedMps, setSpeedMps] = useState<number | null>(null)
  const [headingDegrees, setHeadingDegrees] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const accuracyRef = useRef<number | null>(null)
  const acceptedAtRef = useRef<number | null>(null)
  const watchIdRef = useRef<number | null>(null)
  // What the marker is currently showing. Kept in a ref, not state, so the
  // comparison below reads the latest accepted value without re-subscribing
  // the watch on every reading.
  const acceptedRef = useRef<GeoCoords | null>(null)

  useEffect(() => {
    if (!enabled) {
      setPosition(null)
      setAccuracy(null)
      setSpeedMps(null)
      setHeadingDegrees(null)
      acceptedRef.current = null
      accuracyRef.current = null
      acceptedAtRef.current = null
      return
    }
    setError(null)

    // One reading, wherever it came from, judged the same way.
    const accept = (coords: {
      latitude: number
      longitude: number
      accuracy: number | null
      speed?: number | null
      heading?: number | null
    }) => {
      setError(null)
      const next = { lat: coords.latitude, lng: coords.longitude }
      const nextAccuracy = coords.accuracy ?? null
      const now = Date.now()
      const last = acceptedRef.current
      const lastAccuracy = accuracyRef.current
      const lastAt = acceptedAtRef.current

      // Throw away a fix that claims impossible movement.
      //
      // Two guards, both needed. The speed has to be beyond any real vehicle,
      // and the jump has to be bigger than the two readings' own error added
      // together — otherwise a pair of vague fixes that merely overlap gets
      // discarded as a teleport, and a phone with poor reception would stop
      // updating at all.
      if (last && lastAt) {
        const moved = haversineDistanceMeters(last, next)
        const elapsed = (now - lastAt) / 1000
        const errorBudget = (lastAccuracy ?? 0) + (nextAccuracy ?? 0)
        if (elapsed > 0.5 && moved > errorBudget && moved / elapsed > MAX_PLAUSIBLE_SPEED_MPS) return
      }

      if (last) {
        // A sharper reading always wins, however little the phone claims to
        // have moved. This is the case that used to be lost: the first fix a
        // phone produces is usually a coarse wifi or cell estimate, accurate
        // to hundreds of metres or worse, and it was accepted without any
        // accuracy check at all because there was nothing to compare it to.
        // The real GPS fix that arrived seconds later was then thrown away
        // for not having moved 8 metres — so the driver stayed pinned to a
        // guess, which is what "the location is wrong" looked like.
        const sharper = nextAccuracy != null && lastAccuracy != null && nextAccuracy < lastAccuracy
        if (!sharper) {
          // Movement has to beat the phone's own uncertainty before it counts.
          //
          // A flat 150m ceiling was tried here and froze the marker outright:
          // a phone reporting a steady ±200m had every reading after the
          // first rejected, so the dot only ever moved when the page was
          // reloaded and a fresh first fix came in. That is worse than a
          // twitchy marker, because it looks like tracking that works.
          //
          // Half the accuracy figure, floored at the noise threshold: a sharp
          // fix updates on a few metres, a vague one has to travel far enough
          // that the movement is real rather than the error moving around.
          const needed = Math.max(MIN_MOVE_METERS, (nextAccuracy ?? 0) / 2)
          if (haversineDistanceMeters(last, next) < needed) return
        }
      }

      acceptedRef.current = next
      accuracyRef.current = nextAccuracy
      acceptedAtRef.current = now
      setPosition(next)
      setAccuracy(nextAccuracy)
      // Negative means "not available" in the browser API; null is the honest
      // representation of that, and stops a caller reading -1 as reversing.
      setSpeedMps(coords.speed != null && coords.speed >= 0 ? coords.speed : null)
      setHeadingDegrees(coords.heading != null && coords.heading >= 0 ? coords.heading : null)
    }

    // Inside the installed app, go through Capacitor rather than the
    // WebView's navigator.geolocation.
    //
    // geo.ts already says why for one-off reads — the WebView's own
    // implementation is flaky or unimplemented, and only the plugin raises a
    // real native permission prompt — but the continuous watch a driver
    // depends on was still using the browser API. Android has the permissions
    // in its manifest and no one asking for them at runtime, so the watch
    // never produced a fix: position stayed null, and every driver fell back
    // to their terminal's coordinates. Two different drivers both pinned to
    // CLSU main gate, which is that fallback, not a location.
    if (Capacitor.isNativePlatform()) {
      let nativeId: string | null = null
      let cancelled = false
      void (async () => {
        try {
          const status = await Geolocation.requestPermissions()
          if (status.location === 'denied' && status.coarseLocation === 'denied') {
            setError('Location permission is off for this app. Turn it on in Settings to be tracked.')
            return
          }
          const id = await Geolocation.watchPosition(
            { enableHighAccuracy: true, timeout: 15000 },
            (pos, err) => {
              if (err) {
                setError(err.message || 'Could not get your location.')
                return
              }
              if (pos) accept(pos.coords)
            },
          )
          if (cancelled) void Geolocation.clearWatch({ id })
          else nativeId = id
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not get your location.')
        }
      })()
      return () => {
        cancelled = true
        if (nativeId) void Geolocation.clearWatch({ id: nativeId })
      }
    }

    if (!navigator.geolocation) {
      setError('Location services are not available on this device/browser.')
      return
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => accept(pos.coords),
      (err) => setError(err.message || 'Could not get your location.'),
      // maximumAge 0: never hand back a cached fix. Five seconds of cache is
      // five seconds of a marker sitting still while the person holding it is
      // walking, which is the difference between a live map and a stale one.
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    )
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [enabled])

  return { position, error, accuracy, speedMps, headingDegrees }
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
