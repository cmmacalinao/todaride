import { useState, type ReactNode } from 'react'
import { getCurrentGeoPosition } from '../lib/geo'
import type { GeoCoords } from '../types'

// Location, refreshable from the map itself — kept plain: a name, a refresh
// button, and (only once a refresh actually fails) a line saying why.
// Permission-state detail (allowed/blocked wording, an expandable
// how-to-fix note) used to live here too, but that's the browser's own
// permission prompt's conversation to have, not a line on every booking
// screen for the many people whose location already just works.
export function LocationPermissionRow({
  onLocated,
  // Rendered just before Refresh, so a caller can share this row rather than
  // spend another line of a phone screen on one button.
  trailing,
}: { onLocated?: (coords: GeoCoords) => void; trailing?: ReactNode }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)

  async function refresh() {
    setBusy(true)
    setFailed(null)
    try {
      const coords = await getCurrentGeoPosition()
      setRefreshedAt(new Date())
      onLocated?.(coords)
    } catch (err) {
      setFailed(err instanceof Error ? err.message : 'Could not get your location.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <span aria-hidden className="shrink-0 text-xs leading-none">
          📍
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-700">
          Location
          {refreshedAt && (
            <span className="ml-1 font-normal text-slate-400">
              · {refreshedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </span>
        {trailing}
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={busy}
          // Icon only. "Refresh" beside a recognisable circular arrow is the
          // word that was pushing the row past the edge of the phone, and it
          // is the least surprising control here.
          aria-label="Refresh your location"
          title="Refresh your location"
          className="shrink-0 rounded-lg border border-brand-300 bg-brand-50 px-2 py-1 text-[11px] font-bold text-brand-700 transition hover:bg-brand-100 disabled:opacity-60"
        >
          {busy ? '…' : '🔄'}
        </button>
      </div>

      {failed && <p className="mt-1 text-[11px] leading-snug text-amber-700">{failed}</p>}
    </div>
  )
}
