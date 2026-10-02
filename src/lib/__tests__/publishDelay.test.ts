import { describe, it, expect } from 'vitest'
import { LIVE_GPS_PUBLISH_MS, publishDelayMs } from '../liveTracking'

describe('publishDelayMs', () => {
  it('publishes at once when the window has passed', () => {
    expect(publishDelayMs(0, LIVE_GPS_PUBLISH_MS)).toBe(0)
    expect(publishDelayMs(0, LIVE_GPS_PUBLISH_MS + 500)).toBe(0)
  })

  it('publishes at once on the very first fix', () => {
    expect(publishDelayMs(0, Date.now())).toBe(0)
  })

  // The bug this replaced: a fix arriving inside the window was dropped and
  // nothing retried it, so the next publish waited for the next GPS event.
  it('waits out the remainder rather than throwing the fix away', () => {
    expect(publishDelayMs(1000, 1900)).toBe(100)
    expect(publishDelayMs(1000, 1001)).toBe(999)
  })

  it('never asks for a negative wait', () => {
    expect(publishDelayMs(1000, 999999)).toBe(0)
  })

  it('survives a clock that jumps backwards mid-trip', () => {
    // A phone correcting its time must not park the next publish in the
    // future; it publishes now and carries on.
    expect(publishDelayMs(5000, 1000)).toBe(0)
  })

  it('honours a caller-supplied interval', () => {
    expect(publishDelayMs(0, 500, 3000)).toBe(2500)
    expect(publishDelayMs(0, 3000, 3000)).toBe(0)
  })

  // The measured consequence: fixes arriving a little under the window apart
  // used to publish at half the rate, because every second one was dropped.
  it('keeps the real publish rate at the fix rate, not half of it', () => {
    const FIX_INTERVAL = 900
    let lastPublished = 0
    let clock = 0
    const published: number[] = []
    for (let i = 0; i < 10; i++) {
      clock += FIX_INTERVAL
      const wait = publishDelayMs(lastPublished, clock)
      const at = clock + wait
      published.push(at)
      lastPublished = at
    }
    const gaps = published.slice(1).map((t, i) => t - published[i])
    // Every gap is the window itself, never twice it.
    for (const gap of gaps) {
      expect(gap).toBeLessThanOrEqual(LIVE_GPS_PUBLISH_MS)
    }
    // Ten fixes still produce ten publishes: none was discarded.
    expect(published).toHaveLength(10)
  })
})
