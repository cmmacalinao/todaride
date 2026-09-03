import { useEffect, useState } from 'react'
import { checkForAppUpdate, isUpdateSnoozed, snoozeUpdate, type AvailableUpdate } from '../lib/appUpdate'
import { useHasMyOwnTripInFlight } from '../lib/myOwnTripInFlight'

// Tells the installed app that a newer one exists — see lib/appUpdate for
// how it finds out. Renders nothing on the website, and nothing when the
// phone is already current.
//
// A sheet from the bottom, the way ScanArrivalChoice arrives, rather than a
// bar across the top: the top is the header and the bottom is the driver's
// section nav, and this has to sit over both without fighting either.
//
// It cannot install anything. Android does not let an app replace itself
// from a download; the most this can do is hand the tester the file and say
// plainly what the phone will ask on the way — the same two prompts the
// first install had, which are the step people stop at when unwarned.
export function AppUpdateBanner() {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null)

  // Asked on launch, and again whenever the app comes back to the front. A
  // phone that stays open on a driver's handlebars can go days without a
  // cold start, and it is exactly that phone that is furthest behind.
  useEffect(() => {
    let cancelled = false
    const ask = () => {
      if (document.visibilityState !== 'visible') return
      void checkForAppUpdate().then((found) => {
        if (cancelled || !found) return
        if (!found.required && isUpdateSnoozed(found.versionCode)) return
        setUpdate(found)
      })
    }
    ask()
    document.addEventListener('visibilitychange', ask)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', ask)
    }
  }, [])

  // The same quiet moment AppUpdateWatcher waits for, and this device's own
  // trip only — see useHasMyOwnTripInFlight for why it used to be everyone's.
  const busy = useHasMyOwnTripInFlight()

  if (!update || busy) return null

  const later = () => {
    snoozeUpdate(update.versionCode)
    setUpdate(null)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-update-title"
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-3 sm:items-center"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
        <div className="flex items-start gap-3">
          <span aria-hidden className="text-2xl leading-none">
            ⬆️
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="app-update-title" className="text-base font-bold text-navy-900">
              May bagong bersyon: {update.versionName}
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Naka-install ngayon: <span className="font-mono">{__BUILD_LABEL__}</span>
            </p>
          </div>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-slate-600">
          {update.notes || 'May mga pagbabago at ayos. I-download at i-install para makuha ang mga ito.'}
        </p>
        {update.required && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold leading-relaxed text-red-700">
            Kailangan ang update na ito — hindi na gagana nang maayos ang lumang bersyon.
          </p>
        )}

        {/* target=_blank: from inside the app this hands the link to the
            phone's own browser, which is what can download and install it.
            The WebView itself cannot. */}
        <a
          href={update.apkUrl}
          target="_blank"
          rel="noopener"
          className="mt-3 block rounded-lg bg-brand-600 py-2.5 text-center text-sm font-bold text-white transition hover:bg-brand-700"
        >
          ⬇️ I-download ang update
        </a>

        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          Pagkatapos mag-download, buksan ang file para i-install. Magtatanong ang phone bago mag-install —
          piliin ang <span className="font-semibold">Install</span>, at kung may lumabas na{' '}
          <span className="font-semibold">&ldquo;Unsafe app blocked&rdquo;</span>, piliin ang{' '}
          <span className="font-semibold">More details → Install anyway</span>. Normal ito sa app na hindi
          galing sa Play Store. Sa Samsung, kung{' '}
          <span className="font-semibold">&ldquo;Blocked by Auto Blocker&rdquo;</span>: Settings → Security and
          privacy → Auto Blocker → i-off muna.
        </p>

        {!update.required && (
          <button
            type="button"
            onClick={later}
            className="mt-2 w-full py-2 text-center text-xs font-semibold text-slate-500 hover:text-slate-700"
          >
            Mamaya na
          </button>
        )}
      </div>
    </div>
  )
}
