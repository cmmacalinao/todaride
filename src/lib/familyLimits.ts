import { MINOR_DEFAULT_LIMITS } from '../types'
import type { FamilyMember, FamilyMemberLimits, Passenger } from '../types'

// What a family member's own account may do (2026-09-23).
//
// Only an account that joined a family by invite is limited, and only by the
// parent who owns that family. Everyone else — the parent, an ordinary
// passenger — gets the whole app, so this returns null for them.

export const MINOR_AGE = 18

export function familyMemberEntry(p: Passenger, passengers: Passenger[]): { owner: Passenger; member: FamilyMember } | null {
  if (!p.familyOwnerId) return null
  const owner = passengers.find((o) => o.id === p.familyOwnerId)
  const member = owner?.familyMembers?.find((m) => m.passengerId === p.id || m.name === p.name)
  return owner && member ? { owner, member } : null
}

export function familyLimitsFor(p: Passenger, passengers: Passenger[]): FamilyMemberLimits | null {
  const entry = familyMemberEntry(p, passengers)
  if (!entry) return null
  // Settings the parent actually chose always apply. Otherwise only a child
  // is narrowed down: an adult member — a senior, a spouse — keeps the whole
  // app, the same as any other passenger (2026-09-23).
  if (entry.member.limits) return entry.member.limits
  return p.age < MINOR_AGE ? MINOR_DEFAULT_LIMITS : null
}

// Curfew runs from the evening into the next morning (22:00 → 05:00), so the
// window wraps midnight: inside it when the time is after the start OR before
// the end. A window that does not wrap (say 13:00 → 15:00) is the plain case.
export function withinCurfew(limits: FamilyMemberLimits | null, now = new Date()): boolean {
  if (!limits?.curfew) return false
  const mins = now.getHours() * 60 + now.getMinutes()
  const toMins = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number)
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
  }
  const from = toMins(limits.curfewFrom)
  const to = toMins(limits.curfewTo)
  return from > to ? mins >= from || mins < to : mins >= from && mins < to
}
