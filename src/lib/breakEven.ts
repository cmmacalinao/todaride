import type { FeeReportRow } from './feeReport'

// What it costs to run this each month, and how many rides pay for it.
//
// The question a pilot has to answer before it becomes a business: at ₱0.50
// of a ₱3 fee going to Rotary and ₱1.00 of it to the partner and the TODA,
// GreenTech keeps somewhere between ₱1.50 and ₱2.50 a ride — so a ₱9,000
// month needs somewhere between three and six thousand rides. Guessing that
// number is easy and wrong; this derives it from what the rides actually
// paid.
//
// Net per ride is measured, not assumed, because the mix moves it: a month of
// mostly unreferred rides nets ₱2.50 each, a month of mostly referred ones
// ₱1.50, and the break-even count changes by two thirds between them.

export interface OperatingCostLine {
  id: string
  label: string
  // Pesos per month.
  amount: number
}

export interface BreakEven {
  monthlyCost: number
  // Average GreenTech net across the fee-paying rides in the window. Null
  // when there were none — a number derived from zero rides is not an
  // estimate, it is an invention.
  netPerRide: number | null
  // Rides needed per month to cover the cost. Null for the same reason.
  ridesNeeded: number | null
  // Fee-paying rides actually completed this month.
  ridesThisMonth: number
  // How many short, or null when there is nothing to compare against.
  gap: number | null
  // True when there is not enough history to say anything honest.
  insufficientData: boolean
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function totalMonthlyCost(lines: OperatingCostLine[]): number {
  return round2(lines.reduce((sum, l) => sum + (Number.isFinite(l.amount) ? Math.max(0, l.amount) : 0), 0))
}

// Rows are the monthly fee report (newest first). `window` is how many recent
// months to average the net over — one by default, which is "the last 30
// days" in the only unit the report actually has.
export function breakEven(args: {
  costLines: OperatingCostLine[]
  report: FeeReportRow[]
  thisMonth: string
  windowMonths?: number
}): BreakEven {
  const { costLines, report, thisMonth } = args
  const windowMonths = Math.max(1, args.windowMonths ?? 1)
  const monthlyCost = totalMonthlyCost(costLines)

  // Only rides that carried a fee tell us anything about net per ride. A
  // fee-free ride is not a cheap ride, it is a ride outside this question.
  const window = report.slice(0, windowMonths)
  const payingRides = window.reduce((sum, r) => sum + Math.max(0, r.rides - r.feeFreeRides), 0)
  const net = window.reduce((sum, r) => sum + r.greentechNet, 0)

  const current = report.find((r) => r.month === thisMonth)
  const ridesThisMonth = current ? Math.max(0, current.rides - current.feeFreeRides) : 0

  if (payingRides === 0) {
    return {
      monthlyCost,
      netPerRide: null,
      ridesNeeded: null,
      ridesThisMonth,
      gap: null,
      insufficientData: true,
    }
  }

  const netPerRide = round2(net / payingRides)
  // A net of zero per ride means no number of rides ever covers the cost.
  // Saying "not enough data" is wrong there, but so is dividing by zero.
  const ridesNeeded = netPerRide > 0 ? Math.ceil(monthlyCost / netPerRide) : null
  return {
    monthlyCost,
    netPerRide,
    ridesNeeded,
    ridesThisMonth,
    gap: ridesNeeded === null ? null : Math.max(0, ridesNeeded - ridesThisMonth),
    insufficientData: false,
  }
}

export function breakEvenSheetRows(b: BreakEven, lines: OperatingCostLine[]): Record<string, string | number>[] {
  return [
    ...lines.map((l) => ({ Item: l.label, 'Amount (₱/month)': Math.max(0, l.amount) })),
    { Item: 'TOTAL monthly cost', 'Amount (₱/month)': b.monthlyCost },
    { Item: 'GreenTech net per fee-paying ride', 'Amount (₱/month)': b.netPerRide ?? 'not enough data' },
    { Item: 'Rides needed per month', 'Amount (₱/month)': b.ridesNeeded ?? 'not enough data' },
    { Item: 'Fee-paying rides this month', 'Amount (₱/month)': b.ridesThisMonth },
    { Item: 'Short by', 'Amount (₱/month)': b.gap ?? 'not enough data' },
  ]
}
