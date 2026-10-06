import { Capacitor, registerPlugin } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { useCallback, useEffect, useState } from 'react'

// Whether this phone can actually keep the passenger informed once the
// driver stops looking at it — asked in the driveway, not discovered
// mid-trip.
//
// Android only allows background location through a foreground service, and
// such a service is required to show a persistent notification. The
// notification is therefore not decoration: it is the proof the service is
// running. No notification, no service; no service, and the driver's dot
// freezes the moment the screen sleeps, with the passenger watching a
// tricycle that has stopped moving on a road where it has not.
//
// That is exactly what happened across three pilot runs. Nothing on either
// phone said so: the driver saw a normal trip screen, and the passenger saw
// a stale pin that looked like a slow driver rather than a dead feed. The
// permission behind it (POST_NOTIFICATIONS) is not one the location plugin
// asks for -- its @CapacitorPlugin annotation requests only the two location
// permissions -- so on Android 13+ nothing was ever requesting it.
//
// backgroundLocation.ts now asks for it before starting the watcher. This
// module is the other half: it checks, before a trip, whether the asking
// actually worked, and says so while there is still time to fix it.

type PermissionValue = 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale' | 'unknown'

export type TrackingStatus = 'ok' | 'will-ask' | 'blocked' | 'screen-on-only'

export interface TrackingReadiness {
  status: TrackingStatus
  // Short enough to sit on one line of a phone screen.
  title: string
  // What it means for this driver's next trip, in their terms.
  detail: string
  // Whether there is anywhere useful to send them. Android will not grant
  // either of these from inside the app once refused, so the only honest
  // next step is the system settings screen.
  offerSettings: boolean
}

export function trackingReadiness(input: {
  native: boolean
  notifications: PermissionValue
  // Whatever the service last failed with, if anything. The most
  // authoritative signal there is: a permission can read as granted and the
  // service still refuse to start (background location is a separate switch
  // Android will not report through this API).
  serviceError: string | null
}): TrackingReadiness {
  const { native, notifications, serviceError } = input

  // The website cannot do this at all, and no amount of permission granting
  // changes it — every mobile browser throttles or stops a page that is not
  // on screen. Said plainly rather than offered as something to fix.
  if (!native) {
    return {
      status: 'screen-on-only',
      title: 'Keep this screen on',
      detail:
        'On the website your location stops updating when the screen sleeps. Install the app to keep sharing with the screen off.',
      offerSettings: false,
    }
  }

  // The service itself has spoken. Trust it over any permission check.
  if (serviceError) {
    return {
      status: 'blocked',
      title: 'Background tracking is not running',
      detail: serviceError,
      offerSettings: true,
    }
  }

  if (notifications === 'denied') {
    return {
      status: 'blocked',
      title: 'Turn on notifications to be tracked',
      detail:
        'Android needs to show a notification while it shares your location. Without it your passenger loses you when the screen sleeps. Open Settings → Notifications and allow them.',
      offerSettings: true,
    }
  }

  if (notifications === 'prompt' || notifications === 'prompt-with-rationale') {
    return {
      status: 'will-ask',
      title: 'Allow notifications when asked',
      detail:
        'When your first trip starts your phone will ask. Say allow — it is how Android lets the app keep sharing your location with the screen off.',
      offerSettings: false,
    }
  }

  // Granted, or a phone too old to have the permission at all. Nothing to
  // say: a banner that appears when everything is fine is a banner people
  // learn to ignore when it isn't.
  return {
    status: 'ok',
    title: 'Background tracking ready',
    detail: 'Your passenger keeps seeing you even with the screen off.',
    offerSettings: false,
  }
}

