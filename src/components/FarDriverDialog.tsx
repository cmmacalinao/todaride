import type { ReactNode } from 'react'
import { formatDuration, formatKm } from '../lib/geo'

// "This driver is far away" — asked of the passenger once a far-away driver
// has accepted, and of the driver before they accept a far-away request. The
// same two numbers in both: how far, and how long to get there.
export function FarDriverDialog({
  title,
  who,
  meters,
  minutes,
  note,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  title: string
  // What choosing the first button costs, shown before anyone taps it.
  note?: ReactNode
  // Who is far from whom, finished by the distance and time, e.g. "Mang Ramon
  // is" / "The pickup is".
  who: string
  meters: number
  minutes: number
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/70 p-4" role="alertdialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-sm rounded-2xl border-2 border-amber-400 bg-white p-5 shadow-2xl">
        <p className="text-center text-4xl">🛺</p>
        <p className="mt-2 text-center text-lg font-extrabold text-slate-900">{title}</p>
        <p className="mt-2 text-center text-sm text-slate-700">
          {who} about <span className="font-bold text-slate-900">{formatKm(meters)}</span> away — around{' '}
          <span className="font-bold text-slate-900">{formatDuration(minutes)}</span> to arrive.
        </p>
        {note && <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-center text-xs text-amber-900">{note}</div>}
        <div className="mt-4 space-y-2">
          <button type="button" onClick={onConfirm} className="w-full rounded-xl bg-brand-600 py-3 text-base font-bold text-white hover:bg-brand-700">
            {confirmLabel}
          </button>
          <button type="button" onClick={onCancel} className="w-full rounded-xl border-2 border-slate-300 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
