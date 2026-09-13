import { useMemo, useRef, useState } from 'react'
import { useRides } from '../context/RideContext'
import { getCurrentGeoPosition } from '../lib/geo'
import { RealLiveMap, type MapPoint } from './RealLiveMap'
import { PH_ADDRESS_TREE } from '../mock/data'
import { LANDMARK_CATEGORY_ICONS } from '../types'
import type { Landmark, LandmarkCategory } from '../types'

const LANDMARK_CATEGORY_LABELS: Record<LandmarkCategory, string> = {
  market: 'Market',
  school: 'School / University',
  church: 'Church',
  gas_station: 'Gas Station',
  hospital: 'Hospital',
  government: 'Government',
  transport: 'Terminal / Transport',
  mall: 'Mall',
  other: 'Other',
}

const NUEVA_ECIJA_CITIES = Object.keys(PH_ADDRESS_TREE['Nueva Ecija'] ?? {})

// A TODA admin's own way to grow the landmark search beyond the seeded set
// (see mock/data.ts) — same tap-the-map placement TerminalQuickPanel uses.
// Existing pins are draggable too (see draggableIds below): a landmark
// dropped a street off, or a seeded one whose real-world position turns out
// slightly wrong, gets nudged into place directly rather than deleted and
// re-added under a new id.
export function LandmarkQuickPanel({ onClose }: { onClose: () => void }) {
  const { landmarks, addLandmark, removeLandmark, setLandmarkGps, updateLandmark } = useRides()
  const [name, setName] = useState('')
  const [aliasesText, setAliasesText] = useState('')
  const [category, setCategory] = useState<LandmarkCategory>('other')
  const [city, setCity] = useState(NUEVA_ECIJA_CITIES[0] ?? '')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [error, setError] = useState('')
  const [locating, setLocating] = useState(false)
  const [justAdded, setJustAdded] = useState('')
  const [justMoved, setJustMoved] = useState('')
  const [justEdited, setJustEdited] = useState('')
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null)
  // Which existing landmark the form above is currently editing — null means
  // the form is for adding a new one instead. A double click (name in the
  // list, or the pin itself) loads its name/category/aliases/coordinates
  // into the same fields the Add flow uses, so there's one form, not two.
  const [editingId, setEditingId] = useState<string | null>(null)
  // A single click, by contrast, only locates a landmark — zooms the map to
  // its pin and scrolls the map into view — without touching the form. Kept
  // separate from editingId so browsing the list doesn't discard whatever
  // the admin is mid-typing in an unrelated Add.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [listFilterText, setListFilterText] = useState('')
  const [listFilterCategory, setListFilterCategory] = useState<LandmarkCategory | 'all'>('all')
  const [listSort, setListSort] = useState<'name-asc' | 'name-desc' | 'category'>('name-asc')
  const mapWrapRef = useRef<HTMLDivElement>(null)
  // Tracks the last click's target + time so a second click on the *same*
  // pin/chip within the window reads as a double click — plain onClick/
  // onDoubleClick both firing on every double click is what a browser
  // already does for a <button>, but the map's marker only ever fires a
  // single 'click' event, so both paths go through this one clock instead
  // of relying on native dblclick.
  const lastClickRef = useRef<{ id: string; time: number } | null>(null)
  const pendingSelectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pending =
    Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && lat.trim() !== '' && lng.trim() !== ''
      ? { lat: Number(lat), lng: Number(lng) }
      : null

  const cityLandmarks = landmarks.filter((l) => l.city === city)

  // The chip list below, narrowed and sorted for actually finding one
  // landmark among what can now be hundreds — the seeded OSM sweep alone
  // puts 150+ in San Jose City. The map itself and the Add/nudge flow above
  // stay driven by the full cityLandmarks list; this filtering is purely
  // about scanning the list, not about what exists.
  const normalizedFilter = listFilterText.trim().toLowerCase()
  const visibleLandmarks = cityLandmarks
    .filter((l) => listFilterCategory === 'all' || l.category === listFilterCategory)
    .filter(
      (l) =>
        !normalizedFilter ||
        l.name.toLowerCase().includes(normalizedFilter) ||
        l.aliases.some((a) => a.toLowerCase().includes(normalizedFilter)),
    )
    .sort((a, b) =>
      listSort === 'name-desc'
        ? b.name.localeCompare(a.name)
        : listSort === 'category'
          ? LANDMARK_CATEGORY_LABELS[a.category].localeCompare(LANDMARK_CATEGORY_LABELS[b.category]) ||
            a.name.localeCompare(b.name)
          : a.name.localeCompare(b.name),
    )

  // Snapshot of which pins the map frames itself on, taken once per city
  // rather than recomputed every render — RealLiveMap re-fits whenever the
  // *set* of framed ids changes, so leaving this reactive to `landmarks`
  // meant placing a pending pin, adding a landmark, or deleting one all
  // yanked the view out from under whatever the admin was just looking at.
  // Frozen here, the map still frames the whole city the moment you switch
  // to it, but stays put through everything you do inside that city after.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const framedLandmarkIds = useMemo(() => cityLandmarks.map((l) => l.id), [city])

  // Selecting (single click) or editing (double click) a landmark zooms the
  // map onto just that one pin instead of the whole city — overrides the
  // frozen city-wide frame above for as long as something is selected/being
  // edited, and reverts to it the moment both are cleared.
  const focusedId = editingId ?? selectedId
  const activeFitPointIds = focusedId ? [focusedId] : framedLandmarkIds

  const mapPoints: MapPoint[] = [
    ...cityLandmarks
      .filter((l) => l.gps)
      .map((l) => {
        const isEditing = l.id === editingId
        // The pin being edited IS the pending position while it's being
        // dragged or typed — a second, separate "new landmark" marker
        // hovering next to the real one would just be confusing for an
        // edit, unlike adding, where there's no existing pin to reuse yet.
        const gps = isEditing && pending ? pending : l.gps
        const color = isEditing ? '#0f766e' : l.id === selectedId ? '#2563eb' : '#7c3aed'
        return { id: l.id, gps, color, label: l.name }
      }),
    ...(pending && !editingId
      ? [{ id: 'new-landmark', gps: pending, color: '#0f766e', label: name.trim() || 'New landmark' }]
      : []),
  ]
  if (mapPoints.length === 0) {
    // CLSU as the fallback anchor — same reasoning as TerminalQuickPanel:
    // RealLiveMap needs at least one point to centre on.
    mapPoints.push({ id: 'anchor', gps: { lat: 15.7312, lng: 120.9298 }, color: '#cbd5e1', label: 'Tap to place' })
  }

  function setFromGps(gps: { lat: number; lng: number }) {
    setLat(gps.lat.toFixed(6))
    setLng(gps.lng.toFixed(6))
    setError('')
  }

  async function useMyGps() {
    setLocating(true)
    setError('')
    try {
      setFromGps(await getCurrentGeoPosition())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read this device location.')
    } finally {
      setLocating(false)
    }
  }

  function scrollToMap() {
    mapWrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function selectLandmark(l: Landmark) {
    setSelectedId(l.id)
    scrollToMap()
  }

  function startEdit(l: Landmark) {
    setSelectedId(null)
    setEditingId(l.id)
    setName(l.name)
    setAliasesText(l.aliases.join(', '))
    setCategory(l.category)
    setLat(l.gps.lat.toFixed(6))
    setLng(l.gps.lng.toFixed(6))
    setError('')
    setJustAdded('')
    setJustMoved('')
    setJustEdited('')
    scrollToMap()
  }

  function cancelEdit() {
    setEditingId(null)
    setName('')
    setAliasesText('')
    setCategory('other')
    setLat('')
    setLng('')
    setError('')
  }

  // Shared by both the list's chip buttons and the map's own pins (see
  // onPointClick below) — a first click selects (locates on the map), and a
  // second click on the *same* landmark within the window promotes that to
  // an edit, the same distinction a real double click makes.
  const DOUBLE_CLICK_WINDOW_MS = 350
  function handleLandmarkInteract(l: Landmark) {
    const now = Date.now()
    const last = lastClickRef.current
    if (last && last.id === l.id && now - last.time < DOUBLE_CLICK_WINDOW_MS) {
      if (pendingSelectTimerRef.current) clearTimeout(pendingSelectTimerRef.current)
      lastClickRef.current = null
      startEdit(l)
      return
    }
    lastClickRef.current = { id: l.id, time: now }
    if (pendingSelectTimerRef.current) clearTimeout(pendingSelectTimerRef.current)
    pendingSelectTimerRef.current = setTimeout(() => {
      selectLandmark(l)
      lastClickRef.current = null
    }, DOUBLE_CLICK_WINDOW_MS)
  }

  function handleSubmit() {
    const latNum = Number(lat)
    const lngNum = Number(lng)
    if (!name.trim()) {
      setError('Give the landmark a name.')
      return
    }
    if (!city) {
      setError('Pick which city this landmark is in.')
      return
    }
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum) || (latNum === 0 && lngNum === 0)) {
      setError('Enter both coordinates, tap the map, or use Use my GPS.')
      return
    }
    const aliases = aliasesText
      .split(',')
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean)
    if (editingId) {
      const existing = landmarks.find((l) => l.id === editingId)
      updateLandmark(editingId, {
        name: name.trim(),
        aliases,
        category,
        city,
        gps: { lat: latNum, lng: lngNum },
        todaOrgId: existing?.todaOrgId ?? null,
      })
      setJustEdited(name.trim())
      setJustAdded('')
      setJustMoved('')
      setEditingId(null)
    } else {
      addLandmark({
        id: `landmark-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: name.trim(),
        aliases,
        category,
        city,
        gps: { lat: latNum, lng: lngNum },
        todaOrgId: null,
      })
      setJustAdded(name.trim())
      setJustMoved('')
      setJustEdited('')
    }
    setName('')
    setAliasesText('')
    setLat('')
    setLng('')
    setError('')
  }

  return (
    <section className="space-y-1.5 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Landmark name"
          className="min-w-[10rem] flex-1 rounded-lg border border-slate-300 px-2 py-1 text-[11px]"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as LandmarkCategory)}
          className="rounded-lg border border-slate-300 px-2 py-1 text-[11px]"
        >
          {(Object.keys(LANDMARK_CATEGORY_LABELS) as LandmarkCategory[]).map((c) => (
            <option key={c} value={c}>
              {LANDMARK_CATEGORY_ICONS[c]} {LANDMARK_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <select
          value={city}
          onChange={(e) => {
            setCity(e.target.value)
            setJustMoved('')
            setJustEdited('')
            setListFilterText('')
            setListFilterCategory('all')
            setSelectedId(null)
            cancelEdit()
          }}
          className="max-w-[12rem] rounded-lg border border-slate-300 px-2 py-1 text-[11px]"
        >
          {NUEVA_ECIJA_CITIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <input
        value={aliasesText}
        onChange={(e) => setAliasesText(e.target.value)}
        placeholder="Aliases, comma-separated (e.g. palengke, pamilihan, public market)"
        className="w-full rounded-lg border border-slate-300 px-2 py-1 text-[11px]"
      />
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
        <button
          type="button"
          onClick={handleSubmit}
          className="rounded-lg bg-brand-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-brand-700"
        >
          {editingId ? 'Save changes' : 'Add'}
        </button>
        {editingId && (
          <button
            type="button"
            onClick={cancelEdit}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel edit
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
        >
          Close
        </button>
      </div>
      <div ref={mapWrapRef} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <p className="border-b border-slate-100 px-2 py-1 text-[11px] text-slate-500">
          {editingId
            ? '📍 Editing — drag the green pin or edit the fields above, then Save changes'
            : pending
              ? '📍 Tap again to move it, or drag the green pin'
              : '📍 Tap the map where the landmark stands'}
          {cityLandmarks.length > 0 &&
            !editingId &&
            (pending ? ' · drag a pin to nudge it' : ' · click a pin to locate it, double-click to edit')}{' '}
          · showing {city}'s landmarks only
        </p>
        <RealLiveMap
          points={mapPoints}
          onMapClick={setFromGps}
          onPointClick={(id) => {
            const l = cityLandmarks.find((x) => x.id === id)
            if (l) handleLandmarkInteract(l)
          }}
          fitPointIds={activeFitPointIds}
          draggableIds={[...cityLandmarks.map((l) => l.id), ...(pending && !editingId ? ['new-landmark'] : [])]}
          onPointDragEnd={(id, gps) => {
            if (id === 'new-landmark' || id === editingId) {
              // Staged, same as typing into the lat/lng fields — committed
              // together with the rest of the edit (or the new landmark's
              // other fields) on Save/Add, not saved on its own.
              setFromGps(gps)
              return
            }
            // Any other pin's drag is a standalone move, not part of an
            // edit in progress — dropping it is the save, dispatch fires
            // immediately, the same way a drag already saves a terminal's
            // position.
            setLandmarkGps(id, gps)
            setJustMoved(cityLandmarks.find((l) => l.id === id)?.name ?? '')
            setJustAdded('')
            setJustEdited('')
          }}
        />
      </div>

      {cityLandmarks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={listFilterText}
            onChange={(e) => setListFilterText(e.target.value)}
            placeholder={`Filter ${city}'s ${cityLandmarks.length} landmarks…`}
            className="min-w-[10rem] flex-1 rounded-lg border border-slate-300 px-2 py-1 text-[11px]"
          />
          <select
            value={listFilterCategory}
            onChange={(e) => setListFilterCategory(e.target.value as LandmarkCategory | 'all')}
            className="rounded-lg border border-slate-300 px-2 py-1 text-[11px]"
          >
            <option value="all">All categories</option>
            {(Object.keys(LANDMARK_CATEGORY_LABELS) as LandmarkCategory[]).map((c) => (
              <option key={c} value={c}>
                {LANDMARK_CATEGORY_ICONS[c]} {LANDMARK_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <select
            value={listSort}
            onChange={(e) => setListSort(e.target.value as typeof listSort)}
            title="Arrange the list below"
            className="rounded-lg border border-slate-300 px-2 py-1 text-[11px]"
          >
            <option value="name-asc">Sort: Name (A–Z)</option>
            <option value="name-desc">Sort: Name (Z–A)</option>
            <option value="category">Sort: Category</option>
          </select>
          {(listFilterText || listFilterCategory !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setListFilterText('')
                setListFilterCategory('all')
              }}
              className="text-[11px] font-medium text-slate-500 underline hover:text-slate-700"
            >
              Clear filter
            </button>
          )}
        </div>
      )}

      {cityLandmarks.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {visibleLandmarks.length === 0 && (
            <p className="text-[11px] text-slate-400">No landmarks match this filter.</p>
          )}
          {visibleLandmarks.map((l) =>
            confirmingRemoveId === l.id ? (
              <span
                key={l.id}
                className="flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800"
              >
                Delete {l.name}?
                <button
                  type="button"
                  onClick={() => {
                    removeLandmark(l.id)
                    setConfirmingRemoveId(null)
                    if (l.id === editingId) cancelEdit()
                    if (l.id === selectedId) setSelectedId(null)
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
                key={l.id}
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
                  l.id === editingId
                    ? 'border-brand-400 bg-brand-50 text-brand-700'
                    : l.id === selectedId
                      ? 'border-blue-300 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleLandmarkInteract(l)}
                  title="Click to locate on the map, double-click to edit its name, category, aliases, or position"
                  className="hover:text-brand-700"
                >
                  {LANDMARK_CATEGORY_ICONS[l.category]} {l.name}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingRemoveId(l.id)}
                  title={`Delete ${l.name}`}
                  aria-label={`Delete ${l.name}`}
                  className="text-slate-400 hover:text-rose-600"
                >
                  ✕
                </button>
              </span>
            ),
          )}
        </div>
      )}

      {error ? (
        <p className="text-[11px] font-medium text-amber-700">{error}</p>
      ) : justAdded ? (
        <p className="text-[11px] font-medium text-brand-700">
          ✓ Added {justAdded} — searchable in {city} right away. Add another, or Close when you are done.
        </p>
      ) : justMoved ? (
        <p className="text-[11px] font-medium text-brand-700">✓ Saved {justMoved}'s new position.</p>
      ) : justEdited ? (
        <p className="text-[11px] font-medium text-brand-700">✓ Saved changes to {justEdited}.</p>
      ) : (
        <p className="text-[11px] text-slate-500">
          {landmarks.length} landmark{landmarks.length === 1 ? '' : 's'} total · {cityLandmarks.length} in {city}
          {visibleLandmarks.length !== cityLandmarks.length && ` · ${visibleLandmarks.length} shown`}
        </p>
      )}
    </section>
  )
}
