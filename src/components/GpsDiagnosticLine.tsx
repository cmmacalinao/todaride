import { useEffect, useState } from 'react'
import type { GeoCoords } from '../types'

// Why the map is not moving, in one line, on the phone that can answer it.
//
// "Location is on but it is not detected" is the hardest report to act on,
// because every distinct cause looks identical from the outside: a marker
// that does not move. The permission can be granted at the operating system
// and refused for the site; granted for the site and only for this visit;
// granted and working while the tab is backgrounded, where a browser stops
// delivering readings; or working perfectly and reporting a fix so vague that
// every reading after the first is discarded as noise.
//
// Nobody can tell those apart by looking at a map, so this says which. It is
// deliberately on the driver's own screen rather than in a log: the person
// holding the phone is the only one who can fix any of them, and they are
// standing at a kerb, not reading a console.
type PermissionState = 'granted' | 'denied' | 'prompt' | 'unknown'

export function GpsDiagnosticLine({
  enabled,
  position,
  accuracy,
  error,
}: {
  enabled: boolean
  position: GeoCoords | null
  accuracy: number | null
  error: string | null
}) {
  const [permission, setPermission] = useState<PermissionState>('unknown')
  // When this phone last produced a reading the watch was willing to accept.
  // Its age is the number that matters: a fix from four minutes ago is not
  // tracking, however good it looked when it arrived.
  const [lastFixAt, setLastFixAt] = useState<number | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (position) setLastFixAt(Date.now())
  }, [position])

  // Re-render every few seconds so the age counts up rather than sitting at
  // whatever it was when something else last changed.
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 3000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let status: PermissionStatus | null = null
    const update = () => setPermission((status?.state as PermissionState) ?? 'unknown')
    void (async () => {
      try {
        if (!navigator.permissions?.query) return
        status = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
        update()
        status.addEventListener('change', update)
      } catch {
        // Older Safari does not implement this for geolocation. Unknown is
        // honest, and the rest of the line still works.
      }
    })()
    return () => status?.removeEventListener('change', update)
  }, [])

  if (!enabled) return null

  const ageSeconds = lastFixAt === null ? null : Math.round((Date.now() - lastFixAt) / 1000)
  // A minute without a reading while a tricycle is moving is not a slow fix,
  // it is a stopped one — most often a backgrounded tab.
  const stale = ageSeconds !== null && ageSeconds > 60

  const tone =
    permission === 'denied' || error
      ? 'border-rose-300 bg-rose-50 text-rose-800'
      : lastFixAt === null || stale
        ? 'border-amber-300 bg-amber-50 text-amber-800'
        : 'border-emerald-300 bg-emerald-50 text-emerald-800'

  return (
    <div className={`rounded-lg border px-2.5 py-1.5 text-[11px] leading-snug ${tone}`}>
      <p className="font-semibold">
        {permission === 'denied'
          ? '📍 Blocked for this site'
          : error
            ? '📍 GPS error'
            : lastFixAt === null
              ? '📍 Waiting for your first fix…'
              : stale
                ? `📍 No new fix for ${ageSeconds}s`
                : `📍 Live · ${ageSeconds}s ago${accuracy != null ? ` · ±${Math.round(accuracy)}m` : ''}`}
      </p>
      {permission === 'denied' ? (
        <p className="mt-0.5">
          Your phone's location can be on and this site still blocked. Tap the padlock 🔒 in the address bar →
          Location → Allow, then reload.
        </p>
      ) : error ? (
        <p className="mt-0.5">{error}</p>
      ) : stale ? (
        <p className="mt-0.5">
          Keep this screen open and in front — a browser stops sending your position when the app is in the
          background or the screen is off.
        </p>
      ) : lastFixAt === null && permission === 'prompt' ? (
        <p className="mt-0.5">Your browser has not been answered yet. Choose Allow on every visit when it asks.</p>
      ) : accuracy != null && accuracy > 150 ? (
        <p className="mt-0.5">
          Only accurate to ±{Math.round(accuracy)}m, so small movements are ignored. This usually sharpens up
          outdoors.
        </p>
      ) : null}
    </div>
  )
}
