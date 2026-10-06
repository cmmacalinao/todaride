// Which business the app is running today.
//
// During the pilot nobody is charged: the platform fee is ₱0, TODAs and
// Operators are not billed their monthly plans or per-booking fees, vendors
// pay nothing per order, and no ads are shown. At launch the same app starts
// charging what Admin has configured.
//
// The whole point of doing this as a phase rather than by zeroing the
// settings is that the settings survive. A pilot that works by setting every
// price to zero loses the prices, and whoever turns the business on later has
// to remember what they were. Here the saved values sit untouched and the
// phase decides whether they apply — so switching to launch is one control,
// and switching back to pilot cannot destroy anything.
//
// Everything below therefore takes the saved value and returns the effective
// one. Nothing here writes.

export type BusinessPhase = 'pilot' | 'launch'

export const DEFAULT_BUSINESS_PHASE: BusinessPhase = 'pilot'

export const BUSINESS_PHASE_LABEL: Record<BusinessPhase, string> = {
  pilot: 'Pilot — nobody is charged',
  launch: 'Launch — fees are live',
}

export function isPilot(phase: BusinessPhase | undefined | null): boolean {
  // Unset reads as pilot: an older install that has never seen this setting
  // must not start charging people because it upgraded.
  return (phase ?? DEFAULT_BUSINESS_PHASE) === 'pilot'
}

// The platform fee a ride actually carries.
//
// Takes the fee the caller already worked out — the terminal-QR waiver and
// the fare cap are applied before this — and zeroes it during the pilot.
export function effectivePlatformFee(savedFee: number, phase: BusinessPhase | undefined): number {
  return isPilot(phase) ? 0 : Math.max(0, savedFee)
}

// A monthly plan fee owed by a TODA, Operator or vendor.
export function effectiveMonthlyFee(savedFee: number, phase: BusinessPhase | undefined): number {
  return isPilot(phase) ? 0 : Math.max(0, savedFee)
}

// A per-booking or per-order fee owed by a TODA, Operator or vendor.
export function effectivePerBookingFee(savedFee: number, phase: BusinessPhase | undefined): number {
  return isPilot(phase) ? 0 : Math.max(0, savedFee)
}

// Whether Google AdSense may render at all.
//
// Two conditions, not one: Admin has switched ads on, and the business is
// live. A pilot passenger is doing somebody a favour by testing; showing them
// advertising is a poor way to say thank you, and an empty ad slot on a
// screen nobody is paying for is just clutter.
export function adSenseAllowed(adSenseEnabled: boolean, phase: BusinessPhase | undefined): boolean {
  return adSenseEnabled && !isPilot(phase)
}

// What the activity log records when somebody moves the business between
// phases. Written at the moment of the change, because "who turned the fees
// on, and when" is the kind of question that gets asked months later.
export function businessPhaseLogSummary(from: BusinessPhase, to: BusinessPhase): string {
  if (from === to) return `Business phase re-confirmed as ${to}`
  return to === 'launch'
    ? 'Business phase set to LAUNCH — platform fees, plans and vendor fees are now billed'
    : 'Business phase set to PILOT — all fees suspended; saved prices kept'
}
