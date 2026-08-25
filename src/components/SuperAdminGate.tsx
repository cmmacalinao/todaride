import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../context/SessionContext'
import { useAdminViewMode } from '../lib/adminViewMode'
import { APP_SUPER_ADMIN_CREDENTIALS, APP_SUPER_ADMIN_EMAIL, APP_SUPER_ADMIN_NAME } from '../mock/data'
import { SimpleOtpStep } from './SimpleOtpStep'
import { DesktopOnlyNotice } from './DesktopOnlyNotice'
import { isNativeApp } from '../lib/platform'

// Shown when an Admin session opens /admin/super. Admin is not silently
// bounced — it is asked to authenticate as Super Admin, so the boundary reads
// as "different credentials required" rather than "that page is broken".
// Signing in here replaces the session's role outright; there is no lingering
// "Admin who is temporarily Super Admin" state to reason about later.
export function SuperAdminGate() {
  const navigate = useNavigate()
  const { setAuthedAccount } = useSession()
  const { containerClass } = useAdminViewMode()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials')

  // Same boundary the login form draws, drawn again at the step-up: this is
  // the other door into a Super Admin session, and the installed app does not
  // open it either.
  if (isNativeApp()) {
    return <DesktopOnlyNotice />
  }

  function valid(): boolean {
    const entered = username.trim().toLowerCase()
    const identityOk =
      entered === APP_SUPER_ADMIN_CREDENTIALS.username.toLowerCase() ||
      entered === APP_SUPER_ADMIN_EMAIL.toLowerCase()
    return identityOk && password === APP_SUPER_ADMIN_CREDENTIALS.password
  }

  function handleSubmit() {
    if (!valid()) {
      setError('Incorrect Super Admin username or password.')
      return
    }
    setError('')
    setStep('otp')
  }

  if (step === 'otp') {
    return (
      <div className={`mx-auto ${containerClass} space-y-3 px-4 py-6`}>
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">
            Password confirmed for <span className="font-medium text-slate-700">{username.trim()}</span> — verify
            with a one-time code to finish switching to Super Admin.
          </p>
          <SimpleOtpStep
            destination={username.trim().includes('@') ? username.trim() : APP_SUPER_ADMIN_EMAIL}
            onVerified={() => setAuthedAccount({ role: 'super_admin', id: 'super-admin' })}
            onCancel={() => setStep('credentials')}
          />
        </div>
      </div>
    )
  }

  return (
    <div className={`mx-auto ${containerClass} space-y-3 px-4 py-6`}>
      <section className="rounded-xl border border-gold-400/60 bg-gold-50 p-4 shadow-sm">
        <h1 className="text-sm font-bold text-navy-900">🔒 Super Admin sign-in required</h1>
        <p className="mt-1 text-xs text-slate-600">
          You are signed in as <span className="font-semibold">Admin</span>. Super Admin is a separate account with
          its own credentials — it holds the service switches that affect every user, the TaaS partner hierarchy and
          the access links, so an Admin session cannot open it.
        </p>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Super Admin username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={APP_SUPER_ADMIN_CREDENTIALS.username}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit()
            }}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        {error && <p className="text-xs font-medium text-amber-700">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Sign in as Super Admin
        </button>

        <p className="text-[11px] text-slate-400">
          Demo credential:{' '}
          <span className="font-mono">
            {APP_SUPER_ADMIN_CREDENTIALS.username} / {APP_SUPER_ADMIN_CREDENTIALS.password}
          </span>{' '}
          — or the Founder, {APP_SUPER_ADMIN_NAME} (<span className="font-mono">{APP_SUPER_ADMIN_EMAIL}</span>).
        </p>

        <button
          type="button"
          onClick={() => navigate('/admin')}
          className="w-full rounded-lg border border-slate-300 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          ← Back to Admin
        </button>
      </section>
    </div>
  )
}
