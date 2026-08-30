import type { Ride, RideStatus } from '../types'

// A ride that has stopped. Nothing after this is a change of state — it is a
// record of one.
export function isFinishedRide(status: RideStatus): boolean {
  return status === 'completed' || status === 'cancelled'
}

// Reconciles the shared world arriving from another device with what this one
// already knows.
//
// Every client saves its whole copy of a ride, and the last write wins. That
// is fine while one device is ahead of another, and wrong in exactly one
// case: a device whose copy predates the ending. A passenger cancels; a
// second later the driver's phone — still ticking a simulated approach from
// its own stale copy — writes "driver arriving" back over it, and the
// cancellation is gone. The passenger presses Cancel again, and again, and
// the ride will not die, because whichever client is writing most often gets
// the last word.
//
// So an ending is one-way. Once this device has seen a ride completed or
// cancelled, no incoming copy may walk it back to a state it has left. The
// other direction still flows freely — a device that has not yet heard about
// an ending adopts it the moment it arrives, which is what lets the ticking
// client stop and the two agree.
//
// This is not a substitute for real conflict resolution, which would need
// versions on every row. It is the one rule that matters for a pilot: a trip
// that is over stays over.
// An account this device knows about is never dropped because the copy
// arriving from elsewhere has not heard of it yet.
//
// Accounts live inside one shared blob that every client writes whole, so
// two phones are in a race: one registers a passenger and saves; another,
// still holding the older list, saves a moment later and the new sign-up
// is gone. Someone who registered successfully then cannot log in, and
// there is no row left to recover.
//
// Keeping the union of both sides means the device that has the account
// writes it back on its next save instead of adopting its own erasure.
// The cost is that deleting an account no longer propagates from one
// device to another — during a pilot, losing a sign-up is much worse
// than keeping one too long.
//
// This is a stopgap. The real fix is a row per account, the way rides
// already work; see supabase/migrations/0003_accounts_own_rows.sql.
export function mergeById<T extends { id: string }>(local: T[], incoming: T[]): T[] {
  const merged = new Map(local.map((item) => [item.id, item]))
  // Incoming wins on conflict: it is the newer edit of a record both
  // sides already know. Only records missing from it are preserved.
  for (const item of incoming) merged.set(item.id, item)
  return [...merged.values()]
}

export function mergeIncomingRides(local: Ride[], incoming: Ride[]): Ride[] {
  const mine = new Map(local.map((r) => [r.id, r]))
  return incoming.map((theirs) => {
    const ours = mine.get(theirs.id)
    if (ours && isFinishedRide(ours.status) && !isFinishedRide(theirs.status)) return ours
    return theirs
  })
}
