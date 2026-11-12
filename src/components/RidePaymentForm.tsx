import { useState } from 'react'
import { useRides } from '../context/RideContext'
import { createMayaCheckout } from '../lib/mayaApi'
import {
  fareDestination,
  formatGcashNumber,
  gcashSendLink,
  isPlausibleGcashReference,
  normaliseGcashNumber,
} from '../lib/manualGcash'
import type { FareCollector, PaymentMethod } from '../types'

// What the passenger is asked at the end of a trip.
//
// Two answers, and only two: cash, or the app. There used to be more — GCash
// or Maya, then the driver's number, then their QR, then a box to type the
// reference off your own receipt so the driver could match it by hand. Every
// one of those steps was somebody doing a payment processor's job at a kerb
// at night, and the whole chain rested on a passenger correctly copying a
// twelve-digit number.
//
// E-Wallet hands off to Maya's own checkout page, which is what a payment
// processor is for: it offers whatever channels the merchant account has
// enabled, it takes the card details on its own page so no card number ever
// touches this app, and it tells us whether the money arrived instead of
// asking the passenger to swear to it.
//
// GCash is back alongside it, and the reasoning above is exactly why it is
// worth being plain about what it is: a manual transfer into the pilot's own
// GCash account, with the reference typed back by the passenger. During the
// pilot there is no merchant account and no API, so the choice is this or
// cash only — and a fare somebody can pay from their wallet is worth a
// reference number somebody has to check by hand. It goes when a processor
// arrives.
const METHODS: { id: Choice; label: string; icon: string; blurb: string }[] = [
  { id: 'cash', label: 'Cash', icon: '💵', blurb: 'Hand it to your driver' },
  { id: 'gcash', label: 'GCash', icon: '🟦', blurb: 'Send from your wallet' },
  { id: 'wallet', label: 'Card', icon: '💳', blurb: 'Card or wallet, via Maya' },
]

