import { useMemo, useState } from 'react'
import { useRides } from '../context/RideContext'
import { PH_PROVINCES, getCitiesForProvince } from '../mock/data'
import type { HotlineCategory } from '../types'

const CATEGORIES: { value: HotlineCategory; label: string }[] = [
  { value: 'police', label: '🚓 Police' },
  { value: 'fire', label: '🚒 Fire' },
  { value: 'medical', label: '🚑 Medical' },
  { value: 'rescue', label: '🆘 Rescue' },
  { value: 'disaster', label: '🌊 Disaster / DRRMO' },
  { value: 'toda', label: '🛺 TODA' },
  { value: 'other', label: '📞 Other' },
]

// App Admin's editor for the real emergency numbers riders and drivers see.
// Kept separate from the read-only EmergencyHotlines list because the two
// audiences want opposite things: a rider wants only their own locality's
// numbers, big and dialable; the admin needs to browse and correct every
// locality's entries.
export function HotlineManager() {
  const { emergencyHotlines, addEmergencyHotline, updateEmergencyHotline, removeEmergencyHotline } = useRides()
  const [query, setQuery] = useState('')
  const [showForm, setShowForm] = useState(false)

  const [name, setName] = useState('')
  const [number, setNumber] = useState('')
  const [category, setCategory] = useState<HotlineCategory>('police')
  const [province, setProvince] = useState('')
  const [city, setCity] = useState('')
  const [source, setSource] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  const cities = province ? getCitiesForProvince(province) : []

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return emergencyHotlines
    return emergencyHotlines.filter(
      (h) =>
        h.name.toLowerCase().includes(q) ||
        h.number.toLowerCase().includes(q) ||
        (h.city ?? '').toLowerCase().includes(q) ||
        (h.province ?? '').toLowerCase().includes(q),
    )
  }, [emergencyHotlines, query])

  function handleAdd() {
    if (!name.trim() || !number.trim()) {
      setError('Name and number are both required.')
      return
    }
    addEmergencyHotline({
      name: name.trim(),
      number: number.trim(),
      category,
      province: province || null,
      city: city || null,
      source: source.trim() || null,
      notes: notes.trim() || null,
      // Anything typed in here starts unverified on purpose — it only stops
      // showing that label once someone confirms it by actually calling.
      verified: false,
    })
    setName('')
    setNumber('')
    setSource('')
    setNotes('')
    setError('')
    setShowForm(false)
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">📞 Emergency hotlines</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
          {emergencyHotlines.length} listed
        </span>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Real, dialable numbers shown to drivers, passengers, parents and TODAs — each sees the nationwide numbers plus
        whatever is listed for their own city. Leave the city blank for a province-wide number, or both blank for a
        nationwide one.
      </p>

      <div className="flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, number, city…"
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
        />
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
        >
          {showForm ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {showForm && (
        <div className="mt-3 space-y-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. PNP Science City of Muñoz"
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Number</span>
              <input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="e.g. (044) 456-0000 or 0917-000-0000"
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as HotlineCategory)}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Province (blank = nationwide)</span>
              <select
                value={province}
                onChange={(e) => {
                  setProvince(e.target.value)
                  setCity('')
                }}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
              >
                <option value="">— Nationwide —</option>
                {PH_PROVINCES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">City / municipality (blank = province-wide)</span>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                disabled={!province}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs disabled:bg-slate-100"
              >
                <option value="">— Whole province —</option>
                {cities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Source (optional)</span>
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Where it came from — LGU page, TODA president…"
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Availability (optional)</span>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. 24/7, or office hours only"
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
              />
            </label>
          </div>
          {error && <p className="text-xs font-medium text-amber-700">{error}</p>}
          <button
            type="button"
            onClick={handleAdd}
            className="w-full rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700"
          >
            Add hotline
          </button>
          <p className="text-[11px] text-slate-400">
            New numbers are marked unverified until someone confirms them by calling — verify from the list below.
          </p>
        </div>
      )}

      <div className="mt-3 max-h-[360px] space-y-1.5 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-400">No hotline matches that search.</p>
        ) : (
          filtered.map((h) => (
            <div key={h.id} className="rounded-lg border border-slate-200 p-2.5 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-700">
                    {h.name} · <span className="font-mono">{h.number}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {h.city ?? h.province ?? 'Nationwide'}
                    {h.source ? ` · ${h.source}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => updateEmergencyHotline(h.id, { verified: !h.verified })}
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      h.verified ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {h.verified ? '✓ Verified' : 'Unverified'}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeEmergencyHotline(h.id)}
                    aria-label={`Remove ${h.name}`}
                    className="rounded-lg border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
