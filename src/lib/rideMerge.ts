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
export function mergeIncomingRides(local: Ride[], incoming: Ride[]): Ride[] {
  const mine = new Map(local.map((r) => [r.id, r]))
  return incoming.map((theirs) => {
    const ours = mine.get(theirs.id)
    if (ours && isFinishedRide(ours.status) && !isFinishedRide(theirs.status)) return ours
    return theirs
  })
}
