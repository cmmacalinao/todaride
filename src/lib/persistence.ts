import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabase, getWriterId, supabaseConfigured } from './supabaseClient'

// How the app's state gets from one device to another — or doesn't.
//
// RideContext does not know which of these it is talking to. It hands over a
// plain object to save, and gets told when a different device changed it.
// Everything about tables, realtime channels and localStorage keys lives
// behind this interface.
export interface PersistenceAdapter {
  // Synchronous, so the app has something to render on the first frame.
  // Whatever this browser last saw — the network answer replaces it shortly
  // after.
  loadLocal(): Record<string, unknown> | null
  // The shared world, if there is one. Null when running local-only.
  fetchShared(): Promise<Record<string, unknown> | null>
  save(next: Record<string, unknown>, prev: Record<string, unknown> | null): void
  // Fires when another device changes something. Returns an unsubscribe.
  subscribe(onRemote: (state: Record<string, unknown>) => void): () => void
  // The caller has applied a shared read; from here on saves may go out.
  // See SupabaseAdapter.remoteReady for why nothing is written before this.
  markSynced(): void
  // Whether something was saved here that never reached the server (saved
  // before the first shared read landed). The caller uses it to push the
  // merged state right after that read instead of waiting for the next
  // edit — see the hydrate paths in RideContext.
  hasLocalOnlyChanges(): boolean
  readonly isShared: boolean
}

// The collections that get their own table rather than riding along in the
// one JSONB blob — the ones two devices write at the same time. See the
// comment at the top of 0002_app_schema.sql for why.
// How often a visible page re-reads the shared state when the realtime
// socket has nothing to say. Long enough that five testers cost almost no
// bandwidth, short enough that a driver accepting is seen before the
// passenger gives up and reloads.
const POLL_WHILE_VISIBLE_MS = 45000

// The same heartbeat while a trip is actually running (2026-09-23).
//
// Pilot testing on two phones: the driver's dot stayed put on the passenger's
// map, the tricycle banner lagged behind the real tricycle, an acceptance
// took most of a minute to show, and re-routing never fired because the
// position it judges had not moved. All of it is this number. Positions are
// published every 3 seconds (see LIVE_GPS_PUBLISH_MS) and realtime is meant
// to deliver them at once — but on a carrier network that socket goes quiet
// without saying so, and then 45 seconds is how often a phone learns
// anything at all.
//
// So while this phone is on a live trip it reads every few seconds instead.
// It costs a read per device per 6 seconds, for the minutes a trip lasts,
// and only while the screen is on.
const POLL_ON_TRIP_MS = 6000

// Set by the app when this device is on a live trip — see RideContext.
let syncPaceMs = POLL_WHILE_VISIBLE_MS
export function setSyncPace(onLiveTrip: boolean) {
  syncPaceMs = onLiveTrip ? POLL_ON_TRIP_MS : POLL_WHILE_VISIBLE_MS
}

const HOT: { key: string; table: string; columns: (row: Record<string, unknown>) => Record<string, unknown> }[] = [
  {
    key: 'rides',
    table: 'ride',
    columns: (r) => ({
      id: r.id,
      passenger_id: r.passengerId ?? null,
      driver_id: r.driverId ?? null,
      status: r.status,
      requested_at: r.requestedAt,
      data: r,
    }),
  },
  // Accounts, for the same reason rides are here and more urgently: a lost
  // ride is a demo trip, a lost passenger is somebody who signed up and
  // cannot log in. Inside the shared blob they were erased whenever any
  // other device saved an older copy of the world.
  {
    key: 'passengers',
    table: 'passenger',
    columns: (p) => ({ id: p.id, name: p.name ?? null, phone: p.phone ?? null, data: p }),
  },
  {
    key: 'parents',
    table: 'parent',
    columns: (p) => ({ id: p.id, name: p.name ?? null, phone: p.phone ?? null, data: p }),
  },
  {
    key: 'drivers',
    table: 'driver',
    columns: (d) => ({
      id: d.id,
      toda_org_id: d.todaOrgId ?? null,
      online: d.online ?? false,
      queue_joined_at: d.queueJoinedAt ?? null,
      data: d,
    }),
  },
  {
    key: 'alerts',
    table: 'sos_alert',
    columns: (a) => ({
      id: a.id,
      ride_id: a.rideId ?? null,
      triggered_by: a.triggeredBy,
      status: a.status,
      created_at: a.createdAt,
      data: a,
    }),
  },
  // Food / vendor orders, for the same reason rides are here. An order is
  // placed on the customer's phone and accepted on the vendor's; while both
  // lived inside the one blob, whichever device saved last decided whether
  // the order existed at all — a vendor's phone saving its copy a moment
  // after the customer's landed simply erased it. One row per order cannot
  // be erased by somebody else's unrelated save.
  {
    key: 'medsOrders',
    table: 'meds_order',
    columns: (o) => ({
      id: o.id,
      customer_id: o.customerId ?? null,
      pharmacy_id: o.pharmacyId ?? null,
      status: o.status,
      requested_at: o.requestedAt,
      data: o,
    }),
  },
]

