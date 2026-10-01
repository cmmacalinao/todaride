import { haversineDistanceMeters } from './geo'
import type { GeoCoords } from '../types'

// How far a driver really is from a pickup — by road, not as the crow flies.
//
// Dispatch ranked drivers on straight-line distance. Measured against the
// live Matrix API on 2026-10-02, three driver positions around CLSU:
//
//   driver  straight-line   by road    arrives in   road / straight
//   A       3,086 m         5,152 m    8.6 min      1.67
//   B       2,507 m         3,682 m    6.1 min      1.47
//   C       4,429 m         5,747 m    9.8 min      1.30
//
// Those three happen to rank the same either way — worth saying plainly,
// because the first version of this comment claimed otherwise. What the
// numbers do show is that the detour varies: the same straight-line metre is
// worth 1.3 road metres from one direction and 1.67 from another. So two
// drivers who look equally close are not, and the gap is large enough to
// change who should get the offer — a driver 3.0 km out on a 1.3 road is
// nearer than one 2.6 km out on a 1.67.
//
// Straight-line distance cannot see that, because what makes the difference
// is a river with one bridge, a highway that runs the wrong way, a dead end.
// The passenger just waits longer, and nobody can see why.
//
// The catch is that dispatch runs inside a reducer, which is synchronous and
// must stay pure — and a road distance needs a network call. So the lookup
// here is a synchronous cache read, and filling it is somebody else's job
// (see warmRoadDistances, called from an effect). A miss simply means
// straight-line for now, and the answer is there for the next evaluation —
// which, with an offer rotating every few seconds, is usually moments away.

// Positions are snapped to about 55 m before they become a cache key. A
// driver's GPS moves constantly and a cache keyed on raw coordinates would
// never hit twice; a tricycle has not meaningfully changed its road distance
// to a pickup by moving fifty metres.
const KEY_GRID_DEGREES = 0.0005

function snap(value: number): number {
  return Math.round(value / KEY_GRID_DEGREES)
}

function cacheKey(from: GeoCoords, to: GeoCoords): string {
  return `${snap(from.lat)},${snap(from.lng)}|${snap(to.lat)},${snap(to.lng)}`
}

interface RoadLeg {
  meters: number
  seconds: number
  at: number
}

const cache = new Map<string, RoadLeg>()

// Roads do not move, but a cached answer that is hours old was measured for a
// driver who has since gone somewhere else — the key only fixes where they
// were. An hour keeps a busy terminal's answers warm without carrying
// yesterday's into today.
const CACHE_TTL_MS = 60 * 60 * 1000

// What dispatch calls. Null when nothing is known, which the caller reads as
// "fall back to straight-line" rather than "unreachable".
export function roadDistanceMeters(from: GeoCoords, to: GeoCoords): number | null {
  const hit = cache.get(cacheKey(from, to))
  if (!hit) return null
  if (Date.now() - hit.at > CACHE_TTL_MS) return null
  return hit.meters
}

export function roadSecondsBetween(from: GeoCoords, to: GeoCoords): number | null {
  const hit = cache.get(cacheKey(from, to))
  if (!hit) return null
  if (Date.now() - hit.at > CACHE_TTL_MS) return null
  return hit.seconds
}

// Exposed for tests and for the warming call below.
export function rememberRoadLeg(from: GeoCoords, to: GeoCoords, meters: number, seconds: number) {
  cache.set(cacheKey(from, to), { meters, seconds, at: Date.now() })
}

export function clearRoadDistances() {
  cache.clear()
}

// Which of these legs are not already known. The warming call asks only for
// these, so a terminal full of drivers who have not moved costs nothing.
export function unknownOrigins(origins: GeoCoords[], destination: GeoCoords): GeoCoords[] {
  return origins.filter((o) => roadDistanceMeters(o, destination) === null)
}

function orsApiKey(): string | undefined {
  const key = import.meta.env.VITE_ORS_API_KEY as string | undefined
  return key && key.trim() ? key.trim() : undefined
}

