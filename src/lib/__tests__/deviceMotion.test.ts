import { describe, expect, it } from 'vitest'
import { publishDeviceMotion, readDeviceMotionForTests } from '../liveTracking'

// The reading every map on the page faces itself by. One watch publishes it,
// any number of maps read it, and nothing opens a GPS watch of its own.
describe('device motion', () => {
  it('keeps the newest reading', () => {
    const at = Date.now()
    publishDeviceMotion({ position: { lat: 15.73, lng: 120.93 }, headingDegrees: 90, speedMps: 8, at })
    expect(readDeviceMotionForTests()?.headingDegrees).toBe(90)

    publishDeviceMotion({ position: { lat: 15.74, lng: 120.93 }, headingDegrees: 180, speedMps: 8, at: at + 2000 })
    expect(readDeviceMotionForTests()?.headingDegrees).toBe(180)
  })

  it('ignores a reading that arrives hard on the heels of the last one', () => {
    const at = Date.now() + 100000
    publishDeviceMotion({ position: { lat: 15.73, lng: 120.93 }, headingDegrees: 10, speedMps: 8, at })
    // Fixes arrive about once a second; re-rendering every map that often
    // buys nothing, because the bearing is smoothed anyway.
    publishDeviceMotion({ position: { lat: 15.73, lng: 120.93 }, headingDegrees: 20, speedMps: 8, at: at + 200 })
    expect(readDeviceMotionForTests()?.headingDegrees).toBe(10)

    publishDeviceMotion({ position: { lat: 15.73, lng: 120.93 }, headingDegrees: 30, speedMps: 8, at: at + 1200 })
    expect(readDeviceMotionForTests()?.headingDegrees).toBe(30)
  })
})
