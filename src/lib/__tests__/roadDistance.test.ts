import { describe, it, expect, beforeEach } from 'vitest'
import {
  clearRoadDistances,
  crowFliesSpeedMps,
  dispatchCostSeconds,
  rememberRoadLeg,
  roadDistanceMeters,
  roadSecondsBetween,
  unknownOrigins,
} from '../roadDistance'
import { haversineDistanceMeters } from '../geo'

const PICKUP = { lat: 15.7300, lng: 120.9600 }

// The three legs measured against the live Matrix API on 2026-10-02, which is
// the reason this module exists. Driver C is the nearest in a straight line
// and the slowest to arrive.
const DRIVER_A = { lat: 15.7333, lng: 120.9314 }
const DRIVER_B = { lat: 15.7484, lng: 120.9465 }
const DRIVER_C = { lat: 15.7400, lng: 120.9200 }
const ROAD_A = 5151.62
const ROAD_B = 3682.31
const ROAD_C = 5746.97
const SECS_A = 518.18
const SECS_B = 365.85
const SECS_C = 587.62

describe('roadDistance cache', () => {
  beforeEach(clearRoadDistances)

  it('knows nothing until a leg is measured', () => {
    expect(roadDistanceMeters(DRIVER_A, PICKUP)).toBeNull()
    expect(roadSecondsBetween(DRIVER_A, PICKUP)).toBeNull()
  })

  it('returns a measured leg', () => {
    rememberRoadLeg(DRIVER_A, PICKUP, ROAD_A, SECS_A)
    expect(roadDistanceMeters(DRIVER_A, PICKUP)).toBeCloseTo(ROAD_A, 2)
    expect(roadSecondsBetween(DRIVER_A, PICKUP)).toBeCloseTo(518.18, 2)
  })

  it('treats a driver who has shuffled a few metres as the same leg', () => {
    rememberRoadLeg(DRIVER_A, PICKUP, ROAD_A, SECS_A)
    // ~11 m north: a tricycle rolling forward in the queue, not a new leg.
    const nudged = { lat: DRIVER_A.lat + 0.0001, lng: DRIVER_A.lng }
    expect(haversineDistanceMeters(DRIVER_A, nudged)).toBeLessThan(20)
    expect(roadDistanceMeters(nudged, PICKUP)).toBeCloseTo(ROAD_A, 2)
  })

  it('treats a driver who has genuinely moved as a new leg', () => {
    rememberRoadLeg(DRIVER_A, PICKUP, ROAD_A, SECS_A)
    // ~330 m away: far enough that the road answer should be re-measured.
    const moved = { lat: DRIVER_A.lat + 0.003, lng: DRIVER_A.lng }
    expect(roadDistanceMeters(moved, PICKUP)).toBeNull()
  })

  it('does not confuse one destination with another', () => {
    rememberRoadLeg(DRIVER_A, PICKUP, ROAD_A, SECS_A)
    const elsewhere = { lat: 15.6000, lng: 121.0500 }
    expect(roadDistanceMeters(DRIVER_A, elsewhere)).toBeNull()
  })

  it('asks only for the legs it does not already know', () => {
    rememberRoadLeg(DRIVER_A, PICKUP, ROAD_A, SECS_A)
    const wanted = unknownOrigins([DRIVER_A, DRIVER_B, DRIVER_C], PICKUP)
    expect(wanted).toEqual([DRIVER_B, DRIVER_C])
  })
})

describe('crowFliesSpeedMps', () => {
  beforeEach(clearRoadDistances)

  it('is a positive constant when nothing is measured, leaving straight-line order', () => {
    const speed = crowFliesSpeedMps([DRIVER_A, DRIVER_B, DRIVER_C], PICKUP)
    expect(speed).toBeGreaterThan(0)
    const order = [DRIVER_A, DRIVER_B, DRIVER_C]
      .map((gps, i) => ({ i, c: dispatchCostSeconds(gps, PICKUP, speed) }))
      .sort((x, y) => x.c - y.c)
      .map((x) => x.i)
    const straightOrder = [DRIVER_A, DRIVER_B, DRIVER_C]
      .map((gps, i) => ({ i, m: haversineDistanceMeters(gps, PICKUP) }))
      .sort((x, y) => x.m - y.m)
      .map((x) => x.i)
    expect(order).toEqual(straightOrder)
  })

  it('measures the rate at which drivers close a straight-line metre here', () => {
    rememberRoadLeg(DRIVER_A, PICKUP, ROAD_A, SECS_A)
    rememberRoadLeg(DRIVER_B, PICKUP, ROAD_B, SECS_B)
    rememberRoadLeg(DRIVER_C, PICKUP, ROAD_C, SECS_C)
    const speed = crowFliesSpeedMps([DRIVER_A, DRIVER_B, DRIVER_C], PICKUP)
    // Roughly 6-7 m/s of straight line per second, i.e. a tricycle doing
    // about 25 km/h along roads that wander.
    expect(speed).toBeGreaterThan(4)
    expect(speed).toBeLessThan(10)
  })

  it('takes the median, so one driver behind a long detour does not skew everyone', () => {
    rememberRoadLeg(DRIVER_A, PICKUP, ROAD_A, SECS_A)
    rememberRoadLeg(DRIVER_B, PICKUP, ROAD_B, SECS_B)
    const fair = crowFliesSpeedMps([DRIVER_A, DRIVER_B], PICKUP)
    // A third driver whose only road takes an hour.
    rememberRoadLeg(DRIVER_C, PICKUP, 60000, 3600)
    const skewed = crowFliesSpeedMps([DRIVER_A, DRIVER_B, DRIVER_C], PICKUP)
    expect(skewed).toBeGreaterThan(fair / 2)
  })

  it('ignores a driver already standing at the pickup', () => {
    const atPickup = { lat: PICKUP.lat + 0.00005, lng: PICKUP.lng }
    rememberRoadLeg(atPickup, PICKUP, 300, 60)
    expect(crowFliesSpeedMps([atPickup], PICKUP)).toBe(1)
  })
})

