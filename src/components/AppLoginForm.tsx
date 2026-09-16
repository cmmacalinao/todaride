import { BuildLabel } from './BuildLabel'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRides, usePublicOrigin } from '../context/RideContext'
import { useSession } from '../context/SessionContext'
import {
  clearBiometricEnrollment,
  enrollBiometric,
  getBiometricEnrollment,
  isBiometricAvailable,
  verifyBiometric,
} from '../lib/biometricLogin'
import {
  findAccountForRecovery,
  HOME_PATH_BY_ROLE,
  resolveUnifiedLogin,
  type MatchedAccount,
  type RecoveryMatch,
} from '../lib/unifiedLogin'
import { desktopOnlyMessage, isDesktopOnlyRole, isNativeApp } from '../lib/platform'
import { ForgotPasswordFlow } from './ForgotPasswordFlow'
import { OtpVerify } from './OtpVerify'
import { SimpleOtpStep } from './SimpleOtpStep'
import type { AuthedAccountRole } from '../context/SessionContext'

const ROLE_BY_RECOVERY_KIND: Record<RecoveryMatch['kind'], AuthedAccountRole> = {
  passenger: 'passenger',
  parent: 'parent',
  driver: 'driver',
  toda: 'toda_admin',
  pharmacy: 'pharmacy',
  operator: 'operator_admin',
  franchise: 'franchise_admin',
}

const KIND_LABELS: Record<RecoveryMatch['kind'], string> = {
  passenger: 'Passenger',
  parent: 'Parent',
  driver: 'Driver',
  toda: 'TODA',
  pharmacy: 'Pharmacy / Vendor',
  operator: 'Operator',
  franchise: 'Franchise',
}

// Eleven digits starting 09, however the person spaced or dashed them — the
// one identifier here that can be texted a code, which is what decides
// whether the second button offers OTP or sign-up.
function asPhoneNumber(typed: string): string | null {
  const digits = typed.replace(/\D/g, '')
  const local = digits.startsWith('63') ? `0${digits.slice(2)}` : digits
  return /^09\d{9}$/.test(local) ? local : null
}

// Left padding clears a leading icon; both fields carry one so the row reads
// as a pair rather than one plain field and one dressed up. Dark to match the
// launch screen it lives on — a light pill here would be the one bright box
// on an otherwise dark card, drawing the eye for no reason.
const INPUT_CLASS =
  'w-full rounded-full bg-white/10 py-3.5 pl-11 pr-5 text-sm text-white outline-none ring-1 ring-inset ring-white/10 placeholder:text-white/40 focus:ring-2 focus:ring-gold-400/50'

