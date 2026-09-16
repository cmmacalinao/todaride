import { describe, expect, it } from 'vitest'
import { FAR_DRIVER_METERS, formatDuration, formatKm, minutesToCover } from '../geo'
import { farDriverGap } from '../farDriver'

// What the passenger is told before a long wait starts, and when.
describe('warning about a driver who is far away', () => {
  it('says nothing for a tricycle already on the same street', () => {
    expect(200 > FAR_DRIVER_METERS).toBe(false)
    expect(900 > FAR_DRIVER_METERS).toBe(false)
  })

  it('speaks up past a kilometre', () => {
    expect(1001 > FAR_DRIVER_METERS).toBe(true)
  })

  it('never claims a zero-minute wait', () => {
    // A driver 5m away is still a driver who has to set off. "0 min" reads
    // as "already here", which is a promise the app cannot keep.
    expect(minutesToCover(5)).toBe(1)
  })

  it('turns distance into a wait a passenger can picture', () => {
    expect(minutesToCover(1500)).toBe(5)
    expect(minutesToCover(3000)).toBe(9)
    expect(minutesToCover(8000)).toBe(24)
  })

  it('reaches for hours only when there are hours', () => {
    expect(formatDuration(24)).toBe('24 min')
    expect(formatDuration(59)).toBe('59 min')
    expect(formatDuration(60)).toBe('1 hr')
    expect(formatDuration(65)).toBe('1 hr 5 min')
    expect(formatDuration(180)).toBe('3 hr')
  })

  it('states the distance the way the rest of the app does', () => {
    expect(formatKm(1500)).toBe('1.5 km')
    expect(formatKm(20000)).toBe('20.0 km')
  })
})

// When a driver and a pickup are far enough apart to stop and ask.
describe('farDriverGap', () => {
  const clsu = { lat: 15.73299, lng: 120.931426 }
  const sanJose = { lat: 15.7886023, lng: 120.9921233 }

  it('asks nothing when either end is unknown', () => {
    expect(farDriverGap(null, sanJose)).toBeNull()
    expect(farDriverGap(clsu, null)).toBeNull()
  })

  it('asks nothing for a driver a couple of kilometres off', () => {
    expect(farDriverGap(clsu, clsu)).toBeNull()
    expect(farDriverGap(clsu, sanJose, { meters: 2500, seconds: 400 })).toBeNull()
  })

  it('asks about a driver across town, straight line at tricycle speed', () => {
    const gap = farDriverGap(clsu, sanJose)
    expect(gap).not.toBeNull()
    expect(Math.round(gap!.meters / 1000)).toBe(9)
    expect(gap!.minutes).toBe(minutesToCover(gap!.meters))
  })

  it('prefers the road route when there is one', () => {
    expect(farDriverGap(clsu, sanJose, { meters: 9900, seconds: 1020 })).toEqual({ meters: 9900, minutes: 17 })
  })
})
