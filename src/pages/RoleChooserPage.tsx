import { Link } from 'react-router-dom'
import { useRides } from '../context/RideContext'
import { NearbyTodaAdCard } from '../components/NearbyTodaAdCard'
import { PilotBranding } from '../components/PilotBranding'
import { usePilotBranding } from '../lib/usePilotBranding'

interface RoleTile {
  icon: string
  label: string
  // What this account actually is, in the rider's own words — the tile has to
  // be pickable by someone who doesn't know the app's internal role names.
  blurb: string
  // Where each button lands. Passenger lives behind /book's AuthGate (which
  // reads ?role= and ?auth=); Driver and TODA behind /drive's DriverAuthGate
  // (which reads ?mode=); Food Vendors behind /vendor's AuthGate.
  loginTo: string
  signupTo: string
  // The business card gets the gold outline the old "Partner with us" link
  // had, so it still reads as the invitation it is.
  business?: boolean
}

// "As who" — every role is one card, and under each card sit its own LOGIN
// and SIGNUP. A visitor thinks "I'm a driver" before "do I have an account",
// so the role comes first and the action second, and what they tap is what
// they get — there is no page-level Login/Signup switch whose state a tile
// silently depends on.
export function RoleChooserPage() {
  const { medsEnabled, vendorsEnabled } = useRides()
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
      label: 'Passenger',
      blurb: 'Book tricycle rides for yourself — students get the discounted fare',
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
            label: vendorsEnabled ? 'Food Vendors' : 'Pharmacy',
            blurb: vendorsEnabled
              ? 'Partner with us — sell from your resto or store through TODA SafeRide'
              : 'Partner with us — sell from your pharmacy through TODA SafeRide',
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
      className="relative min-h-[calc(100vh-50px)] overflow-hidden px-4 py-8"
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
        <div className="mb-5 flex flex-col items-center text-center">
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
          <h1 className="mt-4 text-sm font-semibold text-white">Who are you?</h1>
          <p className="mt-1 text-xs text-white/50">Pick your account, then log in or sign up under it.</p>
        </div>

        <div className="space-y-2.5">
          {tiles.map((tile) => (
            <div
              key={tile.label}
              className={`rounded-xl border p-3 ${
                tile.business ? 'border-gold-400/40 bg-gold-400/10' : 'border-white/15 bg-white/5'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl leading-none">{tile.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-semibold ${tile.business ? 'text-gold-400' : 'text-white'}`}>
                    {tile.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-white/55">{tile.blurb}</span>
                </span>
              </div>
              {/* Same pair on every card, same colours: SIGNUP gold (the
                  newcomer is the one who needs the nudge), LOGIN outlined.
                  No selected state — there is nothing to select. */}
              <div className="mt-2.5 flex gap-2">
                <Link
                  to={tile.loginTo}
                  className="flex-1 rounded-lg border border-white/30 bg-white/5 py-2 text-center text-sm font-extrabold uppercase tracking-wide text-white hover:bg-white/15"
                >
                  Login
                </Link>
                <Link
                  to={tile.signupTo}
                  className="flex-1 rounded-lg bg-gold-400 py-2 text-center text-sm font-extrabold uppercase tracking-wide text-navy-900 shadow-sm hover:bg-gold-500"
                >
                  Signup
                </Link>
              </div>
            </div>
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
