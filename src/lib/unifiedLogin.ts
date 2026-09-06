import {
  APP_ADMIN_CREDENTIALS,
  APP_SUPER_ADMIN_CREDENTIALS,
  APP_SUPER_ADMIN_EMAIL,
  APP_SUPER_ADMIN_NAME,
  MOCK_DRIVERS,
  MOCK_FRANCHISES,
  MOCK_OPERATORS,
  MOCK_PARENTS,
  MOCK_PASSENGERS,
  MOCK_PHARMACIES,
  MOCK_TODA_ORGANIZATIONS,
} from '../mock/data'
import type { AuthedAccountRole } from '../context/SessionContext'
import { matchesNameExact, matchesNameQuery } from './fuzzyName'

// A person-shaped account (passenger, parent, driver): logs in with their own
// name/email/mobile plus a 4-digit PIN.
interface PersonAccount {
  id: string
  name: string
  phone: string
  email: string | null
  pin: string | null
  // Drivers only. A driver knows their TRC/plate number better than the exact
  // spelling of their own registered name, so it is a first-class way in.
  plateNumber?: string
}

// An organisation-shaped account (TODA, pharmacy/vendor, operator, franchise):
// logs in with the business name plus the officer PIN, and can't get in at all
// until App Admin has approved it.
interface OrgAccount {
  id: string
  name: string
  adminPin: string
  verificationStatus: 'unregistered' | 'pending' | 'approved' | 'rejected'
  contactPhone?: string | null
  email?: string | null
}

export interface UnifiedDirectories {
  passengers: PersonAccount[]
  parents: PersonAccount[]
  drivers: PersonAccount[]
  todaOrganizations: OrgAccount[]
  pharmacies: OrgAccount[]
  operators: OrgAccount[]
  franchises: OrgAccount[]
}

export interface MatchedAccount {
  role: AuthedAccountRole
  id: string
  name: string
}

export type UnifiedLoginOutcome =
  // Credentials check out. `needsOtp` is true only for App Admin — that gate
  // predates this form and deliberately keeps its second factor.
  | { status: 'ok'; account: MatchedAccount; needsOtp: boolean }
  // Right name and PIN, but App Admin hasn't approved the org yet. Worth its
  // own message: retyping the password will never fix it.
  | { status: 'pending'; name: string }
  | { status: 'rejected'; name: string }
  // One generic failure for "no such user" and "wrong password" alike, so the
  // form can't be used to discover which names have accounts.
  | { status: 'invalid' }

// Phones and plates get typed with whatever punctuation is to hand —
// "0917-200-2001", "0917 200 2001", "TRC-1023", "trc1023". Comparing the
// stripped forms means the separators stop deciding whether someone can log
// in to their own account.
// The demo identities this prototype ships with. They keep the old
// forgiving name match so a walkthrough still works when someone types
// "celeste" instead of "Celeste M." — every account created since has to be
// typed in full. Built from the seed arrays rather than a hand-kept list, so
// adding a seed account cannot silently miss this.
const SEED_ACCOUNT_IDS: ReadonlySet<string> = new Set<string>([
  ...MOCK_PASSENGERS.map((a) => a.id),
  ...MOCK_PARENTS.map((a) => a.id),
  ...MOCK_DRIVERS.map((a) => a.id),
  ...MOCK_TODA_ORGANIZATIONS.map((a) => a.id),
  ...MOCK_PHARMACIES.map((a) => a.id),
  ...MOCK_OPERATORS.map((a) => a.id),
  ...MOCK_FRANCHISES.map((a) => a.id),
])

export function isSeedAccountId(id: string): boolean {
  return SEED_ACCOUNT_IDS.has(id)
}