// One request for every candidate driver at once — which is the whole reason
// to use the Matrix endpoint rather than asking for a route each. It has its
// own daily quota, separate from Directions, so warming dispatch never eats
// into drawing the line on the map.
//
// Silent on every failure: no key, no signal, a refusal, a malformed answer.
// Dispatch carries on with straight-line distances exactly as it did before
// this file existed, which is the behaviour to fall back to and not an error
// worth putting on anybody's screen.
export async function warmRoadDistances(origins: GeoCoords[], destination: GeoCoords): Promise<void> {
  const key = orsApiKey()
  if (!key) return
  const wanted = unknownOrigins(origins, destination)
  if (wanted.length === 0) return
  // The free tier allows a generous matrix, but a booking never needs more
  // than the handful of drivers who could plausibly take it.
  const batch = wanted.slice(0, 20)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const locations = [...batch.map((o) => [o.lng, o.lat]), [destination.lng, destination.lat]]
    const res = await fetch('https://api.heigit.org/openrouteservice/v2/matrix/driving-car', {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations,
        sources: batch.map((_, i) => i),
        destinations: [batch.length],
        metrics: ['distance', 'duration'],
      }),
    })
    if (!res.ok) return
    const data = await res.json()
    const distances: (number | null)[][] | undefined = data?.distances
    const durations: (number | null)[][] | undefined = data?.durations
    if (!Array.isArray(distances)) return
    batch.forEach((origin, i) => {
      const meters = distances[i]?.[0]
      const seconds = durations?.[i]?.[0]
      // A null row is a point the router could not snap to a road — an
      // island, a pin in a field. Leaving it unknown means straight-line,
      // which is better than recording an answer nobody measured.
      if (typeof meters !== 'number' || !Number.isFinite(meters)) return
      rememberRoadLeg(origin, destination, meters, typeof seconds === 'number' ? seconds : 0)
    })
  } catch {
    // Nothing to recover: dispatch already has a working fallback.
  } finally {
    clearTimeout(timeout)
  }
}

// How fast a driver closes a straight-line metre around here, in metres of
// straight line per second of driving — measured from whatever legs this area
// has already cached.
//
// Dispatch ranks candidates by how long they will take to reach the pickup,
// because waiting is what a passenger actually experiences. Neither the
// straight line nor the road distance is a reliable stand-in for that. Ten
// driver positions around CLSU, measured 2026-10-02:
//
//   spot      straight     road    arrives
//   H          1,671 m   3,469 m   6.0 min
//   I          1,852 m   2,119 m   3.1 min
//   F          2,315 m   4,002 m   5.7 min
//   B          2,505 m   3,682 m   6.1 min
//   G          2,714 m   2,636 m   5.3 min
//
// H looks the nearest of all and takes twice as long as I. F is 320 m further
// by road than B and still arrives sooner, because its road is the highway
// and B's is not. Across all ten spots, 14 of the 45 pairs rank differently
// by straight line than by road, and the detour ratio ranges from 0.97 to
// 2.08 — a straight line is worth anywhere from one to two road metres
// depending only on which direction the driver is coming from.
//
// So the ranking is in seconds. The matrix returns durations alongside
// distances at no extra cost, and they are the only one of the three numbers
// that answers the question dispatch is actually asking.
//
// This factor exists because partial knowledge is the normal case, not the
// rare one. A driver waiting at a terminal keeps the same cache key all
// morning, while a driver already rolling crosses a new 55 m grid cell every
// few seconds and so is constantly unmeasured. Ranking the measured against
// the unmeasured by different yardsticks would hand the offer to whoever the
// router happened to have cached, which is not a dispatch rule at all.
// Converting the unmeasured to seconds at the local rate at least puts every
// candidate on one scale.
//
// The median, not the mean: one driver on the far side of a bridge should not
// drag the estimate for everyone else.
export function crowFliesSpeedMps(origins: GeoCoords[], destination: GeoCoords): number {
  const speeds: number[] = []
  for (const origin of origins) {
    const seconds = roadSecondsBetween(origin, destination)
    if (seconds === null || seconds <= 0) continue
    const straight = haversineDistanceMeters(origin, destination)
    // Below about 50 m the ratio is noise: a tiny straight line divides into
    // a meaningless rate.
    if (straight < 50) continue
    speeds.push(straight / seconds)
  }
  // Nothing measured yet. Any positive constant leaves the ordering identical
  // to plain straight-line distance, which is the behaviour to fall back to.
  if (speeds.length === 0) return 1
  speeds.sort((a, b) => a - b)
  const mid = Math.floor(speeds.length / 2)
  return speeds.length % 2 === 1 ? speeds[mid] : (speeds[mid - 1] + speeds[mid]) / 2
}

// The number dispatch sorts on: how many seconds away this driver is. Road
// duration when the router has measured it, and the straight line converted
// at the local rate when it has not.
export function dispatchCostSeconds(
  origin: GeoCoords,
  destination: GeoCoords,
  crowSpeedMps: number,
): number {
  const seconds = roadSecondsBetween(origin, destination)
  if (seconds !== null && seconds > 0) return seconds
  const safeSpeed = crowSpeedMps > 0 ? crowSpeedMps : 1
  return haversineDistanceMeters(origin, destination) / safeSpeed
}
