import { Link } from 'react-router-dom'
import { AppLoginForm } from '../components/AppLoginForm'
import { AndroidAppBanner } from '../components/AndroidAppBanner'
import { NearbyTodaAdCard } from '../components/NearbyTodaAdCard'
import { PilotBranding } from '../components/PilotBranding'
import { BuildLabel } from '../components/BuildLabel'
import { VisionMission } from '../components/VisionMission'
import { usePilotBranding } from '../lib/usePilotBranding'
import { useRides } from '../context/RideContext'

// Trimmed from ten to the four the brand board leads with — a first screen
// that lists everything sells nothing. The rest still describe the product,
// they just don't all belong above the fold.
const FEATURES = [
  { icon: '🛡️', title: 'Safety First', body: 'Verified drivers & secure rides' },
  { icon: '📍', title: 'On-Time', body: 'Real-time tracking & quick pickup' },
  { icon: '👍', title: 'Reliable', body: 'Trusted by our community' },
  // Not "24/7 Support": nobody staffs a line around the clock in the pilot,
  // and a safety promise the service cannot keep is worse than none. Say
  // what every ride really gets.
  { icon: '🧾', title: 'Trip Records', body: 'Driver name and plate saved on every ride' },
]

const MORE_FEATURES = [
  // Not "One-tap SOS": SOS alerts are off in Phase 1 (see
  // SafetySettings.sosAlertsEnabled) — the emergency screen is calls. Update
  // this line when they are switched on.
  { icon: '🚨', title: 'Emergency Assistance', body: 'Call 911, your family, or local hotlines in one tap.' },
  { icon: '💰', title: 'Transparent Fare', body: 'Know your fare before you ride.' },
  { icon: '⭐', title: 'Driver Ratings', body: 'Passenger feedback keeps service safe and accountable.' },
  { icon: '👨‍👩‍👧', title: 'Parents Can Watch', body: "Track your child's trip from your own phone." },
]

