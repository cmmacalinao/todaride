import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useRides } from '../context/RideContext'
import { useSession } from '../context/SessionContext'
import {
  APP_ADMIN_CREDENTIALS,
  APP_SUPER_ADMIN_CREDENTIALS,
  APP_SUPER_ADMIN_EMAIL,
  APP_SUPER_ADMIN_NAME,
  MOCK_FRANCHISES,
  MOCK_OPERATORS,
  MOCK_PARENTS,
  MOCK_PASSENGERS,
  MOCK_PHARMACIES,
} from '../mock/data'
import { resolvePhAddress } from '../lib/customLocation'
import { desktopOnlyMessage, isNativeApp } from '../lib/platform'
import { IdentifierLoginForm } from './IdentifierLoginForm'
import { UnifiedAuth } from './UnifiedAuth'
import { PassengerRegisterForm } from './PassengerRegisterForm'
import { ParentRegisterForm } from './ParentRegisterForm'
import { DriverAuthGate } from './DriverAuthGate'
import { SimpleOtpStep } from './SimpleOtpStep'
import { EMPTY_PH_ADDRESS, PhAddressFields, type PhAddressValue } from './PhAddressFields'
import { BUSINESS_TYPE_LABELS, type BusinessType } from '../types'

type GateRole = 'passenger' | 'parent' | 'driver' | 'admin' | 'pharmacy' | 'vendor' | 'operator' | 'franchise'

const ROLE_LABELS: Record<GateRole, string> = {
  passenger: 'Passenger',
  parent: 'Parent',
  driver: 'Driver',
  admin: 'Admin',
  pharmacy: 'Pharmacy',
  vendor: 'Food / Vendor',
  operator: 'Operator',
  franchise: 'Franchise',
}

// Parent is deliberately absent: a parent signs in as a passenger, and the
// child sits on that one account (see PassengerRegisterForm's dependants
// section). ParentAuth and the parent role are left in place below — existing
// parent accounts, the family view of a trip and SOS routing all still work —
// but the login screen no longer offers it as a separate way in.
const ALL_ROLES: GateRole[] = ['passenger', 'driver', 'admin', 'pharmacy', 'vendor', 'operator', 'franchise']

// Which login tabs make sense for whichever entry point sent someone here —
// LandingPage's "Book a Ride →" only ever needs a rider identity
// (Passenger or Parent booking for a child), "I'm a Driver" only ever needs
// the Driver tab, "Admin Operation" only ever needs the Admin form, and
// "/pharmacy" only ever needs the Pharmacy form (no tab row at all —
// there's nothing to choose between, same as /admin). Any other path
// (typed directly) falls back to showing every tab.
function allowedRolesForPath(pathname: string): GateRole[] {
  if (pathname === '/book') return ['passenger']
  if (pathname === '/drive') return ['driver']
  if (pathname === '/admin') return ['admin']
  if (pathname === '/pharmacy') return ['pharmacy']
  if (pathname === '/vendor') return ['vendor']
  if (pathname === '/operator') return ['operator']
  if (pathname === '/franchise') return ['franchise']
  return ALL_ROLES
}

// The Admin, Pharmacy, Operator, and Franchise entry points skip the tab row
// entirely and go straight to their own form — unlike /drive, which still
// shows a single "Driver" pill.
function showsRoleTabs(pathname: string): boolean {
  return (
    pathname !== '/admin' &&
    pathname !== '/pharmacy' &&
    pathname !== '/vendor' &&
    pathname !== '/operator' &&
    pathname !== '/franchise'
  )
}

// Which query parameters mean "I already know who I am and what I came to
// do" — every one of them is put there by the role chooser (see
// RoleChooserPage's tiles) or by a role-scoped invite link.
const ROLE_SCOPED_PARAMS = ['role', 'auth', 'mode', 'toda', 'student', 'invite']

// Blocks the whole app until someone logs in or signs up — rendered by
// App.tsx in place of NavBar/Routes whenever session.authedAccount is null.
// Not itself a route, so it has no URL of its own.
//
// Two doors, and which one opens depends on how the visitor arrived.
//
// Someone who simply hit a protected URL gets UnifiedAuth: one field, one
// password, and the app works out whether they are a rider, driver, officer
// or partner. That is the right greeting for a returning user, and it is
// what replaced a row of eight tabs asking everyone to classify themselves
// before they could type anything.
//
// But someone who came through the role chooser has ALREADY answered that
// question — they picked "Parent", they pressed "Sign up", and the link they
// followed says so ('/book?role=parent&auth=signup'). UnifiedAuth has no
// registration form and no idea what those parameters mean, so sending them
// there dropped them back on a login box for an account they had just said
// they do not have. The registration forms were never removed; nothing
// routed to them any more. This is that route.
export function AuthGate() {
  const [searchParams] = useSearchParams()
  const roleScoped = ROLE_SCOPED_PARAMS.some((key) => searchParams.has(key))
  // Keyed on the query string so a second trip through the role chooser
  // actually lands on the second choice. Picking Passenger and then going
  // back for Parent changes only the search params — same route, same
  // element — so React keeps the mounted form and the role/mode it captured
  // in useState the first time. The key forces a remount, which is exactly
  // what "a different question was asked" should mean here.
  return roleScoped ? <LegacyAuthGate key={searchParams.toString()} /> : <UnifiedAuth />
}

