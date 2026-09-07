import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useRides } from '../context/RideContext'
import { NearbyTodaAdCard } from '../components/NearbyTodaAdCard'
import { PilotBranding } from '../components/PilotBranding'
import { usePilotBranding } from '../lib/usePilotBranding'
type AuthMode = 'login' | 'signup'

interface RoleTile {
  icon: string
  label: string
  // What this account actually is, in the rider's own words — the tile has to
  // be pickable by someone who doesn't know the app's internal role names.
  blurb: string
  // Where each mode lands. Passenger/Parent/Student all live behind /book's
  // AuthGate (which reads ?role= and ?auth=); Driver and TODA behind /drive's
  // DriverAuthGate (which reads ?mode=).
  loginTo: string
  signupTo: string
  // Shown when choosing who is signing in, hidden when choosing what to
  // create — there is nothing here to create any more.
  loginOnly?: boolean
}

const ROLE_TILES: RoleTile[] = [
  // Student used to be a tile of its own here. It was never a separate
  // account — it opened this same form with the discount box pre-ticked — so
  // it asked people to classify themselves on a screen where both answers
  // led to the same place. The box is on the form, where someone can also
  // change their mind about it.
  {
    icon: '🧑',
    label: 'Passenger',
    blurb: 'Book tricycle rides for yourself — students get the discounted fare',
    loginTo: '/book?role=passenger&auth=login',
    signupTo: '/book?role=passenger&auth=signup',
  },
  // No Parent tile. A parent is a passenger who has a child on their account:
  // adding a dependant is a step inside passenger registration, so a mother
  // ends up with one login rather than two, and this screen no longer asks
  // her to classify herself before it can show her a form.
  //
  // The parent role itself is untouched — dependants, the family view of a
  // trip, and where an SOS goes all still work. Only the separate way in is
  // gone.
  {
    icon: '🛵',
    label: 'Driver',
    blurb: 'Accept bookings and earn with your tricycle',
    loginTo: '/drive?mode=login',
    signupTo: '/drive?mode=register',
  },
  {
    icon: '🏛️',
    label: 'TODA',
    blurb: 'Manage your association, drivers and dues',
    loginTo: '/drive?mode=toda_admin',
    signupTo: '/drive?mode=toda_admin&toda=register',
  },
]

