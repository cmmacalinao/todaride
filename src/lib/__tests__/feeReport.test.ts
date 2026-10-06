import { describe, expect, it } from 'vitest'
import { feeReportSheetRows, monthlyFeeReport } from '../feeReport'
import type { Ride } from '../../types'

const ride = (month: string, payment: Record<string, unknown> | null, status = 'completed'): Ride =>
  ({
    id: `r-${month}-${Math.random()}`,
    status,
    requestedAt: `${month}-05T08:00:00.000Z`,
    completedAt: `${month}-05T08:20:00.000Z`,
    payment: payment ? { paidAt: `${month}-05T08:21:00.000Z`, ...payment } : null,
  }) as unknown as Ride

const referred = (month: string) =>
  ride(month, {
    platformFee: 3,
    partnerDriverId: 'partner',
    partnerCommission: 0.7,
    todaReferralReward: 0.3,
    rotaryShare: 0.5,
    greentechNet: 1.5,
  })

const unreferred = (month: string) =>
  ride(month, { platformFee: 3, partnerCommission: 0, todaReferralReward: 0, rotaryShare: 0.5, greentechNet: 2.5 })

describe('monthlyFeeReport', () => {
  it('adds up one month and splits referred from unreferred', () => {
    const rows = monthlyFeeReport([referred('2026-10'), referred('2026-10'), unreferred('2026-10')])
    expect(rows).toHaveLength(1)
    const r = rows[0]
    expect(r.rides).toBe(3)
    expect(r.referredRides).toBe(2)
    expect(r.unreferredRides).toBe(1)
    expect(r.grossFees).toBe(9)
    expect(r.partnerPayouts).toBe(1.4)
    expect(r.todaRewards).toBe(0.6)
    expect(r.rotaryShare).toBe(1.5)
    expect(r.greentechNet).toBe(5.5)
    // The four shares account for the whole fee.
    expect(r.partnerPayouts + r.todaRewards + r.rotaryShare + r.greentechNet).toBe(r.grossFees)
  })

  it('keeps months apart and puts the newest first', () => {
    const rows = monthlyFeeReport([referred('2026-08'), referred('2026-10'), referred('2026-09')])
    expect(rows.map((r) => r.month)).toEqual(['2026-10', '2026-09', '2026-08'])
  })

  it('ignores rides that never completed', () => {
    const rows = monthlyFeeReport([referred('2026-10'), ride('2026-10', null, 'cancelled')])
    expect(rows[0].rides).toBe(1)
  })

  it('counts a fee-free ride without inventing money for it', () => {
    // The pilot runs at ₱0, and terminal QR rides never carry a fee.
    const rows = monthlyFeeReport([ride('2026-10', { platformFee: 0 })])
    expect(rows[0].rides).toBe(1)
    expect(rows[0].grossFees).toBe(0)
    expect(rows[0].rotaryShare).toBe(0)
    expect(rows[0].greentechNet).toBe(0)
  })

  it('reads what an old ride recorded rather than today\u2019s settings', () => {
    // A ride completed when the donation was ₱1.00 still reports ₱1.00.
    const old = ride('2026-09', { platformFee: 3, rotaryShare: 1, greentechNet: 2 })
    expect(monthlyFeeReport([old])[0].rotaryShare).toBe(1)
  })

  it('survives a payment with none of the new fields', () => {
    // Rides completed before the split existed.
    const legacy = ride('2026-07', { platformFee: 3, partnerCommission: 0.7 })
    const r = monthlyFeeReport([legacy])[0]
    expect(r.grossFees).toBe(3)
    expect(r.rotaryShare).toBe(0)
    expect(r.greentechNet).toBe(0)
    expect(r.unreferredRides).toBe(1)
  })

  it('has nothing to report when nothing completed', () => {
    expect(monthlyFeeReport([])).toEqual([])
  })
})

describe('feeReportSheetRows', () => {
  it('lays the columns out the way the money moves', () => {
    const [row] = feeReportSheetRows(monthlyFeeReport([referred('2026-10')]))
    expect(Object.keys(row)).toEqual([
      'Month',
      'Rides',
      'Referred rides',
      'Unreferred rides',
      'Gross platform fees',
      'Partner payouts',
      'TODA rewards',
      'Rotary share',
      'GreenTech net',
    ])
    expect(row['Rotary share']).toBe(0.5)
  })
})