// Tables the project has not been given yet (see DOCUMENT GUIDES/
// meds_order_table.sql). A build that expects a table the database lacks
// must keep working — the key simply stays inside the app_state blob, as it
// did before, until the table is created. Learned from the first failed
// read, remembered for the life of the document.
const missingTables = new Set<string>()

function isMissingTableError(err: unknown): boolean {
  const e = err as { code?: string; message?: string; status?: number } | null
  return e?.code === '42P01' || e?.code === 'PGRST205' || e?.status === 404 || /does not exist|Could not find the table/i.test(e?.message ?? '')
}

// ---------------------------------------------------------------------------

const STORAGE_KEY = 'tricycle-mock-rides-v21'

// What the app has always done: one JSON blob per browser, and the `storage`
// event to keep tabs of the same browser in step. Still the right answer when
// no backend is configured, and still what holds the first paint even when
// one is.
class LocalAdapter implements PersistenceAdapter {
  readonly isShared = false

  loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? (JSON.parse(raw) as Record<string, unknown>) : null
    } catch {
      return null
    }
  }

  async fetchShared() {
    return null
  }

  markSynced() {
    // Nothing shared to protect.
  }

  hasLocalOnlyChanges() {
    return false
  }

  save(next: Record<string, unknown>) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Quota or private mode — the app keeps working, it just forgets.
    }
  }

  subscribe(onRemote: (state: Record<string, unknown>) => void) {
    function handle(e: StorageEvent) {
      if (e.key !== STORAGE_KEY || !e.newValue) return
      try {
        onRemote(JSON.parse(e.newValue) as Record<string, unknown>)
      } catch {
        // Ignore a corrupt write from another tab.
      }
    }
    window.addEventListener('storage', handle)
    return () => window.removeEventListener('storage', handle)
  }
}

// ---------------------------------------------------------------------------

class SupabaseAdapter implements PersistenceAdapter {
  readonly isShared = true
  private local = new LocalAdapter()
  private writer = getWriterId()
  // The write currently on its way to Supabase, and a counter that ticks on
  // every save. A refetch (realtime, the 12s heartbeat, focus, wake) that
  // reads app_state while a save is still in flight gets the OLD blob back
  // and hands it to RideContext as the truth — which is exactly how a cover
  // photo, a theme colour or a menu edit was vanishing seconds after being
  // made. So a refetch waits for the in-flight save first, and throws its
  // snapshot away if another save began while it was reading.
  private saveInFlight: Promise<void> | null = null
  private saveSeq = 0
  // Whether this document has successfully read the shared state at least
  // once. Until it has, nothing is written to the server — only locally.
  //
  // The persist effect in RideContext runs on mount, with whatever the
  // document started from: usually this browser's cached copy, but after a
  // cleared or unreadable cache it is the SEED data. Writing that to the
  // server before the shared read has even returned is how, on 2026-09-06,
  // every vendor, menu, order, announcement and service switch was replaced
  // by the demo defaults from a single reload of a browser with an empty
  // cache. A document that has not yet seen the shared world has no business
  // overwriting it; once it has (and been hydrated from it), its saves are
  // edits to that world and go through as before.
  private remoteReady = false
  // Set when a save was kept local because remoteReady was still false;
  // cleared by the first write that reaches the server.
  private localOnly = false
  // The blob as last written, so a save that only touched hot-table rows
  // (a ride ticking along, a driver's position) does not re-upload the
  // whole blob — several hundred KB — every 800 ms. Only the changed rows
  // go out; the blob goes out when something in it actually changed.
  private lastBlobJson: string | null = null
  // The realtime channel, once subscribed — the blob's change notice is
  // sent over it (see saveAsync).
  private channel: RealtimeChannel | null = null
  // The whole shared world as this document last knew it: the last full
  // read, with this document's own successful writes laid over it. Lets a
  // change to one table be answered by re-reading that table alone (see
  // fetchTables) instead of the blob and every table again.
  private lastShared: Record<string, unknown> | null = null

