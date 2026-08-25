import { useEffect, useRef, useState } from 'react'
import { useRides } from '../context/RideContext'
import { getCurrentGeoPosition } from '../lib/geo'
import { RealLiveMap, type MapPoint } from '../components/RealLiveMap'
import { CLSU_GPS } from '../mock/data'
import { TERMINAL_TYPE_LABELS } from '../types'
import type { TerminalType } from '../types'

// One panel for putting terminals on the map, used from two places: the
// split-screen simulation (where you need one without losing the panes) and
// Admin › Terminals. Everything happens against the map — tap to place,
// drag or right-click a pin to move it, right-click to delete — with typed
// coordinates for when someone hands you numbers instead of a place.
export function TerminalQuickPanel({
  orgs,
  terminals,
  onAdd,
  onRemove,
  onMove,
  onClose,
}: {
  orgs: ReturnType<typeof useRides>['todaOrganizations']
  terminals: ReturnType<typeof useRides>['terminals']
  onAdd: ReturnType<typeof useRides>['addTerminal']
  onRemove: ReturnType<typeof useRides>['removeTerminal']
  onMove: ReturnType<typeof useRides>['setTerminalGps']
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<TerminalType>('university')
  const [orgId, setOrgId] = useState(orgs[0]?.id ?? '')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [detail, setDetail] = useState('')
  const [error, setError] = useState('')
  const [locating, setLocating] = useState(false)
  // Deleting a terminal cannot be undone and takes its queue with it, so the
  // ✕ asks once rather than acting on a mis-tap.
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null)
  const [seedState, setSeedState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  // Right-clicking a pin opens this at that spot; "Move" then arms the next
  // map tap to reposition that terminal instead of placing a new one.
  const [pinMenu, setPinMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [movingId, setMovingId] = useState<string | null>(null)
  const mapWrapRef = useRef<HTMLDivElement | null>(null)
  const nameRef = useRef<HTMLInputElement | null>(null)
  const [justAdded, setJustAdded] = useState('')

  const org = orgs.find((o) => o.id === orgId)
  const existingCount = terminals.length

  // Tapping the map is the natural way to say "here" — typing coordinates is
  // for when someone hands you numbers. Both write the same two fields, so
  // either can correct the other: tap roughly, then fix a digit, or paste a
  // pair and nudge the pin.
  const pending =
    Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && lat.trim() !== '' && lng.trim() !== ''
      ? { lat: Number(lat), lng: Number(lng) }
      : null

  const mapPoints: MapPoint[] = [
    ...terminals
      .filter((t) => t.gps)
      .map((t) => ({
        id: t.id,
        gps: t.gps!,
        color: t.isActive ? '#1d4ed8' : '#94a3b8',
        label: t.name,
        icon: 'terminal' as const,
      })),
    ...(pending
      ? [{ id: 'new-terminal', gps: pending, color: '#0f766e', label: name.trim() || 'New terminal' }]
      : []),
  ]
  // RealLiveMap centres on its first point, so it always needs one — the
  // campus anchor stands in before any terminal exists.
  if (mapPoints.length === 0) {
    mapPoints.push({ id: 'anchor', gps: org?.terminalGps ?? CLSU_GPS, color: '#cbd5e1', label: 'Tap to place' })
  }

  function setFromGps(gps: { lat: number; lng: number }) {
    setLat(gps.lat.toFixed(6))
    setLng(gps.lng.toFixed(6))
    setError('')
  }

  // Right-click is read from the map container: work out which pin sits
  // under the pointer by measuring the rendered markers. Leaflet's own
  // marker-level contextmenu did not reach react-leaflet's handler here, and
  // a menu that only sometimes opens is worse than none.
  useEffect(() => {
    const wrap = mapWrapRef.current
    if (!wrap) return
    function onContextMenu(e: MouseEvent) {
      const icons = Array.from(wrap!.querySelectorAll<HTMLElement>('.leaflet-marker-icon'))
      let hitId: string | null = null
      let best = 26 // px — a fingertip's worth of slack around the pin
      icons.forEach((icon) => {
        const r = icon.getBoundingClientRect()
        const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2))
        // The id is stamped on the pin itself (see dotIcon) — Leaflet shuffles
        // marker elements by latitude, so their DOM order means nothing.
        const id = icon.querySelector<HTMLElement>('[data-point-id]')?.dataset.pointId ?? null
        if (d < best && id) {
          best = d
          hitId = id
        }
      })
      const point = mapPoints.find((p) => p.id === hitId)
      if (!point || point.id === 'anchor') return
      e.preventDefault()
      const wrapRect = wrap!.getBoundingClientRect()
      setPinMenu({ id: point.id, x: e.clientX - wrapRect.left, y: e.clientY - wrapRect.top })
    }
    // Capture phase: Leaflet stops propagation of events that land on an
    // interactive marker, so a bubble-phase listener out here never sees the
    // right-click that matters most.
    wrap.addEventListener('contextmenu', onContextMenu, true)
    return () => wrap.removeEventListener('contextmenu', onContextMenu, true)
  })

  // One tap, two meanings: repositioning the terminal being moved, or placing
  // the new one. The armed state is what tells them apart, and it is always
  // visible in the line above the map.
  function handleMapTap(gps: { lat: number; lng: number }) {
    if (movingId) {
      onMove(movingId, gps)
      setMovingId(null)
      return
    }
    setFromGps(gps)
  }

  async function useMyGps() {
    setLocating(true)
    setError('')
    try {
      const gps = await getCurrentGeoPosition()
      setLat(gps.lat.toFixed(6))
      setLng(gps.lng.toFixed(6))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read this device location.')
    } finally {
      setLocating(false)
    }
  }

  function handleAdd() {
    const latNum = Number(lat)
    const lngNum = Number(lng)
    if (!name.trim()) {
      setError('Give the terminal a name.')
      return
    }
    if (!org) {
      setError('Pick the TODA this terminal belongs to.')
      return
    }
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum) || (latNum === 0 && lngNum === 0)) {
      setError('Enter both coordinates, or tap Use my GPS.')
      return
    }
    onAdd({
      id: `terminal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      type,
      todaOrgId: org.id,
      gps: { lat: latNum, lng: lngNum },
      // A terminal sits in its own organisation's area, so the address comes
      // from the TODA rather than asking for it again.
      province: org.province,
      city: org.city,
      barangay: org.barangay,
      addressDetail: detail.trim(),
      isActive: true,
    })
    setJustAdded(name.trim())
    setName('')
    setDetail('')
    setLat('')
    setLng('')
    setError('')
  }

  async function saveToSeed() {
    setSeedState('saving')
    try {
      const res = await fetch('/__seed/terminals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(terminals),
      })
      setSeedState(res.ok ? 'saved' : 'error')
    } catch {
      setSeedState('error')
    }
  }

  return (
    <section className="space-y-1.5 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Terminal name"
          className="min-w-[10rem] flex-1 rounded-lg border border-slate-300 px-2 py-1 text-[11px]"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as TerminalType)}
          className="rounded-lg border border-slate-300 px-2 py-1 text-[11px]"
        >
          {(Object.keys(TERMINAL_TYPE_LABELS) as TerminalType[]).map((t) => (
            <option key={t} value={t}>
              {TERMINAL_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <select
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
          className="max-w-[12rem] rounded-lg border border-slate-300 px-2 py-1 text-[11px]"
        >
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={lat}
          onChange={(e) => setLat(e.target.value)}
          inputMode="decimal"
          placeholder="Latitude (15.7331)"
          className="w-36 rounded-lg border border-slate-300 px-2 py-1 text-[11px]"
        />
        <input
          value={lng}
          onChange={(e) => setLng(e.target.value)}
          inputMode="decimal"
          placeholder="Longitude (120.9314)"
          className="w-36 rounded-lg border border-slate-300 px-2 py-1 text-[11px]"
        />
        <button
          type="button"
          disabled={locating}
          onClick={() => void useMyGps()}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        >
          {locating ? 'Locating…' : '📍 Use my GPS'}
        </button>
        <input
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="Landmark (optional)"
          className="min-w-[8rem] flex-1 rounded-lg border border-slate-300 px-2 py-1 text-[11px]"
        />
        <button
          type="button"
          onClick={handleAdd}
          className="rounded-lg bg-brand-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-brand-700"
        >
          Add
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
        >
          Close
        </button>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <p className="border-b border-slate-100 px-2 py-1 text-[11px] text-slate-500">
          {movingId ? (
            <span className="font-medium text-amber-700">
              ✋ Tap where {terminals.find((t) => t.id === movingId)?.name ?? 'it'} should stand —{' '}
              <button type="button" onClick={() => setMovingId(null)} className="underline">
                cancel
              </button>
            </span>
          ) : (
            <>
              {pending ? '📍 Tap again to move it, or drag the green pin' : '📍 Tap the map where the terminal stands'}
              {terminals.length > 0 && ' · drag a 🚏 to nudge it, right-click one to move or delete it'}
            </>
          )}
        </p>
        <div className="relative" ref={mapWrapRef}>
          <RealLiveMap
            points={mapPoints}
            onMapClick={handleMapTap}
            draggableIds={[...terminals.map((t) => t.id), ...(pending ? ['new-terminal'] : [])]}
            onPointDragEnd={(id, gps) => {
              if (id === 'new-terminal') {
                setFromGps(gps)
                return
              }
              onMove(id, gps)
            }}
          />
          {pinMenu && (
            <div
              className="absolute z-[1000] w-40 overflow-hidden rounded-lg border border-slate-200 bg-white text-[11px] shadow-lg"
              style={{ left: Math.min(pinMenu.x, 240), top: Math.min(pinMenu.y, 150) }}
            >
              <p className="truncate border-b border-slate-100 bg-slate-50 px-2 py-1 font-medium text-slate-600">
                {pinMenu.id === 'new-terminal'
                  ? name.trim() || 'New terminal'
                  : (terminals.find((t) => t.id === pinMenu.id)?.name ?? 'Terminal')}
              </p>
              {pinMenu.id === 'new-terminal' ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setPinMenu(null)
                      if (!name.trim()) {
                        setError('Name this terminal (and check its type and TODA) — then Add.')
                        nameRef.current?.focus()
                        nameRef.current?.scrollIntoView({ block: 'nearest' })
                        return
                      }
                      handleAdd()
                    }}
                    className="block w-full px-2 py-1.5 text-left font-medium text-brand-700 hover:bg-brand-50"
                  >
                    {name.trim() ? '➕ Add the terminal here' : '➕ Add terminal — fill in its details'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLat('')
                      setLng('')
                      setPinMenu(null)
                    }}
                    className="block w-full border-t border-slate-100 px-2 py-1.5 text-left text-slate-700 hover:bg-slate-50"
                  >
                    ✕ Clear this pin
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setMovingId(pinMenu.id)
                      setPinMenu(null)
                    }}
                    className="block w-full px-2 py-1.5 text-left text-slate-700 hover:bg-slate-50"
                  >
                    ✋ Move — tap the new spot
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const t = terminals.find((x) => x.id === pinMenu.id)
                      if (t?.gps) setFromGps(t.gps)
                      setPinMenu(null)
                    }}
                    className="block w-full px-2 py-1.5 text-left text-slate-700 hover:bg-slate-50"
                  >
                    📋 Copy its coordinates
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onRemove(pinMenu.id)
                      setPinMenu(null)
                    }}
                    className="block w-full border-t border-slate-100 px-2 py-1.5 text-left font-medium text-rose-600 hover:bg-rose-50"
                  >
                    ✕ Delete this terminal
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setPinMenu(null)}
                className="block w-full border-t border-slate-100 px-2 py-1.5 text-left text-slate-500 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>

      {terminals.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {terminals.map((t) =>
            confirmingRemoveId === t.id ? (
              <span
                key={t.id}
                className="flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800"
              >
                Delete {t.name}?
                <button
                  type="button"
                  onClick={() => {
                    onRemove(t.id)
                    setConfirmingRemoveId(null)
                  }}
                  className="rounded-full bg-amber-600 px-1.5 font-semibold text-white hover:bg-amber-700"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingRemoveId(null)}
                  className="font-medium text-slate-500 hover:text-slate-700"
                >
                  No
                </button>
              </span>
            ) : (
              <span
                key={t.id}
                className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600"
              >
                <button
                  type="button"
                  onClick={() => t.gps && setFromGps(t.gps)}
                  title="Copy this terminal's coordinates into the fields above"
                  className="hover:text-brand-700"
                >
                  🚏 {t.name}
                  {!t.isActive && <span className="text-slate-400"> · off</span>}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingRemoveId(t.id)}
                  title={`Delete ${t.name}`}
                  aria-label={`Delete ${t.name}`}
                  className="text-slate-400 hover:text-rose-600"
                >
                  ✕
                </button>
              </span>
            ),
          )}
        </div>
      )}

      {import.meta.env.DEV && terminals.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void saveToSeed()}
            disabled={seedState === 'saving'}
            title="Write these terminals into the app's seed file, so they survive a cleared cache and reach every device"
            className="rounded-lg border border-brand-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-60"
          >
            {seedState === 'saving' ? 'Saving…' : '💾 Save terminals to seed'}
          </button>
          {seedState === 'saved' && (
            <span className="text-[11px] font-medium text-brand-700">
              ✓ Written to src/mock/terminals.seed.json — these are now the app's defaults.
            </span>
          )}
          {seedState === 'error' && (
            <span className="text-[11px] font-medium text-amber-700">
              Could not write the seed file — this only works while the dev server is running.
            </span>
          )}
        </div>
      )}
      {error ? (
        <p className="text-[11px] font-medium text-amber-700">{error}</p>
      ) : justAdded ? (
        <p className="text-[11px] font-medium text-brand-700">
          ✓ Added {justAdded} — it is on the map above. Add another, or Close when you are done.
        </p>
      ) : (
        <p className="text-[11px] text-slate-500">
          {existingCount} terminal{existingCount === 1 ? '' : 's'} on file · it appears on both panes' maps as soon as
          you add it{org ? ` · address taken from ${org.name}` : ''}
        </p>
      )}
    </section>
  )
}
