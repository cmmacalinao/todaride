import { describe, expect, it } from 'vitest'
import {
  OFF_ROUTE_METERS,
  OFF_ROUTE_STREAK,
  metersFromRoute,
  nextRerouteDecision,
  type RerouteState,
} from '../reroute'
import type { GeoCoords } from '../../types'

// A straight run of Maharlika Highway near CLSU, west to east.
const ROUTE: GeoCoords[] = [
  { lat: 15.7318, lng: 120.9367 },
  { lat: 15.7318, lng: 120.9425 },
  { lat: 15.7318, lng: 120.9480 },
]

// Roughly how many degrees of longitude a metre is at this latitude.
const METER_LNG = 1 / (111320 * Math.cos((15.7318 * Math.PI) / 180))
const METER_LAT = 1 / 111320

function run(points: (GeoCoords | null)[], route = ROUTE) {
  let state: RerouteState = { strayCount: 0 }
  return points.map((p) => {
    const decision = nextRerouteDecision(p, route, state)
    state = { strayCount: decision.strayCount }
    return decision
  })
}

describe('metersFromRoute', () => {
  it('is zero on the line', () => {
    expect(metersFromRoute({ lat: 15.7318, lng: 120.94 }, ROUTE)).toBeCloseTo(0, 1)
  })

  it('measures perpendicular distance from the line', () => {
    const off = { lat: 15.7318 + 30 * METER_LAT, lng: 120.94 }
    expect(metersFromRoute(off, ROUTE)).toBeGreaterThan(25)
    expect(metersFromRoute(off, ROUTE)).toBeLessThan(35)
  })

  // Without clamping to the segment, a point past the end measures to an
  // imaginary continuation of the road and reads as on-route forever.
  it('measures to the end of the route, not past it', () => {
    const beyond = { lat: 15.7318, lng: 120.9480 + 200 * METER_LNG }
    expect(metersFromRoute(beyond, ROUTE)).toBeGreaterThan(150)
  })

  // Longitude degrees are ~3.5% shorter than latitude degrees at this
  // latitude; ignoring that skews every east-west distance.
  it('accounts for longitude degrees being shorter than latitude ones', () => {
    const east = { lat: 15.7318, lng: 120.9480 + 100 * METER_LNG }
    expect(metersFromRoute(east, ROUTE)).toBeGreaterThan(90)
    expect(metersFromRoute(east, ROUTE)).toBeLessThan(110)
  })

  it('handles a degenerate route', () => {
    expect(metersFromRoute({ lat: 15.73, lng: 120.94 }, [])).toBe(Number.POSITIVE_INFINITY)
    expect(metersFromRoute({ lat: 15.7318, lng: 120.9367 }, [ROUTE[0]])).toBeCloseTo(0, 1)
  })
})

describe('nextRerouteDecision', () => {
  const onRoute = { lat: 15.7318, lng: 120.94 }
  const wayOff = { lat: 15.7318 + 300 * METER_LAT, lng: 120.94 }

  it('does nothing while on the route', () => {
    const states = run([onRoute, onRoute, onRoute, onRoute])
    states.forEach((s) => {
      expect(s.reroute).toBe(false)
      expect(s.strayCount).toBe(0)
    })
  })

  it('does nothing without a position or a real route', () => {
    expect(nextRerouteDecision(null, ROUTE, { strayCount: 2 }).reroute).toBe(false)
    expect(nextRerouteDecision(wayOff, undefined, { strayCount: 2 }).reroute).toBe(false)
    // One point is a placeholder, not a path.
    expect(nextRerouteDecision(wayOff, [ROUTE[0]], { strayCount: 2 }).reroute).toBe(false)
  })

  it('re-routes only after the streak is reached', () => {
    const states = run(Array.from({ length: OFF_ROUTE_STREAK }, () => wayOff))
    states.slice(0, -1).forEach((s) => expect(s.reroute).toBe(false))
    expect(states[states.length - 1].reroute).toBe(true)
  })

  // The whole point of the streak: one bad fix is not a wrong turn.
  it('ignores a single stray reading between good ones', () => {
    const states = run([onRoute, wayOff, onRoute, wayOff, onRoute])
    expect(states.some((s) => s.reroute)).toBe(false)
    expect(states[states.length - 1].strayCount).toBe(0)
  })

  // Otherwise a driver genuinely off the map fires a request per reading
  // while the replacement route is still loading.
  it('fires once, not on every reading after', () => {
    const states = run(Array.from({ length: OFF_ROUTE_STREAK + 5 }, () => wayOff))
    expect(states.filter((s) => s.reroute)).toHaveLength(1)
    expect(states[states.length - 1].strayCount).toBe(OFF_ROUTE_STREAK + 5)
  })

  it('does not trip just inside the threshold', () => {
    const nearlyOff = { lat: 15.7318 + (OFF_ROUTE_METERS - 10) * METER_LAT, lng: 120.94 }
    const states = run(Array.from({ length: OFF_ROUTE_STREAK + 2 }, () => nearlyOff))
    expect(states.some((s) => s.reroute)).toBe(false)
  })

  it('resets the count when the driver rejoins the route', () => {
    const states = run([wayOff, wayOff, onRoute, wayOff, wayOff])
    expect(states.some((s) => s.reroute)).toBe(false)
    expect(states[2].strayCount).toBe(0)
    expect(states[4].strayCount).toBe(2)
  })
})
