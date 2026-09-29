import { useEffect, useState } from 'react'
import { haversineDistanceMeters } from './geo'
import { loadGoogleMaps } from './googleMapsLoader'
import type { GeoCoords } from '../types'

export interface RouteInfo {
  // The actual road-network path as a sequence of real waypoints — not just
  // the two endpoints — so a polyline drawn through them follows real
  // streets instead of cutting through buildings/rivers.
  points: GeoCoords[]
  distanceMeters: number
  durationSeconds: number
}

// Same-session cache, keyed by endpoint coordinates — avoids re-fetching the
// same leg's route on every re-render/tick, and avoids hammering the free
// public routing server.
//
// Successes only. A failure used to be written in here as a null and, because
// the lookup below is `has(key)`, that null was the answer for the rest of the
// session: one rate-limited request and those two endpoints had no road route
// again until the app was reloaded. Pilot testing 2026-09-29 — the return leg
// drew no blue line at all, and off-route detection went with it, since
// TripMonitor judges straying against this route and a missing route means
// nothing to stray from.
const routeCache = new Map<string, RouteInfo>()

// A failure is remembered only long enough not to hammer a server that just
// said no. Shorter than the first retry in useRoute, so a retry is a real
// request rather than a cache read of the same failure.
const FAILURE_COOLDOWN_MS = 3000
const failedAt = new Map<string, number>()

// One request per key at a time. Both maps on a trip screen ask for the same
// leg, and without this each of them opens its own request to a server whose
// whole problem is being asked too often.
const inFlight = new Map<string, Promise<RouteInfo | null>>()

function cacheKey(origin: GeoCoords, destination: GeoCoords): string {
  return `${origin.lat},${origin.lng}|${destination.lat},${destination.lng}`
}

// Coordinates rounded to a ~28 m grid, for use as a routing endpoint.
//
// A re-route starts the new route from wherever the tricycle actually is, and
// that is a live GPS reading — a different number every time, so every
// re-route was a brand-new cache key and a brand-new request. Straying twice
// near the same corner now asks once and reuses the answer. The grid is far
// finer than the 100 m that counts as off-route, so nothing here moves a
// route somewhere a driver would notice.
export const ROUTE_SNAP_DEGREES = 0.00025

export function snapForRouting(point: GeoCoords): GeoCoords {
  const snap = (v: number) => Number((Math.round(v / ROUTE_SNAP_DEGREES) * ROUTE_SNAP_DEGREES).toFixed(6))
  return { lat: snap(point.lat), lng: snap(point.lng) }
}

// Tries Google's Directions API first (only when VITE_GOOGLE_MAPS_API_KEY is
// configured) — same rationale as geocode.ts's Google-first path: better PH
// road coverage than OSRM's free public instance. Resolves null (never
// throws) on any failure so the OSRM fallback below still runs.
async function getRouteFromGoogle(origin: GeoCoords, destination: GeoCoords): Promise<RouteInfo | null> {
  const loading = loadGoogleMaps()
  if (!loading) return null
  try {
    await loading
  } catch {
    return null
  }
  if (!window.google?.maps) return null
  return new Promise((resolve) => {
    const service = new window.google!.maps.DirectionsService()
    service.route(
      {
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: destination.lat, lng: destination.lng },
        travelMode: window.google!.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        const route = result?.routes?.[0]
        const leg = route?.legs?.[0]
        if (status !== 'OK' || !route || !leg) {
          resolve(null)
          return
        }
        resolve({
          points: route.overview_path.map((p) => ({ lat: p.lat(), lng: p.lng() })),
          distanceMeters: leg.distance?.value ?? 0,
          durationSeconds: leg.duration?.value ?? 0,
        })
      },
    )
  })
}

// Free, keyless road-network routing via OSRM's public demo server — the
// same "free tier, no API key" pattern already used for OpenStreetMap tiles
// (Leaflet) and address geocoding (Nominatim) elsewhere in this app. It's a
// shared public instance, not meant for heavy production traffic, but fine
// for this prototype. Returns null (never throws) on any failure so callers
// can fall back to straight-line interpolation.
export async function getRoute(origin: GeoCoords, destination: GeoCoords): Promise<RouteInfo | null> {
  const key = cacheKey(origin, destination)
  const hit = routeCache.get(key)
  if (hit) return hit

  const pending = inFlight.get(key)
  if (pending) return pending

  // Asked again too soon after a failure: say no without spending a request.
  // The caller retries on its own clock (see useRoute), and by the time it
  // does this has expired.
  const failed = failedAt.get(key)
  if (failed != null && Date.now() - failed < FAILURE_COOLDOWN_MS) return null

  const request = fetchRoute(origin, destination)
    .then((info) => {
      if (info) {
        routeCache.set(key, info)
        failedAt.delete(key)
      } else {
        // Remembered as a time, not as an answer — so it expires.
        failedAt.set(key, Date.now())
      }
      return info
    })
    .finally(() => {
      inFlight.delete(key)
    })

  inFlight.set(key, request)
  return request
}

