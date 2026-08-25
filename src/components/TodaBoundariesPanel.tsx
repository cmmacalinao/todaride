import { useEffect, useRef, useState } from 'react'
import { useRides } from '../context/RideContext'
import { RealLiveMap, type MapPoint } from './RealLiveMap'
import { CLSU_GPS } from '../mock/data'
import { BOUNDARY_KIND_LABELS } from '../types'
import type { BoundaryKind, GeoCoords, MapBoundary } from '../types'

// A TODA's territory drawn as it actually is. The out-of-area fare has only
// ever known a radius around the terminal (todaRadiusKm), which is a circle
// over a place where the boundary follows the highway, the river and the
// barangay line. This is where someone who knows the ground puts that
// boundary in: tap corner to corner, and the closed shape is the area.
//
// Nothing is charged from it yet — the radius still decides the fare. This
// records the real boundary first, which is the part only a local can do.
function areaSquareMeters(points: GeoCoords[]): number {
  if (points.length < 3) return 0
  const lat0 = (points.reduce((sum, p) => sum + p.lat, 0) / points.length) * (Math.PI / 180)
  const mPerDegLat = 111132.92 - 559.82 * Math.cos(2 * lat0) + 1.175 * Math.cos(4 * lat0)
  const mPerDegLng = 111412.84 * Math.cos(lat0) - 93.5 * Math.cos(3 * lat0)
  const xs = points.map((p) => (p.lng - points[0].lng) * mPerDegLng)
  const ys = points.map((p) => (p.lat - points[0].lat) * mPerDegLat)
  let twiceArea = 0
  for (let i = 0; i < points.length; i += 1) {
    const j = (i + 1) % points.length
    twiceArea += xs[i] * ys[j] - xs[j] * ys[i]
  }
  return Math.abs(twiceArea) / 2
}

// Square metres for a street corner, hectares for a barangay, square
// kilometres for a whole town — one unit for every size a TODA can be.
function formatArea(sqm: number): string {
  if (sqm < 10_000) return `${Math.round(sqm).toLocaleString()} m²`
  if (sqm < 1_000_000) return `${(sqm / 10_000).toFixed(2)} ha (${Math.round(sqm).toLocaleString()} m²)`
  return `${(sqm / 1_000_000).toFixed(2)} km² (${Math.round(sqm).toLocaleString()} m²)`
}

