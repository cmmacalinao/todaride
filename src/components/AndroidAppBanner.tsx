import { useState } from 'react'
import { APK_PATH, canUseApk } from './InstallOffer'

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

export function AndroidAppBanner() {
  const [showHow, setShowHow] = useState(false)

  if (!canUseApk()) return null

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
              with two security warnings, and somebody who was not expecting
              them reads it as "this app is unsafe" and stops — which is the
              correct instinct, and the reason to say plainly that they are
              coming. */}
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
                <span className="font-semibold">1.</span> Kapag lumabas ang{' '}
                <span className="font-semibold">&ldquo;unknown apps&rdquo;</span>, piliin ang{' '}
                <span className="font-semibold">Settings</span> → payagan ang browser →{' '}
                <span className="font-semibold">Install</span>.
              </p>
              {/* The second prompt, named on purpose. Play Protect says
                  "Unsafe app blocked", which reads as a virus warning rather
                  than the routine unsigned-app notice it is — and it is the
                  step pilot testers stop at, having already got past the
                  first one and not expecting another. */}
              <p className="mt-1.5">
                <span className="font-semibold">2.</span> Kung may lumabas na{' '}
                <span className="font-semibold">&ldquo;Unsafe app blocked&rdquo;</span> o{' '}
                <span className="font-semibold">&ldquo;Scan app?&rdquo;</span> mula sa Play Protect, piliin ang{' '}
                <span className="font-semibold">More details</span> →{' '}
                <span className="font-semibold">Install anyway</span>. Normal ito sa lahat ng app na hindi
                galing sa Play Store — hindi ibig sabihin na may virus.
              </p>
              {/* Samsung, named on purpose: One UI's Auto Blocker refuses
                  sideloads outright with no "install anyway" — the tester
                  just sees it fail — and the pilot's testers are on Samsung. */}
              <p className="mt-1.5">
                <span className="font-semibold">3. Samsung:</span> kung sinasabing{' '}
                <span className="font-semibold">&ldquo;Blocked by Auto Blocker&rdquo;</span>, pumunta sa{' '}
                <span className="font-semibold">Settings → Security and privacy → Auto Blocker</span>, i-off
                muna, i-install, tapos i-on ulit.
              </p>
              {/* The one-time cost of moving off the debug certificate: the
                  new key cannot upgrade an install signed with the old one,
                  and Android's message for that says nothing useful. */}
              <p className="mt-1.5">
                <span className="font-semibold">May luma nang TODA SafeRide sa phone?</span> I-uninstall muna
                ito bago i-install ang bago — kung hindi, sasabihin ng phone na{' '}
                <span className="font-semibold">&ldquo;App not installed&rdquo;</span>. Isang beses lang ito.
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