  // Called by RideContext once a shared read has been applied — not merely
  // received. A read that arrives but cannot be hydrated leaves the document
  // on whatever it started with, and that must stay local too.
  markSynced() {
    this.remoteReady = true
  }

  hasLocalOnlyChanges() {
    return this.localOnly
  }

  // Still writes locally as well: it is the first paint on the next launch,
  // and it is what the app falls back to when the phone has no signal at the
  // terminal — which, at a tricycle terminal, is often.
  loadLocal() {
    return this.local.loadLocal()
  }

  async fetchShared() {
    const db = getSupabase()
    if (!db) return null
    try {
      const [stateRow, ...hot] = await Promise.all([
        db.from('app_state').select('state').eq('id', 'singleton').maybeSingle(),
        ...HOT.map((h) => db.from(h.table).select('data')),
      ])
      if (stateRow.error) throw stateRow.error

      const blob = (stateRow.data?.state as Record<string, unknown> | undefined) ?? {}
      const merged: Record<string, unknown> = { ...blob }
      HOT.forEach((h, i) => {
        const res = hot[i]
        if (res.error) {
          if (isMissingTableError(res.error)) {
            // Not created yet — the blob's copy is the only copy.
            missingTables.add(h.table)
            return
          }
          throw res.error
        }
        missingTables.delete(h.table)
        merged[h.key] = (res.data ?? []).map((row) => (row as { data: unknown }).data)
      })
      this.lastShared = merged
      return merged
    } catch (err) {
      // A pilot phone that loses signal must keep working on what it has
      // rather than showing an empty app.
      console.warn('[persistence] could not read the shared state', err)
      return null
    }
  }

  // Re-reads only the named hot tables and lays them over lastShared.
  //
  // A ride moving along writes its row every few seconds, and every connected
  // device used to answer each of those notices by downloading the blob and
  // every table — megabytes per device per tick, which is what pushed the
  // shared reads past the database's statement timeout. The blob and the
  // other tables have their own notices (the blob-changed broadcast, their
  // own row changes) and the heartbeat still does a full read, so nothing
  // relies on a ride notice to learn about anything but rides.
  private async fetchTables(tables: Set<string>): Promise<Record<string, unknown> | null> {
    if (!this.lastShared) return this.fetchShared()
    const db = getSupabase()
    if (!db) return null
    const wanted = HOT.filter((h) => tables.has(h.table) && !missingTables.has(h.table))
    if (wanted.length === 0) return null
    try {
      const results = await Promise.all(wanted.map((h) => db.from(h.table).select('data')))
      // Read after the queries return, so a write of ours that finished in
      // the meantime is already part of it.
      const merged: Record<string, unknown> = { ...this.lastShared }
      results.forEach((res, i) => {
        if (res.error) throw res.error
        merged[wanted[i].key] = (res.data ?? []).map((row) => (row as { data: unknown }).data)
      })
      this.lastShared = merged
      return merged
    } catch (err) {
      console.warn('[persistence] could not read the shared state', err)
      return null
    }
  }

  save(next: Record<string, unknown>, prev: Record<string, unknown> | null) {
    this.saveSeq += 1
    // saveAsync never rejects (it catches and warns), but the guard must hold
    // even if that changes — a refetch waiting on a rejected save would hang.
    const run = this.saveAsync(next, prev).catch(() => {})
    this.saveInFlight = run
    void run.then(() => {
      if (this.saveInFlight === run) this.saveInFlight = null
    })
  }

