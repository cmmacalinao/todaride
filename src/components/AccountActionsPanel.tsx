import { useMemo, useState } from 'react'
import { useRides } from '../context/RideContext'
import { useSession } from '../context/SessionContext'
import { activeSuspension, suspensionSummary, SUSPENSION_DAY_PRESETS } from '../lib/accountOps'
import { ACCOUNT_KIND_LABELS, type AccountKind } from '../types'

// The disciplinary + messaging controls for exactly one account. Every screen
// that can show an account — passenger, driver, parent, and the notes centre
// that reaches partners — drops this in rather than growing its own copy, so a
// suspension raised from the Driver page and one raised from the notes centre
// are the same record with the same rules.
export function AccountActionsPanel({
  kind,
  accountId,
  accountName,
}: {
  kind: AccountKind
  accountId: string
  accountName: string
}) {
  const { accountSuspensions, adminNotes, suspendAccount, liftSuspension, sendAdminNote, logActivity } = useRides()
  const { authedAccount } = useSession()
  const actorName = authedAccount?.role === 'super_admin' ? 'Super Admin' : 'Admin'

  const [reason, setReason] = useState('')
  const [days, setDays] = useState(7)
  const [note, setNote] = useState('')
  const [flash, setFlash] = useState('')

  const active = useMemo(
    () => activeSuspension(accountSuspensions, kind, accountId),
    [accountSuspensions, kind, accountId],
  )
  const history = accountSuspensions.filter((s) => s.kind === kind && s.accountId === accountId)
  const notes = adminNotes.filter((n) => n.kind === kind && n.accountId === accountId)

  function handleSuspend() {
    if (!reason.trim()) {
      setFlash('Give a reason first — a suspension with no recorded cause cannot be reviewed later.')
      return
    }
    suspendAccount({ kind, accountId, accountName, reason: reason.trim(), days })
    logActivity({
      actorRole: 'admin',
      actorName,
      todaOrgId: null,
      action: 'Suspended account',
      summary: `${ACCOUNT_KIND_LABELS[kind]} ${accountName} suspended for ${
        days > 0 ? `${days} day(s)` : 'an indefinite period'
      } — ${reason.trim()}`,
    })
    setReason('')
    setFlash('Suspension recorded.')
  }

  function handleLift() {
    if (!active) return
    liftSuspension(active.id)
    logActivity({
      actorRole: 'admin',
      actorName,
      todaOrgId: null,
      action: 'Lifted suspension',
      summary: `${ACCOUNT_KIND_LABELS[kind]} ${accountName} restored to full access.`,
    })
    setFlash('Access restored.')
  }

  function handleSendNote() {
    if (!note.trim()) return
    sendAdminNote({ kind, accountId, accountName, message: note.trim() })
    logActivity({
      actorRole: 'admin',
      actorName,
      todaOrgId: null,
      action: 'Sent note to client',
      summary: `Note sent to ${ACCOUNT_KIND_LABELS[kind]} ${accountName}: "${note.trim().slice(0, 80)}"`,
    })
    setNote('')
    setFlash('Note sent.')
  }

  return (
    <div className="space-y-3">
      {/* Amber, not red: red is the SOS colour in this app and a suspension is
          an administrative state, not an emergency. */}
      {active ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-900">⏸ {suspensionSummary(active)}</p>
          <p className="mt-0.5 text-[11px] text-amber-800">{active.reason}</p>
          <p className="text-[10px] text-amber-700">
            Started {new Date(active.startedAt).toLocaleString()}
            {active.endsAt ? ` · auto-lifts ${new Date(active.endsAt).toLocaleDateString()}` : ''}
          </p>
          <button
            type="button"
            onClick={handleLift}
            className="mt-2 w-full rounded-lg bg-amber-700 py-1.5 text-[11px] font-semibold text-white hover:bg-amber-800"
          >
            Lift suspension now
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
          <p className="text-xs font-medium text-emerald-800">✓ Account in good standing</p>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 p-3">
        <p className="text-xs font-semibold text-slate-700">Pause / suspend this account</p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Use after a complaint. Pick how many days the pause should last — it lifts itself when the term is up.
        </p>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (complaint reference, what happened)"
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
        />
        <div className="mt-2 flex flex-wrap gap-1">
          {SUSPENSION_DAY_PRESETS.map((preset) => (
            <button
              key={preset.days}
              type="button"
              onClick={() => setDays(preset.days)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                days === preset.days ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleSuspend}
          className="mt-2 w-full rounded-lg bg-slate-800 py-2 text-xs font-semibold text-white hover:bg-slate-900"
        >
          {days > 0 ? `Suspend for ${days} day(s)` : 'Suspend indefinitely'}
        </button>
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <p className="text-xs font-semibold text-slate-700">✉️ Send a note</p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Goes to {accountName} only — a warning, a reminder, or a reply to something they raised.
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Write your note…"
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
        />
        <button
          type="button"
          onClick={handleSendNote}
          disabled={!note.trim()}
          className="mt-1 w-full rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:opacity-40"
        >
          Send note
        </button>
      </div>

      {flash && <p className="text-[11px] font-medium text-brand-700">{flash}</p>}

      {notes.length > 0 && (
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-1.5 text-xs font-semibold text-slate-700">Notes sent ({notes.length})</p>
          <div className="space-y-1.5">
            {notes.slice(0, 6).map((n) => (
              <div key={n.id} className="rounded-md bg-slate-50 p-2 text-[11px]">
                <p className="text-slate-700">{n.message}</p>
                <p className="text-[10px] text-slate-400">{new Date(n.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-1.5 text-xs font-semibold text-slate-700">Suspension history ({history.length})</p>
          <div className="space-y-1.5">
            {history.slice(0, 6).map((s) => (
              <div key={s.id} className="rounded-md bg-slate-50 p-2 text-[11px]">
                <p className="text-slate-700">
                  {s.days > 0 ? `${s.days} day(s)` : 'Indefinite'} · {s.reason}
                </p>
                <p className="text-[10px] text-slate-400">
                  {new Date(s.startedAt).toLocaleDateString()}
                  {s.liftedAt ? ` · lifted ${new Date(s.liftedAt).toLocaleDateString()}` : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
