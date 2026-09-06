// Data recovery, reached with ?recover=1 — see main.tsx.
//
// Every phone keeps a full copy of the shared world in localStorage (see
// lib/persistence.ts). When the server copy is lost — as it was on 2026-09-06,
// when a browser with an empty cache started from seed data and saved that
// over the live app_state — the freshest surviving copy is usually sitting in
// somebody's phone. This screen reads that copy and pushes it back, without
// ever mounting the app: the app saves on mount, and the app is exactly what
// must not run until the server holds the right data again.
//
// Plain DOM on purpose. No React, no RideProvider, nothing that persists.

const STORAGE_KEY = 'tricycle-mock-rides-v21'
const BACKUP_KEY = `${STORAGE_KEY}.unreadable`
// Collections that live in their own tables, not in the app_state blob —
// mirror of HOT in lib/persistence.ts. They are intact on the server and are
// left alone here.
const HOT_KEYS = ['rides', 'passengers', 'parents', 'drivers', 'alerts']

type Blob = Record<string, unknown>

function el(tag: string, text?: string, cls?: string): HTMLElement {
  const node = document.createElement(tag)
  if (text) node.textContent = text
  if (cls) node.className = cls
  return node
}

function summarise(blob: Blob): string[] {
  const arr = (k: string) => (Array.isArray(blob[k]) ? (blob[k] as unknown[]) : [])
  const pharmacies = arr('pharmacies') as { id?: string; name?: string; businessType?: string }[]
  const products = arr('medicineProducts') as { pharmacyId?: string }[]
  const lines = [
    `Vendors / pharmacies: ${pharmacies.length}`,
    ...pharmacies.map((p) => `   • ${p.name ?? '?'} (${p.businessType ?? '?'}) — ${p.id ?? '?'}`),
    `Menu items / products: ${products.length}`,
    `Orders: ${arr('medsOrders').length}`,
    `Announcements: ${arr('announcements').length}`,
    `Terminals: ${arr('terminals').length} · TODAs: ${arr('todaOrganizations').length} · Franchises: ${arr('franchises').length}`,
    `Food & Vendor switch: ${String(blob.vendorsEnabled)} · Pabili: ${String(blob.pabiliEnabled)} · Meds: ${String(blob.medsEnabled)}`,
    `Rides in this copy: ${arr('rides').length} · Drivers: ${arr('drivers').length} · Passengers: ${arr('passengers').length} (these stay on the server as they are)`,
  ]
  return lines
}

async function upload(blob: Blob, status: HTMLElement) {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!url || !key) {
    status.textContent = 'This build has no server configured — nothing to upload to.'
    return
  }
  const rest: Blob = { ...blob }
  for (const k of HOT_KEYS) delete rest[k]
  // A copy saved by an older build carries no stamp; the server's guard
  // would refuse it. This upload is a person's deliberate restore, so it
  // goes in stamped as current.
  if (typeof rest.schemaVersion !== 'number' || rest.schemaVersion < 2) rest.schemaVersion = 2
  status.textContent = 'Uploading…'
  try {
    const res = await fetch(`${url}/rest/v1/app_state`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ id: 'singleton', state: rest, updated_by: `recovery-${Date.now()}` }),
    })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${(await res.text()).slice(0, 300)}`)
    status.textContent = '✓ Uploaded. The server now holds this copy. You can close this tab and open the app normally.'
    status.className = 'ok'
  } catch (err) {
    status.textContent = `Upload failed — ${err instanceof Error ? err.message : String(err)}`
    status.className = 'bad'
  }
}

export function renderRecovery() {
  const root = document.getElementById('root')!
  root.innerHTML = ''
  const style = el('style')
  style.textContent = `
    body{font-family:system-ui,sans-serif;margin:0;background:#f8fafc;color:#0f172a}
    .wrap{max-width:32rem;margin:0 auto;padding:1rem}
    h1{font-size:1.1rem;margin:.5rem 0}
    p,li{font-size:.85rem;line-height:1.4}
    pre{font-size:.75rem;white-space:pre-wrap;background:#fff;border:1px solid #e2e8f0;border-radius:.5rem;padding:.75rem}
    button{width:100%;padding:.8rem;border:0;border-radius:.6rem;background:#1d4ed8;color:#fff;font-weight:700;font-size:.95rem;margin-top:.5rem}
    button[disabled]{background:#94a3b8}
    .ok{color:#047857;font-weight:600}.bad{color:#b45309;font-weight:600}
    .note{color:#475569}
  `
  const wrap = el('div', undefined, 'wrap')
  wrap.appendChild(style)
  wrap.appendChild(el('h1', '🛟 TODA SafeRide — data recovery'))
  wrap.appendChild(
    el('p', 'This reads the copy of the app data saved on this phone and lets you send it back to the server. The app itself is not started on this screen, so nothing here can overwrite that copy.', 'note'),
  )

  const sources: { label: string; raw: string | null }[] = [
    { label: 'Saved data', raw: localStorage.getItem(STORAGE_KEY) },
    { label: 'Set-aside (unreadable) copy', raw: localStorage.getItem(BACKUP_KEY) },
  ]
  let any = false
  for (const src of sources) {
    if (!src.raw) continue
    let blob: Blob | null = null
    try {
      blob = JSON.parse(src.raw) as Blob
    } catch {
      /* shown below */
    }
    const section = el('div')
    section.appendChild(el('h1', `${src.label} — ${(src.raw.length / 1024).toFixed(0)} KB`))
    if (!blob) {
      section.appendChild(el('p', 'Could not parse this copy.', 'bad'))
      wrap.appendChild(section)
      continue
    }
    any = true
    const pre = el('pre', summarise(blob).join('\n'))
    section.appendChild(pre)
    const status = el('p', '')
    const btn = el('button', 'Upload this copy to the server') as HTMLButtonElement
    btn.onclick = () => {
      if (!confirm('Replace the server copy with the data saved on this phone?')) return
      btn.disabled = true
      void upload(blob!, status)
    }
    section.appendChild(btn)
    section.appendChild(status)
    wrap.appendChild(section)
  }
  if (!any) {
    wrap.appendChild(el('p', 'No saved app data was found in this browser.', 'bad'))
  }
  const back = el('button', 'Open the app') as HTMLButtonElement
  back.style.background = '#334155'
  back.onclick = () => window.location.replace('/')
  wrap.appendChild(back)
  root.appendChild(wrap)
}
