import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// The app runs in one of two modes, decided entirely by whether these two
// values are set:
//
//   unset  — every device keeps its own world in localStorage. Fine for a
//            demo on one phone, useless for a pilot: a passenger booking on
//            her phone is invisible to the driver on his.
//   set    — one shared world in Postgres, with realtime pushing changes to
//            every device. This is what a pilot needs.
//
// Nothing else in the app branches on this. The persistence layer picks an
// adapter once at startup and the rest of the code never knows which it got.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = !!url && !!anonKey

// A single client for the document. Two clients would mean two realtime
// sockets and two copies of every message.
let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigured) return null
  if (!client) {
    client = createClient(url!, anonKey!, {
      auth: {
        // The app has its own accounts (see SessionContext); Supabase Auth is
        // not in play yet, so there is no session to persist or refresh.
        persistSession: false,
        autoRefreshToken: false,
      },
      realtime: {
        // A tricycle's position and a queue change are both small and
        // frequent; this is well inside the default but stated so the limit
        // is a decision rather than an accident.
        params: { eventsPerSecond: 20 },
      },
    })
  }
  return client
}

// Identifies this browser to the shared tables, so a client can recognise the
// echo of its own write and skip re-rendering on it. Per tab, not per device:
// the split-screen simulator runs two panes in one browser and they must not
// mistake each other's writes for their own.
let writerId: string | null = null

export function getWriterId(): string {
  if (!writerId) {
    writerId = `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }
  return writerId
}
