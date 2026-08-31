import type { GeoCoords } from '../types'
import { haversineDistanceMeters } from './geo'

// Deciding, from two streams of GPS fixes, whether a passenger is riding IN a
// tricycle rather than merely standing next to one.
//
// Proximity alone cannot tell the difference. At a terminal the passenger is
// within a few metres of half the rank, and every one of those tricycles is a
// wrong answer. What separates the one they are actually in is that it and
// they leave together: same moment, same heading, same speed, and they stay
// together while it happens.

// Below this, "movement" is GPS noise. A phone sitting on a seat wanders a
// few metres a minute; a tricycle in traffic does not.
export const MIN_SPEED_MPS = 2.2 // ~8 km/h — above a walk, below a tricycle

// How far two headings may differ and still count as the same direction.
// Generous on purpose: the passenger's phone and the driver's are metres
// apart on a moving vehicle, and each fix carries its own error.
export const SAME_HEADING_DEGREES = 45

// Riding together has to hold for this long before a trip is recorded.
//
// This is one full driver reporting interval. A tricycle publishes its
// position every 30 seconds, so 30s is the shortest span over which its
// movement can be observed at all — asking for less would be asking a
// question the data cannot answer. It is also, on its own, strong evidence:
// to fake it a passing tricycle would have to hold within 80m of the
// passenger at a matched speed and heading for half a minute, by which point
// it is not passing them, it is carrying them.
export const SUSTAINED_MS = 30_000

// How often a driver's phone publishes where the tricycle is while they are
// on duty. Every reading costs battery and a write to the shared database,
// and 30s is the coarsest cadence that still catches a tricycle pulling out
// of a terminal before the passenger has given up and tapped the list.
export const DRIVER_GPS_PUBLISH_MS = 30_000

// They must also still be together. A tricycle that pulls away is not one
// the passenger is sitting in, however well the headings matched a moment
// ago.
export const MAX_SEPARATION_METERS = 80

export interface Fix {
  gps: GeoCoords
  at: number
  // What the phone itself said about how fast and which way, if it said
  // anything. Preferred over the values derived from a pair of positions:
  // the derived ones are only as good as the two points behind them, and two
  // fixes 8 metres apart with 30 metres of error can imply almost any speed
  // and any heading. The GNSS chip measures rather than infers.
  //
  // Optional throughout. Android withholds both routinely below walking pace,
  // and every fix recorded before this existed has neither — so the derived
  // path has to remain a working fallback rather than a legacy branch.
  speedMps?: number | null
  headingDegrees?: number | null
}

// Compass bearing from one point to the next, in degrees clockwise from
// north. Undefined for a pair that has not moved — there is no direction to
// a stationary point, and returning 0 (due north) would be a lie the
// heading comparison could not detect.
export function bearingDegrees(from: GeoCoords, to: GeoCoords): number | null {
  if (from.lat === to.lat && from.lng === to.lng) return null
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLng = toRad(to.lng - from.lng)
  const y = Math.sin(dLng) * Math.cos(toRad(to.lat))
  const x =
    Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) -
    Math.sin(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.cos(dLng)
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360
}

// The smaller angle between two bearings, so 350° and 10° are 20° apart
// rather than 340°.
export function headingDifference(a: number, b: number): number {
  const raw = Math.abs(a - b) % 360
  return raw > 180 ? 360 - raw : raw
}

// Metres per second between two fixes — the phone's own reading when it gave
// one, otherwise worked out from the distance covered.
export function speedMps(from: Fix, to: Fix): number {
  if (to.speedMps != null && to.speedMps >= 0) return to.speedMps
  const seconds = (to.at - from.at) / 1000
  if (seconds <= 0) return 0
  return haversineDistanceMeters(from.gps, to.gps) / seconds
}

// Which way a pair is travelling — again the phone's own reading first.
// Null when neither source can say, which is the honest answer for a point
// that has not moved.
export function headingOf(from: Fix, to: Fix): number | null {
  if (to.headingDegrees != null && to.headingDegrees >= 0) return to.headingDegrees
  return bearingDegrees(from.gps, to.gps)
}

export interface TogetherVerdict {
  together: boolean
  // How long the pair has been agreeing, so a caller can show progress
  // instead of a silent wait.
  heldMs: number
  reason: 'moving-together' | 'not-moving' | 'different-heading' | 'too-far' | 'too-brief' | 'no-data'
}

// Judges one passenger track against one tricycle's track. Both are ordered
// oldest first; only the span covered by both is considered.
//
// The verdict is deliberately conservative. Every 'false' costs a passenger
// one tap on the list; a wrong 'true' records a trip against a driver who
// never carried them, which is worse in every direction — the driver's log,
// the passenger's history, and the family watching the map.
export function movingTogether(passenger: Fix[], tricycle: Fix[]): TogetherVerdict {
  if (passenger.length < 2 || tricycle.length < 2) {
    return { together: false, heldMs: 0, reason: 'no-data' }
  }

  // Walk backwards along the TRICYCLE's fixes, not the passenger's.
  //
  // The two tracks are sampled at very different rates: the passenger's
  // phone reports continuously while the panel is open, the tricycle's every
  // 30 seconds. Stepping through the fine track and asking the coarse one
  // what it was doing over each two-second slice only ever gets one answer —
  // "no fix that recent" — because the newest driver report can be half a
  // minute old. Stepping through the coarse track instead asks a question
  // the fine one can always answer.
  //
  // The first disagreement ends the streak: this is "how long has it been
  // true without a break", not "how often was it true".
  let heldMs = 0
  let lastFailure: TogetherVerdict['reason'] = 'too-brief'

  for (let i = tricycle.length - 1; i > 0; i--) {
    const to = tricycle[i]
    const from = tricycle[i - 1]
    const pair = spanFor(passenger, from.at, to.at)
    if (!pair) {
      lastFailure = 'no-data'
      break
    }

    if (haversineDistanceMeters(to.gps, pair[1].gps) > MAX_SEPARATION_METERS) {
      lastFailure = 'too-far'
      break
    }

    if (speedMps(from, to) < MIN_SPEED_MPS || speedMps(pair[0], pair[1]) < MIN_SPEED_MPS) {
      lastFailure = 'not-moving'
      break
    }

    const theirs = headingOf(from, to)
    const ours = headingOf(pair[0], pair[1])
    if (theirs === null || ours === null || headingDifference(ours, theirs) > SAME_HEADING_DEGREES) {
      lastFailure = 'different-heading'
      break
    }

    heldMs += to.at - from.at
    if (heldMs >= SUSTAINED_MS) return { together: true, heldMs, reason: 'moving-together' }
  }

  return { together: false, heldMs, reason: lastFailure }
}

// The tricycle's own movement across the window the passenger moved in.
// Returns the fixes bracketing that window, or null when the tricycle has no
// fixes covering it — a driver's phone that stopped reporting cannot be
// vouched for, so it simply does not qualify.
function spanFor(track: Fix[], fromAt: number, toAt: number): [Fix, Fix] | null {
  let before: Fix | null = null
  let after: Fix | null = null
  for (const fix of track) {
    if (fix.at <= fromAt) before = fix
    if (fix.at >= toAt && !after) after = fix
  }
  if (!before || !after || before.at === after.at) return null
  return [before, after]
}

// Keeps a track from growing without bound. Anything older than the window
// the verdict looks at cannot affect it.
export function trimTrack(track: Fix[], now: number, windowMs = SUSTAINED_MS * 4): Fix[] {
  return track.filter((f) => now - f.at <= windowMs)
}
