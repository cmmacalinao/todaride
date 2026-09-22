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
// A paused driver's conversation with Admin, from both copies of the driver
// list. The driver writes from their phone and Admin from theirs; each saves
// the whole list, so taking either copy whole would drop the other side's
// newest message. Everything else about the driver follows the incoming copy.
export function mergeDriverAccessMessages<T extends { id: string; accessMessages?: { id: string; at: string }[]; accessNoticeSeenAt?: string | null }>(
  local: T[],
  incoming: T[],
): T[] {
  const mine = new Map(local.map((d) => [d.id, d]))
  return incoming.map((theirs) => {
    const ours = mine.get(theirs.id)
    if (!ours) return theirs
    const byId = new Map<string, NonNullable<T['accessMessages']>[number]>()
    for (const m of [...(ours.accessMessages ?? []), ...(theirs.accessMessages ?? [])]) byId.set(m.id, m)
    const messages = [...byId.values()].sort((a, b) => a.at.localeCompare(b.at))
    const seen = [ours.accessNoticeSeenAt, theirs.accessNoticeSeenAt].filter(Boolean).sort().pop() ?? null
    return {
      ...theirs,
      ...(messages.length > 0 ? { accessMessages: messages } : {}),
      ...(seen ? { accessNoticeSeenAt: seen } : {}),
    }
  })
}

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

function isNewer(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a) return false
  if (!b) return true
  return new Date(a).getTime() > new Date(b).getTime()
}

// Safety photos from both copies of a trip, by id.
//
// A photo is taken on one phone; every other phone saving its older copy of
// the ride would otherwise drop it. And a photo deleted on one phone must stay
// deleted when an older copy that still has the picture arrives. So: every
// photo either side knows about, and deleted if either side deleted it.
function mergeSafetyPhotos(result: Ride, ours: Ride | undefined, theirs: Ride): Ride {
  if (!ours) return result
  const byId = new Map<string, Ride['safetyPhotos'][number]>()
  for (const p of [...(ours.safetyPhotos ?? []), ...(theirs.safetyPhotos ?? [])]) {
    const seen = byId.get(p.id)
    if (!seen) {
      byId.set(p.id, p)
    } else if (p.removedAt || seen.removedAt) {
      byId.set(p.id, { ...seen, dataUrl: '', removedAt: seen.removedAt ?? p.removedAt })
    }
  }
  const safetyPhotos = [...byId.values()].sort((a, b) => a.takenAt.localeCompare(b.takenAt))
  return { ...result, safetyPhotos }
}

// Chat messages from both copies of a trip, by id — same reason as the
// photos: the driver and the passenger each write their own, and whichever
// copy wins must not drop the other side's.
function mergeRideMessages(result: Ride, ours: Ride | undefined, theirs: Ride): Ride {
  if (!ours || (!ours.messages?.length && !theirs.messages?.length)) return result
  const byId = new Map<string, NonNullable<Ride['messages']>[number]>()
  for (const m of [...(ours.messages ?? []), ...(theirs.messages ?? [])]) byId.set(m.id, m)
  const messages = [...byId.values()].sort((a, b) => a.at.localeCompare(b.at))
  return { ...result, messages }
}

export function mergeIncomingRides(local: Ride[], incoming: Ride[]): Ride[] {
  const mine = new Map(local.map((r) => [r.id, r]))
  return incoming.map((theirs) =>
    mergeRideMessages(
      mergeSafetyPhotos(pickRide(mine.get(theirs.id), theirs), mine.get(theirs.id), theirs),
      mine.get(theirs.id),
      theirs,
    ),
  )
}

function pickRide(ours: Ride | undefined, theirs: Ride): Ride {
  {
    if (!ours) return theirs
    // The one sanctioned step backwards: a passenger letting a far-away
    // driver go puts the ride back to 'requested' (see
    // PASSENGER_RELEASE_DRIVER). Each release is recorded, so the copy that
    // has seen more releases is the newer one whatever its status — without
    // this, every device still holding "driver arriving" would refuse the
    // release below and write the old driver straight back.
    const ourReleases = ours.releasedDrivers?.length ?? 0
    const theirReleases = theirs.releasedDrivers?.length ?? 0
    if (theirReleases > ourReleases && !isFinishedRide(ours.status)) return theirs
    if (ourReleases > theirReleases && !isFinishedRide(theirs.status)) return ours
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
    // Keeping a far-away driver is one-way too: the passenger agreed to the
    // extra charge on their phone, and a driver's phone still resaving its
    // pre-agreement copy of the ride must not take the charge back off.
    let next = theirs
    // Live positions, field by field, newest wins.
    //
    // The driver's phone and the passenger's phone both save this same ride
    // whole, and each only ever moves its own position. So every save from
    // the passenger's phone also carries its old copy of where the driver
    // was — and a passenger sharing GPS saves on every fix. Taking that copy
    // whole put the driver back at the start on the passenger's screen and
    // kept them there, while the driver's own screen (which sets its own
    // position locally) showed both moving. Each position has its own
    // timestamp; the newer one is the truth whichever copy it arrived in.
    if (ours.status === theirs.status) {
      if (isNewer(ours.driverLiveGpsAt, theirs.driverLiveGpsAt)) {
        next = { ...next, driverLiveGps: ours.driverLiveGps, driverLiveGpsAt: ours.driverLiveGpsAt }
      }
      if (isNewer(ours.passengerLiveGpsAt, theirs.passengerLiveGpsAt)) {
        next = { ...next, passengerLiveGps: ours.passengerLiveGps, passengerLiveGpsAt: ours.passengerLiveGpsAt }
      }
      // How far along the current leg the tricycle is only grows within a
      // status (START_RIDE resets it as the status moves on), so a copy
      // behind ours is simply stale — the same staleness as above.
      if ((ours.legProgress ?? 0) > (next.legProgress ?? 0)) {
        next = { ...next, legProgress: ours.legProgress }
      }
    }
    if (ours.farPickupKeptAt && !theirs.farPickupKeptAt && theirs.driverId === ours.driverId) {
      next = {
        ...theirs,
        farPickupKeptAt: ours.farPickupKeptAt,
        farPickupKm: ours.farPickupKm,
        farPickupFee: ours.farPickupFee,
        fareEstimate: ours.fareEstimate,
      }
    }
    // Paying is one-way too, for the same reason endings are: a driver's
    // phone can still be holding — and periodically resaving — its own copy
    // of a ride from the moment it completed, before the passenger tapped
    // "Paid" on theirs. Without this, that stale copy lands right after the
    // acknowledgment and silently un-pays a fare that was already settled,
    // reopening "Trip complete — time to pay" on a trip that is done.
    // "I am safe" is what a parent is waiting to read; a phone still saving
    // an older copy must not take it back off their screen.
    if (ours.riderSafeConfirmedAt && (!next.riderSafeConfirmedAt || next.riderSafeConfirmedAt < ours.riderSafeConfirmedAt)) {
      next = { ...next, riderSafeConfirmedAt: ours.riderSafeConfirmedAt }
    }
    if (ours.paymentAcknowledged && !next.paymentAcknowledged) {
      return { ...next, paymentAcknowledged: true, paymentMethod: ours.paymentMethod, payment: ours.payment ?? next.payment }
    }
    return next
  }
}
