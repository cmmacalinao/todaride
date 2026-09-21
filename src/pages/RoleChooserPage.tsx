import { Link, useSearchParams } from 'react-router-dom'
import { useRides } from '../context/RideContext'
import { NearbyTodaAdCard } from '../components/NearbyTodaAdCard'
import { usePilotBranding } from '../lib/usePilotBranding'

interface RoleTile {
  icon: string
  label: string
  // What this account actually is, in the rider's own words — the tile has to
  // be pickable by someone who doesn't know the app's internal role names.
  blurb: string
  // Where the tile lands, per sheet. Passenger lives behind /book's AuthGate
  // (which reads ?role= and ?auth=); Driver and TODA behind /drive's
  // DriverAuthGate (which reads ?mode= / ?toda=); Food Vendors behind
  // /vendor's AuthGate. The LOGIN | SIGNUP pair at the top of that next page
  // switches between the two sheets — this page only asks who they are.
  loginTo: string
  signupTo: string
  // The business tile keeps the gold outline the old "Partner with us" link
  // had, so it still reads as the invitation it is.
  business?: boolean
}

// "As who" — one tap per role. Which sheet opens first is only a starting
// point (Login unless the start screen's "Create an account" sent them here
// with ?mode=signup); the pair of tabs on the next page changes it.
export function RoleChooserPage() {
  const { medsEnabled, vendorsEnabled } = useRides()
  const [searchParams] = useSearchParams()
  const startOn: 'login' | 'signup' = searchParams.get('mode') === 'signup' ? 'signup' : 'login'
  const pilotBranding = usePilotBranding()

  const tiles: RoleTile[] = [
    // Student used to be a tile of its own here. It was never a separate
    // account — it opened this same form with the discount box pre-ticked —
    // so it asked people to classify themselves on a screen where both
    // answers led to the same place. The box is on the form instead.
    //
    // No Parent tile either. A parent is a passenger who has a child on
    // their account: adding a dependant is a step inside passenger
    // registration, so a mother ends up with one login rather than two. The
    // parent role itself is untouched — only the separate way in is gone.
    {
      icon: '🧑',
      label: 'Passenger/Buyer',
      blurb: 'Book tricycle rides and order from Food Express — students get the discounted fare',
      loginTo: '/book?role=passenger&auth=login',
      signupTo: '/book?role=passenger&auth=signup',
    },
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
    // role= and auth= — AuthGate treats the click as roleScoped and shows the
    // actual Pharmacy/Vendor login-or-signup form; without them this landed
    // on the generic identifier login with no way to register a business.
    ...(medsEnabled || vendorsEnabled
      ? [
          {
            icon: '🏪',
            label: vendorsEnabled ? 'Merchant/Stores' : 'Pharmacy',
            blurb: vendorsEnabled
              ? 'Partner with us — sell from your resto or store through TODA Ride Mobility'
              : 'Partner with us — sell from your pharmacy through TODA Ride Mobility',
            loginTo: vendorsEnabled ? '/vendor?role=vendor&auth=login' : '/pharmacy?role=pharmacy&auth=login',
            signupTo: vendorsEnabled ? '/vendor?role=vendor&auth=signup' : '/pharmacy?role=pharmacy&auth=signup',
            business: true,
          } satisfies RoleTile,
        ]
      : []),
  ]

  return (
    // Same pattern as the launch screen behind it: dark navy, the diagonal
    // weave, an outlined mark rather than a filled panel — this and the main
    // login are the two doors into the app, and a visitor bouncing between
    // "use the main login" and "pick a role" should not land on two
    // different products.
    <div
      className="relative min-h-[calc(100vh-50px)] overflow-hidden px-4 pb-8 pt-3"
      // Same royal-blue-to-navy diagonal as the landing page (see
      // LandingPage.tsx).
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
          {/* The same framed logo and tagline as the login screen, so the two
              doors into the app look like one place. */}
          <Link
            to="/"
            aria-label="Back to home"
            className="flex flex-col items-center rounded-2xl border-2 border-white/25 px-[15px] pb-[9.5px] pt-[11.5px]"
          >
            <img src="/logo.png" alt="TODA Ride Mobility" className="h-[76px] w-auto object-contain" />
            <span className="-mt-1 whitespace-nowrap text-center text-[17px] text-gold-400">
              Transport &amp; Opportunity Digital Access
            </span>
          </Link>
          <p className="mt-3 text-center text-xs font-medium italic leading-snug text-white/70">
            Empowering Drivers. Protecting Passengers.
            <br />
            Strengthening Communities.
          </p>
          {/* Same resolution as the launch screen behind this one — see
              usePilotBranding — so the two doors into the app never
              disagree about which TODA a visitor is looking at. */}
          {pilotBranding.specific ? (
            <NearbyTodaAdCard name={pilotBranding.name} showNearYouTag={pilotBranding.showNearYouTag} />
          ) : null /* The generic "TODA Ride Mobility" wordmark was removed
            (2026-09-21) — the framed logo above already says it all. */}
          <h1 className="mt-4 text-sm font-semibold text-white">Who are you?</h1>
          <p className="mt-1 text-xs text-white/50">Pick your account — you log in or sign up on the next page.</p>
        </div>

        <div className="space-y-2.5">
          {tiles.map((tile) => (
            <Link
              key={tile.label}
              to={startOn === 'signup' ? tile.signupTo : tile.loginTo}
              className={`flex items-center gap-3 rounded-xl border p-3.5 transition ${
                tile.business
                  ? 'border-gold-400/40 bg-gold-400/10 hover:border-gold-400 hover:bg-gold-400/20'
                  : 'border-white/15 bg-white/5 hover:border-gold-400/50 hover:bg-white/10'
              }`}
            >
              <span className="text-2xl leading-none">{tile.icon}</span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-semibold ${tile.business ? 'text-gold-400' : 'text-white'}`}>
                  {tile.label}
                </span>
                <span className="mt-0.5 block text-[11px] text-white/55">{tile.blurb}</span>
              </span>
              <span aria-hidden className={tile.business ? 'text-gold-400' : 'text-white/30'}>
                ›
              </span>
            </Link>
          ))}
        </div>

        <p className="mt-6 text-center text-[11px] text-white/40">
          Prefer one box for everything?{' '}
          <Link to="/" className="font-medium text-gold-400 underline hover:text-gold-500">
            Use the main login
          </Link>
        </p>
      </div>
    </div>
  )
}
