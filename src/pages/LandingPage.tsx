import { Link } from 'react-router-dom'
import { AppLoginForm } from '../components/AppLoginForm'
import { AndroidAppBanner } from '../components/AndroidAppBanner'
import { NearbyTodaAdCard } from '../components/NearbyTodaAdCard'
import { PilotBranding } from '../components/PilotBranding'
import { usePilotBranding } from '../lib/usePilotBranding'

// Trimmed from ten to the four the brand board leads with — a first screen
// that lists everything sells nothing. The rest still describe the product,
// they just don't all belong above the fold.
const FEATURES = [
  { icon: '🛡️', title: 'Safety First', body: 'Verified drivers & secure rides' },
  { icon: '📍', title: 'On-Time', body: 'Real-time tracking & quick pickup' },
  { icon: '👍', title: 'Reliable', body: 'Trusted by our community' },
  { icon: '🎧', title: '24/7 Support', body: "We're here for you" },
]

const MORE_FEATURES = [
  { icon: '🚨', title: 'Emergency Assistance', body: 'One-tap SOS, and local hotlines for your city.' },
  { icon: '💰', title: 'Transparent Fare', body: 'Know your fare before you ride.' },
  { icon: '⭐', title: 'Driver Ratings', body: 'Passenger feedback keeps service safe and accountable.' },
  { icon: '👨‍👩‍👧', title: 'Parents Can Watch', body: "Track your child's trip from your own phone." },
]

export function LandingPage() {
  const pilotBranding = usePilotBranding()
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
          {/* The Rotary partnership artwork, in place of the old logo card. Its
              navy field is cut away so it sits on the cover gradient itself
              rather than on a rectangle of a slightly different blue. */}
          <img
            src="/partner-banner.webp"
            alt="TODA SafeRide — For You. For Your Family. For Our Community. Rotary Community Economic Development Initiative, promoting safe, accessible and sustainable transportation."
            className="mx-auto w-full max-w-sm"
          />
          {/* Whichever TODA's terminal is nearest right now (or Super
              Admin's manual override, or — if neither — the app's own
              generic name) — see usePilotBranding. A specific org gets the
              ad-like card; the generic name renders plainly, since the app
              naming itself isn't a promotion. */}
          {pilotBranding.specific ? (
            <NearbyTodaAdCard name={pilotBranding.name} showNearYouTag={pilotBranding.showNearYouTag} />
          ) : (
            <div className="mt-4">
              <PilotBranding name={pilotBranding.name} />
            </div>
          )}

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
        <h2 className="mb-5 text-center text-lg font-bold tracking-tight text-navy-900">
          Why Choose TODA SafeRide?
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

      {/* Below the features, above the sign-up card: by here somebody has
          seen what the app does, which is the point at which installing it
          is a reasonable thing to ask. Renders nothing off Android. */}
      <AndroidAppBanner />

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
    </div>
  )
}
