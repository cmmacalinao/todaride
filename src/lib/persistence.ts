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
  readonly isShared: boolean
}

// The collections that get their own table rather than riding along in the
// one JSONB blob — the ones two devices write at the same time. See the
// comment at the top of 0002_app_schema.sql for why.
// How often a visible page re-reads the shared state when the realtime
// socket has nothing to say. Long enough that five testers cost almost no
// bandwidth, short enough that a driver accepting is seen before the
// passenger gives up and reloads.
const POLL_WHILE_VISIBLE_MS = 12000

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
]

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

      const merged: Record<string, unknown> = { ...((stateRow.data?.state as object) ?? {}) }
      HOT.forEach((h, i) => {
        const res = hot[i]
        if (res.error) throw res.error
        merged[h.key] = (res.data ?? []).map((row) => (row as { data: unknown }).data)
      })
      return merged
    } catch (err) {
      // A pilot phone that loses signal must keep working on what it has
      // rather than showing an empty app.
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

    const rest: Record<string, unknown> = { ...next }
    // Supabase query builders are thenable but not Promises, so the array
    // is typed to what they actually are.
    const work: PromiseLike<unknown>[] = []

    for (const h of HOT) {
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

    work.push(
      db.from('app_state').upsert({ id: 'singleton', state: rest, updated_by: this.writer }),
    )

    try {
      await Promise.all(work)
    } catch (err) {
      console.warn('[persistence] could not write to the shared state', err)
    }
  }

  subscribe(onRemote: (state: Record<string, unknown>) => void) {
    const db = getSupabase()
    if (!db) return this.local.subscribe(onRemote)

    // On any change from anywhere, re-read the whole world and hand it over.
    // Surgically patching one row into the in-memory tree would be faster and
    // would also be where the subtle bugs live; at a pilot's data volume the
    // simple thing is fast enough and is obviously correct.
    let timer: ReturnType<typeof setTimeout> | null = null
    const refetch = () => {
      if (timer) clearTimeout(timer)
      // A single user action can touch several tables — accepting a ride
      // writes the ride and the driver. Coalesce so that lands as one update.
      timer = setTimeout(async () => {
        // See saveInFlight: never read over the top of our own unfinished
        // write, and never apply a read that a newer write has overtaken —
        // that newer save's own completion will trigger the next refetch.
        const seqAtStart = this.saveSeq
        if (this.saveInFlight) await this.saveInFlight
        const shared = await this.fetchShared()
        if (this.saveSeq !== seqAtStart) {
          refetch()
          return
        }
        if (shared) onRemote(shared)
      }, 120)
    }

    const channel = db.channel('toda-saferide')
    for (const table of ['app_state', ...HOT.map((h) => h.table)]) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
        // Skip the echo of this device's own write to app_state; the hot
        // tables carry no writer column, so those still round-trip.
        const updatedBy = (payload.new as { updated_by?: string } | null)?.updated_by
        if (table === 'app_state' && updatedBy === this.writer) return
        refetch()
      })
    }
    channel.subscribe()

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
    const heartbeat = setInterval(onWake, POLL_WHILE_VISIBLE_MS)
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
      clearInterval(heartbeat)
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onWake)
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onWake)
        window.removeEventListener('online', onWake)
      }
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
