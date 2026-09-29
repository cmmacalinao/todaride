import { describe, expect, it } from 'vitest'
import { STUCK_TRIP_AFTER_MS, tripHasNotMoved } from '../stuckTrip'

const PICKUP = { lat: 15.7484, lng: 120.9465 }
const NOW = Date.parse('2026-09-29T08:00:00.000Z')
const startedMsAgo = (ms: number) => new Date(NOW - ms).toISOString()

describe('tripHasNotMoved', () => {
  it('is false for a trip that has only just started', () => {
    expect(
      tripHasNotMoved({ startedAt: startedMsAgo(10_000), pickup: PICKUP, vehicle: null, now: NOW }),
    ).toBe(false)
  })

  it('is true when neither phone has produced a position at all', () => {
    // The pilot case: the driver's phone never got a GPS fix, the trip sat at
    // "ongoing", and the passenger had no way out of it.
    expect(
      tripHasNotMoved({ startedAt: startedMsAgo(STUCK_TRIP_AFTER_MS + 1000), pickup: PICKUP, vehicle: null, now: NOW }),
    ).toBe(true)
  })

  it('is true when the vehicle is still sitting at the pickup', () => {
    // ~25 m away: GPS wander at a standstill, not a tricycle that has left.
    const wander = { lat: PICKUP.lat + 0.0002, lng: PICKUP.lng + 0.0001 }
    expect(
      tripHasNotMoved({ startedAt: startedMsAgo(5 * 60_000), pickup: PICKUP, vehicle: wander, now: NOW }),
    ).toBe(true)
  })

  it('is false once the trip has actually gone somewhere', () => {
    // ~330 m up the road.
    const movedOn = { lat: PICKUP.lat + 0.003, lng: PICKUP.lng }
    expect(
      tripHasNotMoved({ startedAt: startedMsAgo(5 * 60_000), pickup: PICKUP, vehicle: movedOn, now: NOW }),
    ).toBe(false)
  })

  it('is false for a trip that never started', () => {
    expect(tripHasNotMoved({ startedAt: null, pickup: PICKUP, vehicle: null, now: NOW })).toBe(false)
  })

  it('does not call a trip stuck just because the pickup is unknown', () => {
    // A position exists; without a pickup there is nothing to measure it
    // against, and a live position is better evidence of a real trip than none.
    expect(
      tripHasNotMoved({ startedAt: startedMsAgo(5 * 60_000), pickup: null, vehicle: PICKUP, now: NOW }),
    ).toBe(false)
  })
})