async function fetchRoute(origin: GeoCoords, destination: GeoCoords): Promise<RouteInfo | null> {
  const googleRoute = await getRouteFromGoogle(origin, destination)
  if (googleRoute) return googleRoute

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    const data = await res.json()
    if (data.code !== 'Ok' || !data.routes?.length) return null
    const route = data.routes[0]
    const points: GeoCoords[] = route.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng }))
    return { points, distanceMeters: route.distance, durationSeconds: route.duration }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

// How long to wait before asking again for a route that could not be fetched,
// and how many times to bother.
//
// The public OSRM instance this falls back to refuses requests when it is
// busy, and a refusal is a moment's problem, not a fact about the road. Left
// alone it read as one: the leg with no answer simply had no line, for the
// rest of the trip. Four tries over about forty seconds covers a server
// catching its breath without turning a genuinely unroutable pair of points
// into a retry loop.
const ROUTE_RETRY_MS = 4000
const ROUTE_RETRIES = 4

// Fetches (and caches) the real road route between two points whenever they
// change; null while loading or if routing failed, in which case callers
// should fall back to straight-line behavior.
export function useRoute(origin: GeoCoords | null, destination: GeoCoords | null): RouteInfo | null {
  const [route, setRoute] = useState<RouteInfo | null>(null)
  const key = origin && destination ? cacheKey(origin, destination) : null

  useEffect(() => {
    if (!origin || !destination) {
      setRoute(null)
      return
    }
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let tries = 0
    const ask = () => {
      getRoute(origin, destination).then((result) => {
        if (cancelled) return
        if (result) {
          setRoute(result)
          return
        }
        tries += 1
        if (tries > ROUTE_RETRIES) return
        // Backing off, so a server that is refusing everybody is not asked
        // four times in twelve seconds by every phone on a trip.
        timer = setTimeout(ask, ROUTE_RETRY_MS * tries)
      })
    }
    ask()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return route
}

// One road route through several stops in order — a Group Ride's pickup,
// then each rider's stop in drop-off order. Built leg by leg from getRoute
// (each leg cached on its own, so adding a fourth stop fetches one new leg,
// not four), and joined into a single line. A leg the router cannot answer
// is drawn straight, so the line still reaches every stop.
export function useRouteThrough(stops: GeoCoords[]): RouteInfo | null {
  const [route, setRoute] = useState<RouteInfo | null>(null)
  const key = stops.map((s) => `${s.lat},${s.lng}`).join('|')

  useEffect(() => {
    if (stops.length < 2) {
      setRoute(null)
      return
    }
    let cancelled = false
    void Promise.all(stops.slice(1).map((to, i) => getRoute(stops[i], to))).then((legs) => {
      if (cancelled) return
      const points: GeoCoords[] = []
      let distanceMeters = 0
      let durationSeconds = 0
      legs.forEach((leg, i) => {
        const legPoints = leg?.points ?? [stops[i], stops[i + 1]]
        points.push(...(points.length ? legPoints.slice(1) : legPoints))
        distanceMeters += leg?.distanceMeters ?? haversineDistanceMeters(stops[i], stops[i + 1])
        durationSeconds += leg?.durationSeconds ?? 0
      })
      setRoute({ points, distanceMeters, durationSeconds })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return route
}

// Walks a fraction t (0-1) along a multi-point route by cumulative real
// distance rather than by point-index, so progress along a route with
// unevenly-spaced points still reads as constant-speed travel.
export function pointAlongRoute(points: GeoCoords[], t: number): GeoCoords {
  if (points.length === 0) throw new Error('pointAlongRoute: empty route')
  if (points.length === 1) return points[0]
  const clamped = Math.max(0, Math.min(1, t))

  const segmentLengths: number[] = []
  let total = 0
  for (let i = 0; i < points.length - 1; i++) {
    const len = haversineDistanceMeters(points[i], points[i + 1])
    segmentLengths.push(len)
    total += len
  }
  if (total === 0) return points[0]

  const targetDist = clamped * total
  let accumulated = 0
  for (let i = 0; i < segmentLengths.length; i++) {
    const segLen = segmentLengths[i]
    if (accumulated + segLen >= targetDist || i === segmentLengths.length - 1) {
      const segT = segLen === 0 ? 0 : (targetDist - accumulated) / segLen
      const a = points[i]
      const b = points[i + 1]
      return { lat: a.lat + (b.lat - a.lat) * segT, lng: a.lng + (b.lng - a.lng) * segT }
    }
    accumulated += segLen
  }
  return points[points.length - 1]
}
