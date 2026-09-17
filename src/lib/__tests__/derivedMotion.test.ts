import { describe, expect, it } from 'vitest'
import { derivedMotion } from '../liveTracking'
import { offsetMeters } from '../geo'

// Working out which way the tricycle is going when the phone will not say.
describe('derivedMotion', () => {
  const start = { lat: 15.7329, lng: 120.9314 }

  it('says nothing without an earlier fix to measure from', () => {
    expect(derivedMotion(null, null, start, 1000, 5, 5)).toEqual({ headingDegrees: null, speedMps: null })
  })

  it('says nothing about a few metres of GPS wander', () => {
    const wander = offsetMeters(start, 5, 90)
    expect(derivedMotion(start, 0, wander, 2000, 4, 4).headingDegrees).toBeNull()
  })

  it('needs the stretch to beat both readings’ error, not only 12 m', () => {
    const east = offsetMeters(start, 20, 90)
    expect(derivedMotion(start, 0, east, 4000, 15, 15).headingDegrees).toBeNull()
  })

  it('points the way the tricycle went, at the speed it covered', () => {
    const east = offsetMeters(start, 30, 90)
    const motion = derivedMotion(start, 0, east, 6000, 5, 5)
    expect(Math.round(motion.headingDegrees!)).toBe(90)
    expect(motion.speedMps).toBeCloseTo(5, 0)
    const north = offsetMeters(start, 30, 0)
    expect(Math.round(derivedMotion(start, 0, north, 6000, 5, 5).headingDegrees!)).toBe(0)
  })
})
