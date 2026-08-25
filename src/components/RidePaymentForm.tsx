import { useState } from 'react'
import type { PaymentAccountDetails, PaymentMethod } from '../types'

// What the passenger is asked at the end of a trip, and it differs by how
// they are paying. Cash needs no reference but does need change worked out
// at the kerb; an e-wallet needs the number to send to and the reference off
// the receipt. Asking one set of questions for both is how a passenger ends
// up staring at a field that does not apply to them.
const METHODS: { id: PaymentMethod; label: string; icon: string }[] = [
  { id: 'cash', label: 'Cash', icon: '💵' },
  { id: 'gcash', label: 'GCash', icon: '📱' },
  { id: 'maya', label: 'Maya', icon: '💳' },
]

interface RidePaymentFormProps {
  open: boolean
  onClose: () => void
  driverName: string
  // The driver's mobile number, used only when they have not saved a proper
  // wallet account — in practice the two are usually the same number.
  driverPhone: string | null
  // The driver's saved e-wallet accounts, with their own QR if they uploaded
  // one. This is what the passenger pays into.
  gcashAccount: PaymentAccountDetails | null
  mayaAccount: PaymentAccountDetails | null
  fare: number
  tip: number
  total: number
  initialMethod: PaymentMethod
  onConfirm: (method: PaymentMethod, referenceNo: string | null) => void
}

export function RidePaymentForm({
  open,
  onClose,
  driverName,
  driverPhone,
  gcashAccount,
  mayaAccount,
  fare,
  tip,
  total,
  initialMethod,
  onConfirm,
}: RidePaymentFormProps) {
  const [method, setMethod] = useState<PaymentMethod>(initialMethod)
  const [handed, setHanded] = useState('')
  const [reference, setReference] = useState('')
  const [showQr, setShowQr] = useState(false)

  if (!open) return null

  const isCash = method === 'cash'
  const wallet = method === 'gcash' ? gcashAccount : method === 'maya' ? mayaAccount : null
  const payToName = wallet?.accountName ?? driverName
  const payToNumber = wallet?.accountNumber ?? driverPhone
  // Hands off to the wallet app with the amount already filled in. These
  // schemes only resolve on a phone with the app installed — on anything
  // else the tap does nothing, which is exactly why the QR below it is not
  // an afterthought.
  const walletLink =
    payToNumber && method !== 'cash'
      ? `${method === 'gcash' ? 'gcash' : 'maya'}://send?recipient=${encodeURIComponent(
          payToNumber,
        )}&amount=${total}`
      : null
  const handedAmount = Number(handed) || 0
  const change = handedAmount - total
  // Cash can always be confirmed — the driver is standing there and the
  // amount handed over is optional help, not a gate. An e-wallet cannot,
  // because without a reference there is nothing to reconcile against.
  const canConfirm = isCash || reference.trim().length > 0

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
          <div className="grid grid-cols-3 gap-1.5">
            {METHODS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMethod(m.id)}
                className={`rounded-lg border py-2 text-xs font-semibold transition ${
                  method === m.id
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="block text-base leading-none">{m.icon}</span>
                {m.label}
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
              <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-700">
                  Send ₱{total} to {method === 'gcash' ? 'GCash' : 'Maya'}
                </p>
                <p className="mt-0.5 text-sm font-bold text-slate-800">{payToName}</p>
                <p className="text-sm font-semibold tracking-wide text-slate-700">
                  {payToNumber ?? 'Ask the driver for their number'}
                </p>
              </div>

              {/* Open the wallet first, scan second. The link fills in the
                  driver and the amount so nothing is mistyped; the QR is
                  what you fall back to when the hand-off does not happen —
                  no app installed, a browser, a phone that refuses the
                  scheme. The driver has the same QR on their own screen. */}
              <div className="flex gap-1.5">
                {walletLink && (
                  <a
                    href={walletLink}
                    className="flex-1 rounded-lg bg-[#0f766e] py-2 text-center text-xs font-semibold text-white hover:bg-[#0b5f59]"
                  >
                    Open {method === 'gcash' ? 'GCash' : 'Maya'} · ₱{total}
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
                  {wallet?.qrDataUrl ? (
                    <>
                      <img
                        src={wallet.qrDataUrl}
                        alt={`${payToName} ${method === 'gcash' ? 'GCash' : 'Maya'} QR code`}
                        className="mx-auto aspect-square w-full max-w-[200px] rounded-lg border border-slate-200 object-contain"
                      />
                      <p className="mt-1 text-[10px] text-slate-500">Scan this in your {method === 'gcash' ? 'GCash' : 'Maya'} app.</p>
                    </>
                  ) : (
                    <p className="px-2 py-6 text-[11px] text-slate-400">
                      {payToName} has not saved a QR. Ask them to show theirs — there is a QR button on their
                      screen — or send to the number above.
                    </p>
                  )}
                </div>
              )}
              <label className="block">
                <span className="mb-0.5 block text-[11px] font-medium text-slate-600">
                  Reference number from your receipt
                </span>
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="e.g. 1234 5678 9012"
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                />
              </label>
              <p className="text-[10px] leading-snug text-slate-400">
                Send it in {method === 'gcash' ? 'GCash' : 'Maya'} first, then enter the reference here so the
                driver can match it.
              </p>
              <button
                type="button"
                onClick={() => {
                  setMethod('cash')
                  setReference('')
                  setShowQr(false)
                }}
                className="w-full rounded-lg border border-dashed border-slate-300 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
              >
                💵 Payment didn&apos;t go through? Pay ₱{total} in cash instead
              </button>
            </div>
          )}
        </div>

        <div className="space-y-1.5 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => onConfirm(method, isCash ? null : reference.trim())}
            className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
          >
            {isCash ? `Paid ₱${total} in cash` : `I've sent ₱${total}`}
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
