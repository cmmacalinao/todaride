import { haversineDistanceMeters } from './geo'
import type { GeoCoords } from '../types'

// Why the road changed — asked of the one person who knows.
//
// The app can see that a trip has left its route. It cannot see why, and the
// difference between a closed road and something wrong is the whole question.
// Geometry will never answer it; the driver can, in one tap.
//
// Asked of the driver rather than the passenger on purpose. The driver chose
// the road, so the passenger could only guess — and a guess collected through
// a multiple-choice box looks like data while being nothing of the kind. Worse,
// if something really is wrong, the person who would be answering is sitting
// next to the person causing it, and the safe option is the one that gets
// tapped. The driver's answer is then shown to the passenger and to whoever is
// watching from home, which is the thing they actually wanted to know.

// What a driver can say, in the order the buttons appear. Short labels: this
// is read at a junction, by someone driving.
export interface RouteChangeReason {
  id: string
  icon: string
  label: string
}

export const ROUTE_CHANGE_REASONS: RouteChangeReason[] = [
  { id: 'traffic', icon: '🚗', label: 'Heavy traffic' },
  { id: 'closed', icon: '🚧', label: 'Road closed' },
  { id: 'accident', icon: '🚨', label: 'Accident' },
  { id: 'checkpoint', icon: '👮', label: 'Checkpoint' },
  { id: 'passenger', icon: '🙋', label: 'Passenger asked' },
  { id: 'shortcut', icon: '↪️', label: 'Shortcut' },
]

export function routeChangeReasonLabel(id: string | null | undefined): string | null {
  if (!id) return null
  const found = ROUTE_CHANGE_REASONS.find((r) => r.id === id)
  return found ? `${found.icon} ${found.label}` : null
}

// How much nearer the pickup the tricycle has to come, after having been well
// away from it, before this counts as going back.
//
// A trip that turns around is not traffic and not a shortcut — it is the one
// pattern on a map that genuinely needs explaining. Everything else here is a
// detour; this is a reversal.
export const RETURNING_MARGIN_METERS = 200

// And how far it must have got from the pickup first, so that circling the
// block at the start of a trip never counts as turning back.
export const RETURNING_MIN_PROGRESS_METERS = 400

export interface RouteChangeState {
  // The furthest the trip has been from its pickup so far.
  furthestFromPickup: number | null
  // Asked once per trip: a driver who has answered, or declined to, has said
  // what they are going to say.
  asked: boolean
}

export const ROUTE_CHANGE_START: RouteChangeState = { furthestFromPickup: null, asked: false }

export interface RouteChangeDecision extends RouteChangeState {
  ask: boolean
}

export function nextRouteChangeDecision(
  state: RouteChangeState,
  input: { vehicle: GeoCoords | null; pickup: GeoCoords | null; farOffRoute: boolean },
): RouteChangeDecision {
  if (state.asked) return { ...state, ask: false }

  let furthestFromPickup = state.furthestFromPickup
  let returning = false
  if (input.vehicle && input.pickup) {
    const meters = haversineDistanceMeters(input.vehicle, input.pickup)
    if (furthestFromPickup === null || meters > furthestFromPickup) furthestFromPickup = meters
    returning =
      furthestFromPickup >= RETURNING_MIN_PROGRESS_METERS && meters <= furthestFromPickup - RETURNING_MARGIN_METERS
  }

  // A long way off the planned road counts too — that is the other shape
  // worth a word, and it is already being detected for the guardian.
  const ask = returning || input.farOffRoute
  return { furthestFromPickup, asked: ask, ask }
}
