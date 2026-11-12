// A pretend wallet, for showing the payment flow without money.
//
// The fare screen hands the passenger off to GCash and asks for the
// reference that comes back. Demonstrating that end to end otherwise needs
// two real GCash accounts and a real peso, which is a silly thing to need in
// order to show somebody a screen — so this stands in for the wallet: it
// takes the fare off an imaginary balance and prints a reference of the
// right shape, and the rest of the app cannot tell the difference.
//
// What it deliberately is NOT is an imitation of GCash. The sheet that uses
// this says SIMULATION across the top, carries none of GCash's branding, and
// never asks for a PIN — a convincing copy of somebody else's wallet asking
// for a PIN is a phishing page, whatever it was built for. This is a
// stand-in, and it looks like one.
//
// Off by default, and only an App Admin can turn it on (Super Admin →
// Simulated wallet payment), for the same reason the simulated OTP is: a
// pilot collecting real fares must never be quietly running on pretend ones.

// What the imaginary wallet starts with. Enough for a long demo, odd enough
// to read as a balance rather than a placeholder.
export const SIMULATED_OPENING_BALANCE = 1250

// GCash prints thirteen digits. Matching the length matters more than it
// sounds: the reference is typed into a box that rejects anything shorter
// than nine, and a stand-in that produced four would make the real
// validation look broken.
export const REFERENCE_DIGITS = 13

export function simulatedReference(random: () => number = Math.random): string {
  let out = String(1 + Math.floor(random() * 9))
  while (out.length < REFERENCE_DIGITS) out += String(Math.floor(random() * 10))
  return out
}

// 1029 383 827 362 — grouped the way a receipt shows it, because the whole
// point is that somebody reads it off one screen and types it into another.
export function groupReference(reference: string): string {
  const digits = reference.replace(/\D/g, '')
  if (digits.length !== REFERENCE_DIGITS) return reference
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 10)} ${digits.slice(10)}`
}

export function canAfford(balance: number, amount: number): boolean {
  return amount > 0 && balance >= amount
}

// Never below zero: a simulation that can go overdrawn is demonstrating
// something no wallet does.
export function balanceAfter(balance: number, amount: number): number {
  if (!canAfford(balance, amount)) return balance
  return Math.round((balance - amount) * 100) / 100
}

export function formatBalance(amount: number): string {
  return amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
