import type { Driver, RotaryShareSettings, TodaOrganization } from '../types'

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

// GreenTech's donation to the Rotary community project, taken from
// GreenTech's own portion of the fee rather than added on top: the passenger
// pays no more, the driver keeps the same, and the partner and TODA are
// settled first. Paid on every ride that carries a fee, referred or not —
// that is what makes it a standing commitment rather than a side effect of
// recruitment.
export const ROTARY_SHARE_PER_RIDE = 0.5

// On by default: the donation is the standing arrangement, not an opt-in.
export const DEFAULT_ROTARY_SHARE_SETTINGS: RotaryShareSettings = {
  enabled: true,
  perRide: ROTARY_SHARE_PER_RIDE,
  recipientLabel: 'Rotary Club of San Jose Golden Harvest – Community Project',
}

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
  // GreenTech's donation out of its own share. Unlike the two above it does
  // not depend on a referral.
  rotaryShare: number
  // Whatever is left of the fee once everyone else is paid.
  greentechNet: number
}

const NOTHING: MarketingSplit = {
  partnerDriverId: null,
  partnerCommission: 0,
  todaReferralOrgId: null,
  todaReferralReward: 0,
  rotaryShare: 0,
  greentechNet: 0,
}

// What a completed ride pays out of the platform fee it carried.
//
// Four claims on one fee, settled in this order: the partner who recruited
// the driver, the recruit's TODA, the Rotary project, and GreenTech takes
// what is left. The order is the priority when the fee cannot cover
// everything — a ride whose fee was waived pays nobody, and a fee under ₱1
// pays the partner first.
//
// The first two depend on a referral; the Rotary share does not. That is the
// whole point of it: a donation promised on every ride is a commitment, one
// promised only on recruited rides is a by-product of recruiting. So the
// referral checks below decide the first two shares and nothing else, and an
// unreferred ride still carries its ₱0.50.
//
// Nothing here is ever recomputed. The result is written onto the payment at
// completion (see RideContext), so changing the Rotary amount tomorrow does
// not rewrite what was donated yesterday.
export function marketingSplit(args: {
  recruit: Driver | null | undefined
  drivers: Driver[]
  orgs: TodaOrganization[]
  platformFee: number
  at?: number
  // Super Admin's switch and amount. Defaulted so every existing caller — and
  // every test written before this existed — keeps the standing commitment.
  rotaryEnabled?: boolean
  rotaryPerRide?: number
}): MarketingSplit {
  const { recruit, drivers, orgs, platformFee } = args
  const fee = Math.max(0, platformFee)
  if (fee <= 0) return NOTHING

  let partnerDriverId: string | null = null
  let partnerCommission = 0
  let todaReferralOrgId: string | null = null
  let todaReferralReward = 0

  // Unchanged: who earns on a recruit's ride, and for how long.
  if (recruit && referralActive(recruit, args.at)) {
    const partner = drivers.find((d) => d.id === recruit.referredByDriverId)
    if (partner && partner.id !== recruit.id) {
      partnerDriverId = partner.id
      partnerCommission = Math.min(PARTNER_COMMISSION_PER_RIDE, fee)
      const org = recruit.todaOrgId ? orgs.find((o) => o.id === recruit.todaOrgId) : null
      if (todaQualifiesForReward(org, drivers)) {
        todaReferralReward = Math.min(
          TODA_REFERRAL_REWARD_PER_RIDE,
          Math.max(0, fee - partnerCommission),
        )
        todaReferralOrgId = todaReferralReward > 0 ? org!.id : null
      }
    }
  }

  const afterReferral = Math.max(0, fee - partnerCommission - todaReferralReward)
  const rotaryEnabled = args.rotaryEnabled ?? true
  const rotaryPerRide = args.rotaryPerRide ?? ROTARY_SHARE_PER_RIDE
  const rotaryShare = rotaryEnabled ? Math.min(Math.max(0, rotaryPerRide), afterReferral) : 0

  return {
    partnerDriverId,
    partnerCommission: round2(partnerCommission),
    todaReferralOrgId,
    todaReferralReward: round2(todaReferralReward),
    rotaryShare: round2(rotaryShare),
    greentechNet: round2(Math.max(0, afterReferral - rotaryShare)),
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function formatPeso(n: number): string {
  return `₱${n.toFixed(2)}`
}
