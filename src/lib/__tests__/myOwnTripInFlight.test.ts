import { describe, expect, it, vi } from 'vitest'
import { IN_FLIGHT, useHasMyOwnTripInFlight } from '../myOwnTripInFlight'

// The bug this exists to catch: an update reload/sheet used to check whether
// ANY ride anywhere was in flight, not this device's own. One passenger's
// unclaimed request, left sitting after they closed the app, silenced
// updates for every other phone on the pilot for as long as it stayed
// uncancelled.

let mockRides: unknown[] = []
let mockAlerts: unknown[] = []
let mockAccount: { role: string; id: string } | null = null

vi.mock('../../context/RideContext', () => ({
  useRides: () => ({ rides: mockRides, alerts: mockAlerts }),
}))
vi.mock('../../context/SessionContext', () => ({
  useSession: () => ({ authedAccount: mockAccount }),
}))

// The hook calls two other hooks and nothing React-specific beyond that, so
// it can be exercised directly as a plain function — no renderHook needed.
function call(): boolean {
  return useHasMyOwnTripInFlight()
}

describe('whether THIS device has a trip in flight', () => {
  it('is unmoved by a stranger\'s in-flight ride', () => {
    mockAccount = { role: 'passenger', id: 'pax-1' }
    mockRides = [{ id: 'r1', status: 'requested', passengerId: 'someone-else' }]
    mockAlerts = []
    expect(call()).toBe(false)
  })

  it('is true for the signed-in passenger\'s own ride', () => {
    mockAccount = { role: 'passenger', id: 'pax-1' }
    mockRides = [{ id: 'r1', status: 'ongoing', passengerId: 'pax-1' }]
    mockAlerts = []
    expect(call()).toBe(true)
  })

  it('is true for the signed-in driver\'s own ride', () => {
    mockAccount = { role: 'driver', id: 'drv-1' }
    mockRides = [{ id: 'r1', status: 'driver_arriving', driverId: 'drv-1' }]
    mockAlerts = []
    expect(call()).toBe(true)
  })

  it('is true for the signed-in parent\'s booked ride', () => {
    mockAccount = { role: 'parent', id: 'parent-1' }
    mockRides = [{ id: 'r1', status: 'accepted', bookedByParentId: 'parent-1' }]
    mockAlerts = []
    expect(call()).toBe(true)
  })

  it('ignores a ride the account is not the party on, even with a matching id shape', () => {
    // A driver whose id happens to equal some ride's passengerId must not
    // match on the wrong field.
    mockAccount = { role: 'driver', id: 'shared-id' }
    mockRides = [{ id: 'r1', status: 'ongoing', passengerId: 'shared-id', driverId: 'someone-else' }]
    mockAlerts = []
    expect(call()).toBe(false)
  })

  it('every in-flight status counts', () => {
    mockAccount = { role: 'passenger', id: 'pax-1' }
    for (const status of IN_FLIGHT) {
      mockRides = [{ id: 'r1', status, passengerId: 'pax-1' }]
      mockAlerts = []
      expect(call()).toBe(true)
    }
  })

  it('a finished or cancelled ride of your own does not count', () => {
    mockAccount = { role: 'passenger', id: 'pax-1' }
    mockRides = [{ id: 'r1', status: 'completed', passengerId: 'pax-1' }]
    mockAlerts = []
    expect(call()).toBe(false)
  })

  it('is true for an open SOS this account triggered, even a driver-initiated one with no ride', () => {
    mockAccount = { role: 'driver', id: 'drv-1' }
    mockRides = []
    mockAlerts = [{ status: 'open', triggeredBy: 'drv-1', rideId: null }]
    expect(call()).toBe(true)
  })

  it('is true for an open SOS on your own ride even after that ride is no longer in flight', () => {
    mockAccount = { role: 'parent', id: 'parent-1' }
    mockRides = [{ id: 'r1', status: 'completed', bookedByParentId: 'parent-1' }]
    mockAlerts = [{ status: 'open', triggeredBy: 'the-child-passenger', rideId: 'r1' }]
    expect(call()).toBe(true)
  })

  it('ignores a stranger\'s open SOS', () => {
    mockAccount = { role: 'passenger', id: 'pax-1' }
    mockRides = []
    mockAlerts = [{ status: 'open', triggeredBy: 'someone-else', rideId: 'someone-elses-ride' }]
    expect(call()).toBe(false)
  })

  it('ignores a resolved SOS even on your own ride', () => {
    mockAccount = { role: 'passenger', id: 'pax-1' }
    mockRides = [{ id: 'r1', status: 'ongoing', passengerId: 'other-pax' }]
    mockAlerts = [{ status: 'resolved', triggeredBy: 'pax-1', rideId: 'r1' }]
    expect(call()).toBe(false)
  })

  it('is false when nobody is signed in', () => {
    mockAccount = null
    mockRides = [{ id: 'r1', status: 'ongoing', passengerId: 'pax-1' }]
    mockAlerts = []
    expect(call()).toBe(false)
  })

  it('is false for a role with no trip of its own, however busy the fleet is', () => {
    mockAccount = { role: 'admin', id: 'admin-1' }
    mockRides = [{ id: 'r1', status: 'ongoing', passengerId: 'pax-1' }]
    mockAlerts = [{ status: 'open', triggeredBy: 'pax-1', rideId: 'r1' }]
    expect(call()).toBe(false)
  })
})