export function TodaBoundariesPanel({
  orgs,
  terminals,
  boundaries,
  onSave,
  onDelete,
  onClose,
}: {
  orgs: ReturnType<typeof useRides>['todaOrganizations']
  terminals: ReturnType<typeof useRides>['terminals']
  boundaries: ReturnType<typeof useRides>['boundaries']
  onSave: ReturnType<typeof useRides>['saveBoundary']
  onDelete: ReturnType<typeof useRides>['deleteBoundary']
  onClose: () => void
}) {
  const [orgId, setOrgId] = useState(orgs[0]?.id ?? '')
  const org = orgs.find((o) => o.id === orgId)
  const [kind, setKind] = useState<BoundaryKind>('toda')
  const [name, setName] = useState('')
  const [city, setCity] = useState(orgs[0]?.city ?? '')
  // The boundary being edited, when one was opened from the list; a new
  // drawing until then.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<GeoCoords[]>([])
  const [notice, setNotice] = useState('')
  const mapWrapRef = useRef<HTMLDivElement | null>(null)
  const pendingTapsRef = useRef<number[]>([])

  function switchOrg(nextId: string) {
    setOrgId(nextId)
    setCity(orgs.find((o) => o.id === nextId)?.city ?? city)
    setNotice('')
  }

  // Opening a saved boundary puts its shape back on the map, so a correction
  // is a correction rather than a redraw.
  function edit(b: MapBoundary) {
    setEditingId(b.id)
    setName(b.name)
    setKind(b.kind)
    setCity(b.city)
    if (b.todaOrgId) setOrgId(b.todaOrgId)
    setDraft(b.points)
    setNotice(`Editing "${b.name}" — ${b.points.length} corners.`)
  }

  function startNew() {
    setEditingId(null)
    setName('')
    setDraft([])
    setNotice('')
  }

  const orgTerminals = terminals.filter((t) => t.todaOrgId === orgId && t.gps)
  const points: MapPoint[] = [
    ...orgTerminals.map((t) => ({
      id: t.id,
      gps: t.gps!,
      color: '#1d4ed8',
      label: t.name,
      icon: 'terminal' as const,
    })),
    // Each corner is a pin so it can be seen and counted; the polygon itself
    // is drawn underneath.
    ...draft.map((p, i) => ({
      id: `corner-${i}`,
      gps: p,
      color: '#0f766e',
      label: `Corner ${i + 1}`,
    })),
  ]
  if (points.length === 0) {
    points.push({ id: 'anchor', gps: org?.terminalGps ?? CLSU_GPS, color: '#cbd5e1', label: 'Tap to start' })
  }

  const closed = draft.length >= 3

  // Editing the shape after it is drawn, the way every map editor does it:
  // double-click a corner to drop it, double-click a line to put a new corner
  // in the middle of it. Both are read off the container in the capture phase
  // — Leaflet stops marker events before they reach anything outside, and its
  // own double-click zoom would otherwise fire underneath.
  useEffect(() => {
    const wrap = mapWrapRef.current
    if (!wrap) return

    // Where each corner currently sits on screen, in draft order.
    function cornerPositions() {
      const out: { index: number; x: number; y: number }[] = []
      wrap!.querySelectorAll<HTMLElement>('.leaflet-marker-icon').forEach((icon) => {
        const id = icon.querySelector<HTMLElement>('[data-point-id]')?.dataset.pointId
        if (!id?.startsWith('corner-')) return
        const r = icon.getBoundingClientRect()
        out.push({ index: Number(id.slice('corner-'.length)), x: r.left + r.width / 2, y: r.top + r.height / 2 })
      })
      return out.sort((a, b) => a.index - b.index)
    }

    function onDoubleClick(e: MouseEvent) {
      const corners = cornerPositions()
      if (corners.length === 0) return

      // A corner under the pointer goes.
      // Both taps of this double-click are still waiting to become corners.
      pendingTapsRef.current.forEach((id) => window.clearTimeout(id))
      pendingTapsRef.current = []

      const hit = corners.find((c) => Math.hypot(e.clientX - c.x, e.clientY - c.y) < 26)
      if (hit) {
        e.preventDefault()
        e.stopPropagation()
        setDraft((d) => d.filter((_, i) => i !== hit.index))
        setNotice(`Corner ${hit.index + 1} removed.`)
        return
      }

      // Otherwise: the nearest edge, if the pointer is close enough to it. The
      // new corner lands at the same fraction along the segment in lat/lng as
      // it sits along the line on screen — close enough over a street or two,
      // and it avoids needing the map's own projection.
      if (draft.length < 2) return
      let best: { after: number; t: number; d: number } | null = null
      for (let i = 0; i < corners.length; i += 1) {
        const a = corners[i]
        const b = corners[(i + 1) % corners.length]
        if (!a || !b) continue
        const vx = b.x - a.x
        const vy = b.y - a.y
        const len2 = vx * vx + vy * vy
        if (len2 === 0) continue
        const t = Math.max(0, Math.min(1, ((e.clientX - a.x) * vx + (e.clientY - a.y) * vy) / len2))
        const d = Math.hypot(e.clientX - (a.x + t * vx), e.clientY - (a.y + t * vy))
        if (!best || d < best.d) best = { after: i, t, d }
      }
      if (!best || best.d > 12) return
      e.preventDefault()
      e.stopPropagation()
      const from = draft[best.after]
      const to = draft[(best.after + 1) % draft.length]
      const inserted = {
        lat: from.lat + (to.lat - from.lat) * best.t,
        lng: from.lng + (to.lng - from.lng) * best.t,
      }
      setDraft((d) => [...d.slice(0, best!.after + 1), inserted, ...d.slice(best!.after + 1)])
      setNotice(`Corner added on the line after corner ${best.after + 1}.`)
    }

    wrap.addEventListener('dblclick', onDoubleClick, true)
    return () => wrap.removeEventListener('dblclick', onDoubleClick, true)
  })

  useEffect(
    () => () => {
      pendingTapsRef.current.forEach((id) => window.clearTimeout(id))
    },
    [],
  )

  return (
    <section className="space-y-1.5 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Boundary name — e.g. CLSU Boundary"
          className="min-w-[11rem] flex-1 rounded-lg border border-slate-300 px-2 py-1 text-[11px]"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as BoundaryKind)}
          className="rounded-lg border border-slate-300 px-2 py-1 text-[11px]"
        >
          {(Object.keys(BOUNDARY_KIND_LABELS) as BoundaryKind[]).map((k) => (
            <option key={k} value={k}>
              {BOUNDARY_KIND_LABELS[k]}
            </option>
          ))}
        </select>
        {kind === 'toda' ? (
          <select
            value={orgId}
            onChange={(e) => switchOrg(e.target.value)}
            className="max-w-[12rem] rounded-lg border border-slate-300 px-2 py-1 text-[11px]"
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City / municipality"
            className="w-40 rounded-lg border border-slate-300 px-2 py-1 text-[11px]"
          />
        )}
        <button
          type="button"
          disabled={draft.length === 0}
          onClick={() => setDraft((d) => d.slice(0, -1))}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          ↶ Undo corner
        </button>
        <button
          type="button"
          disabled={draft.length === 0}
          onClick={() => setDraft([])}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          ✕ Clear
        </button>
        <button
          type="button"
          onClick={() => {
            if (draft.length < 3) {
              setNotice('An area needs at least three corners.')
              return
            }
            if (!name.trim()) {
              setNotice('Give this boundary a name — e.g. "CLSU Boundary" or "Muñoz City Proper".')
              return
            }
            const id = editingId ?? `boundary-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
            onSave({
              id,
              name: name.trim(),
              kind,
              todaOrgId: kind === 'toda' ? (org?.id ?? null) : null,
              city: kind === 'toda' ? (org?.city ?? city) : city,
              points: draft,
              source: null,
            })
            setEditingId(id)
            setNotice(
              `Saved "${name.trim()}" — ${draft.length} corners covering ${formatArea(areaSquareMeters(draft))}.`,
            )
          }}
          className="rounded-lg bg-brand-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-brand-700"
        >
          Save boundary
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
        >
          Close
        </button>
      </div>

      {boundaries.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {boundaries.map((b) => (
            <span
              key={b.id}
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
                editingId === b.id ? 'border-brand-400 bg-brand-100 text-brand-800' : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              <button type="button" onClick={() => edit(b)} className="hover:text-brand-700">
                {b.kind === 'city_proper' ? '🏙️' : '🛺'} {b.name}
                <span className="text-slate-400"> · {formatArea(areaSquareMeters(b.points))}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete(b.id)
                  if (editingId === b.id) startNew()
                }}
                title={`Delete ${b.name}`}
                aria-label={`Delete ${b.name}`}
                className="text-slate-400 hover:text-rose-600"
              >
                ✕
              </button>
            </span>
          ))}
          {editingId && (
            <button
              type="button"
              onClick={startNew}
              className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
            >
              + Draw a new one
            </button>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white" ref={mapWrapRef}>
        <p className="border-b border-slate-100 px-2 py-1 text-[11px] text-slate-500">
          {draft.length === 0
            ? '🗺️ Tap each corner of the boundary, going around the edge'
            : closed
              ? `🗺️ ${draft.length} corners · ${formatArea(areaSquareMeters(draft))} — keep tapping to add more, then Save boundary`
              : `🗺️ ${draft.length} of 3 corners — an area needs at least three`}
          {closed && ' · drag a corner to move it, double-click a line to add one, a corner to remove it'}
          {orgTerminals.length > 0 && ' · 🚏 are this TODA’s terminals'}
        </p>
        <RealLiveMap
          points={points}
          areas={[
            ...boundaries
              .filter((b) => b.id !== editingId && b.points.length >= 3)
              .map((b) => ({
                id: b.id,
                points: b.points,
                color: b.kind === 'city_proper' ? '#b45309' : '#64748b',
                label: `${b.name} · ${BOUNDARY_KIND_LABELS[b.kind]}`,
              })),
            ...(closed
              ? [{ id: 'draft', points: draft, color: '#0f766e', label: name.trim() || 'New boundary' }]
              : []),
          ]}
          routeLine={draft.length === 2 ? draft : undefined}
          draggableIds={draft.map((_, i) => `corner-${i}`)}
          onPointDragEnd={(id, gps) => {
            if (!id.startsWith('corner-')) return
            const index = Number(id.slice('corner-'.length))
            setDraft((d) => d.map((p, i) => (i === index ? gps : p)))
            setNotice(`Corner ${index + 1} moved.`)
          }}
          onMapClick={(gps) => {
            const id = window.setTimeout(() => {
              pendingTapsRef.current = pendingTapsRef.current.filter((t) => t !== id)
              setDraft((d) => [...d, gps])
              setNotice('')
            }, 260)
            pendingTapsRef.current.push(id)
          }}
        />
      </div>

      {notice ? (
        <p className="text-[11px] font-medium text-brand-700">{notice}</p>
      ) : (
        <p className="text-[11px] text-slate-500">
          The boundary is a record of the real area for now — dispatch and the out-of-area fare still measure from the
          terminal radius in Settings &amp; Fees.
        </p>
      )}
    </section>
  )
}