type Choice = 'cash' | 'gcash' | 'wallet'

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
  // A food/goods delivery settles the whole order here — goods plus the
  // delivery fee — so the bill says "order", not "trip" and "fare".
  kind?: 'ride' | 'delivery'
  // Whose wallet a GCash fare should go to first. Null for a trip with no
  // driver on it yet, which falls back to the platform's account.
  driverId?: string | null
  onConfirm: (method: PaymentMethod, referenceNo: string | null, collectedBy?: FareCollector) => void
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
  driverId = null,
  onConfirm,
  kind = 'ride',
}: RidePaymentFormProps) {
  // Where a manual GCash fare is sent: the driver's own wallet when they
  // have saved one, the pilot's account otherwise. See fareDestination for
  // why that order — a fare in the driver's GCash is theirs on arrival and
  // nobody is left holding it. Either way the account must be a real one;
  // the sample number the app ships with is well formed and belongs to a
  // stranger, so a pilot that has set nothing up gets cash and card only.
  const { platformGcashAccount, drivers } = useRides()
  const driverAccount = driverId ? (drivers.find((d) => d.id === driverId)?.gcashAccount ?? null) : null
  const destination = fareDestination(driverAccount, platformGcashAccount)
  const gcashReady = destination !== null
  const paysDriver = destination?.collectedBy === 'driver'

  // What the passenger actually chooses between. The stored PaymentMethod
  // behind a card payment is settled when the payment is made, not here.
  const [choice, setChoice] = useState<Choice>(() => {
    if (initialMethod === 'cash') return 'cash'
    if (initialMethod === 'gcash') return gcashReady ? 'gcash' : 'cash'
    return 'wallet'
  })
  const [handed, setHanded] = useState('')
  const [reference, setReference] = useState('')
  const [showQr, setShowQr] = useState(false)
  const [copied, setCopied] = useState(false)
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
    const otherWay = gcashReady
      ? 'Pay with GCash, or hand the fare to your driver in cash.'
      : 'Pay your driver in cash instead.'
    setPayError(
      result.unavailable
        ? `Card payment is not available yet. ${otherWay}`
        : (result.error ?? `That payment could not be started. ${otherWay}`),
    )
  }

  if (!open) return null

  const isCash = choice === 'cash'
  const isGcash = choice === 'gcash'
  const handedAmount = Number(handed) || 0
  const change = handedAmount - total
  const walletLink = gcashSendLink(destination?.account, total)
  const referenceOk = isPlausibleGcashReference(reference)

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
          <p className="text-sm font-bold text-slate-800">
            {kind === 'delivery' ? '✅ Order delivered — time to pay' : '✅ Trip complete — time to pay'}
          </p>
          <p className="text-[11px] text-slate-500">Paying {driverName}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">{kind === 'delivery' ? 'Order total (goods + delivery)' : 'Fare'}</span>
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
            {/* GCash disappears rather than greys out when no account is
                saved: a payment option that cannot be completed is worse
                than one that was never offered. */}
            {METHODS.filter((m) => m.id !== 'gcash' || gcashReady).map((m) => (
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
          ) : isGcash ? (
            <div className="mt-3 space-y-2">
              {/* The account to send to, then the reference to type back — in
                  that order, because that is the order the passenger does it
                  in on their own phone. Same shape as the Statement of
                  Account settlement in PlatformFeeSoa. */}
              <div className="rounded-lg border border-[#0f766e]/30 bg-[#0f766e]/5 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#0b5f59]">
                  Send ₱{total} via GCash to
                </p>
                <p className="mt-0.5 text-sm font-bold text-slate-800">{destination?.account.accountName}</p>
                <p className="text-sm font-semibold tracking-wide text-slate-700">
                  {destination && formatGcashNumber(destination.account.accountNumber)}
                </p>
                {/* Said plainly, because it changes what the passenger is
                    doing: paying the person in front of them, or paying a
                    company that will pay them later. */}
                <p className="mt-1 text-[10px] font-medium text-[#0b5f59]">
                  {paysDriver
                    ? `This is ${driverName}'s own GCash — it reaches them straight away.`
                    : 'This is the TODA Ride Mobility account. Your driver is paid from it.'}
                </p>
              </div>

              <div className="flex gap-1.5">
                {walletLink && (
                  <a
                    href={walletLink}
                    className="flex-1 rounded-lg bg-[#0f766e] py-2 text-center text-xs font-semibold text-white hover:bg-[#0b5f59]"
                  >
                    Open GCash · ₱{total}
                  </a>
                )}
                {/* The way out that always works. gcash:// is not a
                    documented scheme — it is a guess at GCash's own app
                    links — so the button above may open the wallet on its
                    home screen, or do nothing at all. Copying the number
                    costs one tap and cannot fail, and a passenger standing
                    at a kerb needs the second option in front of them, not
                    after they have discovered the first one did nothing. */}
                <button
                  type="button"
                  onClick={async () => {
                    if (!destination) return
                    try {
                      await navigator.clipboard.writeText(normaliseGcashNumber(destination.account.accountNumber))
                      setCopied(true)
                      window.setTimeout(() => setCopied(false), 2500)
                    } catch {
                      // Clipboard refused (an insecure origin, or the
                      // passenger said no). The number is printed above them
                      // either way, so there is nothing to recover from.
                    }
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  {copied ? '✓ Copied' : '⧉ Copy'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowQr((v) => !v)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                    showQr
                      ? 'border-[#0f766e] bg-[#0f766e]/10 text-[#0b5f59]'
                      : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  ⬛ {showQr ? 'Hide QR' : 'QR'}
                </button>
              </div>
              <p className="text-[10px] leading-snug text-slate-400">
                If GCash does not open, copy the number and send it from the app yourself.
              </p>

              {showQr && (
                <div className="rounded-lg border border-slate-200 bg-white p-2 text-center">
                  {destination?.account.qrDataUrl ? (
                    <>
                      <img
                        src={destination.account.qrDataUrl}
                        alt={`${destination.account.accountName} GCash QR code`}
                        className="mx-auto aspect-square w-full max-w-[200px] rounded-lg border border-slate-200 object-contain"
                      />
                      <p className="mt-1 text-[10px] text-slate-500">Scan this in your GCash app.</p>
                    </>
                  ) : (
                    <p className="px-2 py-6 text-[11px] leading-snug text-slate-400">
                      {paysDriver
                        ? `${driverName} has no QR saved — look for the printed one in the tricycle, or send to the number above.`
                        : 'No QR saved yet. Send to the number above instead.'}
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
                  inputMode="numeric"
                  placeholder="e.g. 1029 383 827 362"
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                />
              </label>
              {/* Said while they are typing, not after a disabled button has
                  already refused them: a passenger who has sent the money and
                  cannot work out why the app will not take it is the worst
                  moment this screen has. */}
              {reference.trim().length > 0 && !referenceOk && (
                <p className="text-[11px] font-medium text-amber-700">
                  That looks too short — copy the whole reference number from your GCash receipt.
                </p>
              )}
              <p className="text-[10px] leading-snug text-slate-400">
                Send it in GCash first, then type the reference here. Recording it does not move money —{' '}
                {paysDriver
                  ? 'your driver checks their own GCash for it, so keep your receipt until they confirm.'
                  : 'your payment is matched against the account by hand, so keep your receipt until the trip shows as settled.'}
              </p>
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
            disabled={paying || (isGcash && !referenceOk)}
            // Cash is confirmed here because the driver is standing there and
            // saw it. GCash records what the passenger says they sent, with
            // their reference — a person matches it against the account
            // afterwards. A card payment is not confirmed here at all: Maya
            // confirms it, and the app reads that back on the way home.
            onClick={() => {
              if (isCash) return onConfirm('cash', null)
              if (isGcash) return onConfirm('gcash', reference.trim(), destination?.collectedBy)
              void payOnline()
            }}
            className={`w-full rounded-lg py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 ${
              isGcash ? 'bg-[#0f766e] hover:bg-[#0b5f59]' : 'bg-brand-600 hover:bg-brand-700'
            }`}
          >
            {isCash
              ? `Paid ₱${total} in cash`
              : isGcash
                ? `I've sent ₱${total} via GCash`
                : paying
                  ? 'Opening Maya…'
                  : `Pay ₱${total} with Maya`}
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
