import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useRides } from '../context/RideContext'
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
  {
    icon: '👪',
    label: 'Parent',
    blurb: "Book and track your child's rides",
    loginTo: '/book?role=parent&auth=login',
    // Signing up as a parent is no longer its own account. Adding a child is
    // an option inside passenger registration, so a mother ends up with one
    // login instead of two — see PassengerRegisterForm's dependants section.
    // The tile stays for LOGIN, because parents registered under the old flow
    // still have their own accounts to sign in to.
    signupTo: '/book?role=passenger&auth=signup',
    loginOnly: true,
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
]

// "As who" — for creating an account or signing in. The landing page's own
// User Name / Password form can resolve any existing account without asking,
// but a passenger who does not know that reaches for a Login tab here, so the
// two modes sit side by side and each tile routes to the matching flow.
export function RoleChooserPage() {
  const { medsEnabled, vendorsEnabled } = useRides()
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState<AuthMode>(searchParams.get('mode') === 'login' ? 'login' : 'signup')

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-6 flex flex-col items-center text-center">
        <Link to="/" aria-label="Back to home">
          <img src="/logo.webp" alt="TODA SafeRide" className="h-16 w-auto object-contain" />
        </Link>
        <h1 className="mt-4 text-sm font-semibold text-slate-700">
          {mode === 'signup' ? 'Create your account' : 'Welcome back'}
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          {mode === 'signup' ? 'What will you use TODA SafeRide for?' : 'Which account are you signing in to?'}
        </p>
      </div>

      <div className="mb-5 flex gap-1 rounded-lg bg-slate-100 p-1">
        {(['signup', 'login'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 rounded-md py-2 text-xs font-semibold transition ${
              mode === m ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200'
            }`}
          >
            {m === 'signup' ? 'Sign up' : 'Login'}
          </button>
        ))}
      </div>

      <div className="space-y-2.5">
        {ROLE_TILES.filter((tile) => mode === 'login' || !tile.loginOnly).map((tile) => (
          <Link
            key={tile.label}
            to={mode === 'signup' ? tile.signupTo : tile.loginTo}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition hover:border-brand-300 hover:bg-brand-50"
          >
            <span className="text-2xl leading-none">{tile.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-700">{tile.label}</span>
              <span className="mt-0.5 block text-[11px] text-slate-500">{tile.blurb}</span>
            </span>
            <span aria-hidden className="text-slate-300">
              ›
            </span>
          </Link>
        ))}
      </div>

      {(medsEnabled || vendorsEnabled) && (
        <div className="mt-5">
          <div className="mb-2 flex items-center gap-2">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Business account</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>
          <Link
            to={vendorsEnabled ? '/vendor' : '/pharmacy'}
            className="flex items-center gap-3 rounded-xl border border-gold-400/60 bg-gold-50 p-3.5 shadow-sm transition hover:border-gold-500 hover:bg-gold-100"
          >
            <span className="text-2xl leading-none">🏪</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-navy-900">Pharmacy/Food/Vendors — Partner with us</span>
              <span className="mt-0.5 block text-[11px] text-slate-600">
                {mode === 'signup'
                  ? 'Register your pharmacy, resto or store and sell through TODA SafeRide'
                  : 'Sign in to your pharmacy, resto or store portal'}
              </span>
            </span>
            <span aria-hidden className="text-gold-600">
              ›
            </span>
          </Link>
        </div>
      )}

      <p className="mt-6 text-center text-[11px] text-slate-400">
        {mode === 'signup' ? 'Already have an account? ' : 'Prefer one box for everything? '}
        <Link to="/" className="font-medium text-brand-600 underline hover:text-brand-700">
          {mode === 'signup' ? 'Log in' : 'Use the main login'}
        </Link>
      </p>
    </div>
  )
}
