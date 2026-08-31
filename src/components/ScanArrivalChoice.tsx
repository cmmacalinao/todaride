import { useEffect, useState } from 'react'
import { APK_PATH, canAddToHomeScreen, canUseApk } from './InstallOffer'
import { SCAN_PARAM } from '../lib/freshStart'
import { isInAppBrowser, safariEscapeUrl } from '../lib/inAppBrowser'

// The choice a scanned code lands on.
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
// Both phones get an answer, but not the same one. Android is handed the APK.
// An iPhone cannot install an APK and never will, so it is walked through Add
// to Home Screen instead — which reaches the same place by the only door iOS
// offers: the manifest already declares standalone, so a home-screen launch
// opens without the browser's address bar. Anything else is shown nothing and
// the app simply opens.

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

// iOS's Share button, drawn rather than described.
//
// "Ang kahon na may pataas na arrow" is an accurate description and still
// leaves somebody hunting a toolbar for it. The glyph is the thing they are
// actually looking for, so it is shown at the size it appears on the phone,
// in a box the same shape as the button it sits in.
//
// Inline SVG rather than an image file: it inherits the text colour, stays
// sharp at any size, and cannot be the one asset that failed to load on the
// screen whose whole job is telling somebody what to press.
function ShareGlyph() {
  return (
    <span
      aria-hidden
      className="mx-0.5 inline-flex h-6 w-6 shrink-0 translate-y-1 items-center justify-center rounded-md border border-slate-300 bg-white"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="#0a84ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {/* the arrow leaving the box */}
        <path d="M12 3v11" />
        <path d="M8 7l4-4 4 4" />
        {/* the box it leaves, open at the top so the arrow reads as escaping */}
        <path d="M8 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-2" />
      </svg>
    </span>
  )
}

export function ScanArrivalChoice() {
  const [platform, setPlatform] = useState<'android' | 'ios' | null>(null)
  // Add to Home Screen exists only in Safari. Somebody who opened the code
  // from a Messenger thread is in Meta's browser, where the menu item they
  // are about to be told to find is simply not there.
  const strandedInAnotherApp = platform === 'ios' && isInAppBrowser()

  useEffect(() => {
    if (!ARRIVED_BY_SCAN) return
    if (canUseApk()) setPlatform('android')
    else if (canAddToHomeScreen()) setPlatform('ios')
  }, [])

  if (!platform) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-3 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
        <h2 className="text-base font-bold text-navy-900">Get TODA SafeRide</h2>

        {platform === 'android' ? (
          <>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              You can install the app, or just carry on in your browser — the same booking either way.
            </p>
            <a
              href={APK_PATH}
              download
              onClick={() => setPlatform(null)}
              className="mt-3 block rounded-lg bg-brand-600 py-2.5 text-center text-xs font-bold text-white transition hover:bg-brand-700"
            >
              ⬇️ Install on this phone
            </a>
            <p className="mt-1.5 text-center text-[11px] leading-snug text-slate-500">
              Keeps tracking your trip when the screen locks — the browser cannot. About 11 MB. Android
              will ask before installing, because this is not from the Play Store yet.
            </p>
          </>
        ) : (
          <>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Put it on your Home screen and it opens like an app — no address bar, and it remembers you.
            </p>

            {strandedInAnotherApp && (
              <>
                <a
                  href={safariEscapeUrl()}
                  className="mt-3 block rounded-lg bg-brand-600 py-2.5 text-center text-xs font-bold text-white transition hover:bg-brand-700"
                >
                  🧭 Open in Safari first
                </a>
                <p className="mt-1.5 text-center text-[11px] leading-snug text-slate-500">
                  Kung walang nangyari: pindutin ang ••• sa kanang ibaba, tapos{' '}
                  <span className="font-semibold">Open in Safari</span>. Hindi kayang mag-Add to Home
                  Screen ang browser ng Messenger.
                </p>
              </>
            )}
            {/* Instructions rather than a button, because iOS has no way for a
                page to trigger this. Numbered, because the Share sheet is long
                and the item people miss is the one they have to scroll to. */}
            <ol className="mt-3 space-y-1.5 rounded-lg bg-slate-50 px-3 py-2.5 text-[11px] leading-relaxed text-slate-700">
              <li>
                <span className="font-bold">1.</span> Pindutin ang <ShareGlyph /> —{' '}
                <span className="font-semibold">Share</span>, nasa ibaba ng Safari.
              </li>
              <li>
                <span className="font-bold">2.</span> Mag-scroll pababa sa listahan.
              </li>
              <li>
                <span className="font-bold">3.</span> Piliin ang{' '}
                <span className="font-semibold">Add to Home Screen</span>, tapos{' '}
                <span className="font-semibold">Add</span>.
              </li>
            </ol>
            {/* Only where it is news. Somebody already stranded in another
                app has been told this above, in more useful terms, and saying
                it twice reads as the sheet not knowing where they are. */}
            {!strandedInAnotherApp && (
              <p className="mt-1.5 text-center text-[11px] leading-snug text-slate-500">
                Kailangan itong gawin sa Safari.
              </p>
            )}
          </>
        )}

        {/* Given equal weight, not buried. Most people scanning a code want a
            tricycle now, not a decision about software. */}
        <button
          type="button"
          onClick={() => setPlatform(null)}
          className="mt-3 w-full rounded-lg border border-slate-300 bg-white py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
        >
          Continue in the browser
        </button>
      </div>
    </div>
  )
}