// The single front door: one User Name / Password pair that resolves to
// whichever account it belongs to — rider, parent, driver, TODA officer,
// partner, or App Admin. The per-role login forms behind /book, /drive,
// /admin and the partner portals are untouched and still reachable; this
// only spares people from having to know which one is theirs.
export function AppLoginForm() {
  const navigate = useNavigate()
  const { passengers, parents, drivers, todaOrganizations, pharmacies, operators, franchises } = useRides()
  const {
    setAuthedAccount,
    setRole,
    setCurrentPassengerId,
    setCurrentParentId,
    setLoggedInDriverId,
    setLoggedInTodaAdminOrgId,
    setLoggedInPharmacyId,
    setLoggedInOperatorAdminId,
    setLoggedInFranchiseAdminId,
  } = useSession()

  // Where to send a staff account that reached this form on a phone.
  const { origin, shareable } = usePublicOrigin()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showTerms, setShowTerms] = useState(false)
  const [showForgot, setShowForgot] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [wantsBiometric, setWantsBiometric] = useState(false)
  const [biometricReady, setBiometricReady] = useState(false)
  const [enrollment, setEnrollment] = useState(() => getBiometricEnrollment())
  const [busy, setBusy] = useState(false)
  // App Admin keeps the one-time-code second step it already had — the
  // convenience of a single login form shouldn't quietly downgrade the most
  // privileged account in the system.
  const [pendingAdmin, setPendingAdmin] = useState<MatchedAccount | null>(null)
  // Passwordless entry: a number, a texted code, and whichever account that
  // number belongs to. Candidates are only set when one number turns out to
  // belong to more than one account (a driver who also rides, say).
  const [otpPhone, setOtpPhone] = useState<string | null>(null)
  const [otpCandidates, setOtpCandidates] = useState<RecoveryMatch[] | null>(null)

  useEffect(() => {
    let active = true
    void isBiometricAvailable().then((ok) => {
      if (active) setBiometricReady(ok)
    })
    return () => {
      active = false
    }
  }, [])

  // Applies a resolved identity to the session: the shared authedAccount that
  // unlocks the app, plus whichever per-role id the destination page reads.
  function completeLogin(account: MatchedAccount) {
    // The installed app does not serve Admin or Super Admin (see
    // DESKTOP_ONLY_ROLES). Checked here rather than beside the password
    // comparison because every route in — password, OTP, biometric — ends up
    // in this one function, and a gate on only one of them is not a gate.
    if (isNativeApp() && isDesktopOnlyRole(account.role)) {
      setError('')
      setNotice(desktopOnlyMessage(shareable ? origin : undefined))
      return
    }
    switch (account.role) {
      case 'passenger':
        setCurrentPassengerId(account.id)
        setRole('passenger')
        break
      case 'parent':
        setCurrentParentId(account.id)
        setRole('parent')
        break
      case 'driver':
        setLoggedInDriverId(account.id)
        break
      case 'toda_admin':
        setLoggedInTodaAdminOrgId(account.id)
        break
      case 'pharmacy':
        setLoggedInPharmacyId(account.id)
        break
      case 'operator_admin':
        setLoggedInOperatorAdminId(account.id)
        break
      case 'franchise_admin':
        setLoggedInFranchiseAdminId(account.id)
        break
      case 'admin':
      // Super Admin shares the Admin tab-highlight role: `Role` drives which
      // nav tab looks active, and there is no separate tab identity for it.
      // Access is decided by authedAccount.role, not by this.
      case 'super_admin':
        setRole('admin')
        break
    }
    setAuthedAccount({ role: account.role, id: account.id })
    navigate(HOME_PATH_BY_ROLE[account.role])
  }

  async function finishWithOptionalEnrollment(account: MatchedAccount) {
    if (wantsBiometric && biometricReady) {
      // Enrolling can only fail by the user dismissing the OS prompt, which
      // shouldn't cost them the login they already earned — so the result is
      // deliberately not checked before continuing.
      await enrollBiometric({ role: account.role, id: account.id }, account.name)
    }
    completeLogin(account)
  }

  // The account directories, in the one shape both the password login and
  // the OTP lookup read them in.
  const directories = { passengers, parents, drivers, todaOrganizations, pharmacies, operators, franchises }

  // An organisation still waiting on (or refused) App Admin approval has no
  // working account yet, and a texted code must not become the way around
  // that gate — same refusal the password path gives.
  function orgBlockReason(match: RecoveryMatch): string | null {
    const orgLists: Partial<Record<RecoveryMatch['kind'], { id: string; verificationStatus: string }[]>> = {
      toda: todaOrganizations,
      pharmacy: pharmacies,
      operator: operators,
      franchise: franchises,
    }
    const status = orgLists[match.kind]?.find((o) => o.id === match.id)?.verificationStatus
    if (!status || status === 'approved') return null
    if (status === 'rejected') return `${match.name}'s registration was not approved. Contact the App Admin.`
    return `${match.name} is still awaiting App Admin approval — you can log in once it is approved.`
  }

  async function loginFromPhone(match: RecoveryMatch) {
    const blocked = orgBlockReason(match)
    if (blocked) {
      setError(blocked)
      setOtpCandidates(null)
      return
    }
    setError('')
    setBusy(true)
    await finishWithOptionalEnrollment({ role: ROLE_BY_RECOVERY_KIND[match.kind], id: match.id, name: match.name })
    setBusy(false)
  }

  // A verified number with no account behind it is not a failed login — it is
  // someone who has not registered yet, so it lands them on sign-up rather
  // than on an error.
  function handlePhoneVerified(phone: string) {
    const matches = findAccountForRecovery(directories, phone)
    if (matches.length === 0) {
      navigate('/welcome?mode=signup')
      return
    }
    if (matches.length === 1) {
      void loginFromPhone(matches[0])
      return
    }
    setOtpCandidates(matches)
  }

  async function handleLogin() {
    setNotice('')
    // A number we know, with the password left blank, is not a mistake — it is
    // someone who signs in by code. Texting them one is what they came here
    // for, so pressing Login does it rather than sending them to sign-up for
    // an account they already have.
    const typedPhone = asPhoneNumber(username)
    if (typedPhone && !password.trim() && findAccountForRecovery(directories, typedPhone).length > 0) {
      setError('')
      setOtpCandidates(null)
      setOtpPhone(typedPhone)
      return
    }
    // Nothing typed, or only half of it: there is no login to attempt, and the
    // likeliest reason someone is looking at an empty form is that they do not
    // have an account yet. The button says Login/Register for that reason.
    if (!username.trim() || !password.trim()) {
      setError('')
      navigate('/welcome?mode=signup')
      return
    }
    const outcome = resolveUnifiedLogin(
      { passengers, parents, drivers, todaOrganizations, pharmacies, operators, franchises },
      username,
      password,
    )
    if (outcome.status === 'pending') {
      setError(`${outcome.name} is still awaiting App Admin approval — you can log in once it is approved.`)
      return
    }
    if (outcome.status === 'rejected') {
      setError(`${outcome.name}'s registration was not approved. Contact the App Admin.`)
      return
    }
    if (outcome.status === 'invalid') {
      setError('Incorrect user name or password.')
      return
    }
    setError('')
    if (outcome.needsOtp) {
      setPendingAdmin(outcome.account)
      return
    }
    setBusy(true)
    await finishWithOptionalEnrollment(outcome.account)
    setBusy(false)
  }

  async function handleFingerprint() {
    setError('')
    setNotice('')
    if (!biometricReady) {
      setNotice(
        'This device has no fingerprint or face unlock available to the browser. Use your user name and password instead.',
      )
      return
    }
    if (!enrollment) {
      setNotice(
        'No fingerprint registered on this device yet. Tick "Register my fingerprint on this device", sign in once, and it will be set up.',
      )
      setWantsBiometric(true)
      return
    }
    setBusy(true)
    const verified = await verifyBiometric()
    setBusy(false)
    if (!verified) {
      setError('Fingerprint not recognised.')
      return
    }
    completeLogin({ role: verified.role, id: verified.id, name: verified.label })
  }

  function handleForgetFingerprint() {
    clearBiometricEnrollment()
    setEnrollment(null)
    setNotice('Fingerprint login removed from this device.')
  }

  if (otpPhone) {
    return (
      <div className="w-full max-w-xs space-y-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
        <p className="text-xs text-slate-500">
          Signing in with <span className="font-medium text-slate-800">{otpPhone}</span> — no password needed.
        </p>
        {otpCandidates ? (
          <div className="space-y-1.5">
            <p className="text-xs text-slate-600">This number has more than one account. Which one is this?</p>
            {otpCandidates.map((m) => (
              <button
                key={`${m.kind}-${m.id}`}
                type="button"
                onClick={() => void loginFromPhone(m)}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left text-xs hover:bg-slate-50"
              >
                <span className="truncate font-medium text-slate-700">{m.name}</span>
                <span className="shrink-0 text-[11px] text-slate-500">{KIND_LABELS[m.kind]}</span>
              </button>
            ))}
          </div>
        ) : (
          <OtpVerify
            phone={otpPhone}
            verified={false}
            onVerifiedChange={(ok) => {
              if (ok) handlePhoneVerified(otpPhone)
            }}
          />
        )}
        {error && <p className="px-1 text-xs font-medium text-amber-700">{error}</p>}
        <button
          type="button"
          onClick={() => {
            setOtpPhone(null)
            setOtpCandidates(null)
            setError('')
          }}
          className="w-full text-center text-[11px] font-medium text-slate-500 underline hover:text-slate-700"
        >
          ← Back
        </button>
      </div>
    )
  }

  if (pendingAdmin) {
    return (
      <div className="w-full max-w-xs space-y-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
        <p className="text-xs text-slate-500">
          Password confirmed for <span className="font-medium text-slate-800">{username.trim()}</span> — verify with a
          one-time code to finish logging in.
        </p>
        <SimpleOtpStep
          destination={username.trim().includes('@') ? username.trim() : `${username.trim()}@todaride.ph`}
          onVerified={() => void finishWithOptionalEnrollment(pendingAdmin)}
          onCancel={() => setPendingAdmin(null)}
        />
      </div>
    )
  }

  return (
    <div className="w-full max-w-xs">

      <div className="space-y-2.5">
        <div className="relative">
          <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/40">
            👤
          </span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            // Mobile first, spelled out as the eleven digits people actually
            // type: it is the identifier nearly every rider and driver here
            // knows by heart, and the one they can't misspell.
            placeholder="09XXXXXXXXX, email, or TRC no."
            autoComplete="username"
            aria-label="Mobile number, email, user name, or TRC number"
            className={INPUT_CLASS}
          />
        </div>
        <div className="relative">
          <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/40">
            🔒
          </span>
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleLogin()
            }}
            placeholder="Password"
            autoComplete="current-password"
            aria-label="Password"
            className={`${INPUT_CLASS} pr-16`}
          />
          {/* Only once there is something to reveal — a toggle sitting over
              an empty field invites a tap that does nothing. */}
          {password && (
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gold-400"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          )}
        </div>
      </div>

      {/* Same rule as the sign-up form: a device that cannot do this has
          nothing to offer here, so the row is absent rather than greyed.
          Settings still lists it with the reason. */}
      {!enrollment && biometricReady && (
        <div className="mt-2.5 px-1">
          <label
            className={`flex items-center gap-2 text-[11px] ${
              biometricReady ? 'text-white/70' : 'cursor-not-allowed text-white/30'
            }`}
          >
            <input
              type="checkbox"
              disabled={!biometricReady}
              checked={wantsBiometric && biometricReady}
              onChange={(e) => setWantsBiometric(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-white/30 bg-white/10"
            />
            <span className="font-medium">🔒 Register my fingerprint on this device</span>
          </label>
          <p className="mt-0.5 pl-5 text-[11px] text-white/40">
            {biometricReady
              ? // A fingerprint has to belong to somebody, so it can only be
                // registered as part of a login that has already proved who
                // that is — by password or by texted code, either works.
                'Tick this and sign in once (password or OTP). After that, Fingerprint signs you in on its own.'
              : 'This device or browser has no fingerprint or face unlock available.'}
          </p>
        </div>
      )}

      {error && <p className="mt-2.5 px-1 text-xs font-medium text-amber-400">{error}</p>}
      {notice && <p className="mt-2.5 px-1 text-xs text-white/70">{notice}</p>}

      {/* The same blue as the header bar, not a dark-and-gold match for the
          rest of this screen — the one button here that starts something
          should read as the same brand blue every other primary action in
          the app already uses, not a one-off invented for this screen. */}
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleLogin()}
        className="mt-3 w-full rounded-full bg-brand-600 py-3.5 text-sm font-bold uppercase tracking-wide text-gold-400 shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
      >
        Login / Register
      </button>

      {/* A line either side rather than a bare word — "OR" floating alone
          reads as a stray label; between two rules it reads as the seam
          between two ways in. */}
      <div className="mt-4 flex items-center gap-3">
        <span aria-hidden className="h-px flex-1 bg-white/15" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-white/40">Or</span>
        <span aria-hidden className="h-px flex-1 bg-white/15" />
      </div>

      {/* Outlined, not filled — a second way in reads as optional next to the
          solid button above it, which is what "Or" already said in words. */}
      <div className="mt-3 flex gap-2.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleFingerprint()}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-white/20 bg-white/5 py-3 text-[11px] font-bold uppercase tracking-wide text-white transition hover:bg-white/10 disabled:opacity-60"
        >
          <span aria-hidden>👆</span> Fingerprint
        </button>
        {/* Always the OTP door: registering is what the main Login/Register
            button does now, so this one has a single job and says so. */}
        <button
          type="button"
          onClick={() => {
            const phone = asPhoneNumber(username)
            if (!phone) {
              setError('')
              setNotice('Type your mobile number (09XXXXXXXXX) above, then tap Send OTP.')
              return
            }
            setError('')
            setNotice('')
            setOtpCandidates(null)
            setOtpPhone(phone)
          }}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-white/20 bg-white/5 py-3 text-[11px] font-bold uppercase tracking-wide text-white transition hover:bg-white/10"
        >
          <span aria-hidden>✉️</span> Send OTP
        </button>
      </div>

      {enrollment && (
        <p className="mt-2 px-1 text-center text-[11px] text-white/50">
          Fingerprint set up for {enrollment.label} ·{' '}
          <button type="button" onClick={handleForgetFingerprint} className="underline hover:text-white/80">
            remove
          </button>
        </p>
      )}

      {/* Moved down here from directly under Login/Register — this is the
          "something went wrong" door, not part of the everyday sign-in flow
          above it, so it sits with the fine print rather than competing with
          the buttons someone actually taps every visit. */}
      <button
        type="button"
        onClick={() => setShowForgot(true)}
        className="mt-5 w-full text-center text-[11px] font-bold text-gold-400 underline hover:text-gold-500"
      >
        Forgot password?
      </button>

      <p className="mt-3 px-1 text-center text-[11px] leading-relaxed text-white/50">
        By using this device, you confirm that you have read, understood, and you accept our{' '}
        <button
          type="button"
          onClick={() => setShowTerms(true)}
          className="font-medium text-white underline hover:text-gold-400"
        >
          Terms and Conditions
        </button>
        .
      </p>

      {/* Says the data is simulated, and nothing more. The staff logins
          used to be printed here for demo convenience; they came out when
          the pilot moved to a shared database, where one visitor signing in
          as Super Admin changes the world for every other tester. */}
      <p className="mt-2 px-1 text-center text-xs text-white/70">
        Prototype · simulated data · <BuildLabel />
      </p>



      {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}
      {showForgot && <ForgotPasswordFlow onClose={() => setShowForgot(false)} />}
    </div>
  )
}

function TermsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-sm font-bold text-navy-900">Terms and Conditions</h2>
        <div className="mt-3 space-y-2.5 text-[11px] leading-relaxed text-slate-600">
          <p>
            <span className="font-semibold text-slate-700">This is a prototype.</span> TODA Ride Mobility is being
            demonstrated with simulated data. Rides, payments, orders and alerts shown here are not real, and no
            money changes hands.
          </p>
          <p>
            <span className="font-semibold text-slate-700">Your data stays on this device.</span> Accounts,
            bookings and settings are stored in this browser only. They are not sent to any server, are not shared
            between devices, and are lost if you clear your browser data.
          </p>
          <p>
            <span className="font-semibold text-slate-700">Location.</span> If you allow it, your device location
            is used to show your position on the map and to share a live trip with your driver, passenger or
            parent. It is never uploaded off this device in this prototype.
          </p>
          <p>
            <span className="font-semibold text-slate-700">Emergencies.</span> The SOS button and the hotline
            directory are demonstrations. In a real emergency, call 911 or your local responders directly.
          </p>
          <p>
            <span className="font-semibold text-slate-700">Conduct.</span> Drivers and passengers are expected to
            follow local TODA rules, LTO regulations and city ordinances. Accounts may be paused by a TODA officer
            or the App Admin.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-full bg-brand-600 py-2.5 text-xs font-semibold text-white hover:bg-brand-700"
        >
          Close
        </button>
      </div>
    </div>
  )
}
