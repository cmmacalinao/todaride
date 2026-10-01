import { Capacitor, registerPlugin } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { useEffect, useRef, useState } from 'react'
import type { GeoCoords } from '../types'

// Where a driver is, while nobody is looking at the phone.
//
// Measured on 2026-09-29, two trips, same two phones: whichever phone was
// being watched published its position every 4 seconds, and the other one
// dropped to 50–60. It reversed between trips when the roles swapped, so it
// was never a driver problem or a passenger problem — it is what every mobile
// platform does to a web page that is not on screen. Android throttles it to
// about a minute; Safari stops it outright. FLAG_KEEP_SCREEN_ON (see
// MainActivity) keeps the screen alive against the idle timeout, but it
// cannot survive the power button or a switch to another app.
//
// A driver's phone is mounted on the handlebars and unwatched by design, so
// for the driver this has to work with the screen off. That needs a real
// background service, which is native-only: this is the installed app's
// advantage over the website, and the one place the app is worth having.
//
// A passenger watching from mobile Safari still needs the screen on. Nothing
// available to a web page changes that, which is why the trip screen says how
// old each position is rather than pretending.
//
// Scoped deliberately: started when a trip goes live, stopped the moment it
// ends. A driver who is not on a job is not tracked, the notification is not
// in their tray, and the battery is theirs.
interface BgLocation {
  latitude: number
  longitude: number
  accuracy: number
  bearing: number | null
  speed: number | null
  time: number | null
}

interface BackgroundGeolocationPlugin {
  addWatcher(
    options: {
      backgroundMessage?: string
      backgroundTitle?: string
      requestPermissions?: boolean
      stale?: boolean
      distanceFilter?: number
    },
    callback: (position?: BgLocation, error?: { code?: string; message?: string }) => void,
  ): Promise<string>
  removeWatcher(options: { id: string }): Promise<void>
  openSettings(): Promise<void>
}

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation')

// Android will not deliver background locations without a notification, and
// that is the right trade: a driver can see at a glance that the app is
// tracking them, and dismiss it by finishing the trip.
const NOTIFICATION_TITLE = 'TODA Ride Mobility'
const NOTIFICATION_MESSAGE = 'Sharing your location with your passenger while this trip is running.'

// Ten metres between updates. The foreground watch already reports far more
// often than that when the screen is on; this one is the floor under it, and
// a filter of zero on a background service is a battery complaint waiting to
// happen.
const DISTANCE_FILTER_METERS = 10

export interface BackgroundFix {
  gps: GeoCoords
  accuracy: number | null
  headingDegrees: number | null
  speedMps: number | null
  at: number
}

// The driver's position from the background service, or null when it is not
// running — on the website, on a build without the plugin, on a phone that
// refused the permission. Every one of those falls back to the ordinary
// foreground watch, which is what the app did before this existed.
export function useBackgroundDriverLocation(active: boolean): { fix: BackgroundFix | null; error: string | null } {
  const [fix, setFix] = useState<BackgroundFix | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The watcher id arrives from a promise that may resolve after this effect
  // has already been torn down — a trip that ends within a second of
  // starting, a re-render on the way in. Without somewhere to put it, that
  // watcher is never removed and the notification stays in the driver's tray
  // for a job that finished.
  const watcherRef = useRef<string | null>(null)

  useEffect(() => {
    if (!active) return
    if (!Capacitor.isNativePlatform()) return
    let cancelled = false

    void (async () => {
      try {
        // Ask for notification permission first.
        //
        // Android 13 and later will not show a notification without
        // POST_NOTIFICATIONS, and a foreground service of type "location"
        // has to show one — so without this the service either refuses to
        // start or starts invisibly, which is the same thing from the
        // driver's seat. The plugin declares the permission in its manifest
        // but only auto-requests the two location ones (see its
        // @CapacitorPlugin annotation), so nobody was asking for this at
        // runtime. Pilot, 2026-10-01: no notification ever appeared.
        //
        // Routed through the push-notifications plugin because it is already
        // installed and its requestPermissions is the same Android dialog.
        // It does not register for push — that is a separate call.
        try {
          await PushNotifications.requestPermissions()
        } catch {
          // Older Android has no such permission and nothing to ask for.
        }
        const id = await BackgroundGeolocation.addWatcher(
          {
            backgroundTitle: NOTIFICATION_TITLE,
            backgroundMessage: NOTIFICATION_MESSAGE,
            requestPermissions: true,
            // Never a remembered position: a stale fix published as current
            // is exactly the lag this whole thing exists to remove.
            stale: false,
            distanceFilter: DISTANCE_FILTER_METERS,
          },
          (position, err) => {
            if (err) {
              // Every refusal, not only the one we guessed at.
              //
              // This reported NOT_AUTHORIZED and dropped everything else on
              // the floor, so a service that failed for any other reason was
              // indistinguishable from one that was working. On the pilot
              // that cost two runs: no notification appeared and nothing on
              // the phone would say why.
              setError(
                err.code === 'NOT_AUTHORIZED'
                  ? 'Background location is off for this app. Open Settings → Location and choose "Allow all the time", so your passenger can still see you with the screen off.'
                  : `Background location stopped: ${err.message ?? err.code ?? 'unknown error'}`,
              )
              return
            }
            if (!position) return
            setError(null)
            setFix({
              gps: { lat: position.latitude, lng: position.longitude },
              accuracy: position.accuracy ?? null,
              headingDegrees: position.bearing != null && position.bearing >= 0 ? position.bearing : null,
              speedMps: position.speed != null && position.speed >= 0 ? position.speed : null,
              at: position.time ?? Date.now(),
            })
          },
        )
        if (cancelled) {
          void BackgroundGeolocation.removeWatcher({ id }).catch(() => {})
          return
        }
        watcherRef.current = id
      } catch (err) {
        // Said out loud, not swallowed.
        //
        // This was a bare catch with a comment about the foreground watch
        // carrying on — which it does, but it meant a service that never
        // started looked exactly like one that started fine. Two pilot runs
        // were spent inferring from the absence of a notification what the
        // phone could have said in a sentence. Whatever Android refused
        // with now reaches the driver's screen.
        setError(
          `Background location could not start: ${
            err instanceof Error ? err.message : String(err)
          }. Your passenger will lose you when the screen goes off.`,
        )
      }
    })()

    return () => {
      cancelled = true
      const id = watcherRef.current
      watcherRef.current = null
      if (id) void BackgroundGeolocation.removeWatcher({ id }).catch(() => {})
      setFix(null)
    }
  }, [active])

  return { fix, error }
}
