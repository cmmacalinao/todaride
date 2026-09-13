import { useMemo, useState } from 'react'
import { useRides } from '../context/RideContext'
import { getCurrentGeoPosition } from '../lib/geo'
import { RealLiveMap, type MapPoint } from './RealLiveMap'
import { PH_ADDRESS_TREE } from '../mock/data'
import { LANDMARK_CATEGORY_ICONS } from '../types'
import type { LandmarkCategory } from '../types'

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
  const { landmarks, addLandmark, removeLandmark, setLandmarkGps } = useRides()
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
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null)

  const pending =
    Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && lat.trim() !== '' && lng.trim() !== ''
      ? { lat: Number(lat), lng: Number(lng) }
      : null

  const cityLandmarks = landmarks.filter((l) => l.city === city)

  // Snapshot of which pins the map frames itself on, taken once per city
  // rather than recomputed every render — RealLiveMap re-fits whenever the
  // *set* of framed ids changes, so leaving this reactive to `landmarks`
  // meant placing a pending pin, adding a landmark, or deleting one all
  // yanked the view out from under whatever the admin was just looking at.
  // Frozen here, the map still frames the whole city the moment you switch
  // to it, but stays put through everything you do inside that city after.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const framedLandmarkIds = useMemo(() => cityLandmarks.map((l) => l.id), [city])

  const mapPoints: MapPoint[] = [
    ...cityLandmarks
      .filter((l) => l.gps)
      .map((l) => ({ id: l.id, gps: l.gps, color: '#7c3aed', label: l.name })),
    ...(pending ? [{ id: 'new-landmark', gps: pending, color: '#0f766e', label: name.trim() || 'New landmark' }] : []),
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

  function handleAdd() {
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
    addLandmark({
      id: `landmark-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      aliases: aliasesText
        .split(',')
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean),
      category,
      city,
      gps: { lat: latNum, lng: lngNum },
      todaOrgId: null,
    })
    setJustAdded(name.trim())
    setJustMoved('')
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
          {pending ? '📍 Tap again to move it, or drag the green pin' : '📍 Tap the map where the landmark stands'}
          {cityLandmarks.length > 0 && ' · drag a pin to nudge it'} · showing {city}'s landmarks only
        </p>
        <RealLiveMap
          points={mapPoints}
          onMapClick={setFromGps}
          fitPointIds={framedLandmarkIds}
          draggableIds={[...cityLandmarks.map((l) => l.id), ...(pending ? ['new-landmark'] : [])]}
          onPointDragEnd={(id, gps) => {
            if (id === 'new-landmark') {
              setFromGps(gps)
              return
            }
            // Dropping the pin is the save — dispatch fires immediately, the
            // same way a drag already saves a terminal's position, so there
            // is nothing further for the admin to click.
            setLandmarkGps(id, gps)
            setJustMoved(cityLandmarks.find((l) => l.id === id)?.name ?? '')
            setJustAdded('')
          }}
        />
      </div>

      {cityLandmarks.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {cityLandmarks.map((l) =>
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
                className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600"
              >
                <button
                  type="button"
                  onClick={() => setFromGps(l.gps)}
                  title="Copy this landmark's coordinates into the fields above"
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
      ) : (
        <p className="text-[11px] text-slate-500">
          {landmarks.length} landmark{landmarks.length === 1 ? '' : 's'} total · {cityLandmarks.length} in {city}
        </p>
      )}
    </section>
  )
}
