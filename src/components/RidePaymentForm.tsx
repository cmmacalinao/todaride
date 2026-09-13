import { useState } from 'react'
import { createMayaCheckout } from '../lib/mayaApi'
import type { PaymentMethod } from '../types'

// What the passenger is asked at the end of a trip.
//
// Two answers, and only two: cash, or the app. There used to be more — GCash
// or Maya, then the driver's number, then their QR, then a box to type the
// reference off your own receipt so the driver could match it by hand. Every
// one of those steps was somebody doing a payment processor's job at a kerb
// at night, and the whole chain rested on a passenger correctly copying a
// twelve-digit number.
//
// E-Wallet now hands off to Maya's own checkout page, which is what a payment
// processor is for: it offers whatever channels the merchant account has
// enabled, it takes the card details on its own page so no card number ever
// touches this app, and it tells us whether the money arrived instead of
// asking the passenger to swear to it.
const METHODS: { id: 'cash' | 'wallet'; label: string; icon: string; blurb: string }[] = [
  { id: 'cash', label: 'Cash', icon: '💵', blurb: 'Hand it to your driver' },
  { id: 'wallet', label: 'E-Wallet', icon: '📱', blurb: 'Wallet or card, in the app' },
]

interface RidePaymentFormProps {
  open: boolean
  onClose: () => void
  driverName: string
  fare: number
  tip: number
  total: number
  initialMethod: PaymentMethod
  // Ties a Maya checkout back to this fare — it becomes the request reference
  // number, which is what a dispute is looked up by and what the server reads
  // the payment's status back with.
  rideId: string
  onConfirm: (method: PaymentMethod, referenceNo: string | null) => void
}

export function RidePaymentForm({
  open,
  onClose,
  driverName,
  fare,
  tip,
  total,
  initialMethod,
  rideId,
  onConfirm,
}: RidePaymentFormProps) {
  // 'cash' or 'wallet' — the two the passenger actually chooses between. The
  // stored PaymentMethod behind a wallet is settled when the payment is made,
  // not here.
  const [choice, setChoice] = useState<'cash' | 'wallet'>(initialMethod === 'cash' ? 'cash' : 'wallet')
  const [handed, setHanded] = useState('')
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)

  async function payOnline() {
    setPaying(true)
    setPayError(null)
    const result = await createMayaCheckout({
      rideId,
      total,
      description: `TODA Ride Mobility fare — ${driverName}`,
    })
    setPaying(false)
    if (result.ok && result.data?.redirectUrl) {
      // A full navigation, not a new tab: the passenger returns on the redirect
      // URL, and a popup on a phone is as likely to be blocked as opened.
      window.location.assign(result.data.redirectUrl)
      return
    }
    setPayError(
      result.unavailable
        ? 'Online payment is not available right now. Pay your driver in cash instead.'
        : (result.error ?? 'That payment could not be started. Try again, or pay in cash.'),
    )
  }

  if (!open) return null

  const isCash = choice === 'cash'
  const handedAmount = Number(handed) || 0
  const change = handedAmount - total

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Pay for your ride"
    >
      {/* No click-through close: this is the last step of a trip and a stray
          tap on the backdrop should not dismiss the bill. */}
      <div className="flex max-h-[85vh] w-full max-w-sm flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-200 px-4 py-2.5">
          <p className="text-sm font-bold text-slate-800">✅ Trip complete — time to pay</p>
          <p className="text-[11px] text-slate-500">Paying {driverName}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Fare</span>
              <span className="font-medium text-slate-700">₱{fare}</span>
            </div>
            {tip > 0 && (
              <div className="mt-0.5 flex items-center justify-between text-xs">
                <span className="text-slate-500">Tip</span>
                <span className="font-medium text-emerald-700">₱{tip}</span>
              </div>
            )}
            <div className="mt-1 flex items-center justify-between border-t border-slate-200 pt-1">
              <span className="text-xs font-semibold text-slate-700">Total due</span>
              <span className="text-xl font-bold text-slate-800">₱{total}</span>
            </div>
          </div>

          <p className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            How are you paying?
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {METHODS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setChoice(m.id)
                  setPayError(null)
                }}
                className={`rounded-lg border px-2 py-2 text-xs font-semibold transition ${
                  choice === m.id
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="block text-base leading-none">{m.icon}</span>
                {m.label}
                <span
                  className={`mt-0.5 block text-[10px] font-normal leading-tight ${
                    choice === m.id ? 'text-white/75' : 'text-slate-400'
                  }`}
                >
                  {m.blurb}
                </span>
              </button>
            ))}
          </div>

          {isCash ? (
            <div className="mt-3">
              <p className="mb-1 text-[11px] font-medium text-slate-600">
                How much are you handing over? <span className="text-slate-400">(optional)</span>
              </p>
              <input
                type="number"
                min={0}
                value={handed}
                onChange={(e) => setHanded(e.target.value)}
                placeholder={`₱${total}`}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
              {handedAmount > 0 && (
                <p
                  className={`mt-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                    change < 0 ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'
                  }`}
                >
                  {change < 0
                    ? `Short by ₱${Math.abs(change)} — that is less than the total.`
                    : change === 0
                      ? 'Exact amount — no change needed.'
                      : `Your change: ₱${change}`}
                </p>
              )}
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-snug text-slate-600">
                You will be taken to Maya to pay. Choose your wallet or card there — your card details are
                entered on Maya's page, never in this app. You come straight back when it is done.
              </p>
              {payError && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-800">
                  {payError}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1.5 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            disabled={paying}
            // Cash is confirmed here because the driver is standing there and
            // saw it. A wallet payment is not confirmed here at all — it is
            // confirmed by Maya, and the app reads that back when the
            // passenger returns. Nothing on this screen can mark it paid.
            onClick={() => (isCash ? onConfirm('cash', null) : void payOnline())}
            className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
          >
            {isCash ? `Paid ₱${total} in cash` : paying ? 'Opening Maya…' : `Pay ₱${total} with Maya`}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg py-1.5 text-[11px] font-medium text-slate-500 hover:bg-slate-50"
          >
            Not yet — I'll pay in a moment
          </button>
        </div>
      </div>
    </div>
  )
}
