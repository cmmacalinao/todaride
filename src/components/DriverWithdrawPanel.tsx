import { useState } from 'react'
import type { DriverWithdrawal, PaymentAccountDetails, Ride } from '../types'

type Wallet = 'gcash' | 'maya'
const WALLET_LABEL: Record<Wallet, string> = { gcash: 'GCash', maya: 'Maya' }

// What the platform is holding for this driver.
//
// Only the fares somebody paid online. Cash was handed over at the kerb and
// is already in the driver's pocket — counting it here would offer to send
// them money they have had since Tuesday, and the first driver to try it
// would find the balance impossible to reconcile with what is in their hand.
//
// Exported because the same sum is the honest answer to "how much can I take
// out", and a second definition of it elsewhere would drift.
export function withdrawableBalance(
  rides: Ride[],
  driverId: string,
  withdrawals: DriverWithdrawal[],
): { earned: number; requested: number; available: number } {
  const earned = rides
    .filter(
      (r) =>
        r.driverId === driverId &&
        r.status === 'completed' &&
        r.payment != null &&
        r.payment.method !== 'cash',
    )
    .reduce((sum, r) => sum + (r.payment?.driverPayout ?? 0), 0)

  // Pending counts against the balance as firmly as paid does. A driver who
  // asks twice while the first is still being processed has asked for the
  // same money twice, and somebody has to notice — better here than after
  // both have been sent.
  const requested = withdrawals
    .filter((w) => w.driverId === driverId && w.status !== 'rejected')
    .reduce((sum, w) => sum + w.amount, 0)

  return { earned, requested, available: Math.max(0, earned - requested) }
}

interface DriverWithdrawPanelProps {
  driverId: string
  driverName: string
  rides: Ride[]
  withdrawals: DriverWithdrawal[]
  gcashAccount: PaymentAccountDetails | null
  mayaAccount: PaymentAccountDetails | null
  onRequest: (withdrawal: DriverWithdrawal) => void
}

export function DriverWithdrawPanel({
  driverId,
  driverName,
  rides,
  withdrawals,
  gcashAccount,
  mayaAccount,
  onRequest,
}: DriverWithdrawPanelProps) {
  const accounts: Record<Wallet, PaymentAccountDetails | null> = { gcash: gcashAccount, maya: mayaAccount }
  const firstConfigured: Wallet = gcashAccount ? 'gcash' : 'maya'
  const [wallet, setWallet] = useState<Wallet>(firstConfigured)
  const [amount, setAmount] = useState('')
  const [justAsked, setJustAsked] = useState(false)

  const { earned, requested, available } = withdrawableBalance(rides, driverId, withdrawals)
  const mine = withdrawals.filter((w) => w.driverId === driverId)
  const account = accounts[wallet]
  // Empty means "all of it", which is what most people mean.
  const asked = amount.trim() === '' ? available : Math.floor(Number(amount) || 0)
  const tooMuch = asked > available
  const canAsk = available > 0 && asked > 0 && !tooMuch && !!account?.accountNumber

  function submit() {
    if (!canAsk || !account) return
    onRequest({
      id: `wd-${driverId}-${Date.now()}`,
      driverId,
      driverName,
      amount: asked,
      method: wallet,
      // Copied, not referenced. A driver who edits their wallet number after
      // asking must not silently redirect a payout already approved.
      accountName: account.accountName || driverName,
      accountNumber: account.accountNumber,
      requestedAt: new Date().toISOString(),
      status: 'pending',
      reference: null,
      settledAt: null,
      note: null,
    })
    setAmount('')
    setJustAsked(true)
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700">Withdraw my earnings</h2>
      <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
        Fares your passengers paid in the app are held for you and sent to your wallet when you ask. Cash fares
        are not here — you were paid those at the kerb.
      </p>

      <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-center">
        <div className="rounded-lg border border-slate-200 px-2 py-1.5">
          <p className="text-[10px] font-medium text-slate-500">Paid in app</p>
          <p className="text-sm font-bold text-slate-800">₱{earned.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-slate-200 px-2 py-1.5">
          <p className="text-[10px] font-medium text-slate-500">Already asked</p>
          <p className="text-sm font-bold text-slate-800">₱{requested.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-brand-300 bg-brand-50 px-2 py-1.5">
          <p className="text-[10px] font-medium text-brand-700">Available</p>
          <p className="text-sm font-bold text-brand-800">₱{available.toLocaleString()}</p>
        </div>
      </div>

      {available <= 0 ? (
        <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] leading-snug text-slate-500">
          Nothing to withdraw yet. This fills up as passengers pay their fares in the app rather than in cash.
        </p>
      ) : (
        <>
          <div className="mt-2.5 grid grid-cols-2 gap-1.5">
            {(['gcash', 'maya'] as Wallet[]).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWallet(w)}
                disabled={!accounts[w]?.accountNumber}
                className={`rounded-lg border py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  wallet === w
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {WALLET_LABEL[w]}
              </button>
            ))}
          </div>

          {!account?.accountNumber ? (
            // Said here rather than left as a disabled button with no
            // explanation — the fix is two screens away and nothing else on
            // this panel points at it.
            <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-snug text-amber-800">
              Add your {WALLET_LABEL[wallet]} number under <span className="font-semibold">My e-wallets</span> first
              — that is where the money would be sent.
            </p>
          ) : (
            <>
              <p className="mt-2 text-[11px] text-slate-500">
                To {account.accountName || driverName} ·{' '}
                <span className="font-semibold text-slate-700">{account.accountNumber}</span>
              </p>
              <div className="mt-1.5 flex gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={available}
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value)
                    setJustAsked(false)
                  }}
                  placeholder={`₱${available} (all of it)`}
                  aria-label="How much to withdraw"
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={submit}
                  disabled={!canAsk}
                  className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-400"
                >
                  Withdraw
                </button>
              </div>
              {tooMuch && (
                <p className="mt-1 text-[11px] font-medium text-amber-700">
                  That is more than the ₱{available.toLocaleString()} available.
                </p>
              )}
            </>
          )}
        </>
      )}

      {justAsked && (
        <p className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-2 text-[11px] leading-snug text-emerald-800">
          Asked. Your TODA sends it to your wallet and it shows as paid here, with the reference, once they have.
        </p>
      )}

      {mine.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Your withdrawals</p>
          <ul className="mt-1 space-y-1">
            {mine.slice(0, 6).map((w) => (
              <li
                key={w.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px]"
              >
                <span className="min-w-0">
                  <span className="font-semibold text-slate-800">₱{w.amount.toLocaleString()}</span>{' '}
                  <span className="text-slate-400">
                    {WALLET_LABEL[w.method]} · {new Date(w.requestedAt).toLocaleDateString()}
                  </span>
                  {w.reference && <span className="block truncate text-slate-400">ref {w.reference}</span>}
                  {w.note && <span className="block truncate text-amber-700">{w.note}</span>}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    w.status === 'paid'
                      ? 'bg-emerald-100 text-emerald-800'
                      : w.status === 'rejected'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {w.status === 'paid' ? 'Paid' : w.status === 'rejected' ? 'Refused' : 'Pending'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