// "As who" — for creating an account or signing in. The landing page's own
// User Name / Password form can resolve any existing account without asking,
// but a passenger who does not know that reaches for a Login tab here, so the
// two modes sit side by side and each tile routes to the matching flow.
export function RoleChooserPage() {
  const { medsEnabled, vendorsEnabled } = useRides()
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState<AuthMode>(searchParams.get('mode') === 'login' ? 'login' : 'signup')
  const pilotBranding = usePilotBranding()

  return (
    // Same pattern as the launch screen behind it: dark navy, the diagonal
    // weave, an outlined mark rather than a filled panel — this and the main
    // login are the two doors into the app, and a visitor bouncing between
    // "use the main login" and "pick a role" should not land on two
    // different products.
    <div
      className="relative min-h-[calc(100vh-50px)] overflow-hidden px-4 py-8"
      // Same royal-blue-to-navy diagonal as the landing page (see
      // LandingPage.tsx) — this is the other door into the app, and a
      // visitor bouncing between the two should land on one product, not
      // two differently-lit versions of it.
      style={{ backgroundImage: 'linear-gradient(135deg, #3e6fe4 0%, #0a1529 60%, #0a1529 100%)' }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: 'repeating-linear-gradient(-45deg, white 0, white 2px, transparent 2px, transparent 18px)',
        }}
      />
      <div className="relative mx-auto max-w-lg">
        {/* The way back to the main login, in words — the logo above also
            links home, but a picture is not a button to everyone. */}
        <Link
          to="/"
          className="mb-3 inline-block rounded-lg border border-white/25 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
        >
          ‹ Go back
        </Link>
        <div className="mb-6 flex flex-col items-center text-center">
          <Link to="/" aria-label="Back to home" className="rounded-2xl border-2 border-white/25 p-3">
            <img src="/logo.webp" alt="TODA SafeRide" className="h-14 w-auto object-contain" />
          </Link>
          {/* Same resolution as the launch screen behind this one — see
              usePilotBranding — so the two doors into the app never
              disagree about which TODA a visitor is looking at. */}
          {pilotBranding.specific ? (
            <NearbyTodaAdCard name={pilotBranding.name} showNearYouTag={pilotBranding.showNearYouTag} />
          ) : (
            <div className="mt-3">
              <PilotBranding name={pilotBranding.name} />
            </div>
          )}
          <h1 className="mt-4 text-sm font-semibold text-white">
            {mode === 'signup' ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="mt-1 text-xs text-white/50">
            {mode === 'signup' ? 'What will you use TODA SafeRide for?' : 'Which account are you signing in to?'}
          </p>
        </div>

        <div className="mb-5 flex gap-1 rounded-lg bg-white/5 p-1">
          {(['login', 'signup'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 rounded-md py-2.5 text-base font-extrabold uppercase tracking-wide transition ${
                mode === m ? 'bg-gold-400 text-navy-900 shadow-sm' : 'text-white/60 hover:bg-white/10'
              }`}
            >
              {m === 'signup' ? 'Signup' : 'Login'}
            </button>
          ))}
        </div>

        <div className="space-y-2.5">
          {ROLE_TILES.filter((tile) => mode === 'login' || !tile.loginOnly).map((tile) => (
            <Link
              key={tile.label}
              to={mode === 'signup' ? tile.signupTo : tile.loginTo}
              className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 p-3.5 transition hover:border-gold-400/50 hover:bg-white/10"
            >
              <span className="text-2xl leading-none">{tile.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-white">{tile.label}</span>
                <span className="mt-0.5 block text-[11px] text-white/50">{tile.blurb}</span>
              </span>
              <span aria-hidden className="text-white/30">
                ›
              </span>
            </Link>
          ))}
        </div>

        {(medsEnabled || vendorsEnabled) && (
          <div className="mt-5">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-px flex-1 bg-white/15" />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Business account</span>
              <span className="h-px flex-1 bg-white/15" />
            </div>
            {/* role= (and auth=signup, since "Partner with us" is an
                invitation to sign up, not a returning login) — every other
                tile on this page passes these so AuthGate treats the click
                as roleScoped and shows the actual Pharmacy/Vendor
                login-or-signup form; without them this landed on the
                generic identifier login instead, with no way to register a
                new business account from here at all. */}
            <Link
              // The Log in / Sign up choice made on this page is the one the
              // business form opens on — it has no toggle of its own.
              to={vendorsEnabled ? `/vendor?role=vendor&auth=${mode}` : `/pharmacy?role=pharmacy&auth=${mode}`}
              className="flex items-center gap-3 rounded-xl border border-gold-400/40 bg-gold-400/10 p-3.5 transition hover:border-gold-400 hover:bg-gold-400/20"
            >
              <span className="text-2xl leading-none">🏪</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-gold-400">
                  {vendorsEnabled ? 'Food/Vendors — Partner with us' : 'Pharmacy — Partner with us'}
                </span>
                <span className="mt-0.5 block text-[11px] text-white/60">
                  {mode === 'signup'
                    ? 'Register your pharmacy, resto or store and sell through TODA SafeRide'
                    : 'Sign in to your pharmacy, resto or store portal'}
                </span>
              </span>
              <span aria-hidden className="text-gold-400">
                ›
              </span>
            </Link>
          </div>
        )}

        <p className="mt-6 text-center text-[11px] text-white/40">
          {mode === 'signup' ? 'Already have an account? ' : 'Prefer one box for everything? '}
          <Link to="/" className="font-medium text-gold-400 underline hover:text-gold-500">
            {mode === 'signup' ? 'Log in' : 'Use the main login'}
          </Link>
        </p>
      </div>
    </div>
  )
}
