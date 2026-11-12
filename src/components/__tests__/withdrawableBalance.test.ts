import { describe, expect, it } from 'vitest'
import { withdrawableBalance } from '../DriverWithdrawPanel'
import type { DriverWithdrawal, Payment, Ride } from '../../types'

// Only the shape withdrawableBalance reads. A whole Ride literal here would
// be two hundred lines of fields that have nothing to do with the sum.
const ride = (payment: Partial<Payment> | null, driverId = 'drv-1'): Ride =>
  ({
    id: 'ride-' + Math.random(),
    driverId,
    status: 'completed',
    payment: payment && ({ driverPayout: 89, method: 'gcash', ...payment } as Payment),
  }) as unknown as Ride

const paid = (over: Partial<DriverWithdrawal> = {}): DriverWithdrawal =>
  ({ driverId: 'drv-1', amount: 50, status: 'paid', ...over }) as DriverWithdrawal

describe('what the platform is holding for a driver', () => {
  it('counts a fare the platform collected', () => {
    expect(withdrawableBalance([ride({ collectedBy: 'platform' })], 'drv-1', []).available).toBe(89)
  })

  it('does not count cash', () => {
    // Already in their pocket since the kerb.
    expect(withdrawableBalance([ride({ method: 'cash', collectedBy: 'driver' })], 'drv-1', []).available).toBe(0)
  })

  it('does not count a GCash fare sent to the driver', () => {
    // The whole point of driver-direct: paying this out would pay the same
    // trip twice, once by the passenger and once by the platform.
    expect(withdrawableBalance([ride({ method: 'gcash', collectedBy: 'driver' })], 'drv-1', []).available).toBe(0)
  })

  it('reads a fare recorded before anybody tracked this as centrally collected', () => {
    // Every online fare was platform-collected back then, so undefined has
    // to keep meaning that — otherwise old balances silently drop to zero.
    expect(withdrawableBalance([ride({ method: 'gcash' })], 'drv-1', []).available).toBe(89)
  })

  it('separates two drivers', () => {
    const rides = [ride({ collectedBy: 'platform' }), ride({ collectedBy: 'platform' }, 'drv-2')]
    expect(withdrawableBalance(rides, 'drv-1', []).earned).toBe(89)
  })

  it('takes off what has already been asked for, pending or paid', () => {
    const rides = [ride({ collectedBy: 'platform' }), ride({ collectedBy: 'platform' })]
    const asked = [paid(), paid({ status: 'pending', amount: 20 }), paid({ status: 'rejected', amount: 100 })]
    expect(withdrawableBalance(rides, 'drv-1', asked)).toEqual({ earned: 178, requested: 70, available: 108 })
  })

  it('never goes negative', () => {
    expect(withdrawableBalance([], 'drv-1', [paid({ amount: 500 })]).available).toBe(0)
  })
})
