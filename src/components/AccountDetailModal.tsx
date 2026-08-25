import type { ReactNode } from 'react'
import { AccountActionsPanel } from './AccountActionsPanel'
import { ACCOUNT_KIND_LABELS, type AccountKind } from '../types'

// The overlay that opens when an operator clicks a name on any monitoring
// page. The record itself differs per role, so the caller supplies the body;
// what is identical everywhere — the header, the close affordance and the
// suspend/note controls — lives here so those never drift apart.
export function AccountDetailModal({
  kind,
  accountId,
  accountName,
  subtitle,
  onClose,
  children,
}: {
  kind: AccountKind
  accountId: string
  accountName: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-[1200] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-brand-600 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-brand-100">{ACCOUNT_KIND_LABELS[kind]} record</p>
            <h2 className="truncate text-base font-bold text-white">{accountName}</h2>
            {subtitle && <p className="truncate text-[11px] text-brand-100">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full bg-white/20 px-2.5 py-1 text-sm font-bold text-white hover:bg-white/30"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {children}
          <section>
            <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">Admin actions</h3>
            <AccountActionsPanel kind={kind} accountId={accountId} accountName={accountName} />
          </section>
        </div>
      </div>
    </div>
  )
}

// Small shared building blocks for the modal bodies, so the passenger, driver
// and parent records look like the same document rather than three designs.
export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 p-3">
      <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">{title}</h3>
      {children}
    </section>
  )
}

export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-1 last:border-0">
      <span className="shrink-0 text-[11px] text-slate-500">{label}</span>
      <span className="min-w-0 text-right text-[11px] font-medium text-slate-700">{value}</span>
    </div>
  )
}
