import { haversineDistanceMeters } from './geo'
import type { GeoCoords, Ride } from '../types'

// A standard tricycle's practical capacity — the same figure Ride.passengerCount
// is capped at.
export const TRICYCLE_SEATS = 4

// How far off the route a waiting passenger may be and still count as "on the
// way" — as a share of the journey rather than a flat number, because the two
// scales are nothing alike. On a 400 m hop across campus, a 400 m detour
// doubles the trip; on a 3 km run into town it is a driveway. Floor and
// ceiling keep both ends sensible.
export const ALONG_THE_WAY_SHARE = 0.2
export const ALONG_THE_WAY_MIN_METERS = 300
export const ALONG_THE_WAY_MAX_METERS = 1200

// How much longer the driver may end up travelling, as a multiple of driving
// straight there, when a passenger rides on past the current drop-off. Roads
// bend; a straight line between two points three kilometres apart can sit a
// kilometre off the highway that actually joins them, so judging a distant
// destination by its distance from that line rejects trips down the same
// road. What matters is whether going on from the first drop-off is roughly
// the same journey as going there directly.
export const MAX_ONWARD_DETOUR_RATIO = 1.35

export function alongTheWayCorridorMeters(routeMeters: number): number {
  return Math.min(
    ALONG_THE_WAY_MAX_METERS,
    Math.max(ALONG_THE_WAY_MIN_METERS, Math.round(routeMeters * ALONG_THE_WAY_SHARE)),
  )
}

// A trip nobody else may join. Two kinds: the passenger paid for the whole
// tricycle (specialTrip), or the job is not a passenger ride at all — an
// errand or a medicine delivery has no seat to share in the first place.
export function isSpecialTrip(ride: Ride): boolean {
  return ride.specialTrip === true || ride.serviceType !== 'ride'
}

// Local metres from an origin. Good to well under a metre at barangay
// distances, and it keeps the projection below to plain arithmetic.
function toLocalXY(origin: GeoCoords, p: GeoCoords): { x: number; y: number } {
  const R = 6371000
  const rad = Math.PI / 180
  return {
    x: (p.lng - origin.lng) * rad * R * Math.cos(origin.lat * rad),
    y: (p.lat - origin.lat) * rad * R,
  }
}

// How far `point` sits off the straight path from `from` to `to`, in metres.
//
// Null means it is not on the way at all: either behind the driver or past
// where they are already going. Both cases are turning back, which is exactly
// what the passenger in the tricycle did not agree to.
export function metersOffRoute(from: GeoCoords, to: GeoCoords, point: GeoCoords): number | null {
  const end = toLocalXY(from, to)
  const p = toLocalXY(from, point)
  const lenSq = end.x * end.x + end.y * end.y
  // Driver already at the destination — nothing left of the route to be on.
  if (lenSq < 1) return null
  const t = (p.x * end.x + p.y * end.y) / lenSq
  if (t < 0 || t > 1) return null
  const proj = { x: end.x * t, y: end.y * t }
  return Math.round(Math.hypot(p.x - proj.x, p.y - proj.y))
}

// Seats still free in a tricycle carrying these trips.
export function seatsLeft(activeRides: Ride[]): number {
  const taken = activeRides.reduce((sum, r) => sum + Math.max(1, r.passengerCount), 0)
  return Math.max(0, TRICYCLE_SEATS - taken)
}

// The same corridor, but with no far end: how far `point` sits off the line
// that runs from `from` through `to` and keeps going. Null still means
// behind the driver. This is what lets a passenger flag the tricycle down
// and ride past the current drop-off — the ordinary case of pumara on the
// highway heading further out than whoever is already aboard.
export function metersOffForwardRay(
  from: GeoCoords,
  to: GeoCoords,
  point: GeoCoords,
): { meters: number; t: number } | null {
  const end = toLocalXY(from, to)
  const p = toLocalXY(from, point)
  const lenSq = end.x * end.x + end.y * end.y
  if (lenSq < 1) return null
  const t = (p.x * end.x + p.y * end.y) / lenSq
  if (t < 0) return null
  const proj = { x: end.x * t, y: end.y * t }
  return { meters: Math.round(Math.hypot(p.x - proj.x, p.y - proj.y)), t }
}

