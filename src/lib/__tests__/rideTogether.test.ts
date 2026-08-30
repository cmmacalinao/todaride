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

// A straight run north from CLSU at ~20 km/h (5.5 m/s), sampled at whatever
// moments are asked for. The passenger's phone reports continuously and the
// tricycle's every 30 seconds, so the two are deliberately given different
// sample times in most of these.
function northbound(startLat: number, lng: number, seconds: number[], mps = 5.5): Fix[] {
  return seconds.map((s) => ({ gps: { lat: startLat + (mps * s) / 111_320, lng }, at: at(s) }))
}

// What a phone in the passenger's pocket produces: a fix every two seconds.
const FINE = Array.from({ length: 31 }, (_, i) => i * 2)
// What a tricycle publishes: one fix every 30 seconds.
const COARSE = [0, 30, 60]

describe('telling a ride from standing next to a tricycle', () => {
  it('records nothing when both are parked at the terminal', () => {
    // The exact false positive this replaced: two GPS traces a few metres
    // apart, neither going anywhere.
    const still = (lat: number, seconds: number[]): Fix[] =>
      seconds.map((s) => ({ gps: { lat, lng: 120.94 }, at: at(s) }))
    const verdict = movingTogether(still(15.7331, FINE), still(15.73312, COARSE))
    expect(verdict.together).toBe(false)
    expect(verdict.reason).toBe('not-moving')
  })

  it('records the trip once they have been moving together long enough', () => {
    // One full driver reporting interval of agreement, judged from the
    // coarse track against the fine one.
    const passenger = northbound(15.7331, 120.94, FINE)
    const tricycle = northbound(15.73312, 120.94001, COARSE)
    const verdict = movingTogether(passenger, tricycle)
    expect(verdict.together).toBe(true)
    expect(verdict.heldMs).toBeGreaterThanOrEqual(SUSTAINED_MS)
  })

  it('reads the coarse track even though the passenger reports far more often', () => {
    // The bug this guards: stepping through the passenger's two-second
    // slices and asking a tricycle that reports every 30s what it was doing
    // over each one. The answer was always "no fix that recent", so the
    // rule could never fire on real data however perfectly they travelled
    // together.
    const passenger = northbound(15.7331, 120.94, FINE)
    const tricycle = northbound(15.73312, 120.94001, COARSE)
    expect(movingTogether(passenger, tricycle).reason).toBe('moving-together')
  })

  it('waits out a single agreeing moment', () => {
    // A tricycle passing on the same road at the same instant agrees for a
    // moment. Recording on that would put a stranger's plate in the log.
    const verdict = movingTogether(
      northbound(15.7331, 120.94, [0, 2, 4, 6, 8, 10]),
      northbound(15.73312, 120.94001, [0, 10]),
    )
    expect(verdict.together).toBe(false)
    expect(verdict.reason).toBe('too-brief')
  })

  it('refuses a tricycle heading the other way', () => {
    // Deliberately a short tricycle interval. Over a full 30s report gap two
    // vehicles going opposite ways are 300m apart, so separation refuses
    // them long before heading is consulted — the heading rule only has
    // anything to say across a short gap, which is what this covers.
    const passenger = northbound(15.7331, 120.94, [0, 2, 4])
    const southbound = northbound(15.7331 + 30 / 111_320, 120.94001, [0, 4], -5.5)
    const verdict = movingTogether(passenger, southbound)
    expect(verdict.together).toBe(false)
    expect(verdict.reason).toBe('different-heading')
  })

  it('refuses a tricycle that has pulled away', () => {
    // Same heading, same speed, but on the next street over. Riding in it
    // means being in it.
    const passenger = northbound(15.7331, 120.94, FINE)
    const farLane = northbound(15.7331, 120.9425, COARSE) // ~270m east
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
    const passenger = northbound(15.7331, 120.94, [40, 42, 44, 46, 48, 50])
    const stale = northbound(15.73312, 120.94001, [0, 30])
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