export function LegacyAuthGate() {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { medsEnabled, vendorsEnabled } = useRides()
  // With MEDS off there's nothing for a pharmacy partner to service, so the
  // login option goes away too — their accounts and products stay stored and
  // reachable again the moment Super Admin switches it back on.
  const pathRoles = allowedRolesForPath(location.pathname)
    .filter((r) => medsEnabled || r !== 'pharmacy')
    .filter((r) => vendorsEnabled || r !== 'vendor')
  // Someone landing on /pharmacy while MEDS is off would otherwise be left
  // with no form at all — fall back to the normal rider entry point.
  const withoutParams = pathRoles.length > 0 ? pathRoles : (['passenger'] as GateRole[])
  // The role chooser (see RoleChooserPage) has already asked who they are, so
  // it links here with ?role=/?auth= to land on exactly one form. Anyone
  // reaching a path directly still gets the full tab row as before.
  const requestedRole = searchParams.get('role') as GateRole | null
  const pinnedRole = requestedRole && withoutParams.includes(requestedRole) ? requestedRole : null
  const allowedRoles = pinnedRole ? [pinnedRole] : withoutParams
  const showTabs = allowedRoles.length > 1 && showsRoleTabs(location.pathname)
  const [role, setRole] = useState<GateRole>(allowedRoles[0])
  // Shared between Passenger and Parent so the Log in/Sign up choice is a
  // single row above the Passenger/Parent tabs (not one buried inside each),
  // and switching role tabs doesn't reset which mode was selected.
  const authMode: 'login' | 'signup' = searchParams.get('auth') === 'signup' ? 'signup' : 'login'
  // Drivers and TODAs say it with ?mode=register / ?toda=register rather
  // than ?auth= — one answer for the pair of tabs at the top of the page.
  const isTodaAdmin = searchParams.get('mode') === 'toda_admin' || !!searchParams.get('operatorId')
  const sheetMode: 'login' | 'signup' =
    role === 'driver'
      ? (isTodaAdmin ? searchParams.get('toda') === 'register' : searchParams.get('mode') === 'register')
        ? 'signup'
        : 'login'
      : authMode
  // Switching sheets rewrites only the part of the address that says which
  // sheet — role, student, invite and TODA parameters all stay.
  function selectSheet(next: 'login' | 'signup') {
    const params = new URLSearchParams(searchParams)
    if (role === 'driver') {
      if (isTodaAdmin) {
        params.set('mode', 'toda_admin')
        if (next === 'signup') params.set('toda', 'register')
        else params.delete('toda')
      } else {
        params.set('mode', next === 'signup' ? 'register' : 'login')
      }
    } else {
      params.set('auth', next)
    }
    navigate({ pathname: location.pathname, search: params.toString() })
  }
  // Admin, Operator and Franchise keep their own in-form tabs.
  const showSheetTabs = role === 'passenger' || role === 'parent' || role === 'pharmacy' || role === 'vendor' || role === 'driver'

  // AuthGate doesn't always remount between entry points (e.g. browser
  // back/forward between /book and /drive without passing through '/'), so
  // keep the selected role valid if the allowed set changes under it.
  useEffect(() => {
    if (!allowedRoles.includes(role)) setRole(allowedRoles[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  const isBusinessRole = role === 'pharmacy' || role === 'vendor'

  return (
    // Same royal-blue-to-navy diagonal as the landing/role-chooser screens
    // (see RoleChooserPage.tsx) — every role-scoped login/signup form below
    // already renders its own bordered white card (IdentifierLoginForm,
    // PharmacyAuth, DriverAuthGate's sections, ...), so it drops onto this
    // backdrop unchanged; only this shared header/chrome needed recoloring.
    <div
      className="relative min-h-[calc(100vh-50px)] overflow-hidden"
      style={{ backgroundImage: 'linear-gradient(135deg, #3e6fe4 0%, #0a1529 60%, #0a1529 100%)' }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: 'repeating-linear-gradient(-45deg, white 0, white 2px, transparent 2px, transparent 18px)',
        }}
      />
      <div className="relative mx-auto max-w-lg px-4 pt-6">
        <div className="mb-6 flex flex-col items-center text-center">
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label="Back to home"
          >
            <img
            src="/logo.webp"
            alt="TODA Ride Mobility"
            className={isBusinessRole ? 'h-28 w-auto object-contain' : 'h-16 w-auto object-contain'}
          />
          </button>
          <p className="mt-3 text-sm font-semibold text-white">
            {isBusinessRole ? `${ROLE_LABELS[role]} account` : 'Log in or sign up to continue'}
          </p>
          <span className="mt-1 rounded-full bg-white/10 px-2 py-1 text-[11px] text-white/60">
            Prototype · Simulated data
          </span>
        </div>

        {/* The role chooser only asked who they are; LOGIN or SIGNUP is
            decided here, at the top of the page, and the pair switches the
            sheet below it (?auth= for passengers and businesses, ?mode= /
            ?toda= for drivers and TODAs). */}
        <button
          type="button"
          onClick={() => navigate('/welcome')}
          className="mb-3 rounded-lg border border-white/25 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
        >
          ‹ Go back
        </button>
        {showSheetTabs && <AuthModeTabs mode={sheetMode} setMode={selectSheet} />}

        {showTabs && (
          <div className="mb-4 flex gap-1 rounded-lg bg-white/5 p-1">
            {allowedRoles.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`flex-1 rounded-md py-2 text-xs font-medium transition ${
                  role === r ? 'bg-gold-400 text-navy-900 shadow-sm' : 'text-white/60'
                }`}
              >
                {ROLE_LABELS[r]}
              </button>
            ))}
          </div>
        )}
      </div>

      {role === 'driver' ? (
        <DriverAuth />
      ) : (
        <div className="relative mx-auto max-w-lg px-4 pb-6">
          {role === 'passenger' && <PassengerAuth mode={authMode} asStudent={searchParams.get('student') === '1'} />}
          {role === 'parent' && <ParentAuth mode={authMode} />}
          {role === 'admin' && <AdminAuth />}
          {role === 'pharmacy' && <PharmacyAuth mode={authMode} />}
          {role === 'vendor' && <PharmacyAuth variant="vendor" mode={authMode} />}
          {role === 'operator' && <OperatorAuth />}
          {role === 'franchise' && <FranchiseAuth />}
        </div>
      )}
    </div>
  )
}

