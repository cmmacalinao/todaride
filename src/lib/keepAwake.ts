import { useEffect } from 'react'

// Keeps the phone's screen on while the app is open.
//
// A tricycle ride is exactly the situation a phone's sleep timer is worst at:
// the passenger is not touching the screen, because there is nothing to touch
// — the map moves itself and the trip records itself. Thirty seconds later
// the screen is black, the family watching at home sees the position stop
// updating, and the person who most wanted to glance down and check the plate
// has to unlock the phone one-handed on a moving road to do it.
//
// The Screen Wake Lock API is the sanctioned way to say "not now". It is a
// request, not a command: the browser drops it whenever the page is hidden,
// and refuses it outright on a device that is low on battery. Both are
// reasonable and neither is worth arguing with — the lock is simply taken
// again when the page comes back.
//
// Support is uneven (Chrome and Edge yes, Safari from 16.4, older Android
// webviews no), so every path here is optional and silent. A phone that
// cannot hold the lock behaves exactly as it does today.
type WakeLockSentinelLike = { released: boolean; release: () => Promise<void> }
type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
}

export function useKeepAwake(enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const wakeLock = (navigator as WakeLockNavigator).wakeLock
    if (!wakeLock) return

    let sentinel: WakeLockSentinelLike | null = null
    let cancelled = false

    const acquire = async () => {
      // Only while the page is actually being looked at. Requesting a lock on
      // a hidden page throws, and would throw again on every visibility flip.
      if (cancelled || document.visibilityState !== 'visible') return
      if (sentinel && !sentinel.released) return
      try {
        sentinel = await wakeLock.request('screen')
      } catch {
        // Denied — most often a battery saver. Nothing to recover: the screen
        // sleeps as it normally would.
        sentinel = null
      }
    }

    // The lock is released for us whenever the page is hidden — switching
    // apps, locking the phone, a call coming in. Coming back has to ask again
    // or the screen starts sleeping mid-trip with no sign of why.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      void sentinel?.release().catch(() => {})
      sentinel = null
    }
  }, [enabled])
}
