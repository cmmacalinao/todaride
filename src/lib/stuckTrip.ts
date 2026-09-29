import { haversineDistanceMeters } from './geo'
import type { GeoCoords } from '../types'

// A trip that says it started but has not gone anywhere.
//
// Cancelling is deliberately not offered once a trip is under way: a
// passenger sitting in a moving tricycle has already had the ride, and a
// cancel button there is a way to skip paying for it. But "under way" was
// taken to mean the status, and the status is set by the driver tapping
// Start — which happens before anything moves, and sometimes when nothing is
// going to.
//
// Pilot testing 2026-09-29 produced exactly that: the driver's phone could
// not get a GPS fix, the trip was marked ongoing, nothing moved, and the
// passenger's only options were "I've gotten off the tricycle" — which they
// had never got on — and calling someone. A trip nobody is taking has to be
// escapable.

// Close enough to where it started to be, in effect, still there. Generous
// against GPS wander at a standstill: a phone reporting a steady ±30 m at the
// kerb must not be read as a tricycle that has driven off.
export const STUCK_TRIP_METERS = 80

// Long enough that a trip which simply began a moment ago is never called
// stuck. A tricycle pulling away covers 80 m well inside this.
export const STUCK_TRIP_AFTER_MS = 90_000

export interface StuckTripInput {
  startedAt: string | null
  // Where the trip was meant to begin.
  pickup: GeoCoords | null
  // The best live position of the vehicle: the driver's phone, or the
  // passenger's own if the driver is not sharing. Null when neither has
  // produced one — which is itself the clearest case of not having moved.
  vehicle: GeoCoords | null
  now: number
}

export function tripHasNotMoved({ startedAt, pickup, vehicle, now }: StuckTripInput): boolean {
  if (!startedAt) return false
  const began = Date.parse(startedAt)
  if (Number.isNaN(began)) return false
  if (now - began < STUCK_TRIP_AFTER_MS) return false
  // No position from either phone after a minute and a half of "ongoing":
  // nothing can show this trip moving, so treat it as stuck. This is the
  // case the pilot hit.
  if (!vehicle) return true
  // Without a pickup to measure from there is nothing to compare against,
  // and a position that exists is better evidence of a real trip than none.
  if (!pickup) return false
  return haversineDistanceMeters(vehicle, pickup) <= STUCK_TRIP_METERS
}