export function LandingPage() {
  const pilotBranding = usePilotBranding()
  // The Rotary partnership card — a Super Admin switch (see
  // SuperAdminPage.tsx's "Sign-in screen branding"), not the per-Operator
  // banner upload below. That upload feature (operator.bannerDataUrl) stays
  // in the data model for a future custom banner, but this specific asset
  // is a fixed file: the original combined graphic cropped free of the old
  // TODA SafeRide logo it used to carry, kept off until switched back on.
  const { partnerBannerEnabled } = useRides()
  return (
    <div className="mx-auto max-w-lg bg-white">
      {/* One dark screen, sized to fill the phone rather than just its own
          content — the launch screen is meant to read as a complete app
          screen on its own, with the logo and the "there's more below" arrow
          landing where a phone's own top and bottom would put them, not
          wherever the content happened to end. */}
      <section
        className="relative flex min-h-[calc(100vh-50px)] flex-col overflow-hidden px-6 pb-6 pt-8 text-center"
        // Bright royal blue at the top-left, the app's own near-black navy
        // at the bottom-right — the transition is over by 60% of the way
        // across (the 60%/100% stops share a colour) rather than still
        // fading right up to the corner, so the bottom-right sits on a
        // settled dark rather than a gradient that ran out of room.
        // Diagonal, matching the angle of the stripe texture drawn over it.
        style={{ backgroundImage: 'linear-gradient(135deg, #3e6fe4 0%, #0a1529 60%, #0a1529 100%)' }}
      >
        {/* Diagonal stripes, not a flat panel — the same texture a few pixels
            of gradient give a hero without it needing to be a photograph.
            Kept faint (8% white) so it reads as weave, not as a pattern
            fighting the logo for attention. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(-45deg, white 0, white 2px, transparent 2px, transparent 18px)',
          }}
        />
        {/* Where the pilot is running — the one thing on this screen that
            changes per city. A pill rather than a line of text, so it reads
            as a location badge rather than another sentence to read. */}
        <span className="absolute right-4 top-1 flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
          <span aria-hidden>📍</span> Nueva Ecija
        </span>

        <div className="relative mx-auto flex w-full max-w-xs flex-1 flex-col items-center justify-center">
          {/* An outline, not a filled card — the logo's own transparent
              background stays the dark ground, so it reads as belonging to
              the screen rather than sitting on a patch cut out of it. The
              ring is what still separates it from the stripe texture behind
              it. */}
          {/* What TODA stands for sits inside the logo's own frame, right
              under the mark that says TODA; the frame widens to fit it. */}
          <div className="flex flex-col items-center rounded-2xl border-2 border-white/25 px-4 pb-2.5 pt-3">
            <img src="/logo.png" alt="TODA Ride Mobility" className="h-20 w-auto object-contain" />
            <p className="-mt-1 whitespace-nowrap text-center text-[18px] text-gold-400">
              Transport &amp; Opportunity Digital Access
            </p>
          </div>
          {/* Which build this actually is — see BuildLabel. Right under the
              logo/partner artwork so it's the first thing a screenshot of a
              bug report captures, rather than something found by scrolling
              to the bottom of the page or the login form. */}
          <p className="mt-2 text-center text-xs font-semibold tracking-wide text-white/80">
            <BuildLabel />
          </p>
          {/* Whichever TODA's terminal is nearest right now (or Super
              Admin's manual override, or — if neither — the app's own
              generic name) — see usePilotBranding. A specific org gets the
              ad-like card; the generic name renders plainly, since the app
              naming itself isn't a promotion. */}
          {pilotBranding.specific ? (
            <NearbyTodaAdCard name={pilotBranding.name} showNearYouTag={pilotBranding.showNearYouTag} />
          ) : (
            <div className="mt-4">
              <PilotBranding name={pilotBranding.name} hideSubtitle />
            </div>
          )}
          <p className="mt-2 text-center text-xs font-medium italic leading-snug text-white/70">
            Empowering Drivers. Protecting Passengers.
            <br />
            Strengthening Communities.
          </p>
          {/* One user name and password for everyone — the form works out
              whether you're a rider, parent, driver, TODA officer, partner or
              admin, and sends you to your own page.

              The partner entry point deliberately does NOT live here: signing
              up a pharmacy, resto or store is an account-creation choice, so
              it sits alongside the other account types on the role chooser
              (see RoleChooserPage) rather than cluttering the launch screen. */}
          <div className="mt-6 flex w-full flex-col items-center">
            <AppLoginForm />
          </div>
          {/* The Rotary Community Economic Development Initiative card — off
              unless Super Admin has switched it on. Below the login form's
              "Prototype · simulated data" line rather than under the logo,
              so it does not push the form down. Its navy field is cut away so
              it sits on the cover gradient itself. */}
          {partnerBannerEnabled && (
            <img src="/partner-banner-rotary.png" alt="Rotary Club partnership" className="mx-auto mt-4 w-full max-w-sm" />
          )}
        </div>

        {/* Tells the reader there's more below — without it a page that ends
            right where a phone screen does looks like the entire page. */}
        <span aria-hidden className="relative mt-2 animate-bounce text-lg text-white/40">
          ⌄
        </span>
      </section>

      {/* Hairline instead of a colour change: with the login screen now white
          too, this is the only thing separating the two halves. */}
      <section className="border-t border-slate-200 bg-white px-5 py-10">
        {/* The first thing below the login area, on the white half. Renders
            nothing off Android. -mx-4 cancels the banner's own side margin,
            which this section's padding already provides. */}
        <div className="-mx-4">
          <AndroidAppBanner />
        </div>

        {/* What the name stands for, opening the half of the page that
            explains the app — below the fold rather than in the hero, where
            it would push the login form down. */}
        <div className="mb-8 text-center">
          <p className="text-xl font-extrabold tracking-wide text-navy-900">TODARIDE MOBILITY</p>
          <p className="mx-auto mt-2 max-w-xs text-sm font-medium italic leading-snug text-slate-600">
            Empowering Drivers. Protecting Passengers. Strengthening Communities.
          </p>
          <p className="mt-2 text-xs font-semibold text-brand-700">
            TODA — Transport &amp; Opportunity Digital Access
          </p>
        </div>

        <h2 className="mb-5 text-center text-lg font-bold tracking-tight text-navy-900">
          Why Choose TODA Ride Mobility?
        </h2>

        <div className="grid grid-cols-2 gap-2.5">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-slate-200 bg-white p-3.5 text-center shadow-sm transition hover:border-brand-300 hover:shadow-md"
            >
              <span className="text-2xl leading-none">{f.icon}</span>
              <p className="mt-2 text-sm font-semibold text-navy-900">{f.title}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{f.body}</p>
            </div>
          ))}
        </div>

        {/* The board's navy strip — the one dark element on the light half,
            which is what makes it read as a statement rather than a card. */}
        <div className="mt-2.5 flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3.5">
          <span aria-hidden className="text-base leading-none">🛡️</span>
          <p className="text-xs font-semibold text-gold-400">Your safety is our top priority.</p>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {MORE_FEATURES.map((f) => (
            <div key={f.title} className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <span className="text-lg leading-none">{f.icon}</span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-navy-900">{f.title}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <VisionMission />


      <section className="bg-white px-5 pb-10">
        <div className="rounded-xl bg-brand-600 p-5 text-center">
          <p className="text-sm font-bold text-white">New here?</p>
          <p className="mt-1 text-xs text-slate-400">No terminal visit, no waiting in the rain.</p>
          {/* Goes through the role chooser rather than dropping straight on
              /book's login tabs — otherwise this CTA quietly bypasses the
              step that asks what kind of account to create. */}
          <Link
            to="/welcome?mode=signup"
            className="mt-3 inline-block rounded-full bg-gold-400 px-6 py-2.5 text-sm font-bold text-navy-900 transition hover:bg-gold-500"
          >
            Create an account →
          </Link>
        </div>
      </section>

      {/* The same build info AppLoginForm prints above the fold, repeated
          here at the very bottom of the page — that copy sits inside the
          hero's own scroll area and is easy to miss before reaching "Why
          Choose TODA SafeRide?"; this one is unmissable once someone has
          scrolled the whole page. */}
      <p className="pb-6 text-center text-xs text-slate-500">
        Prototype · simulated data · <BuildLabel />
      </p>
    </div>
  )
}
