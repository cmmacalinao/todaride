// Makes an open tab actually notice a new deploy and update itself.
//
// The bare service-worker registration vite-plugin-pwa auto-injects into
// index.html is only `navigator.serviceWorker.register('/sw.js')` — see
// registerSW.js in a built dist/. registerType: 'autoUpdate' in
// vite.config.ts only decides what the SERVICE WORKER does once a new one
// is found (skip the waiting phase, take over immediately); nothing makes
// the browser go looking for a new one in the first place beyond its own
// throttled, spec-minimum background check. A tab left open across a
// deploy — or one that loaded moments before this session's own deploy
// finished — sat on the old build until it was manually reloaded hard
// enough to bypass the cache. That is the bug this file closes.
//
// `virtual:pwa-register` is the real client the plugin ships for this: it
// wraps registration and adds the parts that were missing. `immediate:
// true` checks the instant this runs, not on the browser's own schedule.
// The visibility/focus listener covers the exact case the docs describe:
// bringing an already-open tab back to the front, or opening a new one,
// after a deploy happened while it wasn't being watched. `onNeedRefresh`
// reloads without asking, matching the 'autoUpdate' this app already
// chose — nobody has to notice a banner and click something for the app
// they are looking at right now to become the one that was just shipped.
import { registerSW } from 'virtual:pwa-register'

export function registerServiceWorkerUpdates() {
  if (!('serviceWorker' in navigator)) return

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateSW(true)
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => void registration.update()
      // The browser's own check is once-per-navigation at best and often
      // skipped entirely for a tab that just sits there. Recheck whenever
      // someone actually comes back to look at the screen — that is the
      // moment "is this stale?" starts to matter, and the moment a manual
      // reload would otherwise have been needed.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
      window.addEventListener('focus', check)
    },
  })
}
