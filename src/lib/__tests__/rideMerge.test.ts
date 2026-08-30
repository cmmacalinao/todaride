import { describe, expect, it } from 'vitest'
import { isFinishedRide, mergeById, mergeIncomingRides } from '../rideMerge'
import type { Ride, RideStatus } from '../../types'

const ride = (id: string, status: RideStatus, extra: Partial<Ride> = {}): Ride =>
  ({ id, status, passengerId: 'pax-1', legProgress: 0, ...extra }) as Ride

describe('reconciling a ride that arrives from another device', () => {
  it('takes the incoming copy for a trip still running', () => {
    // The ordinary case: someone else knows more than we do.
    const merged = mergeIncomingRides([ride('r1', 'requested')], [ride('r1', 'driver_arriving')])
    expect(merged[0].status).toBe('driver_arriving')
  })

  it('refuses to un-cancel a ride this device has already cancelled', () => {
    // The bug this exists for: a passenger cancels, and the driver's phone —
    // still ticking a simulated approach from its own stale copy — writes
    // "driver arriving" back a second later, over and over.
    const merged = mergeIncomingRides([ride('r1', 'cancelled')], [ride('r1', 'driver_arriving')])
    expect(merged[0].status).toBe('cancelled')
  })

  it('refuses to re-open a completed trip', () => {
    const merged = mergeIncomingRides([ride('r1', 'completed')], [ride('r1', 'ongoing')])
    expect(merged[0].status).toBe('completed')
  })

  it('accepts an ending it has not heard about yet', () => {
    // The other direction has to stay open, or the ticking device would never
    // learn the ride is over and the two would never agree.
    const merged = mergeIncomingRides([ride('r1', 'driver_arriving')], [ride('r1', 'cancelled')])
    expect(merged[0].status).toBe('cancelled')
  })

  it('lets one ending replace another', () => {
    // Completed and cancelled are both final; whichever arrives is a record
    // written elsewhere, not a step backwards.
    const merged = mergeIncomingRides([ride('r1', 'cancelled')], [ride('r1', 'completed')])
    expect(merged[0].status).toBe('completed')
  })

  it('keeps the rest of an incoming ride when it holds the local status', () => {
    // Only the status is defended. Everything else on the row — the fare the
    // driver recorded, the photos, the log — is still the other device's to
    // tell us about.
    const local = [ride('r1', 'cancelled', { fareEstimate: 100 })]
    const incoming = [ride('r1', 'driver_arriving', { fareEstimate: 250 })]
    expect(mergeIncomingRides(local, incoming)[0].fareEstimate).toBe(100)
  })

  it('passes through rides this device has never seen', () => {
    const merged = mergeIncomingRides([], [ride('r9', 'requested')])
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('r9')
  })

  it('knows which statuses are endings', () => {
    expect(isFinishedRide('completed')).toBe(true)
    expect(isFinishedRide('cancelled')).toBe(true)
    expect(isFinishedRide('ongoing')).toBe(false)
    expect(isFinishedRide('requested')).toBe(false)
    expect(isFinishedRide('driver_arriving')).toBe(false)
  })
})

describe('reconciling accounts that arrive from another device', () => {
  const person = (id: string, name: string) => ({ id, name }) as { id: string; name: string }

  it('keeps a sign-up the incoming copy has never heard of', () => {
    // The bug this exists for: someone registers on their phone, another
    // device saves a world that predates them, and the account is gone with
    // no row left to recover.
    const local = [person('pax-1', 'Celeste'), person('pax-9', 'Art Danao')]
    const incoming = [person('pax-1', 'Celeste')]
    const merged = mergeById(local, incoming)
    expect(merged.map((p) => p.id).sort()).toEqual(['pax-1', 'pax-9'])
  })

  it('takes the incoming version of a record both sides know', () => {
    // A profile edited elsewhere is a newer edit, not a competing one.
    const merged = mergeById([person('pax-1', 'Old name')], [person('pax-1', 'New name')])
    expect(merged).toHaveLength(1)
    expect(merged[0].name).toBe('New name')
  })

  it('accepts accounts this device has never seen', () => {
    const merged = mergeById([], [person('pax-4', 'Ces')])
    expect(merged.map((p) => p.id)).toEqual(['pax-4'])
  })

  it('is empty only when both sides are', () => {
    expect(mergeById([], [])).toEqual([])
  })
})
