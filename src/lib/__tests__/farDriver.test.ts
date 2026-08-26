import { describe, expect, it } from 'vitest'
import { FAR_DRIVER_METERS, formatDuration, formatKm, minutesToCover } from '../geo'

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
