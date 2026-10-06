import { describe, expect, it } from 'vitest'
import { breakEven, breakEvenSheetRows, totalMonthlyCost } from '../breakEven'
import type { FeeReportRow } from '../feeReport'

const row = (month: string, over: Partial<FeeReportRow> = {}): FeeReportRow => ({
  month,
  rides: 100,
  referredRides: 0,
  unreferredRides: 100,
  feeFreeRides: 0,
  grossFees: 300,
  partnerPayouts: 0,
  todaRewards: 0,
  rotaryShare: 50,
  greentechNet: 250,
  ...over,
})

const costs = [
  { id: 'a', label: 'Netlify', amount: 1200 },
  { id: 'b', label: 'Supabase', amount: 1500 },
  { id: 'c', label: 'SMS credits', amount: 800 },
]

describe('totalMonthlyCost', () => {
  it('adds the lines', () => {
    expect(totalMonthlyCost(costs)).toBe(3500)
  })

  it('ignores a nonsense amount rather than producing NaN', () => {
    expect(totalMonthlyCost([{ id: 'x', label: 'bad', amount: Number.NaN }])).toBe(0)
    expect(totalMonthlyCost([{ id: 'y', label: 'negative', amount: -100 }])).toBe(0)
  })
})

describe('breakEven', () => {
  it('derives net per ride from what the rides actually paid', () => {
    // 100 fee-paying rides netting ₱250 in total is ₱2.50 each.
    const b = breakEven({ costLines: costs, report: [row('2026-10')], thisMonth: '2026-10' })
    expect(b.netPerRide).toBe(2.5)
    expect(b.monthlyCost).toBe(3500)
    expect(b.ridesNeeded).toBe(1400)
    expect(b.ridesThisMonth).toBe(100)
    expect(b.gap).toBe(1300)
    expect(b.insufficientData).toBe(false)
  })

  // The mix moves the answer, which is why it is measured rather than assumed.
  it('needs more rides when more of them are referred', () => {
    const unreferred = breakEven({ costLines: costs, report: [row('2026-10')], thisMonth: '2026-10' })
    const referred = breakEven({
      costLines: costs,
      report: [row('2026-10', { greentechNet: 150, referredRides: 100, unreferredRides: 0 })],
      thisMonth: '2026-10',
    })
    expect(referred.netPerRide).toBe(1.5)
    expect(referred.ridesNeeded!).toBeGreaterThan(unreferred.ridesNeeded!)
  })

  it('says "not enough data" rather than inventing a number', () => {
    const b = breakEven({ costLines: costs, report: [], thisMonth: '2026-10' })
    expect(b.insufficientData).toBe(true)
    expect(b.netPerRide).toBeNull()
    expect(b.ridesNeeded).toBeNull()
    expect(b.gap).toBeNull()
    // The cost is still known even when the rides are not.
    expect(b.monthlyCost).toBe(3500)
  })

  it('treats a month of fee-free rides as no data, not as cheap rides', () => {
    // The pilot, or a flat-plan TODA: these rides say nothing about net.
    const b = breakEven({
      costLines: costs,
      report: [row('2026-10', { rides: 80, feeFreeRides: 80, grossFees: 0, greentechNet: 0 })],
      thisMonth: '2026-10',
    })
    expect(b.insufficientData).toBe(true)
    expect(b.ridesThisMonth).toBe(0)
  })

  it('does not divide by zero when the net per ride is zero', () => {
    const b = breakEven({
      costLines: costs,
      report: [row('2026-10', { greentechNet: 0 })],
      thisMonth: '2026-10',
    })
    expect(b.netPerRide).toBe(0)
    expect(b.ridesNeeded).toBeNull()
    expect(b.gap).toBeNull()
    // Not "insufficient data" — there were rides, they just netted nothing.
    expect(b.insufficientData).toBe(false)
  })

  it('reports no gap once the month is ahead of break-even', () => {
    const b = breakEven({
      costLines: [{ id: 'a', label: 'small', amount: 100 }],
      report: [row('2026-10')],
      thisMonth: '2026-10',
    })
    expect(b.ridesNeeded).toBe(40)
    expect(b.gap).toBe(0)
  })

  it('counts this month only, from a report that holds several', () => {
    const b = breakEven({
      costLines: costs,
      report: [row('2026-10', { rides: 20 }), row('2026-09', { rides: 500 })],
      thisMonth: '2026-10',
    })
    expect(b.ridesThisMonth).toBe(20)
  })
})

describe('breakEvenSheetRows', () => {
  it('lists each cost line, the total, and the derived figures', () => {
    const b = breakEven({ costLines: costs, report: [row('2026-10')], thisMonth: '2026-10' })
    const rows = breakEvenSheetRows(b, costs)
    expect(rows[0]).toEqual({ Item: 'Netlify', 'Amount (₱/month)': 1200 })
    expect(rows.find((r) => r.Item === 'TOTAL monthly cost')?.['Amount (₱/month)']).toBe(3500)
    expect(rows.find((r) => r.Item === 'Rides needed per month')?.['Amount (₱/month)']).toBe(1400)
  })

  it('writes the words rather than a misleading zero when there is no data', () => {
    const b = breakEven({ costLines: costs, report: [], thisMonth: '2026-10' })
    expect(breakEvenSheetRows(b, costs).find((r) => r.Item === 'Rides needed per month')?.['Amount (₱/month)']).toBe(
      'not enough data',
    )
  })
})
