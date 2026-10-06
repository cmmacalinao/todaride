import type { BusinessPhase } from './businessPhase'
import { isPilot } from './businessPhase'

// How a TODA pays for the platform: by the ride, or by the month. Never both.
//
// Two honest models, and the point of making it a mode is that charging both
// at once is the dishonest one — a TODA on a monthly plan whose drivers also
// pay per ride is billed twice for the same service, and neither number on
// its statement is wrong on its own, which is exactly what makes it hard to
// notice.
//
//   per_ride   the drivers pay the platform fee on each completed ride, as
//              they do today, and the TODA is not billed a monthly plan or a
//              per-booking fee.
//
//   flat_plan  the TODA pays its monthly plan, and its drivers' rides carry
//              no platform fee at all.
//
// The second has a consequence worth stating out loud: with no fee on the
// ride there is nothing to split, so no partner commission, no TODA referral
// reward and no Rotary share are generated on those rides. That is not a bug
// to work around — those three are all shares *of the fee*, and a ride that
// carries no fee has nothing for them to be shares of. A flat-plan TODA is
// paying for the platform differently, and its drivers' recruiters are paid
// out of nothing.
//
// Business phase (lib/businessPhase) sits above all of this: during the pilot
// everything is ₱0 whatever the mode says.

export type TodaBillingMode = 'per_ride' | 'flat_plan'

export const DEFAULT_TODA_BILLING_MODE: TodaBillingMode = 'per_ride'

export const TODA_BILLING_MODE_LABEL: Record<TodaBillingMode, string> = {
  per_ride: 'Per ride — drivers pay the platform fee',
  flat_plan: 'Flat plan — the TODA pays monthly, rides are fee-free',
}

export function billingModeOf(mode: TodaBillingMode | undefined | null): TodaBillingMode {
  // Unset reads as per_ride, which is what every existing TODA is doing
  // today. An upgrade must not quietly move anybody onto a monthly plan.
  return mode ?? DEFAULT_TODA_BILLING_MODE
}

// The platform fee a ride actually carries, once the TODA's mode and the
// business phase have both had their say.
//
// Takes the fee the caller already worked out — terminal-QR waiver, fare cap
// — so this only ever reduces it.
export function platformFeeForRide(args: {
  baseFee: number
  mode: TodaBillingMode | undefined | null
  phase: BusinessPhase | undefined
}): number {
  if (isPilot(args.phase)) return 0
  if (billingModeOf(args.mode) === 'flat_plan') return 0
  return Math.max(0, args.baseFee)
}

// What this TODA owes per month. Zero on per_ride: its drivers are already
// paying by the ride, and billing the plan as well is the double charge this
// whole mode exists to prevent.
export function monthlyPlanDueForToda(args: {
  monthlyPlatformFee: number
  mode: TodaBillingMode | undefined | null
  phase: BusinessPhase | undefined
}): number {
  if (isPilot(args.phase)) return 0
  if (billingModeOf(args.mode) !== 'flat_plan') return 0
  return Math.max(0, args.monthlyPlatformFee)
}

// Same question for the per-booking fee a TODA's plan may carry.
export function perBookingDueForToda(args: {
  perBookingFee: number
  mode: TodaBillingMode | undefined | null
  phase: BusinessPhase | undefined
}): number {
  if (isPilot(args.phase)) return 0
  if (billingModeOf(args.mode) !== 'flat_plan') return 0
  return Math.max(0, args.perBookingFee)
}

// A plain statement of which way a TODA is charged, for a statement of
// account or an admin screen — so nobody has to infer it from two numbers
// that happen to be zero.
export function billingModeExplanation(mode: TodaBillingMode | undefined | null, phase: BusinessPhase | undefined): string {
  if (isPilot(phase)) return 'Pilot — nothing is billed, by either model.'
  return billingModeOf(mode) === 'flat_plan'
    ? 'Flat plan: this TODA pays its monthly plan. Its drivers pay no platform fee per ride, so those rides generate no partner, TODA-referral or Rotary share.'
    : 'Per ride: this TODA pays no monthly plan or per-booking fee. Its drivers pay the platform fee on each completed ride.'
}
