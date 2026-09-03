import { BuildLabel } from './BuildLabel'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRides, usePublicOrigin } from '../context/RideContext'
import { useSession } from '../context/SessionContext'
import { desktopOnlyMessage, isNativeApp } from '../lib/platform'
import { APP_ADMIN_CREDENTIALS, APP_SUPER_ADMIN_CREDENTIALS, APP_SUPER_ADMIN_EMAIL } from '../mock/data'

// One door for everybody.
//
// The old gate asked "which of eight kinds of person are you?" before it
// asked anything else — a row of tabs reading Passenger, Parent, Driver,
// Admin, Pharmacy, Food/Vendor, Operator, Franchise. But people do not think
// of themselves as a role in a tab bar; they know their number, and a driver
// knows the TRC number painted on their sidecar. So this asks for that, and
// works out the role itself.
//
// Order matters below: the staff credentials are checked first because they
// are exact strings, then drivers by TRC number, then everyone else by
// name/email/phone. Whoever matches, matches — nobody has to know which list
// they are in.

type Matched =
  | { kind: 'admin'; tier: 'admin' | 'super_admin' }
  | { kind: 'driver'; id: string; name: string }
  | { kind: 'passenger'; id: string; name: string }
  | { kind: 'parent'; id: string; name: string }
  | { kind: 'toda_admin'; id: string; name: string }

function norm(v: string): string {
  return v.trim().toLowerCase()
}

// A person is "found" by any of the things they actually know about
// themselves: the number they give out, their email, their name as
// registered, or — for a driver — the number on the tricycle.
function matchesAccount(a: { name: string; phone?: string | null; email?: string | null }, needle: string): boolean {
  const n = norm(needle)
  if (!n) return false
  if (a.email && norm(a.email) === n) return true
  if (a.phone && a.phone.replace(/[^\d]/g, '') === needle.replace(/[^\d]/g, '') && needle.replace(/[^\d]/g, '')) return true
  return norm(a.name) === n || norm(a.name).startsWith(n + ' ') || norm(a.name).split(' ')[0] === n
}

