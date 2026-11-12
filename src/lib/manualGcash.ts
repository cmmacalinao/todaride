import type { PaymentAccountDetails } from '../types'

// Paying a fare by GCash without a payment processor.
//
// There is no API here and nothing in this file can move money. The passenger
// opens their own GCash app, sends the fare to the pilot's account, and types
// the reference number off their own receipt — the app records that, and a
// person checks it against the account's own history. That is the whole
// mechanism, and it is worth being plain about: a reference typed by the payer
// is a claim, not a confirmation.
//
// It is still worth having during the pilot, because the alternative is cash
// only. A GCash business account and an API come later (PayMongo or Maya);
// when they do, lib/mayaApi is the path that replaces this one, and the
// passenger stops being asked to copy numbers.

// Every separator a Philippine mobile number gets written with.
export function normaliseGcashNumber(text: string): string {
  return text.replace(/\D/g, '')
}

// 09XXXXXXXXX — eleven digits starting 09, which is every mobile number in
// the country and so every GCash account.
export function isGcashNumber(text: string): boolean {
  const digits = normaliseGcashNumber(text)
  return digits.length === 11 && digits.startsWith('09')
}

// 0917 800 2020 — grouped the way GCash itself prints it, so somebody
// checking the number against their phone screen can do it at a glance.
// Anything that is not a mobile number is handed back untouched rather than
// mangled into groups of three.
export function formatGcashNumber(text: string): string {
  const digits = normaliseGcashNumber(text)
  if (!isGcashNumber(digits)) return text.trim()
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
}

// Whether there is enough here to ask somebody to send money to it. A blank
// or half-filled account must never be shown as a payment target: the
// passenger would send the fare into nowhere and still believe they had paid.
export function isGcashAccountReady(account: PaymentAccountDetails | null | undefined): boolean {
  return !!account && account.accountName.trim().length > 0 && isGcashNumber(account.accountNumber)
}

// The number the app ships with as an example. Real money sent to it goes to
// a stranger, so every screen that can show it says so.
export const SAMPLE_GCASH_NUMBER = '09178002020'

export function isSampleGcashAccount(account: PaymentAccountDetails | null | undefined): boolean {
  return !!account && normaliseGcashNumber(account.accountNumber) === SAMPLE_GCASH_NUMBER
}

// GCash's own send deep link, with the recipient and the amount already in
// it, so the fare cannot be sent to a number somebody mistyped off a screen.
// Resolves only on a phone with GCash installed — hence the printed number
// and the QR next to it, which are what a desktop or a missing app falls
// back to.
export function gcashSendLink(account: PaymentAccountDetails | null | undefined, amount: number): string | null {
  if (!isGcashAccountReady(account) || !Number.isFinite(amount) || amount <= 0) return null
  const recipient = normaliseGcashNumber(account!.accountNumber)
  return `gcash://send?recipient=${encodeURIComponent(recipient)}&amount=${amount}`
}

// What the payer types back. GCash prints a thirteen-digit reference, often
// in groups, and people copy it with spaces, dashes or an "Ref." prefix —
// all of which are thrown away here. Deliberately lenient: this is matched by
// a human against a wallet history, and rejecting a real receipt because it
// was written with a dash would be the app being wrong about its own data.
export function normaliseReference(text: string): string {
  return text.replace(/\D/g, '')
}

// Short enough to be a typo rather than a reference. Nine digits is below
// every GCash reference and above every accidental keypress, and is the point
// at which recording it is worse than asking again.
export const MIN_REFERENCE_DIGITS = 9

export function isPlausibleGcashReference(text: string): boolean {
  const digits = normaliseReference(text)
  return digits.length >= MIN_REFERENCE_DIGITS && digits.length <= 24
}

// Whether fares may actually be collected into this account.
//
// Being a well-formed number is not enough: the sample number the app ships
// with is well formed and belongs to somebody else, so a pilot that forgot to
// change it would quietly send strangers real money. The fare screen offers
// GCash only when this is true, and Super Admin says so in the one place
// where it can be fixed.
export function canCollectGcash(account: PaymentAccountDetails | null | undefined): boolean {
  return isGcashAccountReady(account) && !isSampleGcashAccount(account)
}