// LOGIN | SIGNUP, gold on the selected side — the pair at the top of every
// auth page (and inside the Operator and Franchise forms, which are not
// reached through the role chooser).
export function AuthModeTabs({ mode, setMode }: { mode: 'login' | 'signup'; setMode: (m: 'login' | 'signup') => void }) {
  return (
    <div className="mb-4 flex gap-1 rounded-lg bg-white/5 p-1">
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
  )
}

const MOCK_PASSENGER_IDS = new Set(MOCK_PASSENGERS.map((p) => p.id))

function PassengerAuth({ mode, asStudent = false }: { mode: 'login' | 'signup'; asStudent?: boolean }) {
  const { passengers } = useRides()
  const { setCurrentPassengerId, setAuthedAccount, setRole: setSessionRole } = useSession()

  return (
    <div>
      {mode === 'login' ? (
        <IdentifierLoginForm
          accounts={passengers}
          seedIds={MOCK_PASSENGER_IDS}
          onFound={(id) => {
            setCurrentPassengerId(id)
            setAuthedAccount({ role: 'passenger', id })
            setSessionRole('passenger')
          }}
          noAccountHint="No passenger account found for that name, email, or number — tap Sign up below."
        />
      ) : (
        <PassengerRegisterForm
          asStudent={asStudent}
          onRegistered={(id) => {
            setCurrentPassengerId(id)
            setAuthedAccount({ role: 'passenger', id })
            setSessionRole('passenger')
          }}
        />
      )}
    </div>
  )
}

const MOCK_PARENT_IDS = new Set(MOCK_PARENTS.map((p) => p.id))

function ParentAuth({ mode }: { mode: 'login' | 'signup' }) {
  const { parents } = useRides()
  const { setCurrentParentId, setAuthedAccount, setRole: setSessionRole } = useSession()

  return (
    <div>
      {mode === 'login' ? (
        <IdentifierLoginForm
          accounts={parents}
          seedIds={MOCK_PARENT_IDS}
          onFound={(id) => {
            setCurrentParentId(id)
            setAuthedAccount({ role: 'parent', id })
            setSessionRole('parent')
          }}
          noAccountHint="No parent account found for that name, email, or number — tap Sign up below."
        />
      ) : (
        <ParentRegisterForm
          onRegistered={(id) => {
            setCurrentParentId(id)
            setAuthedAccount({ role: 'parent', id })
            setSessionRole('parent')
          }}
        />
      )}
    </div>
  )
}

function DriverAuth() {
  const { setLoggedInDriverId, setLoggedInTodaAdminOrgId, setAuthedAccount } = useSession()

  return (
    <DriverAuthGate
      onLoggedIn={(driverId) => {
        setLoggedInDriverId(driverId)
        setAuthedAccount({ role: 'driver', id: driverId })
      }}
      onTodaAdminLoggedIn={(orgId) => {
        setLoggedInTodaAdminOrgId(orgId)
        setAuthedAccount({ role: 'toda_admin', id: orgId })
      }}
    />
  )
}

