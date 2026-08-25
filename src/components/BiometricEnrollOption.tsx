import { useEffect, useState } from 'react'
import {
  clearBiometricEnrollment,
  enrollBiometric,
  getBiometricEnrollment,
  isBiometricAvailable,
} from '../lib/biometricLogin'
import type { AuthedAccountRole } from '../context/SessionContext'

// Offering fingerprint at sign-up rather than only at login: the moment an
// account is created is when the person is holding the phone they will use it
// on, and it spares them typing a PIN they set thirty seconds ago. The
// enrollment itself can only happen after the account exists — WebAuthn ties
// a credential to a user id — so this is a choice made during the form and
// acted on once registration returns an id.
export function useBiometricEnrollChoice() {
  const [ready, setReady] = useState(false)
  const [wanted, setWanted] = useState(false)
  const [alreadyEnrolled] = useState(() => getBiometricEnrollment() !== null)

  useEffect(() => {
    let active = true
    void isBiometricAvailable().then((ok) => {
      if (active) setReady(ok)
    })
    return () => {
      active = false
    }
  }, [])

  // Failing here can only mean the OS prompt was dismissed, which must not
  // cost someone the account they just finished registering — so the result
  // is deliberately not checked by callers.
  async function enrollIfWanted(account: { role: AuthedAccountRole; id: string }, label: string) {
    if (!wanted || !ready) return
    await enrollBiometric(account, label)
  }

  return { ready, wanted, setWanted, alreadyEnrolled, enrollIfWanted }
}

export function BiometricEnrollOption({
  ready,
  wanted,
  onChange,
  alreadyEnrolled,
}: {
  ready: boolean
  wanted: boolean
  onChange: (wanted: boolean) => void
  alreadyEnrolled: boolean
}) {
  // Someone filling in a registration form has nothing to decide about a
  // feature their device cannot do — on a phone without fingerprint or face
  // unlock this is a dead row in the middle of the form, so it simply is not
  // there. Settings still lists it, greyed with the reason, because that
  // screen is an inventory of what can be turned on (see FingerprintSetting).
  if (alreadyEnrolled || !ready) return null
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5">
      <label className="flex items-center gap-2 text-xs text-slate-700">
        <input
          type="checkbox"
          checked={wanted}
          onChange={(e) => onChange(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-slate-300"
        />
        <span className="font-medium">🔒 Register my fingerprint on this device</span>
      </label>
      <p className="mt-0.5 pl-5 text-[11px] text-slate-400">
        Your phone will ask for your fingerprint right after you register — then you can sign in with it instead of
        your PIN.
      </p>
    </div>
  )
}

// The same setting seen from inside the account, where it belongs long-term:
// fingerprint is stored per device and never synced, so a rider who signed up
// on one phone and now holds another has no way to enrol it except here. And
// unlike sign-up, this can enrol immediately — the account is already known,
// which is the whole reason the login screen could only ever offer a "next
// time you sign in" tick box.
export function FingerprintSetting({
  account,
  label,
}: {
  account: { role: AuthedAccountRole; id: string }
  label: string
}) {
  const [ready, setReady] = useState(false)
  const [enrollment, setEnrollment] = useState(() => getBiometricEnrollment())
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    void isBiometricAvailable().then((ok) => {
      if (active) setReady(ok)
    })
    return () => {
      active = false
    }
  }, [])

  const mine = enrollment !== null && enrollment.role === account.role && enrollment.id === account.id

  async function handleRegister() {
    setBusy(true)
    setNotice('')
    const ok = await enrollBiometric(account, label)
    setBusy(false)
    if (!ok) {
      setNotice('Not registered — the fingerprint prompt was cancelled or refused.')
      return
    }
    setEnrollment(getBiometricEnrollment())
    setNotice('Fingerprint registered. Use the Fingerprint button next time you sign in.')
  }

  function handleRemove() {
    clearBiometricEnrollment()
    setEnrollment(null)
    setNotice('Fingerprint removed from this device.')
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-xs font-medium text-slate-700">🔒 Fingerprint sign-in</p>
      {!ready ? (
        <p className="mt-1 text-[11px] text-slate-400">
          This device or browser has no fingerprint or face unlock available.
        </p>
      ) : mine ? (
        <>
          <p className="mt-1 text-[11px] text-slate-500">
            Registered on this device. The Fingerprint button on the sign-in screen will let you straight in.
          </p>
          <button
            type="button"
            onClick={handleRemove}
            className="mt-2 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
          >
            Remove from this device
          </button>
        </>
      ) : (
        <>
          <p className="mt-1 text-[11px] text-slate-500">
            {enrollment
              ? `This device currently signs in as ${enrollment.label}. Registering yours replaces that — only one account per device.`
              : 'Sign in with your fingerprint instead of typing your PIN. It is stored on this device only.'}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleRegister()}
            className="mt-2 rounded-lg bg-brand-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {enrollment ? 'Register mine instead' : 'Register my fingerprint'}
          </button>
        </>
      )}
      {notice && <p className="mt-1.5 text-[11px] text-slate-500">{notice}</p>}
    </div>
  )
}
