import { Link } from 'react-router-dom'
import { AppLoginForm } from '../components/AppLoginForm'

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
  return (
    <div className="mx-auto max-w-lg bg-white">
      {/* Fills the rest of the viewport so the logo and the login form are the
          whole first screen — everything below is reached by scrolling, which
          is what makes this read as a launch screen rather than a list. */}
      <section className="relative flex min-h-[calc(100vh-50px)] flex-col items-center justify-center overflow-hidden bg-white px-6 pb-14 pt-8 text-center">
        <div className="relative -mt-6 flex w-full flex-col items-center">
          {/* Bare, with no panel behind it. The mark is a transparent PNG and
              its white "SafeRide" wordmark carries a heavy black keyline, so it holds
              up on the white page without a coloured backing — and the blue
              pin keeps its contrast instead of dissolving into one. */}
          <img src="/logo.webp" alt="TODA SafeRide — Safe Rides for You and Your Family" className="w-48" />

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

        {/* Tells the reader there's more below — without it a full-height
            launch screen looks like the entire page. */}
        <span aria-hidden className="absolute bottom-5 animate-bounce text-lg text-slate-300">
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
