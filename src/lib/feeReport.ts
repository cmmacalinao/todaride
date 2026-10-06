import type { Ride } from '../types'

// Where every platform fee went, by month.
//
// One fee is divided four ways at completion (see marketingProgram), and the
// figures are written onto the payment there rather than recomputed here.
// That is deliberate: this report must keep saying what a ride actually paid
// even after Super Admin changes the Rotary amount or a TODA's registration
// slips, so it reads the recorded numbers and never re-derives them.
//
// Rides with no fee — terminal QR, safetyRecord, and the whole pilot while
// Admin has the fee at ₱0 — carry no payment shares and so contribute
// nothing but a ride count.

export interface FeeReportRow {
  // 'YYYY-MM', sortable as a string and unambiguous across locales.
  month: string
  rides: number
  // A ride counts as referred when a partner was recorded on it, whether or
  // not the fee stretched far enough to pay them in full.
  referredRides: number
  unreferredRides: number
  grossFees: number
  partnerPayouts: number
  todaRewards: number
  rotaryShare: number
  greentechNet: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function monthOf(iso: string): string {
  // Sliced rather than parsed: a Date would drag the viewer's timezone into
  // which month a late-night ride belongs to, and the fee was earned where
  // the ride happened.
  return iso.slice(0, 7)
}

export function monthlyFeeReport(rides: Ride[]): FeeReportRow[] {
  const byMonth = new Map<string, FeeReportRow>()
  for (const ride of rides) {
    if (ride.status !== 'completed') continue
    const paidAt = ride.payment?.paidAt ?? ride.completedAt ?? ride.requestedAt
    if (!paidAt) continue
    const month = monthOf(paidAt)
    const row =
      byMonth.get(month) ??
      {
        month,
        rides: 0,
        referredRides: 0,
        unreferredRides: 0,
        grossFees: 0,
        partnerPayouts: 0,
        todaRewards: 0,
        rotaryShare: 0,
        greentechNet: 0,
      }
    const p = ride.payment
    row.rides += 1
    if (p?.partnerDriverId) row.referredRides += 1
    else row.unreferredRides += 1
    row.grossFees += p?.platformFee ?? 0
    row.partnerPayouts += p?.partnerCommission ?? 0
    row.todaRewards += p?.todaReferralReward ?? 0
    row.rotaryShare += p?.rotaryShare ?? 0
    row.greentechNet += p?.greentechNet ?? 0
    byMonth.set(month, row)
  }
  return [...byMonth.values()]
    .map((r) => ({
      ...r,
      grossFees: round2(r.grossFees),
      partnerPayouts: round2(r.partnerPayouts),
      todaRewards: round2(r.todaRewards),
      rotaryShare: round2(r.rotaryShare),
      greentechNet: round2(r.greentechNet),
    }))
    // Newest first: the month anybody is asking about is almost always the
    // one just finished.
    .sort((a, b) => b.month.localeCompare(a.month))
}

// Column order for the spreadsheet, so the export reads left to right the way
// the money moves: what came in, who it went to, what was left.
export const FEE_REPORT_COLUMNS = [
  'Month',
  'Rides',
  'Referred rides',
  'Unreferred rides',
  'Gross platform fees',
  'Partner payouts',
  'TODA rewards',
  'Rotary share',
  'GreenTech net',
] as const

export function feeReportSheetRows(rows: FeeReportRow[]): Record<string, string | number>[] {
  return rows.map((r) => ({
    Month: r.month,
    Rides: r.rides,
    'Referred rides': r.referredRides,
    'Unreferred rides': r.unreferredRides,
    'Gross platform fees': r.grossFees,
    'Partner payouts': r.partnerPayouts,
    'TODA rewards': r.todaRewards,
    'Rotary share': r.rotaryShare,
    'GreenTech net': r.greentechNet,
  }))
}