function AdminAuth() {
  const { setAuthedAccount, setRole: setSessionRole } = useSession()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials')

  // Which tier the entered credentials belong to, or null if neither.
  function resolveTier(): 'admin' | 'super_admin' | null {
    const entered = username.trim().toLowerCase()
    const isSuper =
      entered === APP_SUPER_ADMIN_CREDENTIALS.username.toLowerCase() ||
      entered === APP_SUPER_ADMIN_EMAIL.toLowerCase()
    if (isSuper && password === APP_SUPER_ADMIN_CREDENTIALS.password) return 'super_admin'
    if (entered === APP_ADMIN_CREDENTIALS.username && password === APP_ADMIN_CREDENTIALS.password) return 'admin'
    return null
  }

  function handleLogin() {
    if (!resolveTier()) {
      setError('Incorrect username or password.')
      return
    }
    // Same boundary the other two doors draw (see UnifiedAuth and
    // AppLoginForm): the installed app does not serve the staff tiers. This
    // form is currently unreachable — AuthGate renders UnifiedAuth instead —
    // but it is still an admin login, and leaving it open would quietly undo
    // the rule the moment anyone wires it back up.
    if (isNativeApp()) {
      setError(desktopOnlyMessage())
      return
    }
    setError('')
    setStep('otp')
  }

  function handleOtpVerified() {
    const tier = resolveTier()
    if (!tier) return
    setAuthedAccount(tier === 'super_admin' ? { role: 'super_admin', id: 'super-admin' } : { role: 'admin', id: 'admin' })
    setSessionRole('admin')
  }

  if (step === 'otp') {
    return (
      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <p className="text-xs text-slate-500">
          Password confirmed for <span className="font-medium text-slate-700">{username.trim()}</span> — verify
          with a one-time code to finish logging in.
        </p>
        <SimpleOtpStep
          destination={username.trim().includes('@') ? username.trim() : `${username.trim()}@todaride.ph`}
          onVerified={handleOtpVerified}
          onCancel={() => setStep('credentials')}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs text-slate-500">
        Admin access isn't self-service, so there's no Sign up here. Sign in as{' '}
        <span className="font-mono">{APP_ADMIN_CREDENTIALS.username}</span> for day-to-day operations, or{' '}
        <span className="font-mono">{APP_SUPER_ADMIN_CREDENTIALS.username}</span> for Super Admin (the Founder,{' '}
        {APP_SUPER_ADMIN_NAME}, can also use <span className="font-mono">{APP_SUPER_ADMIN_EMAIL}</span>).
      </p>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Username</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-xs font-medium text-amber-700">{error}</p>}
      <button
        type="button"
        onClick={handleLogin}
        className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
      >
        Log in
      </button>
    </div>
  )
}

// TODARIDE MEDS — a pharmacy's own portal login, same shape as TODA Admin's
// org-select + PIN (see DriverAuthGate.tsx's TodaAdminLoginForm), plus a
// self-service Sign up (any pharmacy can register itself — see
// PharmacySignupForm below) since MEDS isn't limited to the seeded partner
// list anymore.
// Every seeded demo pharmacy's PIN is auto-filled on selection (see
// handleSelectPharmacy below) so testing doesn't require looking up PINs in
// mock/data.ts — a self-registered pharmacy/store isn't in this set, so its
// real, actually-secret PIN is never guessed or shown, and still has to be
// typed in by hand like any real login.
const MOCK_PHARMACY_IDS = new Set(MOCK_PHARMACIES.map((p) => p.id))

// One component serves both partner entry points: /pharmacy and /vendor share
// the same account type, portal and login, and differ only in which business
// categories sign-up offers (see SIGNUP_CATEGORIES).
// `mode` comes from the role chooser's own Log in / Sign up choice (via
// ?auth=, held by LegacyAuthGate) — this form used to carry a second toggle
// for the same question, which read as the page asking twice.
function PharmacyAuth({ variant = 'pharmacy', mode }: { variant?: 'pharmacy' | 'vendor'; mode: 'login' | 'signup' }) {
  const navigate = useNavigate()
  const { pharmacies } = useRides()
  const { setLoggedInPharmacyId, setAuthedAccount } = useSession()
  // Login is filtered by the same categories sign-up offers, so a resto owner
  // doesn't scroll a dropdown full of pharmacies to find themselves.
  const categories = SIGNUP_CATEGORIES[variant]
  const [loginType, setLoginType] = useState<BusinessType>(categories[0].value)
  const matching = pharmacies.filter((p) => p.businessType === loginType)
  const [pharmacyId, setPharmacyId] = useState(matching[0]?.id ?? '')
  const [pin, setPin] = useState(() => matching[0]?.id && MOCK_PHARMACY_IDS.has(matching[0].id) ? matching[0].adminPin : '')
  const [error, setError] = useState('')

  function handleSelectPharmacy(id: string) {
    setPharmacyId(id)
    const seed = MOCK_PHARMACY_IDS.has(id) ? pharmacies.find((p) => p.id === id) : undefined
    setPin(seed?.adminPin ?? '')
  }

  // Switching category re-points the selection at that category's first
  // account, so the dropdown and the PIN never disagree with the active tab.
  function handleSelectLoginType(type: BusinessType) {
    setLoginType(type)
    setError('')
    const first = pharmacies.find((p) => p.businessType === type)
    setPharmacyId(first?.id ?? '')
    setPin(first && MOCK_PHARMACY_IDS.has(first.id) ? first.adminPin : '')
  }

  function logIntoPharmacy(id: string) {
    setLoggedInPharmacyId(id)
    setAuthedAccount({ role: 'pharmacy', id })
  }

  function handleLogin() {
    const pharmacy = pharmacies.find((p) => p.id === pharmacyId)
    if (!pharmacy) {
      setError('Select a pharmacy.')
      return
    }
    if (pharmacy.adminPin !== pin) {
      setError('Incorrect PIN.')
      return
    }
    setError('')
    logIntoPharmacy(pharmacy.id)
  }

  const roleParam = variant === 'vendor' ? 'vendor' : 'pharmacy'
  const switchLink = (to: 'login' | 'signup', label: string) => (
    <button
      type="button"
      onClick={() => navigate(`/${roleParam}?role=${roleParam}&auth=${to}`)}
      className="font-semibold text-brand-700 hover:underline"
    >
      {label}
    </button>
  )

  return (
    <div>
      {mode === 'signup' ? (
        <>
          <PharmacySignupForm onRegistered={logIntoPharmacy} variant={variant} />
        </>
      ) : (
        // Same card/label/helper-text shape as IdentifierLoginForm (the
        // passenger/driver/TODA login) — a name/PIN pair works there because
        // every account is unique by name; a pharmacy/vendor's login instead
        // needs to name a business type first, so this row of tabs plus a
        // select stands in for that one identifier field.
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-xs text-slate-500">
            {variant === 'vendor'
              ? 'For partner restaurants, food sellers and other vendors. No account yet? '
              : 'For partner pharmacies and stores. No account yet? '}
            {switchLink('signup', 'Sign up')}
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">What kind of business is this?</label>
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
              {categories.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => handleSelectLoginType(c.value)}
                  className={`flex-1 whitespace-nowrap rounded-md py-1.5 text-[11px] font-medium transition ${
                    loginType === c.value ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-500'
                  }`}
                >
                  {c.icon} {c.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              {BUSINESS_TYPE_LABELS[loginType]}
            </label>
            {matching.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 p-2.5 text-xs text-slate-400">
                No {BUSINESS_TYPE_LABELS[loginType].toLowerCase()} accounts registered yet —{' '}
                {switchLink('signup', 'sign up')} to create the first one.
              </p>
            ) : (
              <select
                value={pharmacyId}
                onChange={(e) => handleSelectPharmacy(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {matching.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {MOCK_PHARMACY_IDS.has(p.id) ? ` (demo, PIN ${p.adminPin})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tracking-widest"
              placeholder="••••"
            />
          </div>
          {error && <p className="text-xs font-medium text-amber-700">{error}</p>}
          <button
            type="button"
            onClick={handleLogin}
            disabled={matching.length === 0}
            className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Log in
          </button>
        </div>
      )}
    </div>
  )
}

// Any pharmacy can sign up — no Admin-approval workflow built for MEDS yet
// (see Pharmacy.verificationStatus's comment), so registering goes live and
// logs straight in, same as Passenger/Parent signup rather than Driver/TODA's
// submit-and-wait pattern.
// The two sign-up entry points share this whole form — only which pair of
// business categories is offered differs, so a Resto signing up never has to
// scroll past pharmacy/prescription options that don't apply to them.
// Pharmacy and Other Commodity are pulled from both signup panels for this
// version — a scope call, not a technical one: TODARIDE MEDS (see
// medsEnabled in Super Admin) and the "sell anything else" catch-all stay
// fully working underneath, just not offered as something new to sign up
// for right now. Re-add the two removed entries here (and flip medsEnabled
// back on) to bring them back — nothing about the underlying flows was
// touched.
const SIGNUP_CATEGORIES: Record<'pharmacy' | 'vendor', { value: BusinessType; icon: string; label: string; blurb: string }[]> = {
  pharmacy: [
    {
      value: 'store',
      icon: '🏪',
      label: 'Store',
      blurb: 'Connects to Food Express — customers can pick you by name for a delivery.',
    },
  ],
  vendor: [
    {
      value: 'resto_food',
      icon: '🍽️',
      label: 'Resto / Food',
      blurb: 'Restaurants, carinderias, bakeries — cooked food and drinks for delivery.',
    },
  ],
}

function PharmacySignupForm({
  onRegistered,
  variant = 'pharmacy',
}: {
  onRegistered: (pharmacyId: string) => void
  variant?: 'pharmacy' | 'vendor'
}) {
  const { registerPharmacy } = useRides()
  const categories = SIGNUP_CATEGORIES[variant]
  const [name, setName] = useState('')
  const [businessType, setBusinessType] = useState<BusinessType>(categories[0].value)
  const [contactPhone, setContactPhone] = useState('')
  const [address, setAddress] = useState<PhAddressValue>(EMPTY_PH_ADDRESS)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (
      !name.trim() ||
      !contactPhone.trim() ||
      !address.province ||
      !address.city ||
      !address.barangay ||
      !address.addressDetail.trim() ||
      pin.trim().length !== 4
    ) {
      setError('Fill in your pharmacy name, contact number, full address (province/city/barangay/detail), and a 4-digit PIN.')
      return
    }
    setError('')
    setSubmitting(true)
    // Geocodes the typed address into both the real gps (for the live map)
    // and an abstract simulation-grid position (for fare/priority-dispatch
    // math) — same helper the booking flow uses to resolve a delivery
    // address, reused here so a self-registered pharmacy is positioned the
    // same way a seeded one is.
    const location = await resolvePhAddress({
      province: address.province,
      city: address.city,
      barangay: address.barangay,
      addressDetail: address.addressDetail.trim(),
    })
    const id = registerPharmacy({
      name: name.trim(),
      businessType,
      contactPhone: contactPhone.trim(),
      province: address.province,
      city: address.city,
      barangay: address.barangay,
      addressDetail: address.addressDetail.trim(),
      coords: location.coords,
      locationGps: location.gps,
      adminPin: pin.trim(),
    })
    setSubmitting(false)
    onRegistered(id)
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs text-slate-500">
        Register your business to start receiving orders — you'll be able to add products/manage orders right after
        signing up.
      </p>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">What kind of business is this?</label>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {categories.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setBusinessType(c.value)}
              className={`flex-1 whitespace-nowrap rounded-md py-1.5 text-[11px] font-medium transition ${
                businessType === c.value ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-500'
              }`}
            >
              {c.icon} {c.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">
          {categories.find((c) => c.value === businessType)?.blurb}
        </p>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">
          {BUSINESS_TYPE_LABELS[businessType]} name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={
            businessType === 'pharmacy'
              ? 'e.g. Mercury Drug — Your Branch'
              : businessType === 'resto_food'
                ? "e.g. Aling Nena's Carinderia"
                : businessType === 'other_commodity'
                  ? 'e.g. RJ Hardware & LPG Supply'
                  : 'e.g. Aling Nena Sari-Sari Store'
          }
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Contact number</label>
        <input
          type="tel"
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
          placeholder="09XX-XXX-XXXX"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <PhAddressFields
        value={address}
        onChange={setAddress}
        addressDetailLabel="Store address (street, landmark, notes)"
        addressDetailPlaceholder="e.g. Unit 2, near the public market entrance"
      />
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Create a 4-digit PIN</label>
        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tracking-widest"
          placeholder="••••"
        />
        <p className="mt-1 text-[11px] text-slate-400">
          Use this to log in to your {BUSINESS_TYPE_LABELS[businessType].toLowerCase()} portal.
        </p>
      </div>
      {error && <p className="text-xs font-medium text-amber-700">{error}</p>}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Registering…' : `Register ${BUSINESS_TYPE_LABELS[businessType].toLowerCase()}`}
      </button>
    </div>
  )
}

const MOCK_OPERATOR_IDS = new Set(MOCK_OPERATORS.map((o) => o.id))

// TaaS Level 2 — "Authorized Operator." Unlike Pharmacy's instant self-service
// signup, an Operator's registration lands 'pending' and login is blocked
// until the App Admin approves it (same pending-block pattern as
// TodaAdminLoginForm in DriverAuthGate.tsx) — becoming an Operator is a
// bigger commitment (activation fee, managing other TODAs) than joining MEDS.
// Admin's "Copy application link" (AdminPage.tsx's TaaS Applications
// section) appends ?apply=1 so the shared link opens straight on the
// Sign-up sub-tab instead of Login — same query-param pattern DriverAuthGate
// already uses for ?mode=toda_admin.
function wantsApplyMode(): boolean {
  return new URLSearchParams(window.location.search).get('apply') === '1'
}

// A Franchise's "Operator sign-up" link/QR (see FranchisePage.tsx) carries
// this so a brand-new Operator registering through it is auto-linked to that
// Franchise — same pattern as DriverAuthGate's inviteOperatorId for TODAs.
function inviteFranchiseId(): string | null {
  return new URLSearchParams(window.location.search).get('franchiseId')
}

function OperatorAuth() {
  const [mode, setMode] = useState<'login' | 'signup'>(() => (wantsApplyMode() || inviteFranchiseId() ? 'signup' : 'login'))
  const { operators } = useRides()
  const { setLoggedInOperatorAdminId, setAuthedAccount } = useSession()
  const [operatorId, setOperatorId] = useState(operators[0]?.id ?? '')
  const [pin, setPin] = useState(() => operators[0]?.id && MOCK_OPERATOR_IDS.has(operators[0].id) ? operators[0].adminPin : '')
  const [error, setError] = useState('')

  function handleSelectOperator(id: string) {
    setOperatorId(id)
    const seed = MOCK_OPERATOR_IDS.has(id) ? operators.find((o) => o.id === id) : undefined
    setPin(seed?.adminPin ?? '')
  }

  function handleLogin() {
    const operator = operators.find((o) => o.id === operatorId)
    if (!operator) {
      setError('Select an Operator.')
      return
    }
    if (operator.adminPin !== pin) {
      setError('Incorrect PIN.')
      return
    }
    if (operator.verificationStatus === 'pending') {
      setError('This Operator application is still under review by the App Admin.')
      return
    }
    if (operator.verificationStatus === 'rejected') {
      setError('This Operator application was not approved. Contact support.')
      return
    }
    setError('')
    setLoggedInOperatorAdminId(operator.id)
    setAuthedAccount({ role: 'operator_admin', id: operator.id })
  }

  return (
    <div>
      <AuthModeTabs mode={mode} setMode={setMode} />
      {mode === 'signup' ? (
        <OperatorRegisterForm onSubmitted={() => setMode('login')} inviteFranchiseId={inviteFranchiseId()} />
      ) : (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-xs text-slate-500">
            Level 2 — for TODA cooperatives and organizations authorized to manage other TODAs. No account yet?
            Switch to Sign up.
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Operator</label>
            <select
              value={operatorId}
              onChange={(e) => handleSelectOperator(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {operators.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.verificationStatus !== 'approved' ? ` (${o.verificationStatus})` : ''}
                  {MOCK_OPERATOR_IDS.has(o.id) ? ` (demo, PIN ${o.adminPin})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          {error && <p className="text-xs font-medium text-amber-700">{error}</p>}
          <button
            type="button"
            onClick={handleLogin}
            className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Log in
          </button>
        </div>
      )}
    </div>
  )
}

function OperatorRegisterForm({
  onSubmitted,
  inviteFranchiseId,
}: {
  onSubmitted: () => void
  inviteFranchiseId: string | null
}) {
  const { registerOperator, setOperatorFranchise, franchises } = useRides()
  const inviteFranchise = inviteFranchiseId ? franchises.find((f) => f.id === inviteFranchiseId) ?? null : null
  const [name, setName] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [province, setProvince] = useState('')
  const [city, setCity] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit() {
    if (
      !name.trim() ||
      !contactPerson.trim() ||
      !contactPhone.trim() ||
      !province.trim() ||
      !city.trim() ||
      pin.trim().length !== 4
    ) {
      setError('Fill in your Operator name, contact person, contact number, province, city, and a 4-digit PIN.')
      return
    }
    const newOperatorId = registerOperator({
      name: name.trim(),
      contactPerson: contactPerson.trim(),
      contactPhone: contactPhone.trim(),
      province: province.trim(),
      city: city.trim(),
      adminPin: pin.trim(),
    })
    if (inviteFranchise) setOperatorFranchise(newOperatorId, inviteFranchise.id)
    setError('')
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <section className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-center">
        <p className="text-sm font-semibold text-brand-800">Application submitted</p>
        <p className="mt-1 text-xs text-slate-600">
          {inviteFranchise
            ? `Your Operator is now linked under ${inviteFranchise.name}. It's still with the App Admin for review — they'll also set your activation and monthly fees on approval. Your PIN will work once it's approved.`
            : "Your Operator application is with the App Admin for review — they'll also set your activation and monthly fees on approval. Your PIN will work once it's approved."}
        </p>
        <button
          onClick={onSubmitted}
          className="mt-3 rounded-lg border border-brand-300 bg-white px-4 py-2 text-xs font-medium text-brand-700 hover:bg-brand-50"
        >
          Back to login
        </button>
      </section>
    )
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700">Apply as an Authorized Operator</h2>
      <p className="text-xs text-slate-500">
        For established TODA cooperatives and organizations ready to manage multiple TODAs under TODASafeRide's
        Level-2 Authorized Operator program.
      </p>

      {inviteFranchise && (
        <div className="rounded-lg border border-brand-200 bg-brand-50 p-3 text-xs text-brand-800">
          <p className="font-medium">Joining {inviteFranchise.name}</p>
          <p className="mt-0.5">
            Registering through this link automatically links your Operator under {inviteFranchise.name} (Level 3)
            once the App Admin approves it — no separate assignment step needed.
          </p>
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Operator name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Nueva Ecija North Operator"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Contact person</label>
        <input
          value={contactPerson}
          onChange={(e) => setContactPerson(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Contact number</label>
        <input
          type="tel"
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
          placeholder="09XX-XXX-XXXX"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Province</label>
          <input
            value={province}
            onChange={(e) => setProvince(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">City</label>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Create a 4-digit PIN</label>
        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tracking-widest"
          placeholder="••••"
        />
      </div>
      {error && <p className="text-xs font-medium text-amber-700">{error}</p>}
      <button
        type="button"
        onClick={handleSubmit}
        className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
      >
        Submit application
      </button>
    </section>
  )
}

const MOCK_FRANCHISE_IDS = new Set(MOCK_FRANCHISES.map((f) => f.id))

// TaaS Level 3 — "Franchise" (territory). Same pending-block pattern as
// Operator above — introduced only after the model is proven, so becoming a
// franchisee is the highest-stakes signup in the app.
function FranchiseAuth() {
  const [mode, setMode] = useState<'login' | 'signup'>(() => (wantsApplyMode() ? 'signup' : 'login'))
  const { franchises } = useRides()
  const { setLoggedInFranchiseAdminId, setAuthedAccount } = useSession()
  const [franchiseId, setFranchiseId] = useState(franchises[0]?.id ?? '')
  const [pin, setPin] = useState(() => franchises[0]?.id && MOCK_FRANCHISE_IDS.has(franchises[0].id) ? franchises[0].adminPin : '')
  const [error, setError] = useState('')

  function handleSelectFranchise(id: string) {
    setFranchiseId(id)
    const seed = MOCK_FRANCHISE_IDS.has(id) ? franchises.find((f) => f.id === id) : undefined
    setPin(seed?.adminPin ?? '')
  }

  function handleLogin() {
    const franchise = franchises.find((f) => f.id === franchiseId)
    if (!franchise) {
      setError('Select a Franchise.')
      return
    }
    if (franchise.adminPin !== pin) {
      setError('Incorrect PIN.')
      return
    }
    if (franchise.verificationStatus === 'pending') {
      setError('This Franchise application is still under review by the App Admin.')
      return
    }
    if (franchise.verificationStatus === 'rejected') {
      setError('This Franchise application was not approved. Contact support.')
      return
    }
    setError('')
    setLoggedInFranchiseAdminId(franchise.id)
    setAuthedAccount({ role: 'franchise_admin', id: franchise.id })
  }

  return (
    <div>
      <AuthModeTabs mode={mode} setMode={setMode} />
      {mode === 'signup' ? (
        <FranchiseRegisterForm onSubmitted={() => setMode('login')} />
      ) : (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-xs text-slate-500">
            Level 3 — the right to operate a TODA Ride Mobility business within an approved territory. No account yet?
            Switch to Sign up.
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Franchise</label>
            <select
              value={franchiseId}
              onChange={(e) => handleSelectFranchise(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {franchises.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                  {f.verificationStatus !== 'approved' ? ` (${f.verificationStatus})` : ''}
                  {MOCK_FRANCHISE_IDS.has(f.id) ? ` (demo, PIN ${f.adminPin})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          {error && <p className="text-xs font-medium text-amber-700">{error}</p>}
          <button
            type="button"
            onClick={handleLogin}
            className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Log in
          </button>
        </div>
      )}
    </div>
  )
}

function FranchiseRegisterForm({ onSubmitted }: { onSubmitted: () => void }) {
  const { registerFranchise } = useRides()
  const [name, setName] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [province, setProvince] = useState('')
  const [city, setCity] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit() {
    if (
      !name.trim() ||
      !contactPerson.trim() ||
      !contactPhone.trim() ||
      !province.trim() ||
      !city.trim() ||
      pin.trim().length !== 4
    ) {
      setError('Fill in your Franchise name, contact person, contact number, territory province, city, and a 4-digit PIN.')
      return
    }
    registerFranchise({
      name: name.trim(),
      contactPerson: contactPerson.trim(),
      contactPhone: contactPhone.trim(),
      province: province.trim(),
      city: city.trim(),
      adminPin: pin.trim(),
    })
    setError('')
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <section className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-center">
        <p className="text-sm font-semibold text-brand-800">Application submitted</p>
        <p className="mt-1 text-xs text-slate-600">
          Your Franchise application is with the App Admin for review — they'll also set your franchise and monthly
          technology fees on approval. Your PIN will work once it's approved.
        </p>
        <button
          onClick={onSubmitted}
          className="mt-3 rounded-lg border border-brand-300 bg-white px-4 py-2 text-xs font-medium text-brand-700 hover:bg-brand-50"
        >
          Back to login
        </button>
      </section>
    )
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700">Apply for a Franchise territory</h2>
      <p className="text-xs text-slate-500">
        For transportation entrepreneurs, TODA cooperatives, and business investors ready to build and operate a
        TODASafeRide territory.
      </p>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Franchise name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Nueva Ecija Franchise"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Contact person</label>
        <input
          value={contactPerson}
          onChange={(e) => setContactPerson(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Contact number</label>
        <input
          type="tel"
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
          placeholder="09XX-XXX-XXXX"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Territory province</label>
          <input
            value={province}
            onChange={(e) => setProvince(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">City</label>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Create a 4-digit PIN</label>
        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tracking-widest"
          placeholder="••••"
        />
      </div>
      {error && <p className="text-xs font-medium text-amber-700">{error}</p>}
      <button
        type="button"
        onClick={handleSubmit}
        className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
      >
        Submit application
      </button>
    </section>
  )
}
