import { useState } from 'react'
import { formatTripRoute } from '../lib/addressFormat'
import type { PaymentAccountDetails, PlatformFeePayment, Ride } from '../types'

export interface SoaLine {
  rideId: string
  at: string
  passengerName: string
  from: string
  to: string
  fare: number
  charged: number
}

// One month's platform fees, as a statement: what was charged, trip by trip,
// less what has already been settled. A driver collecting cash fares holds
// the commission in their own pocket until they send it on, so "how much do
// I owe and for which trips" is a real question the app has to answer — not
// a display of a number already netted out somewhere else.
export function buildSoa(rides: Ride[], driverId: string, monthStart: Date) {
  const lines: SoaLine[] = rides
    .filter(
      (r) =>
        r.status === 'completed' &&
        r.driverId === driverId &&
        r.payment !== null &&
        new Date(r.requestedAt) >= monthStart,
    )
    .map((r) => ({
      rideId: r.id,
      at: r.completedAt ?? r.requestedAt,
      passengerName: r.passengerName,
      from: r.pickup.label,
      to: r.dropoff.label,
      fare: r.fareEstimate,
      charged: (r.payment?.platformFee ?? 0) + (r.payment?.todaCommission ?? 0),
    }))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  const charged = lines.reduce((sum, l) => sum + l.charged, 0)
  return { lines, charged }
}

// A charge that is not a per-ride commission — a monthly subscription, a
// per-booking levy on a whole org. Same statement, different line shape: an
// organisation's bill is not a list of trips it drove.
export interface ChargeLine {
  id: string
  label: string
  detail: string | null
  amount: number
}

interface PlatformFeeSoaProps {
  open: boolean
  onClose: () => void
  periodLabel: string
  lines: SoaLine[]
  charged: number
  paid: number
  payments: PlatformFeePayment[]
  account: PaymentAccountDetails
  onPay: (amount: number, reference: string) => void
  // Supplied instead of ride lines by the TODA, Operator and Franchise
  // portals, whose bill is a subscription rather than a stack of trips.
  chargeLines?: ChargeLine[]
  // What the statement calls the things it is listing.
  linesLabel?: string
}

