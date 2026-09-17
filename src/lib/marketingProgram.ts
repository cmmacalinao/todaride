import type { Driver, TodaOrganization } from '../types'

// Driver Marketing Promotion Program.
//
// A driver joins as a marketing partner and gets a referral code. A new
// driver who signs up with that code is their recruit. For a year from the
// recruit's sign-up, every ride the recruit completes pays, out of the
// platform fee already collected on that ride:
//   - ₱0.70 to the partner who recruited them, and
//   - ₱0.30 to the recruit's TODA — only while that TODA has every member
//     registered (its registered drivers reach the official member count
//     Admin set for it).
// The recruit's own pay and the passenger's fare are untouched.
export const PARTNER_COMMISSION_PER_RIDE = 0.7
export const TODA_REFERRAL_REWARD_PER_RIDE = 0.3
export const REFERRAL_WINDOW_DAYS = 365

const DAY_MS = 24 * 60 * 60 * 1000

// Unambiguous characters only — no 0/O or 1/I — so a code read aloud at a
// terminal or copied off a phone screen is typed right the first time.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generatePartnerCode(existingCodes: Iterable<string>, random: () => number = Math.random): string {
  const taken = new Set([...existingCodes].map((c) => c.toUpperCase()))
  for (;;) {
    let code = 'TR-'
    for (let i = 0; i < 5; i += 1) code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]
    if (!taken.has(code)) return code
  }
}

export function normalizeReferralCode(code: string | null | undefined): string {
  return (code ?? '').trim().toUpperCase()
}

export function findPartnerByCode(drivers: Driver[], code: string | null | undefined): Driver | null {
  const wanted = normalizeReferralCode(code)
  if (!wanted) return null
  return drivers.find((d) => normalizeReferralCode(d.partnerCode) === wanted) ?? null
}

// Whether rides by this recruit still earn for their partner.
export function referralActive(recruit: Driver, at: number = Date.now()): boolean {
  if (!recruit.referredByDriverId || !recruit.referredAt) return false
  return at - new Date(recruit.referredAt).getTime() <= REFERRAL_WINDOW_DAYS * DAY_MS
}

export function referralEndsAt(recruit: Driver): string | null {
  if (!recruit.referredAt) return null
  return new Date(new Date(recruit.referredAt).getTime() + REFERRAL_WINDOW_DAYS * DAY_MS).toISOString()
}

// Registered members count toward the official total once Admin has approved
// them — a pending sign-up is not yet a member who is in the app.
export function registeredMemberCount(orgId: string, drivers: Driver[]): number {
  return drivers.filter((d) => d.todaOrgId === orgId && d.verificationStatus === 'approved').length
}

export function todaQualifiesForReward(org: TodaOrganization | null | undefined, drivers: Driver[]): boolean {
  const official = org?.officialMemberCount ?? 0
  if (!org || official <= 0) return false
  return registeredMemberCount(org.id, drivers) >= official
}

export interface MarketingSplit {
  partnerDriverId: string | null
  partnerCommission: number
  todaReferralOrgId: string | null
  todaReferralReward: number
}

const NONE: MarketingSplit = { partnerDriverId: null, partnerCommission: 0, todaReferralOrgId: null, todaReferralReward: 0 }

// What a completed ride pays out under the program. Never more than the
// platform fee the ride actually carried: a ride with its fee waived pays
// nothing, and a fee under ₱1 pays the partner first.
export function marketingSplit(args: {
  recruit: Driver | null | undefined
  drivers: Driver[]
  orgs: TodaOrganization[]
  platformFee: number
  at?: number
}): MarketingSplit {
  const { recruit, drivers, orgs, platformFee } = args
  if (!recruit || platformFee <= 0 || !referralActive(recruit, args.at)) return NONE
  const partner = drivers.find((d) => d.id === recruit.referredByDriverId)
  if (!partner || partner.id === recruit.id) return NONE
  const partnerCommission = Math.min(PARTNER_COMMISSION_PER_RIDE, platformFee)
  const org = recruit.todaOrgId ? orgs.find((o) => o.id === recruit.todaOrgId) : null
  const todaReferralReward = todaQualifiesForReward(org, drivers)
    ? Math.min(TODA_REFERRAL_REWARD_PER_RIDE, Math.max(0, platformFee - partnerCommission))
    : 0
  return {
    partnerDriverId: partner.id,
    partnerCommission: round2(partnerCommission),
    todaReferralOrgId: todaReferralReward > 0 ? org!.id : null,
    todaReferralReward: round2(todaReferralReward),
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function formatPeso(n: number): string {
  return `₱${n.toFixed(2)}`
}
