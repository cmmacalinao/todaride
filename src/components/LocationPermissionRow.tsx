import { useEffect, useState } from 'react'
import { getCurrentGeoPosition } from '../lib/geo'
import type { GeoCoords } from '../types'

// Location, refreshable from the map itself, with the browser's own answer
// showing beside it.
//
// The app cannot choose "Allow on every visit" for anybody. That radio lives
// in the browser's permission dialog and no page may touch it — which is the
// whole reason this row exists rather than a line of code. What the app can
// do is ask at a moment the person is expecting to be asked, say which option
// keeps them from being asked again, and afterwards report what the browser
// actually recorded, so "it keeps asking me" stops being a mystery.
//
// A refresh rather than an on/off switch: tracking is meant to be on, and the
// thing people actually need is a way to wake it when the dot has gone stale
// or the prompt was dismissed. A switch would add a second way for location
// to be off, and the app already has enough of those.
//
// The Permissions API reports granted/denied/prompt without triggering
// anything. Safari on older iOS does not implement it for geolocation, so the
// state is allowed to be unknown and the row simply offers the button.
type PermissionState = 'granted' | 'denied' | 'prompt' | 'unknown'

export function LocationPermissionRow({ onLocated }: { onLocated?: (coords: GeoCoords) => void }) {
  const [permission, setPermission] = useState<PermissionState>('unknown')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)
  // The how-to-fix note, folded away by default.
  const [howToFixOpen, setHowToFixOpen] = useState(false)

  useEffect(() => {
    let status: PermissionStatus | null = null
    const update = () => setPermission((status?.state as PermissionState) ?? 'unknown')
    void (async () => {
      try {
        if (!navigator.permissions?.query) return
        status = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
        update()
        // Granting or revoking mid-session should show without a reload —
        // somebody fixing this in browser settings is looking at this row
        // while they do it.
        status.addEventListener('change', update)
      } catch {
        // Older Safari refuses the query outright. Unknown is honest.
      }
    })()
    return () => status?.removeEventListener('change', update)
  }, [])

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
    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-sm leading-none">
          📍
        </span>
        <span className="min-w-0 flex-1 text-[11px] font-semibold text-slate-700">
          Live location
          {permission === 'granted' && <span className="ml-1 font-normal text-emerald-700">· allowed</span>}
          {permission === 'denied' && <span className="ml-1 font-normal text-rose-700">· blocked</span>}
          {refreshedAt && (
            <span className="ml-1 font-normal text-slate-400">
              · {refreshedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={busy}
          className="shrink-0 rounded-lg border border-brand-300 bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-700 transition hover:bg-brand-100 disabled:opacity-60"
        >
          {busy ? 'Locating…' : '🔄 Refresh'}
        </button>
      </div>

      {/* Said before the dialog appears, not after it has been dismissed. The
          two options look equally reasonable in the moment, and only one of
          them stops the question coming back every single visit. */}
      {permission === 'prompt' && (
        <p className="mt-1 text-[11px] leading-snug text-slate-500">
          When your browser asks, choose <span className="font-semibold">Allow on every visit</span>. If you
          choose <span className="font-semibold">Allow this time</span> it will ask again every time you open
          the app.
        </p>
      )}

      {/* Folded away until asked for.
          The fix is four lines of instructions about browser settings, and it
          was sitting open in red above the map on every screen for anyone
          whose phone has location off — shouting at the many to help the few
          who are going to act on it. The state still shows in the row above
          ("· blocked"); this is only the how. */}
      {permission === 'denied' && (
        <>
          <button
            type="button"
            onClick={() => setHowToFixOpen((v) => !v)}
            aria-expanded={howToFixOpen}
            className="mt-1 flex w-full items-center gap-1 text-left text-[11px] font-semibold text-rose-700"
          >
            <span aria-hidden className="text-[9px] leading-none">{howToFixOpen ? '▼' : '▶'}</span>
            How to turn location back on
          </button>
          {howToFixOpen && (
            <p className="mt-1 text-[11px] leading-snug text-rose-700">
              Location is blocked in this browser, so it will not ask again however many times you press
              Refresh. Tap the padlock 🔒 in the address bar → Location → Allow, then reload the page.
            </p>
          )}
        </>
      )}

      {failed && permission !== 'denied' && (
        <p className="mt-1 text-[11px] leading-snug text-amber-700">{failed}</p>
      )}
    </div>
  )
}
