import { useMemo, useState } from 'react'
import { useRides } from '../context/RideContext'
import type { EmergencyHotline, HotlineCategory } from '../types'

const CATEGORY_META: Record<HotlineCategory, { icon: string; label: string }> = {
  police: { icon: '🚓', label: 'Police' },
  fire: { icon: '🚒', label: 'Fire' },
  medical: { icon: '🚑', label: 'Medical' },
  rescue: { icon: '🆘', label: 'Rescue' },
  disaster: { icon: '🌊', label: 'Disaster' },
  toda: { icon: '🛺', label: 'TODA' },
  other: { icon: '📞', label: 'Other' },
}

// Widest scope first — in an emergency the nationwide numbers are the ones
// that always work, so they should never be buried under local entries.
function scopeRank(h: EmergencyHotline): number {
  if (!h.province) return 0
  if (!h.city) return 1
  return 2
}

function scopeLabel(h: EmergencyHotline): string {
  if (!h.province) return 'Nationwide'
  if (!h.city) return h.province
  return h.city
}

export function EmergencyHotlines({
  province,
  city,
  title = 'Emergency numbers',
  // The panel supplies its own sticky title bar, so the inline heading would
  // be a second copy of the same words.
  hideTitle = false,
  // Set on a role's own screen so the list opens focused on where they are;
  // Admin leaves it off to browse every locality.
  scopeToLocation = true,
}: {
  province?: string | null
  city?: string | null
  title?: string
  hideTitle?: boolean
  scopeToLocation?: boolean
}) {
  const { emergencyHotlines } = useRides()
  const [query, setQuery] = useState('')

  // 911 reaches police, fire and medical anywhere in the country, so it's the
  // one number that is never the wrong answer. Pinned above the search box
  // rather than sorted to the top of the list, so no filter — a city scope, a
  // typo'd search — can ever take it off screen.
  const primary = emergencyHotlines.find((h) => h.number.replace(/\D/g, '') === '911') ?? null

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return emergencyHotlines
      .filter((h) => {
        // Skipped here because it's rendered on its own above.
        if (primary && h.id === primary.id) return false
        if (scopeToLocation) {
          // Nationwide always shows. Province-wide shows to anyone in that
          // province. A city entry shows only in that city — someone in
          // Muñoz shouldn't be handed a Cabanatuan number as if it were local.
          if (h.province && province && h.province !== province) return false
          if (h.province && !province) return false
          if (h.city && h.city !== city) return false
        }
        if (!q) return true
        return (
          h.name.toLowerCase().includes(q) ||
          h.number.toLowerCase().includes(q) ||
          (h.city ?? '').toLowerCase().includes(q) ||
          (h.province ?? '').toLowerCase().includes(q) ||
          CATEGORY_META[h.category].label.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => scopeRank(a) - scopeRank(b) || a.name.localeCompare(b.name))
  }, [emergencyHotlines, query, province, city, scopeToLocation, primary])

  return (
    <section className="rounded-xl border border-danger-200 bg-danger-50 p-4 shadow-sm">
      {!hideTitle && <h2 className="text-sm font-semibold text-danger-900">🆘 {title}</h2>}
      <p className="mt-0.5 text-[11px] text-danger-800">
        {scopeToLocation
          ? `Nationwide numbers plus anything listed for ${city ?? 'your area'}. Tap a number to call.`
          : 'Every number on file, across all localities. Tap a number to call.'}
      </p>

      {primary && (
        <a
          href={`tel:${primary.number.replace(/[^\d+]/g, '')}`}
          className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-danger-700 px-4 py-3 shadow-sm transition hover:bg-danger-800"
        >
          <span className="min-w-0">
            <span className="block text-xs font-semibold uppercase tracking-wide text-danger-100">
              {primary.name}
            </span>
            <span className="mt-0.5 block text-[11px] text-danger-200">
              Police, fire and medical — anywhere in the country
            </span>
          </span>
          <span className="shrink-0 text-3xl font-extrabold leading-none text-white">{primary.number}</span>
        </a>
      )}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search name, number, city…"
        className="mt-2 w-full rounded-lg border border-danger-300 bg-white px-2 py-1.5 text-xs"
      />

      {visible.length === 0 ? (
        <p className="mt-3 text-xs text-danger-800">
          {query ? 'No number matches that search.' : 'No numbers listed for your area yet — ask the App Admin to add them.'}
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {visible.map((h) => (
            <li key={h.id} className="rounded-lg border border-danger-200 bg-white p-2.5">
              <div className="flex items-center gap-2">
                <span aria-hidden className="text-base leading-none">
                  {CATEGORY_META[h.category].icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-700">{h.name}</p>
                  <p className="text-[11px] text-slate-400">
                    {CATEGORY_META[h.category].label} · {scopeLabel(h)}
                    {h.notes ? ` · ${h.notes}` : ''}
                    {!h.verified && ' · unverified'}
                  </p>
                </div>
                <a
                  href={`tel:${h.number.replace(/[^\d+]/g, '')}`}
                  className="shrink-0 rounded-lg bg-danger-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-danger-800"
                >
                  {h.number}
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