  private async saveAsync(next: Record<string, unknown>, prev: Record<string, unknown> | null) {
    this.local.save(next)
    const db = getSupabase()
    if (!db) return
    if (!this.remoteReady) {
      // Kept locally, not pushed: this document has not read the shared
      // state yet (first paint, or offline), so what it holds may be a stale
      // cache or the seeds — either would erase everyone else's world. The
      // subscription's refetch (realtime, heartbeat, focus, online) hydrates
      // it as soon as the server can be read, and saves flow from then on.
      console.warn('[persistence] not yet synced with the shared state — kept this change locally only')
      this.localOnly = true
      return
    }

    const rest: Record<string, unknown> = { ...next }
    // Supabase query builders are thenable but not Promises, so the array
    // is typed to what they actually are.
    const work: PromiseLike<unknown>[] = []

    for (const h of HOT) {
      // No table yet: the key rides along in the blob as it always did.
      if (missingTables.has(h.table)) continue
      delete rest[h.key]
      const rows = (next[h.key] as Record<string, unknown>[] | undefined) ?? []
      const before = (prev?.[h.key] as Record<string, unknown>[] | undefined) ?? []
      // Only what actually changed. The reducer rebuilds an object when it
      // edits it and leaves the rest alone, so identity is a reliable and
      // very cheap test — far cheaper than deep-comparing every ride on
      // every keystroke.
      const beforeById = new Map(before.map((r) => [r.id as string, r]))
      const changed = rows.filter((r) => beforeById.get(r.id as string) !== r)
      if (changed.length > 0) {
        work.push(db.from(h.table).upsert(changed.map(h.columns)))
      }
      // Deletions are rare (clearing rides, removing a driver) but must not
      // leave ghosts in a table every other device reads.
      const liveIds = new Set(rows.map((r) => r.id as string))
      const removed = before.filter((r) => !liveIds.has(r.id as string)).map((r) => r.id as string)
      if (removed.length > 0) {
        work.push(db.from(h.table).delete().in('id', removed))
      }
    }

    const blobJson = JSON.stringify(rest)
    const blobChanged = blobJson !== this.lastBlobJson
    if (blobChanged) {
      work.push(
        db.from('app_state').upsert({ id: 'singleton', state: rest, updated_by: this.writer }),
      )
    }
    if (work.length === 0) return

    try {
      await Promise.all(work)
      this.localOnly = false
      // Without this, a table-only refetch would hand back the blob from
      // the last full read — older than what this document just wrote — and
      // HYDRATE takes the blob's settings wholesale, reverting this
      // device's own change on screen and then saving the reverted value.
      if (this.lastShared) this.lastShared = { ...this.lastShared, ...next }
      if (blobChanged) {
        this.lastBlobJson = blobJson
        // Tell the other devices the blob changed — a few bytes, not the
        // blob. Realtime's own row-change notice for app_state carried the
        // whole new row (several hundred KB) to every connected device on
        // every write, and that was most of the project's realtime traffic;
        // they only need to know to re-read.
        void this.channel?.send({ type: 'broadcast', event: 'blob-changed', payload: { writer: this.writer } })
      }
    } catch (err) {
      console.warn('[persistence] could not write to the shared state', err)
    }
  }

