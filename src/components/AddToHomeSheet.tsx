import { useEffect, useState } from 'react'
import { InstallAppButton } from './InstallAppButton'
import { ADD_PARAM } from '../lib/freshStart'
import { isNativeApp } from '../lib/platform'

// What a scanned code lands on.
//
// A QR code cannot put an icon on a phone by itself. Neither iOS nor Android
// lets a scanned address install anything, and that restriction is the whole
// point of it — a code on a poster could otherwise leave something behind on
// every phone that looked at it. What the code can do is land somebody on the
// offer at the one moment they are certain to take it: just after a person
// standing next to them handed them the app.
//
// So the shared link ends here, with the same install row the menu carries —
// one tap where Chrome will do it, the recipe for that phone where it will
// not. Shown once, on arrival, and never again: it is an offer, and an offer
// that reappears is a nag.
export function AddToHomeSheet() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (!params.has(ADD_PARAM)) return

    // Take the parameter out of the address straight away. It has been read,
    // and leaving it there means a reload, a bookmark or a shared screenshot
    // of the URL brings the sheet back for someone who already answered it.
    params.delete(ADD_PARAM)
    const query = params.toString()
    window.history.replaceState(
      null,
      '',
      window.location.pathname + (query ? `?${query}` : '') + window.location.hash,
    )

    // Already on the home screen, or inside the wrapper — there is nothing
    // left to offer, and an empty sheet is worse than no sheet.
    if (isNativeApp()) return
    if (window.matchMedia('(display-mode: standalone)').matches) return
    setOpen(true)
  }, [])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
        <h2 className="text-base font-bold text-navy-900">Welcome to TODA SafeRide</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          Keep it on your home screen and it opens like any other app — no browser tabs to find, and it
          works when the signal drops.
        </p>

        <div className="mt-3">
          <InstallAppButton />
        </div>

        <button
          type="button"
          onClick={() => setOpen(false)}
          className="mt-3 w-full rounded-lg border border-slate-300 bg-white py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
        >
          Not now — just open the app
        </button>
      </div>
    </div>
  )
}
