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
