import { haversineDistanceMeters } from './geo'
import type { GeoCoords } from '../types'

// When to throw away the route and ask for a new one.
//
// A drawn route is a claim about where the tricycle is going. The moment the
// driver turns off it — a closed road, a shortcut, a passenger picked up on
// the way — that claim is wrong, and every number resting on it is wrong too:
// the line on the map, the distance, the arrival time. Left alone it stays
// wrong for the rest of the trip, because the route is only fetched when the
// endpoints change and the endpoints have not changed.

// How far off the line counts as "not on this route any more".
//
// Generous, because being near a road is not the same as being on it: GPS on
// a phone in a sidecar wanders, the route geometry is simplified, and a
// divided highway puts the two carriageways tens of metres apart. Too tight
// and the app re-routes continuously while following the route perfectly.
export const OFF_ROUTE_METERS = 60

// How many consecutive readings must agree before anything is re-fetched.
//
// One bad fix is not a wrong turn. Three in a row, at roughly a second each,
// is a driver who has actually gone somewhere else — and this is the guard
// that stops a single GPS spike from spending a network request and redrawing
// the map under someone.
export const OFF_ROUTE_STREAK = 3

// Metres from a point to a line segment, on the flat.
//
// Over the tens of metres this is asked about, treating latitude/longitude as
// a plane is accurate to well under a metre — and the alternative is a great
// circle cross-track formula whose extra precision nothing here can use.
function distanceToSegmentMeters(p: GeoCoords, a: GeoCoords, b: GeoCoords): number {
  // Longitude degrees shrink toward the poles; at 15°N they are ~3.5% shorter
  // than latitude degrees. Ignoring that skews every distance east-west.
  const latScale = Math.cos((p.lat * Math.PI) / 180)
  const ax = (a.lng - p.lng) * latScale
  const ay = a.lat - p.lat
  const bx = (b.lng - p.lng) * latScale
  const by = b.lat - p.lat

  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy

  // A zero-length segment (duplicate points) is just its endpoint.
  if (lengthSquared === 0) return haversineDistanceMeters(p, a)

  // Where the foot of the perpendicular falls, clamped to the segment so a
  // point beyond either end measures to that end rather than to an imaginary
  // extension of the road.
  let t = -(ax * dx + ay * dy) / lengthSquared
  t = Math.max(0, Math.min(1, t))

  const closest: GeoCoords = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }
  return haversineDistanceMeters(p, closest)
}

// How far a position is from the nearest part of a route.
export function metersFromRoute(point: GeoCoords, route: GeoCoords[]): number {
  if (route.length === 0) return Number.POSITIVE_INFINITY
  if (route.length === 1) return haversineDistanceMeters(point, route[0])
  let nearest = Number.POSITIVE_INFINITY
  for (let i = 0; i < route.length - 1; i++) {
    const d = distanceToSegmentMeters(point, route[i], route[i + 1])
    if (d < nearest) nearest = d
    // Nothing later can beat a point that is already on the line.
    if (nearest === 0) break
  }
  return nearest
}

export interface RerouteState {
  // Consecutive readings that have been off the route.
  strayCount: number
}

export interface RerouteDecision extends RerouteState {
  // True on the reading that tips it over — once only, so the caller fetches
  // a new route rather than one per reading for as long as it is off.
  reroute: boolean
  metersOff: number
}

// When a detour stops being a detour.
//
// Most trips that leave the planned road are fine — a closed street, traffic,
// a shortcut, another passenger picked up along the way — and those only get
// a note (see TripMonitor). A passenger is asked "are you okay?" only when
// the trip looks like it is going somewhere else entirely: far from the road
// it was meant to take, or getting further from the destination for minutes
// on end. Asked once per trip; an answer is not asked for again.

// Further than this from the route planned at the start of the trip.
export const FAR_OFF_ROUTE_METERS = 500

// Getting further from the destination for this long…
export const MOVING_AWAY_MS = 120_000
// …by at least this much beyond the closest it had come. Sitting in traffic
// is not moving away; neither is a loop around a block.
export const MOVING_AWAY_MARGIN_METERS = 150

export interface FarOffRouteState {
  closestToDestination: number | null
  closestAt: number | null
  asked: boolean
}

export const FAR_OFF_ROUTE_START: FarOffRouteState = { closestToDestination: null, closestAt: null, asked: false }

export interface FarOffRouteDecision extends FarOffRouteState {
  ask: boolean
  reason: 'far' | 'away' | null
}

export function nextFarOffRouteDecision(
  state: FarOffRouteState,
  input: { metersOffPlanned: number | null; metersToDestination: number | null; now: number },
): FarOffRouteDecision {
  let { closestToDestination, closestAt } = state
  const d = input.metersToDestination
  if (d !== null) {
    if (closestToDestination === null || d < closestToDestination) {
      closestToDestination = d
      closestAt = input.now
    }
  }
  const next = { closestToDestination, closestAt, asked: state.asked }
  if (state.asked) return { ...next, ask: false, reason: null }

  if (input.metersOffPlanned !== null && input.metersOffPlanned > FAR_OFF_ROUTE_METERS) {
    return { ...next, asked: true, ask: true, reason: 'far' }
  }
  if (
    d !== null &&
    closestToDestination !== null &&
    closestAt !== null &&
    input.now - closestAt >= MOVING_AWAY_MS &&
    d > closestToDestination + MOVING_AWAY_MARGIN_METERS
  ) {
    return { ...next, asked: true, ask: true, reason: 'away' }
  }
  return { ...next, ask: false, reason: null }
}

// Given where the vehicle is, the route it is meant to be on, and how many
// readings have already strayed, decide whether to ask for a new route.
export function nextRerouteDecision(
  point: GeoCoords | null,
  route: GeoCoords[] | undefined,
  previous: RerouteState,
): RerouteDecision {
  // No position, or no real route to be off: nothing to judge. A route of one
  // point or fewer is a placeholder, not a path.
  if (!point || !route || route.length < 2) {
    return { strayCount: 0, reroute: false, metersOff: 0 }
  }

  const metersOff = metersFromRoute(point, route)
  if (metersOff <= OFF_ROUTE_METERS) {
    return { strayCount: 0, reroute: false, metersOff }
  }

  const strayCount = previous.strayCount + 1
  // Fires exactly on the reading that reaches the streak. Beyond it the count
  // keeps climbing but reroute stays false, so a driver who is genuinely off
  // the map does not trigger a request per second while the new route loads.
  return { strayCount, reroute: strayCount === OFF_ROUTE_STREAK, metersOff }
}
