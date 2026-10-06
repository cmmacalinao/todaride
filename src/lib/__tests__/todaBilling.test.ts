import { describe, expect, it } from 'vitest'
import {
  billingModeExplanation,
  billingModeOf,
  DEFAULT_TODA_BILLING_MODE,
  monthlyPlanDueForToda,
  perBookingDueForToda,
  platformFeeForRide,
} from '../todaBilling'
import { marketingSplit } from '../marketingProgram'
import type { Driver, TodaOrganization } from '../../types'

describe('TODA billing mode', () => {
  it('defaults to per ride, which is what every TODA does today', () => {
    expect(DEFAULT_TODA_BILLING_MODE).toBe('per_ride')
    expect(billingModeOf(undefined)).toBe('per_ride')
    expect(billingModeOf(null)).toBe('per_ride')
  })

  // The whole point of the mode: never both.
  it('charges per ride and no monthly plan on per_ride', () => {
    expect(platformFeeForRide({ baseFee: 3, mode: 'per_ride', phase: 'launch' })).toBe(3)
    expect(monthlyPlanDueForToda({ monthlyPlatformFee: 1500, mode: 'per_ride', phase: 'launch' })).toBe(0)
    expect(perBookingDueForToda({ perBookingFee: 2, mode: 'per_ride', phase: 'launch' })).toBe(0)
  })

  it('charges the monthly plan and no per-ride fee on flat_plan', () => {
    expect(platformFeeForRide({ baseFee: 3, mode: 'flat_plan', phase: 'launch' })).toBe(0)
    expect(monthlyPlanDueForToda({ monthlyPlatformFee: 1500, mode: 'flat_plan', phase: 'launch' })).toBe(1500)
    expect(perBookingDueForToda({ perBookingFee: 2, mode: 'flat_plan', phase: 'launch' })).toBe(2)
  })

  it('never bills both ways, whichever mode is set', () => {
    for (const mode of ['per_ride', 'flat_plan'] as const) {
      const perRide = platformFeeForRide({ baseFee: 3, mode, phase: 'launch' })
      const monthly = monthlyPlanDueForToda({ monthlyPlatformFee: 1500, mode, phase: 'launch' })
      expect(perRide > 0 && monthly > 0).toBe(false)
    }
  })

  it('lets the pilot override both models', () => {
    for (const mode of ['per_ride', 'flat_plan'] as const) {
      expect(platformFeeForRide({ baseFee: 3, mode, phase: 'pilot' })).toBe(0)
      expect(monthlyPlanDueForToda({ monthlyPlatformFee: 1500, mode, phase: 'pilot' })).toBe(0)
      expect(perBookingDueForToda({ perBookingFee: 2, mode, phase: 'pilot' })).toBe(0)
    }
  })

  it('treats an unset mode as per ride rather than moving anyone onto a plan', () => {
    expect(platformFeeForRide({ baseFee: 3, mode: undefined, phase: 'launch' })).toBe(3)
    expect(monthlyPlanDueForToda({ monthlyPlatformFee: 1500, mode: undefined, phase: 'launch' })).toBe(0)
  })

  it('says which way a TODA is charged rather than leaving it to be inferred', () => {
    expect(billingModeExplanation('flat_plan', 'launch')).toMatch(/monthly plan/)
    expect(billingModeExplanation('per_ride', 'launch')).toMatch(/no monthly plan/)
    expect(billingModeExplanation('per_ride', 'pilot')).toMatch(/Pilot/)
  })
})

// The consequence worth testing, because it is the part somebody would
// otherwise try to "fix": a fee-free ride has nothing to split.
describe('a flat-plan TODA generates no fee shares', () => {
  const driver = (id: string, extra: Partial<Driver> = {}): Driver =>
    ({ id, name: id, todaOrgId: 'toda-a', verificationStatus: 'approved', ...extra }) as Driver
  const partner = driver('partner')
  const recruit = driver('recruit', {
    referredByDriverId: 'partner',
    referredAt: new Date(Date.now() - 30 * 864e5).toISOString(),
  })
  const orgs = [{ id: 'toda-a', name: 'A', officialMemberCount: 2 } as TodaOrganization]

  it('pays nobody when the ride carries no fee', () => {
    const fee = platformFeeForRide({ baseFee: 3, mode: 'flat_plan', phase: 'launch' })
    expect(fee).toBe(0)
    const split = marketingSplit({ recruit, drivers: [partner, recruit], orgs, platformFee: fee })
    expect(split.partnerCommission).toBe(0)
    expect(split.todaReferralReward).toBe(0)
    expect(split.rotaryShare).toBe(0)
    expect(split.greentechNet).toBe(0)
  })

  it('still pays everyone on a per-ride TODA', () => {
    const fee = platformFeeForRide({ baseFee: 3, mode: 'per_ride', phase: 'launch' })
    const split = marketingSplit({ recruit, drivers: [partner, recruit], orgs, platformFee: fee })
    expect(split.partnerCommission).toBe(0.7)
    expect(split.rotaryShare).toBe(0.5)
  })
})
