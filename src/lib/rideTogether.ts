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

// Riding together has to hold for this long before a trip is recorded. One
// agreeing sample is a tricycle passing at the same moment on the same road,
// which is exactly the false positive that would record a stranger's trip.
export const SUSTAINED_MS = 8000

// They must also still be together. A tricycle that pulls away is not one
// the passenger is sitting in, however well the headings matched a moment
// ago.
export const MAX_SEPARATION_METERS = 80

export interface Fix {
  gps: GeoCoords
  at: number
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

// Metres per second between two fixes.
export function speedMps(from: Fix, to: Fix): number {
  const seconds = (to.at - from.at) / 1000
  if (seconds <= 0) return 0
  return haversineDistanceMeters(from.gps, to.gps) / seconds
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

  // Walk backwards through the passenger's track for as long as every step
  // agrees with the tricycle's movement over the same moment. The first
  // disagreement ends the streak — this is "how long has it been true
  // without a break", not "how often was it true".
  let heldMs = 0
  let lastFailure: TogetherVerdict['reason'] = 'too-brief'

  for (let i = passenger.length - 1; i > 0; i--) {
    const to = passenger[i]
    const from = passenger[i - 1]
    const pair = spanFor(tricycle, from.at, to.at)
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

    const theirs = bearingDegrees(pair[0].gps, pair[1].gps)
    const ours = bearingDegrees(from.gps, to.gps)
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