describe('dispatchCostSeconds', () => {
  beforeEach(clearRoadDistances)

  it('uses the measured travel time when the router has one', () => {
    rememberRoadLeg(DRIVER_C, PICKUP, ROAD_C, SECS_C)
    expect(dispatchCostSeconds(DRIVER_C, PICKUP, 6)).toBeCloseTo(SECS_C, 2)
  })

  it('converts an unmeasured driver to seconds at the local rate', () => {
    const straight = haversineDistanceMeters(DRIVER_B, PICKUP)
    expect(dispatchCostSeconds(DRIVER_B, PICKUP, 5)).toBeCloseTo(straight / 5, 2)
  })

  it('survives a nonsense rate rather than dividing by zero', () => {
    const cost = dispatchCostSeconds(DRIVER_B, PICKUP, 0)
    expect(Number.isFinite(cost)).toBe(true)
    expect(cost).toBeGreaterThan(0)
  })

  // The two cases this module was built for, both measured against the live
  // Matrix API on 2026-10-02 rather than invented.
  it('does not send the offer to the spot that merely looks nearest', () => {
    // H is the nearest of all ten spots in a straight line and takes twice
    // as long to arrive as I, which looks further away.
    const H = { lat: 15.7450, lng: 120.9610 }
    const I = { lat: 15.7180, lng: 120.9720 }
    expect(haversineDistanceMeters(H, PICKUP)).toBeLessThan(haversineDistanceMeters(I, PICKUP))
    rememberRoadLeg(H, PICKUP, 3469, 6.0 * 60)
    rememberRoadLeg(I, PICKUP, 2119, 3.1 * 60)
    const speed = crowFliesSpeedMps([H, I], PICKUP)
    expect(dispatchCostSeconds(I, PICKUP, speed)).toBeLessThan(
      dispatchCostSeconds(H, PICKUP, speed),
    )
  })

  it('prefers the longer road when it is the faster road', () => {
    // F sits 320 m further from the pickup by road than B and still arrives
    // sooner, because F's road is the highway and B's is not. Ranking on
    // road distance would pick B; ranking on time picks F.
    const F = { lat: 15.7450, lng: 120.9750 }
    const B = DRIVER_B
    rememberRoadLeg(F, PICKUP, 4002, 5.7 * 60)
    rememberRoadLeg(B, PICKUP, ROAD_B, SECS_B)
    expect(roadDistanceMeters(F, PICKUP)!).toBeGreaterThan(roadDistanceMeters(B, PICKUP)!)
    const speed = crowFliesSpeedMps([F, B], PICKUP)
    expect(dispatchCostSeconds(F, PICKUP, speed)).toBeLessThan(
      dispatchCostSeconds(B, PICKUP, speed),
    )
  })

  it('still ranks a measured driver against an unmeasured one sensibly', () => {
    // A queued driver whose leg is cached, and a rolling driver whose GPS has
    // moved into a fresh grid cell so his leg is not. The rolling one is
    // genuinely much closer and must not be sent to the back of the list.
    rememberRoadLeg(DRIVER_C, PICKUP, ROAD_C, SECS_C)
    const speed = crowFliesSpeedMps([DRIVER_C], PICKUP)
    const rolling = { lat: 15.7305, lng: 120.9640 }
    expect(dispatchCostSeconds(rolling, PICKUP, speed)).toBeLessThan(
      dispatchCostSeconds(DRIVER_C, PICKUP, speed),
    )
  })
})
