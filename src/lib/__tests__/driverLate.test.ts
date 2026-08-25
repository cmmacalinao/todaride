import { describe, expect, it } from 'vitest'
import { DRIVER_LATE_GRACE_SECONDS, driverPickupOverdue } from '../tracking'
import type { Ride } from '../../types'

// The rule decides when a waiting passenger is offered a way out, and it is
// made of clocks — the kind of thing that reads as obviously correct and is
// off by a status check. Tested against fixed timestamps rather than the real
// clock so it means the same thing whenever it runs.
const ACCEPTED = '2026-08-26T08:00:00.000Z'
const at = (secondsAfterAccept: number) => new Date(ACCEPTED).getTime() + secondsAfterAccept * 1000

function ride(over: Partial<Ride>): Ride {
  return {
    id: 'r1',
    passengerId: 'pax-1',
    passengerName: 'Test',
    status: 'driver_arriving',
    serviceType: 'ride',
    passengerCount: 1,
    acceptedAt: ACCEPTED,
    legProgress: 0.4,
    ...over,
  } as Ride
}

// A real road route of four minutes — the estimate the app would have shown.
const EXPECTED = 240

describe('a driver who has not turned up', () => {
  it('is not late while still inside the estimate', () => {
    expect(driverPickupOverdue(ride({}), EXPECTED, at(EXPECTED - 1)).late).toBe(false)
  })

  it('is not late during the grace period after it', () => {
    // The estimate has lapsed, but an estimate is an estimate — telling the
    // passenger the driver is late the second it expires teaches them to
    // distrust the number rather than the driver.
    expect(driverPickupOverdue(ride({}), EXPECTED, at(EXPECTED + 1)).late).toBe(false)
    expect(driverPickupOverdue(ride({}), EXPECTED, at(EXPECTED + DRIVER_LATE_GRACE_SECONDS)).late).toBe(false)
  })

  it('is late once the estimate and the grace are both spent', () => {
    const overdue = driverPickupOverdue(ride({}), EXPECTED, at(EXPECTED + DRIVER_LATE_GRACE_SECONDS + 1))
    expect(overdue.late).toBe(true)
    expect(overdue.waitedSeconds).toBe(EXPECTED + DRIVER_LATE_GRACE_SECONDS + 1)
  })

  it('falls back to the simulated leg when no road route resolved', () => {
    // Null expectation must not read as "expected in zero seconds", which
    // would make every driver late the moment they accepted.
    expect(driverPickupOverdue(ride({}), null, at(0)).late).toBe(false)
    expect(driverPickupOverdue(ride({}), null, at(0)).expectedSeconds).toBeGreaterThan(
      DRIVER_LATE_GRACE_SECONDS,
    )
  })

  it('is never late once the tricycle has arrived', () => {
    // legProgress 1 is "standing at the pickup". Hours may pass while the
    // passenger walks out to the road; none of it is the driver being late.
    const arrived = ride({ legProgress: 1 })
    expect(driverPickupOverdue(arrived, EXPECTED, at(99999)).late).toBe(false)
  })

  it('is never late once the trip has started, or before anyone accepted', () => {
    expect(driverPickupOverdue(ride({ status: 'ongoing' }), EXPECTED, at(99999)).late).toBe(false)
    expect(driverPickupOverdue(ride({ status: 'requested' }), EXPECTED, at(99999)).late).toBe(false)
    expect(driverPickupOverdue(ride({ acceptedAt: null }), EXPECTED, at(99999)).late).toBe(false)
  })
})
