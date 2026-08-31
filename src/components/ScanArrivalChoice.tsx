import { useEffect, useState } from 'react'
import { APK_PATH, canUseApk } from './AndroidAppLink'
import { SCAN_PARAM } from '../lib/freshStart'

// The choice a scanned code lands on, on Android only.
//
// Someone who scans a code at a terminal looks at the screen once. An offer
// below the fold of the landing page, or behind a menu, is not an offer to
// that person — which is exactly how the first version failed: the banner was
// real and correct and nobody saw it.
//
// So a scanned arrival asks the question outright, and only here. It is not
// shown on an ordinary visit, because somebody who types the address in has
// already chosen how they are reaching the app.
//
// On an iPhone, or a laptop, this renders nothing at all: there is no APK to
// offer, so there is no question worth asking, and the app simply opens.
// Read as the module loads, before React renders anything.
//
// It was read in an effect first, and that missed: a signed-in visitor is
// redirected off / onto their own screen, and the router rewrites the address
// on the way — so by the time an effect ran, the parameter was already gone
// and the sheet never appeared for exactly the people who arrive signed in.
// Module scope runs once, before any of that.
const ARRIVED_BY_SCAN = (() => {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  if (!params.has(SCAN_PARAM)) return false
  // Taken out of the address immediately, so a reload does not ask again.
  params.delete(SCAN_PARAM)
  const query = params.toString()
  window.history.replaceState(
    null,
    '',
    window.location.pathname + (query ? `?${query}` : '') + window.location.hash,
  )
  return true
})()

export function ScanArrivalChoice() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (ARRIVED_BY_SCAN && canUseApk()) setOpen(true)
  }, [])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-3 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
        <h2 className="text-base font-bold text-navy-900">Get TODA SafeRide</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          You can install the app, or just carry on in your browser — the same booking either way.
        </p>

        <a
          href={APK_PATH}
          download
          onClick={() => setOpen(false)}
          className="mt-3 block rounded-lg bg-brand-600 py-2.5 text-center text-xs font-bold text-white transition hover:bg-brand-700"
        >
          ⬇️ Install on this phone
        </a>
        <p className="mt-1.5 text-center text-[11px] leading-snug text-slate-500">
          Keeps tracking your trip when the screen locks — the browser cannot. About 11 MB. Android
          will ask before installing, because this is not from the Play Store yet.
        </p>

        {/* Given equal weight, not buried. Most people scanning a code want a
            tricycle now, not a decision about software. */}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="mt-3 w-full rounded-lg border border-slate-300 bg-white py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
        >
          Continue in the browser
        </button>
      </div>
    </div>
  )
}
