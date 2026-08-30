import { describe, expect, it } from 'vitest'
import {
  MAX_SEPARATION_METERS,
  SUSTAINED_MS,
  bearingDegrees,
  headingDifference,
  movingTogether,
  speedMps,
  trimTrack,
  type Fix,
} from '../rideTogether'

// A tenth of a degree of latitude is ~11.1 km, so these are comfortable
// road-scale distances. Fixed numbers rather than the real clock, so the
// rule means the same thing whenever it runs.
const T0 = 1_756_000_000_000
const at = (seconds: number) => T0 + seconds * 1000

// A straight run north from CLSU, one fix per second at ~20 km/h (5.5 m/s).
function northbound(startLat: number, lng: number, seconds: number[], mps = 5.5): Fix[] {
  return seconds.map((s) => ({ gps: { lat: startLat + (mps * s) / 111_320, lng }, at: at(s) }))
}

describe('telling a ride from standing next to a tricycle', () => {
  it('records nothing when both are parked at the terminal', () => {
    // The exact false positive this replaced: two GPS traces a few metres
    // apart, neither going anywhere.
    const still = (lat: number): Fix[] =>
      [0, 3, 6, 9, 12].map((s) => ({ gps: { lat, lng: 120.94 }, at: at(s) }))
    const verdict = movingTogether(still(15.7331), still(15.73312))
    expect(verdict.together).toBe(false)
    expect(verdict.reason).toBe('not-moving')
  })

  it('records the trip once they have been moving together long enough', () => {
    const seconds = [0, 3, 6, 9, 12]
    const passenger = northbound(15.7331, 120.94, seconds)
    const tricycle = northbound(15.73312, 120.94001, seconds)
    const verdict = movingTogether(passenger, tricycle)
    expect(verdict.together).toBe(true)
    expect(verdict.heldMs).toBeGreaterThanOrEqual(SUSTAINED_MS)
  })

  it('waits out a single agreeing moment', () => {
    // A tricycle passing on the same road at the same instant agrees for a
    // moment. Recording on that would put a stranger's plate in the log.
    const seconds = [0, 3]
    const verdict = movingTogether(
      northbound(15.7331, 120.94, seconds),
      northbound(15.73312, 120.94001, seconds),
    )
    expect(verdict.together).toBe(false)
    expect(verdict.reason).toBe('too-brief')
  })

  it('refuses a tricycle heading the other way', () => {
    const seconds = [0, 3, 6, 9, 12]
    const passenger = northbound(15.7331, 120.94, seconds)
    // Starts 66m up the road and comes back down it, so the two cross and
    // stay well inside the separation limit throughout — otherwise this
    // would be caught as 'too-far' and the heading rule never tested.
    const southbound = northbound(15.7331 + 66 / 111_320, 120.94001, seconds, -5.5)
    const verdict = movingTogether(passenger, southbound)
    expect(verdict.together).toBe(false)
    expect(verdict.reason).toBe('different-heading')
  })

  it('refuses a tricycle that has pulled away', () => {
    // Same heading, same speed, but on the next street over. Riding in it
    // means being in it.
    const seconds = [0, 3, 6, 9, 12]
    const passenger = northbound(15.7331, 120.94, seconds)
    const farLane = northbound(15.7331, 120.9425, seconds) // ~270m east
    const verdict = movingTogether(passenger, farLane)
    expect(verdict.together).toBe(false)
    expect(verdict.reason).toBe('too-far')
  })

  it('says nothing at all before there are two fixes to compare', () => {
    expect(movingTogether([], []).reason).toBe('no-data')
    expect(movingTogether(northbound(15.7331, 120.94, [0]), []).reason).toBe('no-data')
  })

  it('will not vouch for a tricycle whose phone stopped reporting', () => {
    // The driver's fixes are all older than the passenger's window, so
    // there is nothing to compare the movement against.
    const passenger = northbound(15.7331, 120.94, [20, 23, 26, 29, 32])
    const stale = northbound(15.73312, 120.94001, [0, 3])
    expect(movingTogether(passenger, stale).together).toBe(false)
  })
})

describe('the geometry underneath it', () => {
  it('reads due north as 0 and due east as 90', () => {
    expect(bearingDegrees({ lat: 15, lng: 120 }, { lat: 16, lng: 120 })).toBeCloseTo(0, 0)
    expect(bearingDegrees({ lat: 15, lng: 120 }, { lat: 15, lng: 121 })).toBeCloseTo(90, 0)
  })

  it('has no heading for a point that has not moved', () => {
    // 0 would read as due north, which the heading check could not tell
    // apart from a genuine northward step.
    expect(bearingDegrees({ lat: 15, lng: 120 }, { lat: 15, lng: 120 })).toBeNull()
  })

  it('measures across north the short way', () => {
    expect(headingDifference(350, 10)).toBe(20)
    expect(headingDifference(10, 350)).toBe(20)
    expect(headingDifference(0, 180)).toBe(180)
  })

  it('gives no speed for fixes that share a timestamp', () => {
    const a: Fix = { gps: { lat: 15, lng: 120 }, at: at(0) }
    const b: Fix = { gps: { lat: 15.001, lng: 120 }, at: at(0) }
    expect(speedMps(a, b)).toBe(0)
  })

  it('drops fixes too old to affect the verdict', () => {
    const track = [0, 10, 20, 60].map((s) => ({ gps: { lat: 15, lng: 120 }, at: at(s) }))
    const kept = trimTrack(track, at(60), 30_000)
    expect(kept.map((f) => f.at)).toEqual([at(60)])
  })

  it('keeps the separation limit at the width of a terminal, not a street', () => {
    expect(MAX_SEPARATION_METERS).toBe(80)
  })
})
