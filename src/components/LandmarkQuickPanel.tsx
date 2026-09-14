import { useEffect, useMemo, useRef, useState } from 'react'
import { useRides } from '../context/RideContext'
import { getCurrentGeoPosition } from '../lib/geo'
import { RealLiveMap, type MapPoint } from './RealLiveMap'
import { DestinationSearch } from './DestinationSearch'
import { PH_ADDRESS_TREE } from '../mock/data'
import { LANDMARK_CATEGORY_ICONS } from '../types'
import type { GeoCoords, Landmark, LandmarkCategory } from '../types'

const LANDMARK_CATEGORY_LABELS: Record<LandmarkCategory, string> = {
  market: 'Market',
  school: 'School / University',
  church: 'Church',
  gas_station: 'Gas Station',
  hospital: 'Hospital',
  government: 'Government',
  transport: 'Terminal / Transport',
  mall: 'Mall',
  street: 'Street',
  other: 'Other',
}

const NUEVA_ECIJA_CITIES = Object.keys(PH_ADDRESS_TREE['Nueva Ecija'] ?? {})

// The map's own toolbar row, next to Legend — one line of controls for
// whatever the admin is working on, reachable without scrolling down to the
// form below the map (which is out of reach entirely in full screen). The
// row is always on screen; a control is greyed out until it applies, so
// nothing ever moves around as the selection changes.
//
// The first button is one button for two jobs: "➕ Add name" while a new pin
// is pending (tapped on the map or typed as coordinates), "✏️ Rename" once
// an existing landmark is selected. Both open a small inline text field
// right in this row rather than a native window.prompt() — Capacitor's
// WebView (this app ships through it) blocks prompt/alert/confirm outright
// on most Android builds, so a button built on prompt() silently does
// nothing there.
//
// A drag only stages the pin's new spot (see stagedMove in the panel); 💾
// lights up gold until it is tapped. ↩️ beside Delete is the one way back:
// it discards a pending new pin, drops an unsaved drag, or — once saved —
// puts the pin back where it was.
//
// The key at the call site remounts this fresh whenever the pending pin or
// the selected landmark changes, which is what resets the draft below
// instead of a manual effect.
function LandmarkQuickActions({
  landmark,
  pendingNew,
  newName,
  newCategory,
  stagedGps,
  undoMove,
  confirmingDelete,
  onAddNew,
  onDiscardNew,
  onNewCategoryChange,
  onRename,
  onCategoryChange,
  onSaveMove,
  onUndoMove,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
}: {
  landmark: Landmark | null
  // A new pin is waiting to be named — the first button reads Add name.
  pendingNew: boolean
  // The form's name/category fields, shared with the new pin so whichever
  // place the admin types in wins.
  newName: string
  newCategory: LandmarkCategory
  // Where the selected pin was dropped and not yet saved — turns 💾 gold.
  stagedGps: GeoCoords | null
  // The last SAVED move that can still be put back (any landmark, not only
  // the selected one).
  undoMove: { id: string; name: string } | null
  confirmingDelete: boolean
  onAddNew: (name: string) => void
  onDiscardNew: () => void
  onNewCategoryChange: (category: LandmarkCategory) => void
  onRename: (l: Landmark, newName: string) => void
  onCategoryChange: (l: Landmark, category: LandmarkCategory) => void
  onSaveMove: (l: Landmark) => void
  onUndoMove: () => void
  onDeleteRequest: (l: Landmark) => void
  onDeleteConfirm: (l: Landmark) => void
  onDeleteCancel: () => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  if (landmark && !pendingNew && confirmingDelete) {
    return (
      <span className="flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
        Delete {landmark.name}?
        <button
          type="button"
          onClick={() => onDeleteConfirm(landmark)}
          className="rounded bg-amber-600 px-1.5 font-semibold text-white hover:bg-amber-700"
        >
          Yes
        </button>
        <button type="button" onClick={onDeleteCancel} className="font-medium text-slate-600 hover:text-slate-800">
          No
        </button>
      </span>
    )
  }
  // The inline name box, for a new pin and for a rename alike.
  const commitDraft = () => {
    if (draft === null || !draft.trim()) return
    if (pendingNew) onAddNew(draft.trim())
    else if (landmark) onRename(landmark, draft.trim())
    setDraft(null)
  }
  if (draft !== null && (pendingNew || landmark)) {
    return (
      <span
        className={`flex items-center gap-1 rounded-md border bg-white px-1.5 py-1 ${pendingNew ? 'border-teal-300' : 'border-slate-300'}`}
      >
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Landmark name"
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitDraft()
            else if (e.key === 'Escape') setDraft(null)
          }}
          className="w-36 rounded border border-slate-300 px-1.5 py-0.5 text-[11px]"
        />
        <button
          type="button"
          disabled={!draft.trim()}
          onClick={commitDraft}
          className={`rounded px-1.5 py-0.5 text-[11px] font-semibold text-white disabled:opacity-40 ${pendingNew ? 'bg-teal-700' : 'bg-brand-600'}`}
        >
          {pendingNew ? 'Add' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => setDraft(null)}
          className="text-[11px] font-medium text-slate-500 hover:text-slate-700"
        >
          ✕
        </button>
      </span>
    )
  }
  const nameIdle = !pendingNew && !landmark
  const editIdle = pendingNew || !landmark
  const plainBtn =
    'rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40'
  const canUndo = pendingNew || !!stagedGps || !!undoMove
  const undoTitle = pendingNew
    ? 'Discard the new pin'
    : stagedGps
      ? 'Put the pin back — discard the unsaved move'
      : undoMove
        ? `Undo moving ${undoMove.name} — put it back where it was`
        : 'Nothing to undo yet'
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={nameIdle}
        onClick={() => setDraft(pendingNew ? newName : (landmark?.name ?? ''))}
        title={
          pendingNew ? 'Name this new landmark and add it' : landmark ? `Rename ${landmark.name}` : 'Tap the map or select a pin first'
        }
        className={
          pendingNew
            ? 'rounded-md border border-teal-300 bg-teal-50 px-2 py-1 text-[11px] font-semibold text-teal-800 transition hover:bg-teal-100'
            : plainBtn
        }
      >
        {pendingNew ? '➕ Add name' : '✏️ Rename'}
      </button>
      {/* The form's own category picker, right here beside the pin. For a
          new pin it sets what Add name will file it under; for a selected
          landmark a change applies at once — a select is one deliberate
          tap already, unlike a drag that can happen by accident. */}
      <select
        disabled={nameIdle}
        value={pendingNew ? newCategory : (landmark?.category ?? 'other')}
        onChange={(e) => {
          const next = e.target.value as LandmarkCategory
          if (pendingNew) onNewCategoryChange(next)
          else if (landmark) onCategoryChange(landmark, next)
        }}
        title={pendingNew ? 'Category of the new landmark' : landmark ? `Category of ${landmark.name}` : 'Tap the map or select a pin first'}
        aria-label={pendingNew ? 'Category of the new landmark' : landmark ? `Category of ${landmark.name}` : 'Category'}
        className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-[11px] font-semibold text-slate-600 disabled:opacity-40"
      >
        {(Object.keys(LANDMARK_CATEGORY_LABELS) as LandmarkCategory[]).map((c) => (
          <option key={c} value={c}>
            {LANDMARK_CATEGORY_ICONS[c]} {LANDMARK_CATEGORY_LABELS[c]}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={editIdle || !stagedGps}
        onClick={() => landmark && onSaveMove(landmark)}
        aria-label={landmark && stagedGps ? `Save ${landmark.name}'s new position` : 'Save position'}
        title={landmark && stagedGps ? `Save ${landmark.name}'s new position` : 'Drag a pin first — then tap to save where it lands'}
        className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition disabled:opacity-40 ${
          !editIdle && stagedGps
            ? 'border-gold-400 bg-gold-400 text-navy-900 shadow-sm hover:bg-gold-400/80'
            : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
        }`}
      >
        💾
      </button>
      <button
        type="button"
        disabled={editIdle}
        onClick={() => landmark && onDeleteRequest(landmark)}
        title={!editIdle && landmark ? `Delete ${landmark.name}` : 'Select a pin first'}
        className="rounded-md border border-rose-300 bg-white px-2 py-1 text-[11px] font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-40"
      >
        🗑️ Delete
      </button>
      <button
        type="button"
        disabled={!canUndo}
        onClick={pendingNew ? onDiscardNew : onUndoMove}
        aria-label={undoTitle}
        title={undoTitle}
        className={plainBtn}
      >
        ↩️
      </button>
    </div>
  )
}

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
  // Full screen gets its own quick-action row (Rename/Save/Delete/Undo —
  // see toolbarAction below), since the whole form above is out of view
  // there. isFullscreen tracks RealLiveMap's own fullscreen toggle so that
  // row only shows up where the rest of the form is genuinely unreachable —
  // the same three actions already live in the form for the normal view.
  const [isFullscreen, setIsFullscreen] = useState(false)
  // Dragging an existing pin stages the move: the pin shows at the new spot
  // and the map row's 💾 turns gold until it is tapped (the admin's choice —
  // a drop by itself is too easy to do by accident on a phone). One staged
  // move at a time: dragging another pin selects that one and lets the
  // earlier, unsaved drag snap back.
  const [stagedMove, setStagedMove] = useState<{ id: string; gps: GeoCoords } | null>(null)
  // The last move that was actually saved — where that pin was before — so
  // ↩️ Undo (beside Delete) can put it straight back even after 💾. Only the
  // latest is kept: one wrong drag is the case that happens, not a chain.
  const [lastMove, setLastMove] = useState<{ id: string; name: string; from: GeoCoords } | null>(null)
  const [listFilterText, setListFilterText] = useState('')
  const [listFilterCategory, setListFilterCategory] = useState<LandmarkCategory | 'all'>('all')
  const [listSort, setListSort] = useState<'name-asc' | 'name-desc' | 'category'>('name-asc')
  // Full screen hides the filterable list below the map entirely, so it
  // gets its own small find-by-name box in the toolbar instead (see
  // mapSearchMatches and the toolbarAction JSX below).
  const [mapSearchText, setMapSearchText] = useState('')
  const mapWrapRef = useRef<HTMLDivElement>(null)
  // Tracks the last click's target + time so a second click on the *same*
  // pin/chip within the window reads as a double click — plain onClick/
  // onDoubleClick both firing on every double click is what a browser
  // already does for a <button>, but the map's marker only ever fires a
  // single 'click' event, so both paths go through this one clock instead
  // of relying on native dblclick.
  const lastClickRef = useRef<{ id: string; time: number } | null>(null)
  const pendingSelectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Deleting the selected/edited landmark clears selectedId/editingId, which
  // would otherwise fall back to framing every landmark in the city again —
  // a jarring zoom-out right when the admin just meant to remove one pin.
  // Set true by every delete confirm just before that clear, this holds the
  // map on whatever frame was already on screen for the one render that
  // follows, then resets itself (see the effect near the bottom of the
  // component) so a later, deliberate deselection still reverts normally.
  const suppressRefitOnClearRef = useRef(false)
  // Consumes the flag above exactly once, right after the render that used
  // it as the holdFit prop — so a later, deliberate deselection (Cancel
  // edit, clicking elsewhere) still re-frames the whole city as normal.
  useEffect(() => {
    suppressRefitOnClearRef.current = false
  })

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

  // Full screen has no room for the filterable chip list below the map, so
  // typing here is the only way to find one of a city's (100+) landmarks
  // without leaving full screen. Capped at 8 so the dropdown never outgrows
  // the screen it is floating over.
  const normalizedMapSearch = mapSearchText.trim().toLowerCase()
  const mapSearchMatches = normalizedMapSearch
    ? cityLandmarks
        .filter(
          (l) =>
            l.name.toLowerCase().includes(normalizedMapSearch) ||
            l.aliases.some((a) => a.toLowerCase().includes(normalizedMapSearch)),
        )
        .slice(0, 8)
    : []

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
        const isSelected = l.id === selectedId
        // The pin being edited IS the pending position while it's being
        // dragged or typed — a second, separate "new landmark" marker
        // hovering next to the real one would just be confusing for an
        // edit, unlike adding, where there's no existing pin to reuse yet.
        // A staged drag shows the pin where it was dropped, the same way an
        // edit's pending position does — the saved coordinate only changes
        // once 💾 is tapped.
        const gps = isEditing && pending ? pending : stagedMove?.id === l.id ? stagedMove.gps : l.gps
        const color = isEditing ? '#0f766e' : isSelected ? '#2563eb' : '#7c3aed'
        // Category alongside the name — the dot's colour is the same purple
        // for every landmark (unlike a trip map's tricycle/pickup/dropoff
        // colour coding), so the key needs the category spelled out to mean
        // anything at this scale (300+ entries in San Jose City alone).
        return { id: l.id, gps, color, label: `${l.name} · ${LANDMARK_CATEGORY_LABELS[l.category]}` }
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

  // Only a click from the list scrolls the map into view — a click on the
  // map's own pin means the admin is already looking at the map, and
  // scrolling anywhere from there was the reported bug (it moved the page
  // toward the list, the opposite of the point of tapping a pin).
  function selectLandmark(l: Landmark, source: 'list' | 'map') {
    setSelectedId(l.id)
    // Moving on to another pin lets an unsaved drag of the previous one
    // snap back — one staged move at a time, and 💾 always refers to the
    // selected pin.
    if (stagedMove && stagedMove.id !== l.id) setStagedMove(null)
    if (source === 'list') scrollToMap()
  }

  function startEdit(l: Landmark, source: 'list' | 'map') {
    setSelectedId(null)
    setStagedMove(null)
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
    setConfirmingRemoveId(null)
    if (source === 'list') scrollToMap()
  }

  function cancelEdit() {
    setEditingId(null)
    setName('')
    setAliasesText('')
    setCategory('other')
    setLat('')
    setLng('')
    setError('')
    setConfirmingRemoveId(null)
  }

  // Shared by the form's own city <select> and the floating one full screen
  // offers next to the zoom buttons (see cityPicker below) — switching city
  // clears everything scoped to the one being left behind.
  function changeCity(next: string) {
    setCity(next)
    setJustMoved('')
    setJustEdited('')
    setListFilterText('')
    setListFilterCategory('all')
    setMapSearchText('')
    setSelectedId(null)
    setStagedMove(null)
    cancelEdit()
  }

  // Shared by both the list's chip buttons and the map's own pins (see
  // onPointClick below) — a first click selects (locates on the map), and a
  // second click on the *same* landmark within the window promotes that to
  // an edit, the same distinction a real double click makes.
  const DOUBLE_CLICK_WINDOW_MS = 350
  function handleLandmarkInteract(l: Landmark, source: 'list' | 'map') {
    const now = Date.now()
    const last = lastClickRef.current
    if (last && last.id === l.id && now - last.time < DOUBLE_CLICK_WINDOW_MS) {
      if (pendingSelectTimerRef.current) clearTimeout(pendingSelectTimerRef.current)
      lastClickRef.current = null
      startEdit(l, source)
      return
    }
    lastClickRef.current = { id: l.id, time: now }
    if (pendingSelectTimerRef.current) clearTimeout(pendingSelectTimerRef.current)
    pendingSelectTimerRef.current = setTimeout(() => {
      selectLandmark(l, source)
      lastClickRef.current = null
    }, DOUBLE_CLICK_WINDOW_MS)
  }

  // nameOverride: the map row's own Add name box (NewLandmarkQuickActions)
  // hands its text straight in rather than round-tripping through the form's
  // name state, which would not have updated yet within the same event.
  function handleSubmit(nameOverride?: string) {
    const nameText = (nameOverride ?? name).trim()
    const latNum = Number(lat)
    const lngNum = Number(lng)
    if (!nameText) {
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
        name: nameText,
        aliases,
        category,
        city,
        gps: { lat: latNum, lng: lngNum },
        todaOrgId: existing?.todaOrgId ?? null,
      })
      setJustEdited(nameText)
      setJustAdded('')
      setJustMoved('')
      setEditingId(null)
    } else {
      addLandmark({
        id: `landmark-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: nameText,
        aliases,
        category,
        city,
        gps: { lat: latNum, lng: lngNum },
        todaOrgId: null,
      })
      setJustAdded(nameText)
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
          onChange={(e) => changeCity(e.target.value)}
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
          onClick={() => handleSubmit()}
          className="rounded-lg bg-brand-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-brand-700"
        >
          {editingId ? 'Save changes' : 'Add'}
        </button>
        {pending && !editingId && (
          <button
            type="button"
            onClick={() => {
              setName('')
              setAliasesText('')
              setLat('')
              setLng('')
              setError('')
            }}
            title="Discard the pending new landmark's pin"
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
          >
            ✕ Clear new landmark
          </button>
        )}
        {editingId && (
          <button
            type="button"
            onClick={cancelEdit}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel edit
          </button>
        )}
        {editingId &&
          (confirmingRemoveId === editingId ? (
            <span className="flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
              Delete {name || 'this landmark'}?
              <button
                type="button"
                onClick={() => {
                  suppressRefitOnClearRef.current = true
                  const id = editingId
                  removeLandmark(id)
                  setConfirmingRemoveId(null)
                  cancelEdit()
                  if (id === selectedId) setSelectedId(null)
                }}
                className="rounded-md bg-amber-600 px-1.5 font-semibold text-white hover:bg-amber-700"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setConfirmingRemoveId(null)}
                className="font-medium text-slate-600 hover:text-slate-800"
              >
                No
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingRemoveId(editingId)}
              title={`Delete ${name}`}
              className="rounded-lg border border-rose-300 bg-white px-2 py-1 text-[11px] font-medium text-rose-600 hover:bg-rose-50"
            >
              Delete
            </button>
          ))}
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
        >
          Close
        </button>
      </div>
      <div ref={mapWrapRef} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {!editingId && (
          <p className="border-b border-slate-100 px-2 py-1 text-[11px] text-slate-500">
            {pending ? '📍 Tap again to move it, or drag the green pin' : '📍 Tap the map where the landmark stands'}
            {cityLandmarks.length > 0 &&
              (pending ? ' · drag a pin to nudge it' : ' · click a pin to locate it, double-click to edit')}{' '}
            · showing {city}'s landmarks only
          </p>
        )}
        <RealLiveMap
          points={mapPoints}
          onMapClick={setFromGps}
          legendOverride={[
            { color: '#7c3aed', label: 'Landmark' },
            { color: '#2563eb', label: 'Selected' },
            { color: '#0f766e', label: 'Editing / new' },
          ]}
          cityPicker={
            <select
              value={city}
              onChange={(e) => changeCity(e.target.value)}
              title="Switch city"
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-sm"
            >
              {NUEVA_ECIJA_CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          }
          onPointClick={(id) => {
            if (id === 'new-landmark') {
              // Tapping the pending pin itself discards it — the same
              // outcome as the Clear new landmark button, reachable without
              // scrolling back up to the form.
              setName('')
              setAliasesText('')
              setLat('')
              setLng('')
              setError('')
              return
            }
            const l = cityLandmarks.find((x) => x.id === id)
            if (l) handleLandmarkInteract(l, 'map')
          }}
          onFullscreenChange={setIsFullscreen}
          toolbarAction={
            <>
                {/* Same Find Barangay box the booking maps carry beside
                    Legend. Every barangay is itself a seeded landmark
                    (landmark-brgy-*), so picking one just selects that pin
                    — the map zooms there and the admin can drop or nudge
                    landmarks around it without hunting across the city. */}
                <DestinationSearch
                  city={city}
                  onSelect={(place) => {
                    const match = cityLandmarks.find(
                      (l) =>
                        l.id.startsWith('landmark-brgy-') &&
                        l.gps.lat === place.gps.lat &&
                        l.gps.lng === place.gps.lng,
                    )
                    if (match) selectLandmark(match, 'map')
                  }}
                  barangayOnly
                  placeholder="🔍 Find Barangay"
                  className="relative z-[80] w-32 sm:w-40"
                  resultsClassName="absolute left-0 top-full mt-1 w-64 max-h-56 overflow-y-auto"
                  inputClassName="w-full rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-600 placeholder:font-normal"
                />
                {/* One row for whatever is in hand: a pending new pin takes
                    the first button (Add name) and the category picker;
                    otherwise they belong to the selected landmark. */}
                <LandmarkQuickActions
                    key={pending && !editingId ? `new:${pending.lat},${pending.lng}` : (selectedId ?? "none")}
                    landmark={cityLandmarks.find((l) => l.id === selectedId) ?? null}
                    pendingNew={!!pending && !editingId}
                    newName={name}
                    newCategory={category}
                    onAddNew={(n) => handleSubmit(n)}
                    onDiscardNew={() => {
                      setName('')
                      setAliasesText('')
                      setLat('')
                      setLng('')
                      setError('')
                    }}
                    onNewCategoryChange={setCategory}
                    stagedGps={stagedMove?.id === selectedId ? stagedMove.gps : null}
                    undoMove={lastMove}
                    confirmingDelete={confirmingRemoveId === selectedId}
                    onRename={(l, nextName) => {
                      // A rename commits a staged drag along with it — the
                      // admin is clearly done with this pin.
                      const staged = stagedMove?.id === l.id ? stagedMove.gps : null
                      if (staged && l.gps) setLastMove({ id: l.id, name: nextName, from: l.gps })
                      updateLandmark(l.id, {
                        name: nextName,
                        aliases: l.aliases,
                        category: l.category,
                        city: l.city,
                        gps: staged ?? l.gps,
                        todaOrgId: l.todaOrgId,
                      })
                      if (staged) setStagedMove(null)
                      setJustEdited(nextName)
                      setJustAdded('')
                      setJustMoved('')
                    }}
                    onCategoryChange={(l, nextCategory) => {
                      // Carries a staged drag along, the same as Rename —
                      // the admin is clearly finishing this pin.
                      const staged = stagedMove?.id === l.id ? stagedMove.gps : null
                      if (staged && l.gps) setLastMove({ id: l.id, name: l.name, from: l.gps })
                      updateLandmark(l.id, {
                        name: l.name,
                        aliases: l.aliases,
                        category: nextCategory,
                        city: l.city,
                        gps: staged ?? l.gps,
                        todaOrgId: l.todaOrgId,
                      })
                      if (staged) setStagedMove(null)
                      setJustEdited(l.name)
                      setJustAdded('')
                      setJustMoved('')
                    }}
                    onSaveMove={(l) => {
                      if (stagedMove?.id !== l.id) return
                      if (l.gps) setLastMove({ id: l.id, name: l.name, from: l.gps })
                      setLandmarkGps(l.id, stagedMove.gps)
                      setStagedMove(null)
                      setJustMoved(l.name)
                      setJustAdded('')
                      setJustEdited('')
                    }}
                    onUndoMove={() => {
                      // A staged (unsaved) drag is simply dropped — the pin
                      // snaps back. Otherwise the last SAVED move is reverted.
                      if (stagedMove) {
                        setStagedMove(null)
                        return
                      }
                      if (!lastMove) return
                      setLandmarkGps(lastMove.id, lastMove.from)
                      setLastMove(null)
                      setJustMoved('')
                      setJustAdded('')
                      setJustEdited('')
                    }}
                    onDeleteRequest={(l) => setConfirmingRemoveId(l.id)}
                    onDeleteConfirm={(l) => {
                      suppressRefitOnClearRef.current = true
                      removeLandmark(l.id)
                      setConfirmingRemoveId(null)
                      setSelectedId(null)
                      if (stagedMove?.id === l.id) setStagedMove(null)
                      if (lastMove?.id === l.id) setLastMove(null)
                    }}
                    onDeleteCancel={() => setConfirmingRemoveId(null)}
                  />
                {isFullscreen && (
                  <div className="relative z-[80]">
                    <input
                      value={mapSearchText}
                      onChange={(e) => setMapSearchText(e.target.value)}
                      placeholder="🔍 Find a landmark"
                      className="w-28 rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-600 placeholder:font-normal sm:w-40"
                    />
                    {normalizedMapSearch && (
                      <div className="absolute right-0 top-full mt-1 max-h-56 w-56 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                        {mapSearchMatches.length === 0 ? (
                          <p className="px-2 py-1.5 text-[11px] text-slate-400">No matches.</p>
                        ) : (
                          mapSearchMatches.map((l) => (
                            <button
                              key={l.id}
                              type="button"
                              onClick={() => {
                                selectLandmark(l, 'map')
                                setMapSearchText('')
                              }}
                              className="block w-full truncate px-2 py-1.5 text-left text-[11px] text-slate-600 hover:bg-brand-50"
                            >
                              {LANDMARK_CATEGORY_ICONS[l.category]} {l.name}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
            </>
          }
          fitPointIds={activeFitPointIds}
          holdFit={suppressRefitOnClearRef.current}
          singlePointZoom={18}
          draggableIds={[...cityLandmarks.map((l) => l.id), ...(pending && !editingId ? ['new-landmark'] : [])]}
          onPointDragEnd={(id, gps) => {
            if (id === 'new-landmark' || id === editingId) {
              // Staged, same as typing into the lat/lng fields — committed
              // together with the rest of the edit (or the new landmark's
              // other fields) on Save/Add, not saved on its own.
              setFromGps(gps)
              return
            }
            // Any existing pin's drag selects that pin and stages the move
            // for the map row's 💾 (see stagedMove) — nothing is saved yet.
            setSelectedId(id)
            setStagedMove({ id, gps })
            setConfirmingRemoveId(null)
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
                    suppressRefitOnClearRef.current = true
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
                  onClick={() => handleLandmarkInteract(l, 'list')}
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