// Everything except the all-clear. 'ok' never shows: a banner that appears
// when nothing is wrong is one drivers learn to scroll past when something
// is.
//
// The web notice is included even though there is nothing to grant. A driver
// on the website is not misconfigured, but they are about to lose their
// passenger the moment the screen sleeps, and that is worth one line — drawn
// quieter than the two that need acting on (see its status in DriverPage).
export function shouldWarnDriver(readiness: TrackingReadiness): boolean {
  return readiness.status !== 'ok'
}

interface BackgroundGeolocationSettings {
  openSettings(): Promise<void>
}

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationSettings>('BackgroundGeolocation')

export function openTrackingSettings(): void {
  void BackgroundGeolocation.openSettings().catch(() => {
    // Nothing useful to say if even the settings screen will not open; the
    // banner's own words already name the screen to go to.
  })
}

// Reads the real permission state, and re-reads it whenever the driver comes
// back to the app — which is exactly what they do after being sent to
// Settings, and the one moment the answer is most likely to have changed.
export function useDriverTrackingReadiness(serviceError: string | null): TrackingReadiness {
  const native = Capacitor.isNativePlatform()
  const [notifications, setNotifications] = useState<PermissionValue>('unknown')

  const refresh = useCallback(() => {
    if (!native) return
    void (async () => {
      try {
        const result = await PushNotifications.checkPermissions()
        setNotifications((result.receive as PermissionValue) ?? 'unknown')
      } catch {
        // A phone with no such permission to check. 'unknown' reads as fine,
        // which it is: below Android 13 the notification needs no grant.
        setNotifications('unknown')
      }
    })()
  }, [native])

  useEffect(() => {
    refresh()
    if (!native) return
    // visibilitychange rather than the App plugin's resume: it fires in the
    // native webview and on the website alike, and this is the only thing
    // either needs it for.
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [native, refresh])

  return trackingReadiness({ native, notifications, serviceError })
}

// The last thing the background service failed with, carried across the end
// of the trip.
//
// Two permissions can stop a driver being followed, and the check above can
// only see one of them. POST_NOTIFICATIONS is readable; ACCESS_BACKGROUND
// _LOCATION — Android's "Allow all the time" — is not reported by any plugin
// here, and the only thing that knows about it is the service itself, when it
// refuses to start mid-trip with NOT_AUTHORIZED.
//
// That error used to live and die inside the trip card. So a driver whose
// notifications were fine but whose location was "While using the app" saw a
// clean dashboard, a normal trip, and a passenger whose map quietly froze —
// the exact shape of the three pilot runs nobody could explain. Writing it
// down means the next look at the dashboard says what went wrong, instead of
// the trip having to be run again to find out.
const FAILURE_KEY = 'toda-bg-location-failure-v1'

// Long enough to survive the trip and the drive home, short enough that a
// permission fixed yesterday is not still being complained about today.
const FAILURE_TTL_MS = 12 * 60 * 60 * 1000

// Pure, so the staleness rule can be tested without a browser.
export function parseStoredFailure(
  raw: string | null,
  now: number,
  maxAgeMs = FAILURE_TTL_MS,
): string | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { message?: unknown; at?: unknown }
    if (typeof parsed.message !== 'string' || !parsed.message) return null
    if (typeof parsed.at !== 'number') return null
    // A clock that has gone backwards must not make an old failure immortal.
    const age = now - parsed.at
    if (age < 0 || age > maxAgeMs) return null
    return parsed.message
  } catch {
    // Someone else's key, or a half-written value. Nothing to report beats
    // reporting nonsense on a safety screen.
    return null
  }
}

export function rememberTrackingFailure(message: string | null): void {
  try {
    if (!message) localStorage.removeItem(FAILURE_KEY)
    else localStorage.setItem(FAILURE_KEY, JSON.stringify({ message, at: Date.now() }))
  } catch {
    // Private mode, blocked storage. The in-trip message still shows.
  }
}

export function lastTrackingFailure(): string | null {
  try {
    return parseStoredFailure(localStorage.getItem(FAILURE_KEY), Date.now())
  } catch {
    return null
  }
}