export interface AlongTheWayFit {
  offRouteMeters: number
  // True when the new passenger is going further out than the one already
  // aboard — same road, later stop. The driver drops the first, carries on.
  beyondCurrentDropoff: boolean
  // How much further past the current drop-off, in metres. 0 when they get
  // off first.
  beyondMeters: number
  // Metres added to the driver's journey by the detour — the honest cost of
  // saying yes, since the pickup is a stop on the way rather than a straight
  // line through it.
  detourMeters: number
}

// Whether a waiting request can be swept up by a driver already carrying
// someone. Both ends matter: the pickup has to be on the way, and so does
// where they are going — a passenger heading back the way you came is a
// second trip, not a shared one.
export function alongTheWayFit(
  driverGps: GeoCoords | null,
  currentDropoff: GeoCoords | null | undefined,
  candidate: Ride,
  maxOffRouteMetersOverride?: number,
): AlongTheWayFit | null {
  // The pin the passenger dropped beats the label's coordinate: someone who
  // shared their exact spot is standing there, not at the centre of the
  // barangay or the landmark the address happens to name.
  const pickup = candidate.pickupGps ?? candidate.pickup.gps
  const dropoff = candidate.dropoff.gps
  if (!driverGps || !currentDropoff || !pickup) return null
  const maxOffRouteMeters =
    maxOffRouteMetersOverride ?? alongTheWayCorridorMeters(haversineDistanceMeters(driverGps, currentDropoff))
  const pickupRay = metersOffForwardRay(driverGps, currentDropoff, pickup)
  // Boarding has to happen before the current passenger gets off (t <= 1) —
  // past that the tricycle is somewhere it never agreed to go.
  if (!pickupRay || pickupRay.t > 1) return null
  const offRoute = pickupRay.meters
  // Judged by the metres it actually adds, not by its distance from a
  // straight line. A pin 300 m off the chord a quarter of the way along adds
  // far less than 300 m to the drive — the tricycle passes close to it either
  // way.
  const directToCurrent = haversineDistanceMeters(driverGps, currentDropoff)
  const viaPickupMeters =
    haversineDistanceMeters(driverGps, pickup) + haversineDistanceMeters(pickup, currentDropoff)
  const pickupDetour = Math.max(0, Math.round(viaPickupMeters - directToCurrent))
  if (pickupDetour > maxOffRouteMeters) return null
  // Where they are going has to lie ahead too — but "ahead" does not stop at
  // the current drop-off. Riding further out along the same road is the
  // commonest shared trip there is; only going back the way we came is not.
  let beyondCurrentDropoff = false
  let beyondMeters = 0
  if (dropoff && !candidate.destinationPending) {
    const ray = metersOffForwardRay(driverGps, currentDropoff, dropoff)
    // Further along than where they got in — not merely ahead of the driver.
    // Getting off behind your own pickup is travelling backwards, however
    // neatly the point sits on the line.
    if (!ray || ray.t <= pickupRay.t) return null
    if (ray.t > 1) {
      // Carrying on past the first passenger's stop. Ask the only question
      // that matters: is going on from there roughly the same drive as
      // heading straight to it?
      const straightToTheirs = haversineDistanceMeters(driverGps, dropoff)
      const onwardMeters = directToCurrent + haversineDistanceMeters(currentDropoff, dropoff)
      if (onwardMeters > straightToTheirs * MAX_ONWARD_DETOUR_RATIO + maxOffRouteMeters) return null
      beyondCurrentDropoff = true
      beyondMeters = Math.round(haversineDistanceMeters(currentDropoff, dropoff))
    } else if (ray.meters > maxOffRouteMeters) {
      // Getting off before the current passenger does — short range, where
      // the straight line is a fair stand-in for the road.
      return null
    }
  }
  return {
    offRouteMeters: offRoute,
    beyondCurrentDropoff,
    beyondMeters,
    detourMeters: pickupDetour,
  }
}
