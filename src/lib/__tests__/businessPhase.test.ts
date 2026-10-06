import { describe, expect, it } from 'vitest'
import {
  adSenseAllowed,
  businessPhaseLogSummary,
  DEFAULT_BUSINESS_PHASE,
  effectiveMonthlyFee,
  effectivePerBookingFee,
  effectivePlatformFee,
  isPilot,
} from '../businessPhase'

describe('business phase', () => {
  it('starts in pilot', () => {
    expect(DEFAULT_BUSINESS_PHASE).toBe('pilot')
  })

  it('treats an unset phase as pilot', () => {
    // An older install upgrading must not start charging people because it
    // gained a setting it has never seen.
    expect(isPilot(undefined)).toBe(true)
    expect(isPilot(null)).toBe(true)
  })

  it('charges nothing at all during the pilot', () => {
    expect(effectivePlatformFee(3, 'pilot')).toBe(0)
    expect(effectiveMonthlyFee(1500, 'pilot')).toBe(0)
    expect(effectivePerBookingFee(2, 'pilot')).toBe(0)
  })

  it('charges the saved values at launch', () => {
    expect(effectivePlatformFee(3, 'launch')).toBe(3)
    expect(effectiveMonthlyFee(1500, 'launch')).toBe(1500)
    expect(effectivePerBookingFee(2, 'launch')).toBe(2)
  })

  it('never returns a negative fee', () => {
    expect(effectivePlatformFee(-5, 'launch')).toBe(0)
    expect(effectiveMonthlyFee(-1, 'launch')).toBe(0)
  })

  // The reason this is a phase rather than zeroed settings: the prices have
  // to survive the pilot so nobody has to remember them later.
  it('leaves the saved value untouched, whatever the phase', () => {
    const saved = 3
    effectivePlatformFee(saved, 'pilot')
    effectivePlatformFee(saved, 'launch')
    expect(saved).toBe(3)
  })

  it('hides AdSense during the pilot even when ads are switched on', () => {
    expect(adSenseAllowed(true, 'pilot')).toBe(false)
    expect(adSenseAllowed(true, 'launch')).toBe(true)
    expect(adSenseAllowed(false, 'launch')).toBe(false)
  })

  it('records which way the switch went', () => {
    expect(businessPhaseLogSummary('pilot', 'launch')).toMatch(/LAUNCH/)
    expect(businessPhaseLogSummary('launch', 'pilot')).toMatch(/PILOT/)
    expect(businessPhaseLogSummary('pilot', 'launch')).toMatch(/billed/)
    expect(businessPhaseLogSummary('launch', 'pilot')).toMatch(/saved prices kept/)
  })

  it('says so rather than claiming a change when nothing changed', () => {
    expect(businessPhaseLogSummary('pilot', 'pilot')).toMatch(/re-confirmed/)
  })
})
