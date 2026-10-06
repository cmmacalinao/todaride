import { describe, expect, it } from 'vitest'
import {
  animationDurationMs,
  easeHeading,
  easeInOut,
  interpolateAlongRoute,
  interpolateCoords,
  MAX_ANIMATION_MS,
  MIN_ANIMATION_MS,
  pruneBuffer,
  samplePositionAt,
  shortestTurnDegrees,
  shouldTeleport,
  TELEPORT_GAP_MS,
  type TimedFix,
} from '../markerAnimator'
import { haversineDistanceMeters } from '../geo'

const A = { lat: 15.73, lng: 120.96 }
// ~22 m north of A: a normal second of tricycle movement.
const B = { lat: 15.7302, lng: 120.96 }
// ~1.1 km east: not something that happened smoothly in one second.
const FAR = { lat: 15.73, lng: 120.97 }

describe('interpolateCoords', () => {
  it('sits at each end at 0 and 1', () => {
    expect(interpolateCoords(A, B, 0)).toEqual(A)
    expect(interpolateCoords(A, B, 1)).toEqual(B)
  })

  it('sits halfway at 0.5', () => {
    const mid = interpolateCoords(A, B, 0.5)
    expect(mid.lat).toBeCloseTo((A.lat + B.lat) / 2, 10)
  })

  it('clamps rather than overshooting', () => {
    expect(interpolateCoords(A, B, 2)).toEqual(B)
    expect(interpolateCoords(A, B, -1)).toEqual(A)
  })
})

describe('easeInOut', () => {
  it('starts at 0, ends at 1, and is symmetric about the middle', () => {
    expect(easeInOut(0)).toBe(0)
    expect(easeInOut(1)).toBe(1)
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 10)
    expect(easeInOut(0.25) + easeInOut(0.75)).toBeCloseTo(1, 10)
  })

  it('moves more slowly at the ends than in the middle', () => {
    expect(easeInOut(0.1)).toBeLessThan(0.1)
    expect(easeInOut(0.9)).toBeGreaterThan(0.9)
  })
})

describe('shouldTeleport', () => {
  it('glides a normal second of movement', () => {
    expect(shouldTeleport({ from: A, to: B, gapMs: 1000 })).toBe(false)
  })

  it('jumps a leap no vehicle made smoothly', () => {
    expect(haversineDistanceMeters(A, FAR)).toBeGreaterThan(200)
    expect(shouldTeleport({ from: A, to: FAR, gapMs: 1000 })).toBe(true)
  })

  it('jumps after a long silence even if the vehicle barely moved', () => {
    // Ten seconds of no fixes: we do not know what happened in between, and
    // a smooth crawl would be a confident lie about it.
    expect(shouldTeleport({ from: A, to: B, gapMs: TELEPORT_GAP_MS + 1 })).toBe(true)
  })

  it('jumps rather than trusting a nonsense gap', () => {
    expect(shouldTeleport({ from: A, to: B, gapMs: Number.NaN })).toBe(true)
  })

  it('is on the glide side exactly at the threshold', () => {
    expect(shouldTeleport({ from: A, to: A, gapMs: TELEPORT_GAP_MS })).toBe(false)
  })
})

describe('animationDurationMs', () => {
  it('matches the real gap between fixes', () => {
    expect(animationDurationMs(1500)).toBe(1500)
  })

  it('clamps a flicker up and a crawl down', () => {
    expect(animationDurationMs(50)).toBe(MIN_ANIMATION_MS)
    expect(animationDurationMs(9000)).toBe(MAX_ANIMATION_MS)
  })

  it('survives a zero or nonsense gap', () => {
    expect(animationDurationMs(0)).toBe(MIN_ANIMATION_MS)
    expect(animationDurationMs(Number.NaN)).toBe(MIN_ANIMATION_MS)
  })
})

describe('shortestTurnDegrees', () => {
  // The most obviously wrong thing a marker can do is spin the long way
  // round when a vehicle turns through north.
  it('turns 20 degrees right from 350 to 10, not 340 left', () => {
    expect(shortestTurnDegrees(350, 10)).toBe(20)
  })

  it('turns left when left is shorter', () => {
    expect(shortestTurnDegrees(10, 350)).toBe(-20)
  })

  it('never asks for more than half a turn', () => {
    for (const [from, to] of [
      [0, 179],
      [0, 181],
      [90, 270],
      [359, 1],
    ]) {
      expect(Math.abs(shortestTurnDegrees(from, to))).toBeLessThanOrEqual(180)
    }
  })

  it('eases a heading and lands on the target', () => {
    expect(easeHeading(350, 10, 0)).toBeCloseTo(350, 6)
    expect(easeHeading(350, 10, 1) % 360).toBeCloseTo(10, 6)
  })
})

