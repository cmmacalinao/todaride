import { useRides } from '../context/RideContext'
import { SUPPORT_CATEGORY_LABELS } from '../types'

// Where Contact us messages land. The form also hands the sender's own mail
// client a copy addressed to the support mailbox, but this is the copy the
// support team can work from without leaving the console.
export function SupportInbox() {
  const { supportMessages, setSupportMessageStatus } = useRides()
  const unread = supportMessages.filter((m) => m.status === 'new')

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">📥 Support inbox</h2>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            unread.length > 0 ? 'bg-gold-100 text-gold-800' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {unread.length} new
        </span>
      </div>
      <p className="mb-2 text-[11px] text-slate-500">
        Messages sent through <span className="font-medium">Contact us</span> in the menu — from signed-in accounts
        and from logged-out visitors.
      </p>

      {supportMessages.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-xs text-slate-400">No messages yet.</p>
      ) : (
        <div className="space-y-2">
          {supportMessages.map((m) => (
            <div
              key={m.id}
              className={`rounded-lg border p-2.5 text-xs ${
                m.status === 'new' ? 'border-gold-300 bg-gold-50' : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-slate-800">{m.name}</p>
                <span className="shrink-0 text-[10px] text-slate-400">
                  {new Date(m.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                {SUPPORT_CATEGORY_LABELS[m.category]}
                {m.fromRole ? ` · signed in as ${m.fromRole.replace(/_/g, ' ')}` : ' · logged-out visitor'}
              </p>
              <p className="mt-1 text-slate-700">{m.message}</p>
              <p className="mt-1 text-[11px] text-slate-500">
                {[m.email, m.phone].filter(Boolean).join(' · ') || 'No contact details left'}
              </p>
              <div className="mt-2 flex gap-1.5">
                {m.email && (
                  <a
                    href={`mailto:${m.email}?subject=${encodeURIComponent('Re: your TODA SafeRide message')}`}
                    className="flex-1 rounded-lg border border-slate-300 py-1.5 text-center text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Reply by email
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setSupportMessageStatus(m.id, m.status === 'new' ? 'handled' : 'new')}
                  className="flex-1 rounded-lg border border-slate-300 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                >
                  {m.status === 'new' ? 'Mark handled' : 'Reopen'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