function bare(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function identifierMatchesPerson(
  account: PersonAccount,
  identifier: string,
  // Recovery says yes (you may misremember your own spelling); login says no
  // unless this is one of the prototype's seed identities.
  fuzzyName = true,
): boolean {
  const needle = identifier.trim()
  if (!needle) return false
  const lower = needle.toLowerCase()
  const needleBare = bare(needle)
  const nameMatches = fuzzyName || isSeedAccountId(account.id)
  return (
    (!!account.email && account.email.trim().toLowerCase() === lower) ||
    (!!needleBare && bare(account.phone) === needleBare) ||
    (!!account.plateNumber && !!needleBare && bare(account.plateNumber) === needleBare) ||
    (nameMatches ? matchesNameQuery(account.name, needle) : matchesNameExact(account.name, needle))
  )
}

function identifierMatchesOrg(account: OrgAccount, identifier: string, fuzzyName = true): boolean {
  const needle = identifier.trim()
  if (!needle) return false
  const lower = needle.toLowerCase()
  const needleBare = bare(needle)
  const nameMatches = fuzzyName || isSeedAccountId(account.id)
  return (
    (!!account.email && account.email.trim().toLowerCase() === lower) ||
    (!!account.contactPhone && !!needleBare && bare(account.contactPhone) === needleBare) ||
    (nameMatches ? matchesNameQuery(account.name, needle) : matchesNameExact(account.name, needle))
  )
}

function findPerson(
  accounts: PersonAccount[],
  role: AuthedAccountRole,
  identifier: string,
  secret: string,
): MatchedAccount | null {
  const match = accounts.find(
    (a) => identifierMatchesPerson(a, identifier, false) && !!a.pin && a.pin === secret,
  )
  return match ? { role, id: match.id, name: match.name } : null
}

function findOrg(
  accounts: OrgAccount[],
  role: AuthedAccountRole,
  identifier: string,
  secret: string,
): { account: MatchedAccount; status: OrgAccount['verificationStatus'] } | null {
  const match = accounts.find((a) => identifierMatchesOrg(a, identifier, false) && a.adminPin === secret)
  return match
    ? { account: { role, id: match.id, name: match.name }, status: match.verificationStatus }
    : null
}

// One front-door login for every kind of account in the app: whoever you are,
// you type your name (or email/mobile) and your PIN, and this works out which
// directory you belong to. The per-role forms behind /book, /drive, /admin and
// the partner portals still exist untouched — this is an additional entry
// point, not a replacement, so nothing that already worked stops working.
//
// Order matters only for the vanishingly unlikely case of one identifier+secret
// pair matching two directories; App Admin is checked first because it's an
// exact username match rather than a fuzzy name one.
export function resolveUnifiedLogin(
  directories: UnifiedDirectories,
  identifier: string,
  secret: string,
): UnifiedLoginOutcome {
  const typed = identifier.trim()
  if (!typed || !secret.trim()) return { status: 'invalid' }

  const typedLower = typed.toLowerCase()

  // Super Admin is checked first and matched on its own password. The
  // Founder's email and name reach this tier; the generic 'admin' username
  // never does, however it is spelled.
  const isSuperAdminIdentity =
    typedLower === APP_SUPER_ADMIN_CREDENTIALS.username.toLowerCase() ||
    typedLower === APP_SUPER_ADMIN_EMAIL.toLowerCase() ||
    matchesNameQuery(APP_SUPER_ADMIN_NAME, typed)
  if (isSuperAdminIdentity && secret === APP_SUPER_ADMIN_CREDENTIALS.password) {
    return {
      status: 'ok',
      account: { role: 'super_admin', id: 'super-admin', name: APP_SUPER_ADMIN_NAME },
      needsOtp: true,
    }
  }

  const isAdminIdentity = typedLower === APP_ADMIN_CREDENTIALS.username.toLowerCase()
  if (isAdminIdentity && secret === APP_ADMIN_CREDENTIALS.password) {
    return { status: 'ok', account: { role: 'admin', id: 'admin', name: 'Admin' }, needsOtp: true }
  }

  const person =
    findPerson(directories.passengers, 'passenger', typed, secret) ??
    findPerson(directories.parents, 'parent', typed, secret) ??
    findPerson(directories.drivers, 'driver', typed, secret)
  if (person) return { status: 'ok', account: person, needsOtp: false }

  const org =
    findOrg(directories.todaOrganizations, 'toda_admin', typed, secret) ??
    findOrg(directories.pharmacies, 'pharmacy', typed, secret) ??
    findOrg(directories.operators, 'operator_admin', typed, secret) ??
    findOrg(directories.franchises, 'franchise_admin', typed, secret)
  if (org) {
    // A TODA that only exists because a driver named it at signup has no PIN
    // and no officers yet, so there is no account here to let anyone into.
    if (org.status === 'unregistered') return { status: 'invalid' }
    if (org.status === 'pending') return { status: 'pending', name: org.account.name }
    if (org.status === 'rejected') return { status: 'rejected', name: org.account.name }
    return { status: 'ok', account: org.account, needsOtp: false }
  }

  return { status: 'invalid' }
}

export type RecoveryKind = 'passenger' | 'parent' | 'driver' | 'toda' | 'pharmacy' | 'operator' | 'franchise'

export interface RecoveryMatch {
  kind: RecoveryKind
  id: string
  name: string
  phone: string
}

// Deliberately identifier-only: this is the "forgot password" path, so it
// cannot ask for the secret it is about to replace. The one-time code sent to
// the account's own number is what proves ownership.
export function findAccountForRecovery(
  directories: UnifiedDirectories,
  identifier: string,
): RecoveryMatch[] {
  const typed = identifier.trim()
  if (!typed) return []
  const people: [RecoveryKind, PersonAccount[]][] = [
    ['passenger', directories.passengers],
    ['parent', directories.parents],
    ['driver', directories.drivers],
  ]
  const orgs: [RecoveryKind, OrgAccount[]][] = [
    ['toda', directories.todaOrganizations],
    ['pharmacy', directories.pharmacies],
    ['operator', directories.operators],
    ['franchise', directories.franchises],
  ]
  const out: RecoveryMatch[] = []
  for (const [kind, list] of people) {
    for (const a of list) {
      if (identifierMatchesPerson(a, typed)) out.push({ kind, id: a.id, name: a.name, phone: a.phone })
    }
  }
  for (const [kind, list] of orgs) {
    for (const a of list) {
      if (identifierMatchesOrg(a, typed) && a.contactPhone) {
        out.push({ kind, id: a.id, name: a.name, phone: a.contactPhone })
      }
    }
  }
  return out
}

// Where each role belongs once it's through the door. Without this, App.tsx's
// role redirects would still land riders and drivers correctly, but App Admin
// would be left sitting on the landing page.
export const HOME_PATH_BY_ROLE: Record<AuthedAccountRole, string> = {
  super_admin: '/admin/super',
  // Not straight to /book: a rider picks Book a Ride vs. Record mo ang
  // Biyahe on /book/start first (see RiderStartPage) — landing on the
  // booking form itself skipped that choice on every login.
  passenger: '/book/start',
  parent: '/book/start',
  driver: '/drive',
  toda_admin: '/drive',
  admin: '/admin',
  pharmacy: '/pharmacy',
  operator_admin: '/operator',
  franchise_admin: '/franchise',
}
