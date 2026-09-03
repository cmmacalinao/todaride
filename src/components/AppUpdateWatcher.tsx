import { useEffect, useState } from 'react'
import { useHasMyOwnTripInFlight } from '../lib/myOwnTripInFlight'

// Gets an already-installed phone onto the current build.
//
// The service worker serves what it cached and only then checks for something
// newer, so the new build installs during one visit and appears on the next.
// Between those two moments the page is running code that has already been
// replaced — which is how a tester ends up reporting that a change made days
// ago "isn't there", and why the answer always sounds like an excuse.
//
// Once the new worker takes over, this reloads. The scanned-link reset in
// freshStart covers a phone being handed the app; this covers the phones that
// already have it.
//
// It waits for a quiet moment first. This app is carrying people home: a
// reload during a live trip or an open SOS would throw away whatever is on
// screen at the worst possible time, and the update can perfectly well wait
// until the trip is over. Nothing is lost by waiting — the check re-runs on
// every render, so it fires the moment the ride ends.
//
// "Busy" means this device's own trip (see useHasMyOwnTripInFlight), not the
// whole fleet's. It used to check every ride in the shared database
// unfiltered, so one passenger's unclaimed request left sitting after they
// closed the app silenced reloads for every other phone on the pilot for as
// long as it sat there uncancelled.
export function AppUpdateWatcher() {
  const busy = useHasMyOwnTripInFlight()
  const [tookOver, setTookOver] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    // No controller yet means this is the first install on this device. There
    // is no stale code to replace, so taking control is not a reason to
    // reload — that would bounce every first-time visitor for nothing.
    if (!navigator.serviceWorker.controller) return
    const onChange = () => setTookOver(true)
    navigator.serviceWorker.addEventListener('controllerchange', onChange)
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onChange)
  }, [])

  // A phone left on a home screen can go a week without a cold start, and the
  // browser only re-checks the worker when the page loads. Ask again on the
  // hour, and whenever the app comes back to the foreground.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    let registration: ServiceWorkerRegistration | null = null
    void navigator.serviceWorker.ready.then((r) => {
      registration = r
    })
    const check = () => {
      if (document.visibilityState !== 'visible') return
      if (!navigator.onLine) return
      void registration?.update()
    }
    const hourly = setInterval(check, 60 * 60 * 1000)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(hourly)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])

  useEffect(() => {
    if (!tookOver || busy) return
    window.location.reload()
  }, [tookOver, busy])

  return null
}
