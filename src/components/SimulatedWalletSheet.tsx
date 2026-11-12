import { useEffect, useState } from 'react'
import { formatGcashNumber } from '../lib/manualGcash'
import {
  SIMULATED_OPENING_BALANCE,
  balanceAfter,
  canAfford,
  formatBalance,
  groupReference,
  simulatedReference,
} from '../lib/walletSimulation'
import type { PaymentAccountDetails } from '../types'

// The pretend wallet, on screen.
//
// Standing in for the step the app cannot do itself: the passenger leaves
// for GCash, sends the fare, and comes back with a reference. Here that
// happens without leaving the app and without money, so the whole payment
// can be shown to a TODA, a driver or a council in one sitting.
//
// It is a stand-in and it looks like one. No GCash logo, none of GCash's
// colours, SIMULATION across the top of every screen, and — the part that
// matters most — it never asks for a PIN. A faithful copy of somebody
// else's wallet with a PIN box in it is a phishing page no matter who built
// it or why, so this one is unmistakably the app's own furniture wearing a
// label. See lib/walletSimulation for the same point about the data.

type Stage = 'review' | 'sending' | 'receipt'

export function SimulatedWalletSheet({
  open,
  account,
  payeeLabel,
  amount,
  onClose,
  onSent,
}: {
  open: boolean
  account: PaymentAccountDetails
  // Who the money is going to in plain words — the driver's name, or the
  // platform's. The account name alone can be a business registration
  // nobody recognises.
  payeeLabel: string
  amount: number
  onClose: () => void
  // The reference the passenger would have copied off their receipt. The
  // fare screen fills its own box with it, which is the one thing this
  // sheet exists to produce.
  onSent: (reference: string) => void
}) {
  const [stage, setStage] = useState<Stage>('review')
  const [reference, setReference] = useState('')

  // Every opening is a fresh send. Without this, closing the sheet on a
  // receipt and reopening it shows the previous trip's reference, which is
  // the one number in here somebody might actually write down.
  useEffect(() => {
    if (!open) return
    setStage('review')
    setReference('')
  }, [open])

  useEffect(() => {
    if (stage !== 'sending') return
    // A beat, because an instant receipt does not read as a transfer and
    // the point of this is to look like what really happens.
    const timer = window.setTimeout(() => {
      const ref = simulatedReference()
      setReference(ref)
      setStage('receipt')
    }, 1100)
    return () => window.clearTimeout(timer)
  }, [stage])

  if (!open) return null

  const affordable = canAfford(SIMULATED_OPENING_BALANCE, amount)
  const remaining = balanceAfter(SIMULATED_OPENING_BALANCE, amount)

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/70 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Simulated wallet payment"
    >
      <div className="w-full max-w-sm overflow-hidden rounded-xl border-2 border-dashed border-amber-400 bg-white shadow-xl">
        {/* The label is the first thing on the screen and stays on every
            stage. Somebody walking past a phone mid-demo must not be able
            to mistake this for a wallet that moved money. */}
        <div className="bg-amber-400 px-3 py-1.5">
          <p className="text-center text-[11px] font-extrabold uppercase tracking-widest text-amber-950">
            ⚠ Simulation · no money moves
          </p>
        </div>

        <div className="px-4 py-3">
          <p className="text-sm font-bold text-slate-800">Practice wallet</p>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
            This is not GCash and it is not connected to any wallet. It stands in for the part you would do in
            your own app, so the rest of the payment can be shown end to end.
          </p>

          {stage !== 'receipt' ? (
            <>
              <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Send to</p>
                <p className="mt-0.5 text-sm font-bold text-slate-800">{payeeLabel}</p>
                <p className="text-xs text-slate-500">{account.accountName}</p>
                <p className="text-sm font-semibold tracking-wide text-slate-700">
                  {formatGcashNumber(account.accountNumber)}
                </p>
              </div>

              <div className="mt-2 rounded-lg border border-slate-200 px-3 py-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-slate-500">Amount</span>
                  <span className="text-2xl font-bold text-slate-800">₱{amount}</span>
                </div>
                <div className="mt-1.5 space-y-0.5 border-t border-slate-100 pt-1.5 text-[11px]">
                  <div className="flex justify-between text-slate-500">
                    <span>Pretend balance</span>
                    <span>₱{formatBalance(SIMULATED_OPENING_BALANCE)}</span>
                  </div>
                  <div className="flex justify-between font-medium text-slate-600">
                    <span>After sending</span>
                    <span>₱{formatBalance(remaining)}</span>
                  </div>
                </div>
              </div>

              {!affordable && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-medium leading-snug text-amber-800">
                  The pretend balance of ₱{formatBalance(SIMULATED_OPENING_BALANCE)} will not cover this fare —
                  which is what a passenger short of load would see, too.
                </p>
              )}

              <button
                type="button"
                disabled={stage === 'sending' || !affordable}
                onClick={() => setStage('sending')}
                className="mt-3 w-full rounded-lg bg-slate-800 py-2.5 text-sm font-bold text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
              >
                {stage === 'sending' ? 'Sending…' : `Send ₱${amount}`}
              </button>
              <p className="mt-1.5 text-center text-[10px] text-slate-400">
                A real wallet asks for your PIN here. This one never will.
              </p>
            </>
          ) : (
            <>
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-center">
                <p className="text-2xl leading-none">✅</p>
                <p className="mt-1 text-sm font-bold text-emerald-900">₱{amount} sent</p>
                <p className="text-[11px] text-emerald-800">to {payeeLabel}</p>
                <div className="mt-2 rounded-lg bg-white px-2 py-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Reference number
                  </p>
                  <p className="font-mono text-sm font-bold tracking-wide text-slate-800">
                    {groupReference(reference)}
                  </p>
                </div>
                <p className="mt-1.5 text-[10px] text-emerald-800">
                  Pretend balance now ₱{formatBalance(remaining)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  onSent(groupReference(reference))
                  onClose()
                }}
                className="mt-3 w-full rounded-lg bg-[#0f766e] py-2.5 text-sm font-bold text-white hover:bg-[#0b5f59]"
              >
                Use this reference
              </button>
              <p className="mt-1.5 text-center text-[10px] leading-snug text-slate-400">
                This is the number a passenger copies off their own receipt. It goes into the fare screen's
                reference box exactly as a real one would.
              </p>
            </>
          )}

          <button
            type="button"
            onClick={onClose}
            className="mt-2 w-full rounded-lg py-1.5 text-[11px] font-medium text-slate-500 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
