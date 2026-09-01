import { useEffect } from 'react'
import { getCurrentGeoPosition } from './geo'

// Ask for location once, as the app opens.
//
// Everything this app is for rests on knowing where the phone is: the pickup
// it books from, the tricycle it matches you to, the dot a parent watches, the
// rule that decides you have boarded. Until now nothing asked for it up front
// — permission was requested by whichever screen happened to need it first,
// which meant the dialog appeared halfway through booking, or during a trip,
// or (if the passenger never reached that screen) not at all. A phone that was
// never asked looks exactly like a phone that refused, and the app spends the
// ride drawing a dot that does not move.
//
// So it is asked for at the door, before anything depends on the answer.
//
// Asked, not nagged. A browser that has already been told — allowed or
// blocked — is never asked again: re-requesting a denied permission does
// nothing at all in every browser (the dialog does not reappear), and
// re-requesting a granted one is a wasted fix. Only the undecided state
// produces a prompt, which is the only state where a prompt is any use.
export function useAskForLocationOnOpen(enabled = true) {
  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    void (async () => {
      try {
        // Where the Permissions API is available, only the undecided state is
        // worth a request. Safari on older iOS does not implement it for
        // geolocation, and there the request itself is the only way to find
        // out — which is safe, because the browser shows nothing for a
        // decision already made.
        if (navigator.permissions?.query) {
          const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
          if (cancelled || status.state !== 'prompt') return
        }
        await getCurrentGeoPosition()
      } catch {
        // Refused, unavailable, or timed out. Nothing to do here: the screens
        // that need a position each say so in their own words, and the
        // location row offers the way back on.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [enabled])
}
