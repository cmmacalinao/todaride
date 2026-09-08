import { MAX_VENDOR_POSTS, type Pharmacy, type Ride, type RideStatus, type VendorPost, type VendorPostComment } from '../types'

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

// A store's feed, reconciled the same way accounts are: the union of both
// sides by post id. Every client writes the whole blob, so a post made in
// the seconds before this device's first shared read landed — or on a
// phone whose copy was behind — used to be replaced by the server's list
// and vanish; and a phone holding an older copy could erase posts made
// elsewhere the same way. Reactions and comments are unioned per post too,
// so two people liking at once both count.
//
// Deletion is a tombstone (Pharmacy.removedPostIds) — a device that still
// has the post drops it when it sees the id, instead of restoring it.
function unionStrings(a: string[] | undefined, b: string[] | undefined): string[] | undefined {
  if (!a && !b) return undefined
  return [...new Set([...(a ?? []), ...(b ?? [])])]
}

function mergePost(local: VendorPost, incoming: VendorPost): VendorPost {
  const comments = new Map<string, VendorPostComment>()
  for (const c of [...(local.comments ?? []), ...(incoming.comments ?? [])]) comments.set(c.id, c)
  const merged: VendorPost = {
    ...incoming,
    sharePhotoDataUrl: incoming.sharePhotoDataUrl ?? local.sharePhotoDataUrl ?? null,
    likes: unionStrings(local.likes, incoming.likes),
    hearts: unionStrings(local.hearts, incoming.hearts),
  }
  if (comments.size > 0) {
    merged.comments = [...comments.values()]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(-50)
  }
  return merged
}

export function mergeVendorPosts(local: Pharmacy[], incoming: Pharmacy[]): Pharmacy[] {
  const byId = new Map(local.map((p) => [p.id, p]))
  // Vendor and pharmacy accounts are accounts: unioned by id like
  // passengers (mergeById), never dropped because the copy arriving from
  // elsewhere has not heard of one — or, worse, is a copy of the seeds.
  const incomingIds = new Set(incoming.map((p) => p.id))
  const onlyMine = local.filter((p) => !incomingIds.has(p.id))
  return [...incoming, ...onlyMine].map((remote) => {
    const mine = byId.get(remote.id)
    if (!mine || mine === remote) return remote
    const removed = new Set([...(remote.removedPostIds ?? []), ...(mine.removedPostIds ?? [])])
    const posts = new Map<string, VendorPost>()
    for (const post of [...(mine.posts ?? []), ...(remote.posts ?? [])]) {
      if (removed.has(post.id)) continue
      const prev = posts.get(post.id)
      posts.set(post.id, prev ? mergePost(prev, post) : post)
    }
    const sorted = [...posts.values()]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, MAX_VENDOR_POSTS)
    const next: Pharmacy = { ...remote, posts: sorted }
    if (removed.size > 0) next.removedPostIds = [...removed].slice(-50)
    return next
  })
}

// How far along a ride is. A trip only ever moves forward through these,
// so a copy sitting at a lower rung is older than one further up —
// whatever order the two writes happened to reach the database in.
//
// 'declined' shares a rung with 'requested': a driver turning an offer down
// leaves the ride looking for someone else rather than advancing it.
const LIFECYCLE_RANK: Record<RideStatus, number> = {
  requested: 0,
  declined: 0,
  accepted: 1,
  driver_arriving: 2,
  ongoing: 3,
  completed: 4,
  cancelled: 4,
}

export function mergeIncomingRides(local: Ride[], incoming: Ride[]): Ride[] {
  const mine = new Map(local.map((r) => [r.id, r]))
  return incoming.map((theirs) => {
    const ours = mine.get(theirs.id)
    if (!ours) return theirs
    // A ride never travels backwards.
    //
    // This began as a rule about endings — a cancelled trip that another
    // phone kept ticking back to life. The same thing happens one rung
    // down and is worse: a driver accepts, and a device still holding
    // "requested" saves its copy over the top, so the acceptance vanishes
    // and the passenger is left watching a request nobody answered while
    // the driver is on their way to them.
    //
    // Every client refusing to adopt an older status means the world
    // converges forwards instead of on whoever wrote last.
    if (LIFECYCLE_RANK[ours.status] > LIFECYCLE_RANK[theirs.status]) return ours
    return theirs
  })
}