  subscribe(onRemote: (state: Record<string, unknown>) => void) {
    const db = getSupabase()
    if (!db) return this.local.subscribe(onRemote)

    // On a change from anywhere, re-read what changed and hand over the whole
    // world. Surgically patching one row into the in-memory tree would be
    // faster still and would also be where the subtle bugs live; re-reading a
    // whole table keeps the simple, obviously correct shape.
    let timer: ReturnType<typeof setTimeout> | null = null
    // How many reads in a row were thrown away because a save began while
    // they were in flight. A device that saves every second (a ride ticking
    // along) and reads slowly (a strained server) would otherwise never
    // apply a read at all — and keep writing its own stale copy over
    // everyone else's. After two deferrals the read is applied regardless;
    // HYDRATE merges rides, accounts and posts, so what this device changed
    // in the meantime survives the merge and goes out on its next save.
    let deferred = 0
    // What the pending refetch has to read: named hot tables, or everything.
    let pendingAll = false
    const pendingTables = new Set<string>()
    // No table: a full read (the blob changed, the heartbeat, coming back
    // from the background). A table: just that table — see fetchTables.
    const refetch = (table?: string) => {
      if (table) pendingTables.add(table)
      else pendingAll = true
      if (timer) clearTimeout(timer)
      // A single user action can touch several tables — accepting a ride
      // writes the ride and the driver. Coalesce so that lands as one update.
      timer = setTimeout(async () => {
        const all = pendingAll
        const tables = new Set(pendingTables)
        pendingAll = false
        pendingTables.clear()
        // See saveInFlight: never read over the top of our own unfinished
        // write, and never apply a read that a newer write has overtaken —
        // that newer save's own completion will trigger the next refetch.
        const seqAtStart = this.saveSeq
        if (this.saveInFlight) await this.saveInFlight
        const shared = all ? await this.fetchShared() : await this.fetchTables(tables)
        if (this.saveSeq !== seqAtStart && deferred < 2) {
          deferred += 1
          if (all) refetch()
          else tables.forEach((t) => refetch(t))
          return
        }
        deferred = 0
        if (shared) onRemote(shared)
      }, 120)
    }

    const channel = db.channel('toda-saferide')
    // The hot tables' rows are small, so their change notices are cheap.
    // The blob is not: its notice is the small broadcast below instead of
    // a postgres_changes subscription that would deliver the whole row.
    for (const table of HOT.map((h) => h.table)) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => refetch(table))
    }
    channel.on('broadcast', { event: 'blob-changed' }, (msg) => {
      const writer = (msg.payload as { writer?: string } | undefined)?.writer
      if (writer === this.writer) return
      refetch()
    })
    channel.subscribe()
    this.channel = channel

    // Coming back from the background is its own kind of change.
    //
    // A phone that is locked, switched away from, or off signal suspends
    // its timers and usually loses the websocket. Whatever happened while
    // it was away arrived at a socket nobody was listening to, and the
    // subscription alone will never tell it. So it sat showing a world from
    // whenever it last heard anything — a driver accepting, a fare being
    // proposed, a ride being cancelled, none of it arriving until somebody
    // thought to reload.
    //
    // Worse than looking stale: that device then SAVES its old world over
    // the top of everyone else's, which is how a fresh sign-up or a
    // driver's acceptance gets erased by a phone in a pocket.
    //
    // Re-reading on wake is cheap and makes the stale window a moment
    // rather than an afternoon.
    const onWake = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      refetch()
    }

    // A heartbeat, because a websocket on a phone is a promise nobody can
    // keep.
    //
    // Realtime is configured correctly and works on a desk. On a mobile
    // network it is another matter: carrier NAT drops idle connections,
    // the browser throttles a backgrounded tab, and a project over its
    // usage quota can have realtime limited without telling the client.
    // Any of those leave the socket open-looking and silent, and the app
    // then shows a world that stopped -- which is exactly what a passenger
    // means when they say it only updates if they pull to refresh.
    //
    // So the app refreshes for them. Only while the page is actually being
    // looked at, so a phone in a pocket costs nothing, and slowly enough
    // to stay cheap: one read of the shared state, not a stream.
    //
    // This does not replace the subscription -- when the socket is healthy
    // updates still arrive in a moment rather than on the next beat. It is
    // the floor under it.
    // Self-rescheduling rather than a fixed interval, so the pace can change
    // the moment a trip starts or ends.
    let heartbeat: ReturnType<typeof setTimeout> = setTimeout(function beat() {
      onWake()
      heartbeat = setTimeout(beat, syncPaceMs)
    }, syncPaceMs)
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onWake)
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onWake)
      window.addEventListener('online', onWake)
    }

    // Same-browser tabs still talk through localStorage: it is instant, and
    // the split-screen simulator depends on it.
    const unsubLocal = this.local.subscribe(onRemote)
    return () => {
      if (timer) clearTimeout(timer)
      clearTimeout(heartbeat)
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onWake)
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onWake)
        window.removeEventListener('online', onWake)
      }
      this.channel = null
      void db.removeChannel(channel)
      unsubLocal()
    }
  }
}

// ---------------------------------------------------------------------------

let adapter: PersistenceAdapter | null = null

export function getPersistence(): PersistenceAdapter {
  if (!adapter) {
    adapter = supabaseConfigured ? new SupabaseAdapter() : new LocalAdapter()
  }
  return adapter
}