export function PlatformFeeSoa({
  open,
  onClose,
  periodLabel,
  lines,
  charged,
  paid,
  payments,
  account,
  onPay,
  chargeLines,
  linesLabel,
}: PlatformFeeSoaProps) {
  const [paying, setPaying] = useState(false)
  const [reference, setReference] = useState('')
  const [showQr, setShowQr] = useState(false)
  const balance = Math.max(0, charged - paid)
  // Same hand-off the passenger gets when paying a driver: the recipient and
  // the amount are filled in by the link, so a settlement cannot be sent to
  // a mistyped number. It only resolves on a phone with GCash installed —
  // hence the QR beside it, and the number still printed above.
  const walletLink = account.accountNumber
    ? `gcash://send?recipient=${encodeURIComponent(account.accountNumber)}&amount=${balance}`
    : null

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Statement of Account"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-slate-800">Statement of Account</span>
            <span className="block text-[11px] text-slate-500">{periodLabel}</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close statement"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-lg font-bold text-slate-500 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {/* The balance first: it is the reason the statement was opened.
              The trips that make it up follow, for anyone who wants to check
              the arithmetic rather than take it on trust. */}
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Charged this period</span>
              <span className="font-medium text-slate-700">₱{charged.toLocaleString()}</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between text-xs">
              <span className="text-slate-500">Already paid</span>
              <span className="font-medium text-emerald-700">− ₱{paid.toLocaleString()}</span>
            </div>
            <div className="mt-1 flex items-center justify-between border-t border-slate-200 pt-1">
              <span className="text-xs font-semibold text-slate-700">Balance due</span>
              <span className="text-lg font-bold text-slate-800">₱{balance.toLocaleString()}</span>
            </div>
          </div>

          <p className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {linesLabel ?? 'Trips charged'} ({chargeLines ? chargeLines.length : lines.length})
          </p>
          {chargeLines ? (
            <div className="space-y-1">
              {chargeLines.map((c) => (
                <div key={c.id} className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 px-2 py-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-slate-700">{c.label}</span>
                    {c.detail && <span className="block truncate text-[10px] text-slate-500">{c.detail}</span>}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-slate-700">₱{c.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          ) : lines.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
              No completed trips this period — nothing has been charged.
            </p>
          ) : (
            <div className="space-y-1">
              {lines.map((l) => (
                <div key={l.rideId} className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 px-2 py-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-slate-700">{l.passengerName}</span>
                    <span className="block truncate text-[10px] text-slate-500">{formatTripRoute(l.from, l.to, 2)}</span>
                    <span className="block text-[10px] text-slate-400">
                      {new Date(l.at).toLocaleDateString()} · fare ₱{l.fare}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-slate-700">₱{l.charged}</span>
                </div>
              ))}
            </div>
          )}

          {payments.length > 0 && (
            <>
              <p className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Payments</p>
              <div className="space-y-1">
                {payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 px-2 py-1.5">
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium text-emerald-800">
                        GCash · ref {p.reference || '—'}
                      </span>
                      <span className="block text-[10px] text-emerald-700">{new Date(p.paidAt).toLocaleString()}</span>
                    </span>
                    <span className="shrink-0 text-xs font-bold text-emerald-800">₱{p.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="border-t border-slate-200 px-4 py-3">
          {balance <= 0 ? (
            <p className="rounded-lg bg-emerald-50 py-2 text-center text-xs font-semibold text-emerald-800">
              ✓ Fully settled — nothing due this period.
            </p>
          ) : paying ? (
            <div className="space-y-2">
              {/* The account to send to, then the reference to type back —
                  in that order, because that is the order the payer does it
                  in on their own phone. */}
              <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-700">Send ₱{balance.toLocaleString()} via GCash to</p>
                <p className="mt-0.5 text-sm font-bold text-slate-800">{account.accountName}</p>
                <p className="text-sm font-semibold tracking-wide text-slate-700">{account.accountNumber}</p>
              </div>
              <div className="flex gap-1.5">
                {walletLink && (
                  <a
                    href={walletLink}
                    className="flex-1 rounded-lg bg-[#0f766e] py-2 text-center text-xs font-semibold text-white hover:bg-[#0b5f59]"
                  >
                    Open GCash · ₱{balance.toLocaleString()}
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setShowQr((v) => !v)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                    showQr ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  ⬛ {showQr ? 'Hide QR' : 'Scan QR'}
                </button>
              </div>

              {showQr && (
                <div className="rounded-lg border border-slate-200 bg-white p-2 text-center">
                  {account.qrDataUrl ? (
                    <>
                      <img
                        src={account.qrDataUrl}
                        alt={`${account.accountName} GCash QR code`}
                        className="mx-auto aspect-square w-full max-w-[200px] rounded-lg border border-slate-200 object-contain"
                      />
                      <p className="mt-1 text-[10px] text-slate-500">Scan this in your GCash app.</p>
                    </>
                  ) : (
                    <p className="px-2 py-6 text-[11px] text-slate-400">
                      No QR saved for the platform account. Send to the number above — or ask the App Admin to
                      add one in Super Admin.
                    </p>
                  )}
                </div>
              )}

              <label className="block">
                <span className="mb-0.5 block text-[11px] font-medium text-slate-600">
                  GCash reference number from your receipt
                </span>
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="e.g. 1234 5678 9012"
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!reference.trim()}
                  onClick={() => {
                    onPay(balance, reference.trim())
                    setReference('')
                    setPaying(false)
                  }}
                  className="flex-1 rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                >
                  I've sent ₱{balance.toLocaleString()}
                </button>
                <button
                  type="button"
                  onClick={() => setPaying(false)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Back
                </button>
              </div>
              <p className="text-[10px] leading-snug text-slate-400">
                Recording it here does not move money — send it in GCash first, then enter the reference so the
                platform can match your payment.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPaying(true)}
              className="w-full rounded-lg bg-[#0f766e] py-2.5 text-sm font-bold text-white hover:bg-[#0b5f59]"
            >
              Pay ₱{balance.toLocaleString()} via GCash
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