export function UnifiedAuth() {
  const navigate = useNavigate()
  const { drivers, passengers, parents, todaOrganizations } = useRides()
  // Where to send an admin who tried to sign in on a phone. Falls back to a
  // generic "open the web app" when nobody has published an address yet (see
  // usePublicOrigin) — naming https://localhost would be worse than vague.
  const { origin, shareable } = usePublicOrigin()
  const {
    setCurrentPassengerId,
    setCurrentParentId,
    setLoggedInDriverId,
    setLoggedInTodaAdminOrgId,
    setAuthedAccount,
    setRole,
  } = useSession()

  const [identifier, setIdentifier] = useState('')
  const [secret, setSecret] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  function findMatch(): Matched | 'wrong-secret' | null {
    const id = identifier.trim()
    if (!id) return null

    // Staff first — exact usernames, so they can never be shadowed by someone
    // whose name happens to be similar.
    const isSuper = norm(id) === norm(APP_SUPER_ADMIN_CREDENTIALS.username) || norm(id) === norm(APP_SUPER_ADMIN_EMAIL)
    if (isSuper) {
      return secret === APP_SUPER_ADMIN_CREDENTIALS.password ? { kind: 'admin', tier: 'super_admin' } : 'wrong-secret'
    }
    if (norm(id) === norm(APP_ADMIN_CREDENTIALS.username)) {
      return secret === APP_ADMIN_CREDENTIALS.password ? { kind: 'admin', tier: 'admin' } : 'wrong-secret'
    }

    // The TRC number is a driver's most natural identifier — it is painted on
    // the sidecar and it is what a passenger reports.
    const byPlate = drivers.find((d) => norm(d.plateNumber) === norm(id))
    const driver = byPlate ?? drivers.find((d) => matchesAccount(d, id))
    if (driver) {
      if (driver.pin && secret !== driver.pin) return 'wrong-secret'
      return { kind: 'driver', id: driver.id, name: driver.name }
    }

    const toda = todaOrganizations.find((o) => norm(o.name) === norm(id))
    if (toda) {
      if (toda.adminPin && secret !== toda.adminPin) return 'wrong-secret'
      return { kind: 'toda_admin', id: toda.id, name: toda.name }
    }

    const passenger = passengers.find((p) => matchesAccount(p, id))
    if (passenger) {
      if (passenger.pin && secret !== passenger.pin) return 'wrong-secret'
      return { kind: 'passenger', id: passenger.id, name: passenger.name }
    }

    const parent = parents.find((p) => matchesAccount(p, id))
    if (parent) {
      if (parent.pin && secret !== parent.pin) return 'wrong-secret'
      return { kind: 'parent', id: parent.id, name: parent.name }
    }

    return null
  }

  function signIn() {
    const match = findMatch()
    if (match === null) {
      setError('No account found for that number, email, user name, or TRC no.')
      return
    }
    if (match === 'wrong-secret') {
      setError('That password does not match the account.')
      return
    }
    // The installed app does not serve the two staff tiers (see
    // DESKTOP_ONLY_ROLES). The credentials are still correct — this is not a
    // failed login — so say where they do work rather than rejecting them.
    if (match.kind === 'admin' && isNativeApp()) {
      setError('')
      setNotice(desktopOnlyMessage(shareable ? origin : undefined))
      return
    }
    setError('')
    switch (match.kind) {
      case 'admin':
        setAuthedAccount({ role: match.tier, id: match.tier })
        setRole('admin')
        navigate(match.tier === 'super_admin' ? '/super-admin' : '/admin')
        break
      case 'driver':
        setLoggedInDriverId(match.id)
        setAuthedAccount({ role: 'driver', id: match.id })
        setRole('driver')
        navigate('/drive')
        break
      case 'toda_admin':
        setLoggedInTodaAdminOrgId(match.id)
        setAuthedAccount({ role: 'toda_admin', id: match.id })
        navigate('/toda-admin')
        break
      case 'passenger':
        setCurrentPassengerId(match.id)
        setAuthedAccount({ role: 'passenger', id: match.id })
        setRole('passenger')
        navigate('/')
        break
      case 'parent':
        setCurrentParentId(match.id)
        setAuthedAccount({ role: 'parent', id: match.id })
        setRole('parent')
        navigate('/parent')
        break
    }
  }

  const field =
    'w-full rounded-full border-0 bg-slate-100 px-5 py-3.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-600/40'

  return (
    <div className="mx-auto max-w-sm px-5 pb-10 pt-8">
      <div className="mb-8 flex justify-center">
        <button type="button" onClick={() => navigate('/')} aria-label="TODA SafeRide home">
          <img src="/logo.webp" alt="TODA SafeRide" className="h-28 w-auto object-contain" />
        </button>
      </div>

      <div className="space-y-3">
        <input
          value={identifier}
          onChange={(e) => {
            setIdentifier(e.target.value)
            setError('')
          }}
          placeholder="09XXXXXXXXX, email, user name, or TRC no."
          className={field}
          autoComplete="username"
        />
        <input
          type="password"
          value={secret}
          onChange={(e) => {
            setSecret(e.target.value)
            setError('')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') signIn()
          }}
          placeholder="Password"
          className={field}
          autoComplete="current-password"
        />

        {error && <p className="px-2 text-center text-xs font-medium text-amber-700">{error}</p>}
        {notice && <p className="px-2 text-center text-xs font-medium text-brand-700">{notice}</p>}

        <button
          type="button"
          onClick={signIn}
          className="w-full rounded-full bg-brand-600 py-4 text-base font-extrabold uppercase tracking-wide text-gold-400 shadow-sm transition hover:bg-brand-700"
        >
          Login / Register
        </button>

        <div className="pt-1 text-center">
          <button
            type="button"
            onClick={() => setNotice('Ask your TODA or the app admin to reset it for you.')}
            className="text-sm font-bold text-brand-700 underline"
          >
            Forgot password?
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          {/* Both are real intentions with no implementation behind them yet,
              so they say so rather than failing silently — a dead button
              teaches people not to trust the ones that do work. */}
          <button
            type="button"
            onClick={() => setNotice('Fingerprint sign-in is not switched on for this device yet.')}
            className="rounded-full bg-brand-600 py-3.5 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-brand-700"
          >
            Fingerprint
          </button>
          <button
            type="button"
            onClick={() => setNotice('One-time codes are not sent in this prototype — use your password.')}
            className="rounded-full bg-brand-600 py-3.5 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-brand-700"
          >
            Send OTP
          </button>
        </div>

        <p className="px-2 pt-3 text-center text-xs leading-relaxed text-slate-500">
          By using this device, you confirm that you have read, understood, and you accept our{' '}
          <button type="button" onClick={() => navigate('/privacy')} className="font-bold text-brand-700 underline">
            Terms and Conditions
          </button>
          .
        </p>

        {/* Prototype only. The staff logins that used to be printed here
            came out when the pilot moved to a shared database — see the note
            beside APP_ADMIN_CREDENTIALS. */}
        <p className="px-2 text-center text-[11px] leading-relaxed text-slate-400">
          Prototype · simulated data · <BuildLabel />
        </p>
      </div>
    </div>
  )
}
