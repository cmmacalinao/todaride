import type { GeoCoords } from '../types'
import type { RouteInfo } from './routing'
import { haversineDistanceMeters } from './geo'
import { splitRouteAtProgress } from './routeProgress'

// What is left of the current leg — road still ahead of the tricycle, and
// the time that road takes at a tricycle's pace.
//
// The old arrival time was (1 - legProgress) × a fixed 12-second simulation
// leg, which is where "12s away" came from: it described the simulation's
// clock, not the road. This one is built from distance. The road ahead is
// measured along the real route from wherever the tricycle actually is (its
// live fix, or the simulated marker), so it shrinks as the tricycle moves;
// the time is that distance at the route's own pace, capped at what a
// tricycle in town actually does, since the routing service assumes a car.
//
// Off the route (a detour, before the reroute lands) the straight line to
// the destination is used with a road-winding allowance, so the number
// never freezes on a road nobody is driving.

// ~23 km/h — a loaded tricycle on Nueva Ecija's town roads, not a car on
// the highway the routing service prices for.
export const TRICYCLE_MAX_MPS = 6.5
// With no route at all: a little slower still, since a straight line has
// no idea about the corners.
export const TRICYCLE_DEFAULT_MPS = 5.5
// Straight line to road: the winding allowance when the route cannot help.
const STRAIGHT_TO_ROAD = 1.3
// Beyond this off the route, the projection onto it is not where the
// tricycle is — see splitRouteAtProgress.
const OFF_ROUTE_METERS = 150

export interface LegRemaining {
  meters: number
  seconds: number
  // How the number was arrived at, for anyone reading the code with a
  // screen in hand: along the route from a position, along the route by
  // the simulation's fraction, or a straight line.
  basis: 'route-position' | 'route-progress' | 'straight'
}

function polylineMeters(points: GeoCoords[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += haversineDistanceMeters(points[i - 1], points[i])
  return total
}

export function remainingLeg({
  route,
  vehicleGps,
  destination,
  legProgress,
}: {
  route: RouteInfo | null | undefined
  vehicleGps: GeoCoords | null | undefined
  destination: GeoCoords | null | undefined
  legProgress: number
}): LegRemaining | null {
  const progress = Math.max(0, Math.min(1, legProgress))
  if (route && route.points.length > 1) {
    const pace =
      route.distanceMeters > 0 && route.durationSeconds > 0
        ? Math.min(route.distanceMeters / route.durationSeconds, TRICYCLE_MAX_MPS)
        : TRICYCLE_DEFAULT_MPS
    if (vehicleGps) {
      const split = splitRouteAtProgress(route.points, vehicleGps, OFF_ROUTE_METERS)
      if (split) {
        const meters = polylineMeters(split.remaining)
        return { meters, seconds: meters / pace, basis: 'route-position' }
      }
      const end = route.points[route.points.length - 1]
      const meters = haversineDistanceMeters(vehicleGps, end) * STRAIGHT_TO_ROAD
      return { meters, seconds: meters / TRICYCLE_DEFAULT_MPS, basis: 'straight' }
    }
    const meters = (1 - progress) * route.distanceMeters
    return { meters, seconds: meters / pace, basis: 'route-progress' }
  }
  if (vehicleGps && destination) {
    const meters = haversineDistanceMeters(vehicleGps, destination) * STRAIGHT_TO_ROAD
    return { meters, seconds: meters / TRICYCLE_DEFAULT_MPS, basis: 'straight' }
  }
  return null
}
