import type { AccountKind, AccountSuspension } from '../types'

// A suspension counts as active only while it has not been lifted by hand and
// has not run out its own clock. Both are checked here rather than in a
// reducer because "has it lapsed?" depends on the current time, and state
// written once at suspend-time would go stale without anything dispatching.
export function activeSuspension(
  suspensions: AccountSuspension[],
  kind: AccountKind,
  accountId: string,
): AccountSuspension | null {
  const now = Date.now()
  return (
    suspensions.find(
      (s) =>
        s.kind === kind &&
        s.accountId === accountId &&
        s.liftedAt === null &&
        (s.endsAt === null || new Date(s.endsAt).getTime() > now),
    ) ?? null
  )
}

export function suspensionDaysLeft(suspension: AccountSuspension): number | null {
  if (!suspension.endsAt) return null
  const ms = new Date(suspension.endsAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / 86400000))
}

export function suspensionSummary(suspension: AccountSuspension): string {
  const left = suspensionDaysLeft(suspension)
  if (left === null) return 'Suspended indefinitely'
  return left <= 1 ? 'Suspended — ends today' : `Suspended — ${left} day(s) left`
}

// Preset lengths an operator actually reaches for. 0 is "indefinite" and is
// deliberately last: an unbounded suspension should take a conscious extra
// press, not be the neighbour of the shortest option.
export const SUSPENSION_DAY_PRESETS: { days: number; label: string }[] = [
  { days: 1, label: '1 day' },
  { days: 3, label: '3 days' },
  { days: 7, label: '7 days' },
  { days: 15, label: '15 days' },
  { days: 30, label: '30 days' },
  { days: 0, label: 'Indefinite' },
]
