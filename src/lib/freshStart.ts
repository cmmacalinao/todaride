// A code scanned at the terminal has to be able to overrule a stale phone.
//
// The service worker answers from the build it cached last time before it
// goes looking for a newer one, so a phone that installed the app weeks ago
// opens weeks-old code — and keeps doing so until it happens to load twice in
// a row. Someone being handed the app by a person standing next to them
// cannot diagnose that, and the person doing the handing cannot either. The
// symptom is always the same and always misleading: "the new thing isn't
// there".
//
// So the shared link carries ?fresh, and arriving with it forces the update
// the browser would otherwise get round to in its own time: re-fetch the
// worker, install whatever is newer, let it take over, then load the app.
//
// It does NOT unregister the worker or delete its caches by hand, which is
// the obvious version and is wrong. unregister() does not take effect while
// the page is still a client of the worker, so the reload that follows adopts
// the very worker it was meant to replace — and since precaching only ever
// happens during install, that phone is left with a live worker and an empty
// cache: online-only, silently, until the next deploy. Letting the worker
// update itself is the supported path, and its own cleanupOutdatedCaches
// throws away the previous build's cache once the new one is safely in.
//
// localStorage is untouched throughout: it holds the signed-in account and
// any ride in progress, and someone who scans a friend's code to help them
// should not be signed out for it.
export const FRESH_PARAM = 'fresh'

// A phone on a bad signal must not be left staring at a blank page while the
// worker thinks about it. Past this, carry on with whatever is already there.
const UPDATE_TIMEOUT_MS = 8000

export function wantsFreshStart(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).has(FRESH_PARAM)
}

// Resolves once the worker that `update()` pulled down has taken over, or
// immediately if this phone was already on the current build.
async function adoptNewestWorker(registration: ServiceWorkerRegistration): Promise<void> {
  await registration.update()
  const incoming = registration.installing ?? registration.waiting
  if (!incoming) return

  await new Promise<void>((resolve) => {
    const settle = () => {
      if (incoming.state === 'activated' || incoming.state === 'redundant') resolve()
    }
    incoming.addEventListener('statechange', settle)
    settle()
    setTimeout(resolve, UPDATE_TIMEOUT_MS)
  })
}

// Something to look at while the worker updates.
//
// The reset mounts no app — that is the point of it — so without this the
// person who just scanned a code at a terminal watches a blank white page for
// as long as the update takes. A blank page reads as a broken link, and the
// one thing this route must not do is look broken to somebody being handed
// the app for the first time.
//
// Written straight into the document rather than rendered: React is not
// running on this path and starting it up to show one line would be slower
// than the thing it is apologising for.
function showUpdatingSplash(): void {
  const root = document.getElementById('root')
  if (!root) return
  root.innerHTML = `
    <div style="position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:#1e3a8a;font-family:system-ui,-apple-system,'Segoe UI',sans-serif">
      <img src="/logo.webp" alt="TODA SafeRide" style="width:150px;max-width:60vw;height:auto" />
      <div style="width:26px;height:26px;border:3px solid rgba(255,255,255,.28);border-top-color:#fbbf24;border-radius:50%;animation:toda-spin .8s linear infinite"></div>
      <p style="margin:0;color:#e2e8f0;font-size:13px;letter-spacing:.01em">Kinukuha ang pinakabagong bersyon…</p>
      <style>@keyframes toda-spin{to{transform:rotate(360deg)}}</style>
    </div>`
}

export async function freshStart(): Promise<void> {
  showUpdatingSplash()
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(
        registrations.map((r) =>
          adoptNewestWorker(r).catch(() => {
            // Offline, or the fetch was refused. The reload below still gets
            // this phone to the app; it just gets there on the build it has.
          }),
        ),
      )
    }
  } catch {
    // Private windows and locked-down browsers refuse the whole API — in
    // which case nothing was ever cached, so there is nothing to update.
  }

  const url = new URL(window.location.href)
  url.searchParams.delete(FRESH_PARAM)
  // A build that briefly shipped handed itself ?add to raise an install
  // prompt on arrival. That prompt is gone, and nothing strips the parameter
  // any more, so it would sit in the address bar of every phone still running
  // that build until it next updated. Clear it here, where such a phone is
  // guaranteed to pass through.
  url.searchParams.delete('add')
  // replace, not assign: the ?fresh address must not sit in history, where
  // Back would run the whole routine again.
  window.location.replace(url.toString())
}
