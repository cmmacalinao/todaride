import { useState } from 'react'
import { useRides } from '../context/RideContext'
import { APP_ADMIN_CREDENTIALS, APP_SUPER_ADMIN_CREDENTIALS } from '../mock/data'
import { findAccountForRecovery, type RecoveryMatch } from '../lib/unifiedLogin'
import { OtpVerify } from './OtpVerify'

const KIND_LABELS: Record<RecoveryMatch['kind'], string> = {
  passenger: 'Passenger',
  parent: 'Parent',
  driver: 'Driver',
  toda: 'TODA',
  pharmacy: 'Pharmacy / Vendor',
  operator: 'Operator',
  franchise: 'Franchise',
}

// Masks all but the last 4 digits so a picker can show "which of these is
// you?" without handing out someone else's full number.
function maskPhone(phone: string): string {
  const total = (phone.match(/\d/g) ?? []).length
  let seen = 0
  return phone.replace(/\d/g, (d) => {
    seen += 1
    return seen > total - 4 ? d : '•'
  })
}

// Recovery for anyone who signs in with a PIN. Ownership is proved by the
// one-time code sent to the account's own registered number — the flow never
// asks for the secret it is about to replace, which is the whole point.
//
// App Admin and Super Admin are deliberately NOT recoverable here: their
// credentials are fixed constants in this prototype, not per-account records,
// so offering a reset would be a dead end dressed up as a feature.
export function ForgotPasswordFlow({ onClose }: { onClose: () => void }) {
  const { passengers, parents, drivers, todaOrganizations, pharmacies, operators, franchises, resetAccountPin } =
    useRides()
  const [identifier, setIdentifier] = useState('')
  const [candidates, setCandidates] = useState<RecoveryMatch[] | null>(null)
  const [chosen, setChosen] = useState<RecoveryMatch | null>(null)
  const [otpVerified, setOtpVerified] = useState(false)
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  function handleFind() {
    setError('')
    const typed = identifier.trim()
    const adminish =
      typed.toLowerCase() === APP_ADMIN_CREDENTIALS.username.toLowerCase() ||
      typed.toLowerCase() === APP_SUPER_ADMIN_CREDENTIALS.username.toLowerCase()
    if (adminish) {
      setError('Admin and Super Admin passwords are issued by the App Admin and cannot be reset from here.')
      return
    }
    const matches = findAccountForRecovery(
      { passengers, parents, drivers, todaOrganizations, pharmacies, operators, franchises },
      typed,
    )
    if (matches.length === 0) {
      setError('No account found for that name, email, mobile number, or TRC number.')
      return
    }
    if (matches.length === 1) {
      setChosen(matches[0])
      setCandidates(null)
      return
    }
    setCandidates(matches)
  }

  function handleSave() {
    if (!chosen) return
    if (!/^\d{4}$/.test(pin)) {
      setError('Choose a 4-digit PIN.')
      return
    }
    if (pin !== confirmPin) {
      setError('The two PINs do not match.')
      return
    }
    setError('')
    resetAccountPin(chosen.kind, chosen.id, pin)
    setDone(true)
  }

  if (done) {
    return (
      <Shell onClose={onClose} title="PIN updated">
        <p className="text-xs text-slate-600">
          Your new PIN is saved for <span className="font-semibold">{chosen?.name}</span>. Use it with your name,
          email, mobile number{chosen?.kind === 'driver' ? ', or TRC number' : ''} to log in.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-full bg-brand-600 py-2.5 text-xs font-semibold text-white hover:bg-brand-700"
        >
          Back to log in
        </button>
      </Shell>
    )
  }

  return (
    <Shell onClose={onClose} title="Forgot password">
      {!chosen ? (
        <>
          <p className="text-xs text-slate-600">
            Enter the name, email, mobile number, or TRC number on the account. We will text a one-time code to the
            registered number to confirm it is yours.
          </p>
          <input
            value={identifier}
            onChange={(e) => {
              setIdentifier(e.target.value)
              setCandidates(null)
              setError('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleFind()
            }}
            placeholder="Name, email, 09XX-XXX-XXXX, or TRC-1023"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          {candidates && (
            <div className="space-y-1.5">
              <p className="text-xs text-slate-500">More than one account matches — which is yours?</p>
              {candidates.map((c) => (
                <button
                  key={`${c.kind}-${c.id}`}
                  type="button"
                  onClick={() => setChosen(c)}
                  className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-700">{c.name}</span>{' '}
                  <span className="text-xs text-slate-400">
                    · {KIND_LABELS[c.kind]} · {maskPhone(c.phone)}
                  </span>
                </button>
              ))}
            </div>
          )}
          {error && <p className="text-xs font-medium text-amber-700">{error}</p>}
          {!candidates && (
            <button
              type="button"
              onClick={handleFind}
              className="w-full rounded-full bg-brand-600 py-2.5 text-xs font-semibold text-white hover:bg-brand-700"
            >
              Find my account
            </button>
          )}
        </>
      ) : (
        <>
          <p className="text-xs text-slate-600">
            Resetting the PIN for <span className="font-semibold">{chosen.name}</span> ({KIND_LABELS[chosen.kind]}) ·{' '}
            {maskPhone(chosen.phone)}
          </p>
          {/* Worth a credit. This is the one screen where the code is the
              only thing standing between a phone number and somebody else's
              account -- shown on screen instead, anyone who knows a number
              could reset the PIN behind it without ever holding the phone.
              It also fires rarely: only when someone is genuinely locked
              out. */}
          <OtpVerify
            phone={chosen.phone}
            verified={otpVerified}
            onVerifiedChange={setOtpVerified}
            sendRealSms
          />

          {otpVerified && (
            <div className="space-y-2 border-t border-slate-100 pt-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">New 4-digit PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tracking-widest"
                  placeholder="••••"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Confirm new PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tracking-widest"
                  placeholder="••••"
                />
              </div>
              {error && <p className="text-xs font-medium text-amber-700">{error}</p>}
              <button
                type="button"
                onClick={handleSave}
                className="w-full rounded-full bg-brand-600 py-2.5 text-xs font-semibold text-white hover:bg-brand-700"
              >
                Save new PIN
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setChosen(null)
              setOtpVerified(false)
              setPin('')
              setConfirmPin('')
              setError('')
            }}
            className="w-full rounded-lg border border-slate-300 py-2 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
          >
            ← Use a different account
          </button>
        </>
      )}
    </Shell>
  )
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="max-h-[85vh] w-full max-w-md space-y-3 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-navy-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md px-2 py-1 text-lg text-slate-400 hover:bg-slate-100"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