describe('samplePositionAt - the delay buffer', () => {
  const buffer: TimedFix[] = [
    { gps: A, at: 1000, headingDegrees: 0 },
    { gps: B, at: 2000, headingDegrees: 90 },
  ]

  it('has nothing to say with an empty buffer', () => {
    expect(samplePositionAt([], 5000)).toBeNull()
  })

  it('interpolates between the two fixes around the render time', () => {
    const s = samplePositionAt(buffer, 1500)!
    expect(s.holding).toBe(false)
    expect(s.gps.lat).toBeGreaterThan(A.lat)
    expect(s.gps.lat).toBeLessThan(B.lat)
  })

  // The rule that keeps this honest: never guess where it went next.
  it('holds the last position when the buffer runs dry, instead of extrapolating', () => {
    const s = samplePositionAt(buffer, 9000)!
    expect(s.holding).toBe(true)
    expect(s.gps).toEqual(B)
  })

  it('shows the first fix immediately rather than an empty map for a second', () => {
    const s = samplePositionAt(buffer, 0)!
    expect(s.gps).toEqual(A)
    expect(s.holding).toBe(true)
  })

  it('does not slide across a gap it should jump', () => {
    const jumpy: TimedFix[] = [
      { gps: A, at: 1000 },
      { gps: FAR, at: 2000 },
    ]
    const s = samplePositionAt(jumpy, 1500)!
    // Still at A; it appears at FAR once the render time passes it.
    expect(s.gps).toEqual(A)
    expect(s.holding).toBe(true)
  })

  it('copes with fixes arriving out of order', () => {
    const shuffled: TimedFix[] = [
      { gps: B, at: 2000 },
      { gps: A, at: 1000 },
    ]
    const s = samplePositionAt(shuffled, 1500)!
    expect(s.gps.lat).toBeGreaterThan(A.lat)
    expect(s.gps.lat).toBeLessThan(B.lat)
  })

  it('eases the heading between fixes', () => {
    const s = samplePositionAt(buffer, 1500)!
    expect(s.headingDegrees).toBeGreaterThan(0)
    expect(s.headingDegrees).toBeLessThan(90)
  })
})

describe('pruneBuffer', () => {
  it('drops fixes nothing will be drawn from again', () => {
    const buffer: TimedFix[] = [
      { gps: A, at: 1000 },
      { gps: B, at: 9000 },
    ]
    expect(pruneBuffer(buffer, 9000)).toHaveLength(1)
  })

  it('never empties the buffer, since a stale fix beats no marker', () => {
    const buffer: TimedFix[] = [{ gps: A, at: 1000 }]
    expect(pruneBuffer(buffer, 999_999)).toHaveLength(1)
  })
})

describe('interpolateAlongRoute', () => {
  // An L-shaped road: east, then north. The straight line between the ends
  // cuts the corner and goes through whatever is inside the bend.
  const corner = { lat: 15.73, lng: 120.962 }
  const end = { lat: 15.732, lng: 120.962 }
  const route = [A, corner, end]

  it('follows the bend instead of cutting it', () => {
    const mid = interpolateAlongRoute(route, A, end, 0.5)
    const straight = interpolateCoords(A, end, 0.5)
    // The route midpoint is nearer the corner than the straight line is.
    expect(haversineDistanceMeters(mid, corner)).toBeLessThan(haversineDistanceMeters(straight, corner))
  })

  it('still lands on both ends', () => {
    expect(interpolateAlongRoute(route, A, end, 0)).toEqual(A)
    const finish = interpolateAlongRoute(route, A, end, 1)
    expect(haversineDistanceMeters(finish, end)).toBeLessThan(1)
  })

  it('falls back to a straight line with no usable route', () => {
    expect(interpolateAlongRoute(null, A, B, 0.5)).toEqual(interpolateCoords(A, B, 0.5))
    expect(interpolateAlongRoute([A], A, B, 0.5)).toEqual(interpolateCoords(A, B, 0.5))
  })

  it('falls back rather than dragging the marker onto a road it is not on', () => {
    // A wrong road is worse than no road.
    const elsewhere = [
      { lat: 15.9, lng: 121.2 },
      { lat: 15.901, lng: 121.2 },
    ]
    expect(interpolateAlongRoute(elsewhere, A, B, 0.5)).toEqual(interpolateCoords(A, B, 0.5))
  })

  it('falls back when the movement runs backwards along the route', () => {
    expect(interpolateAlongRoute(route, end, A, 0.5)).toEqual(interpolateCoords(end, A, 0.5))
  })
})
