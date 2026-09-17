import { haversineDistanceMeters } from './geo'
import type { GeoCoords } from '../types'

// Has the passenger got out?
//
// Two phones that were travelling together stop travelling together, and the
// trip is over in every sense except the app's. Nobody presses anything at the
// kerb — the passenger has their bag and their fare in hand, the driver has
// the next job — so the ride stays "ongoing" for as long as it takes somebody
// to remember, which is how a trip ends at midnight three barangays away.
//
// This is the noticing. It does not end anything by itself: it says the two
// have parted, and both screens offer to close the trip.

// How far apart is "not in the same tricycle".
//
// A tricycle is about two metres of vehicle, so ten is generous — which it has
// to be, because the two phones are not measuring from the same place. Each
// has its own fix with its own error, and the gap between two readings taken
// side by side is routinely several metres before anybody has moved at all.
export const SEPARATION_METERS = 10

// How many consecutive readings must agree before anyone is asked.
//
// This is the whole difference between a useful prompt and an unusable one.
// Ten metres is inside ordinary GPS noise: a single reading beyond it means
// almost nothing, and asking on one would put "has the passenger left?" on a
// driver's screen every couple of minutes while the passenger is sitting
// behind them. Three in a row is a phone that has genuinely moved away and
// stayed away — at one fix a second, about three seconds of walking.
export const SEPARATION_STREAK = 3

// Not the mirror of the one above.
//
// Coming back together is the correction of a mistake, so it is believed
// sooner than the separation was: one reading close again clears the streak.
// The alternative is a prompt that lingers after the passenger has got back
// in, or after the fix that caused it turns out to have been a glitch.
export const REUNION_METERS = 8

export interface SeparationState {
  // Consecutive readings with the two phones apart.
  apartCount: number
  // Whether the prompt has already been raised for this trip. Asked once:
  // somebody who has said "not yet" is telling you they know, and a question
  // that comes back every ten seconds is not a safety feature.
  asked: boolean
}

export interface SeparationDecision extends SeparationState {
  // True on the single reading that crosses the threshold, so a caller can
  // open a dialog rather than re-open one every tick.
  separated: boolean
  metersApart: number | null
}

export function nextSeparationDecision(
  a: GeoCoords | null | undefined,
  b: GeoCoords | null | undefined,
  state: SeparationState,
): SeparationDecision {
  // One of the phones is not reporting. Not "they have parted" — unknown, and
  // guessing here would end trips over a location permission.
  if (!a || !b) return { ...state, separated: false, metersApart: null }

  const metersApart = haversineDistanceMeters(a, b)

  if (metersApart <= REUNION_METERS) {
    return { apartCount: 0, asked: state.asked, separated: false, metersApart }
  }
  if (metersApart <= SEPARATION_METERS) {
    // In the band between the two thresholds: neither clearly apart nor
    // clearly together. Hold the count rather than moving it either way, so a
    // reading hovering on the line cannot ratchet its way to a prompt.
    return { ...state, separated: false, metersApart }
  }

  const apartCount = state.apartCount + 1
  const crossed = apartCount >= SEPARATION_STREAK && !state.asked
  return {
    apartCount,
    asked: state.asked || crossed,
    separated: crossed,
    metersApart,
  }
}

// Whether the two are apart right now, as opposed to the one-off "they have
// just parted" moment the decision flags. Held from the reading that crossed
// the streak until one reading brings them back together — the same rule as
// the prompt, so a map label and the question it pairs with never disagree.
export function isApart(state: SeparationState): boolean {
  return state.apartCount >= SEPARATION_STREAK
}

// Where this phone was at a given moment, from the positions it has kept.
//
// The other phone's position arrives late — a passenger aboard publishes
// every ten seconds — and comparing that against where the tricycle is now
// measures how far the tricycle has driven since, not how far apart the two
// are. At 20 km/h ten seconds is 55 metres: every trip "separated" within a
// minute of setting off, with the passenger sitting in the sidecar. Compared
// against where the tricycle was when that reading was taken, two phones in
// the same vehicle agree again.
//
// Null when nothing kept is close enough in time to stand for that moment,
// which callers treat as "cannot tell", never as "apart".
export const MATCH_WITHIN_MS = 3000

// Two kept positions this far apart in time or less can be joined by a
// straight line to say where the phone was in between.
//
// Both phones share every few seconds (LIVE_GPS_PUBLISH_MS), so a reading
// from one almost never lands on a reading from the other; the nearest one
// can be two seconds away — twelve metres at tricycle speed, past the
// separation threshold on its own. Between two fixes a few seconds apart a
// tricycle is, near enough, on the line joining them.
export const INTERPOLATE_WITHIN_MS = 10000

export function positionAt(history: { at: number; gps: GeoCoords }[], at: number): GeoCoords | null {
  let before: { at: number; gps: GeoCoords } | null = null
  let after: { at: number; gps: GeoCoords } | null = null
  for (const h of history) {
    if (h.at <= at && (!before || h.at > before.at)) before = h
    if (h.at >= at && (!after || h.at < after.at)) after = h
  }
  if (before && after && after.at - before.at <= INTERPOLATE_WITHIN_MS) {
    if (after.at === before.at) return before.gps
    const f = (at - before.at) / (after.at - before.at)
    return {
      lat: before.gps.lat + (after.gps.lat - before.gps.lat) * f,
      lng: before.gps.lng + (after.gps.lng - before.gps.lng) * f,
    }
  }
  const nearest = [before, after]
    .filter((h): h is { at: number; gps: GeoCoords } => h !== null)
    .sort((a, b) => Math.abs(a.at - at) - Math.abs(b.at - at))[0]
  return nearest && Math.abs(nearest.at - at) <= MATCH_WITHIN_MS ? nearest.gps : null
}
