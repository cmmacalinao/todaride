import { useState } from 'react'
import { isNativeApp } from '../lib/platform'

// Offers the Android app, to the phones that can actually use one.
//
// The shared QR code deliberately points at this website rather than at the
// download, because one code has to work for whoever is holding the phone —
// and an APK is meaningless on an iPhone. So the code brings everybody here,
// and here is where the device is known: Android is offered the app, everyone
// else is offered nothing and simply rides in the browser.
//
// It is offered rather than pushed, and it sits below the fold. Installing is
// a commitment, and asking for it before somebody has seen the thing is how
// you lose the person who only wanted a tricycle. The real argument for the
// app is not the icon — it is that browser geolocation stops when the screen
// locks, which is exactly when a trip is being tracked.
const APK_PATH = '/TodaSafeRide.apk'

function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android/i.test(navigator.userAgent)
}

export function AndroidAppBanner() {
  const [showHow, setShowHow] = useState(false)

  // Already inside the app, or on a phone this file cannot run on.
  if (isNativeApp() || !isAndroid()) return null

  return (
    <section className="mx-4 mb-6 rounded-2xl border-2 border-gold-400 bg-gold-50 p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-2xl leading-none">
          🤖
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-navy-900">Android app available</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Keeps tracking your trip when the screen locks — the browser cannot. Roughly 10 MB.
          </p>

          <a
            href={APK_PATH}
            download
            className="mt-3 block rounded-lg bg-brand-600 py-2 text-center text-xs font-bold text-white transition hover:bg-brand-700"
          >
            ⬇️ Download the app
          </a>

          {/* Said before it happens, not after. Android interrupts a sideload
              with a security warning, and somebody who was not expecting one
              reads it as "this app is unsafe" and stops — which is the correct
              instinct, and the reason to say plainly that it is coming. */}
          <button
            type="button"
            onClick={() => setShowHow((v) => !v)}
            className="mt-2 w-full text-center text-[11px] font-semibold text-brand-700 underline"
          >
            {showHow ? 'Hide' : 'Your phone will warn you — here is why'}
          </button>

          {showHow && (
            <div className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
              <p>
                Android blocks apps that do not come from the Play Store, so it will ask before
                installing. TODA SafeRide is not on the Play Store yet — this is the pilot.
              </p>
              <p className="mt-1.5">
                Kapag lumabas ang <span className="font-semibold">&ldquo;unknown apps&rdquo;</span>, piliin ang{' '}
                <span className="font-semibold">Settings</span> → payagan ang browser →{' '}
                <span className="font-semibold">Install</span>.
              </p>
              <p className="mt-1.5">
                Ayaw mag-install? Gamitin lang ang app dito sa browser — gumagana rin ang lahat.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
