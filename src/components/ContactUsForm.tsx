import { useState } from 'react'
import { useRides } from '../context/RideContext'
import { useSession } from '../context/SessionContext'
import { APP_SUPPORT_EMAIL } from '../mock/data'
import { SUPPORT_CATEGORY_LABELS, type SupportCategory } from '../types'

// "Contact us" — reachable from the hamburger menu on every screen, signed in
// or not.
//
// Two things happen on send, deliberately. The message is stored so the
// support team can read it in the Admin console, AND the sender's own mail
// client is opened with the same text addressed to the support mailbox. This
// prototype has no server, so a form that only claimed to "send an email"
// would silently drop every message — the mail-client handoff is the part
// that genuinely reaches the inbox.
export function ContactUsForm({ onDone }: { onDone?: () => void }) {
  const { sendSupportMessage } = useRides()
  const { authedAccount } = useSession()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [category, setCategory] = useState<SupportCategory>('account')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  function handleSend() {
    if (!name.trim() || !message.trim()) {
      setError('Your name and a message are both needed.')
      return
    }
    if (!email.trim() && !phone.trim()) {
      setError('Leave an email or a phone number so support can reply.')
      return
    }
    setError('')

    sendSupportMessage({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      category,
      message: message.trim(),
      fromRole: authedAccount?.role ?? null,
    })

    const subject = `[${SUPPORT_CATEGORY_LABELS[category]}] Message from ${name.trim()}`
    const body = [
      message.trim(),
      '',
      '—',
      `From: ${name.trim()}`,
      email.trim() ? `Email: ${email.trim()}` : null,
      phone.trim() ? `Phone: ${phone.trim()}` : null,
      `Sent from TODA SafeRide · ${new Date().toLocaleString()}`,
    ]
      .filter(Boolean)
      .join('\n')
    window.location.href = `mailto:${APP_SUPPORT_EMAIL}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`

    setSent(true)
  }

  if (sent) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-sm font-semibold text-emerald-800">✓ Message sent</p>
          <p className="mt-1 text-xs text-emerald-700">
            Our support team has it, and your email app should have opened with a copy addressed to{' '}
            <span className="font-medium">{APP_SUPPORT_EMAIL}</span> — send that too if you would like a reply by
            email.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setSent(false)
            setMessage('')
            onDone?.()
          }}
          className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Done
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Send the TODA SafeRide support team a message and they will get back to you at{' '}
        <span className="font-medium text-slate-700">{APP_SUPPORT_EMAIL}</span>.
      </p>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-slate-500">Your name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-slate-500">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-slate-500">Mobile no.</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="09XX XXX XXXX"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-slate-500">What is this about?</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as SupportCategory)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          {(Object.keys(SUPPORT_CATEGORY_LABELS) as SupportCategory[]).map((c) => (
            <option key={c} value={c}>
              {SUPPORT_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-slate-500">Message</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          placeholder="How can we help?"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      {error && <p className="text-xs font-medium text-amber-700">{error}</p>}

      <button
        type="button"
        onClick={handleSend}
        className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
      >
        Send to support team
      </button>
    </div>
  )
}
