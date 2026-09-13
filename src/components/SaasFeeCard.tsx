import { useState } from 'react'
import { PlatformFeeSoa, type ChargeLine } from './PlatformFeeSoa'
import { useRides } from '../context/RideContext'
import type { PlatformFeePayerRole } from '../types'

interface SaasFeeCardProps {
  payerRole: PlatformFeePayerRole
  payerId: string
  payerName: string
  // The plan's own name, shown so the bill can be checked against what was
  // agreed rather than taken on trust.
  planLabel: string
  monthlyFee: number
  perBookingFee: number
  // Completed bookings this month across everything this payer is billed for.
  bookings: number
  // What one billable unit is called on the bill — "booking" for a TODA or
  // operator, "delivered order" for a vendor.
  bookingNoun?: string
  title?: string
}

// The Level 1 SaaS bill, as the org itself sees it: what is owed this month,
// what it is made of, and a way to settle it. The same statement and the same
// GCash hand-off the drivers get for their per-ride commission — one billing
// surface, whichever rung of the hierarchy is paying.
export function SaasFeeCard({
  payerRole,
  payerId,
  payerName,
  planLabel,
  monthlyFee,
  perBookingFee,
  bookings,
  bookingNoun = 'booking',
  title = 'SaaS platform fee',
}: SaasFeeCardProps) {
  const { platformFeePayments, platformGcashAccount, recordPlatformFeePayment } = useRides()
  const [showSoa, setShowSoa] = useState(false)

  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const bookingCharge = perBookingFee > 0 ? perBookingFee * bookings : 0
  const charged = monthlyFee + bookingCharge
  const periodPayments = platformFeePayments.filter(
    (p) => p.payerRole === payerRole && p.payerId === payerId && new Date(p.paidAt) >= monthStart,
  )
  const paid = periodPayments.reduce((sum, p) => sum + p.amount, 0)
  const balance = Math.max(0, charged - paid)
  const periodLabel = monthStart.toLocaleDateString([], { month: 'long', year: 'numeric' })

  const chargeLines: ChargeLine[] = [
    {
      id: 'monthly',
      label: `${planLabel} — monthly platform fee`,
      detail: periodLabel,
      amount: monthlyFee,
    },
    ...(perBookingFee > 0
      ? [
          {
            id: 'per-booking',
            label: `Per-${bookingNoun} fee`,
            detail: `₱${perBookingFee} × ${bookings} completed ${bookingNoun}${bookings === 1 ? '' : 's'}`,
            amount: bookingCharge,
          },
        ]
      : []),
  ]

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      <p className="mt-0.5 text-[11px] text-slate-500">
        What {payerName} owes TODA Ride Mobility this month. A separate billing relationship from the per-ride
        commission — it is not taken out of anyone's fare.
      </p>
      <div className="mt-2 space-y-1 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Plan</span>
          <span className="font-medium text-slate-700">{planLabel}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Monthly platform fee</span>
          <span className="font-medium text-slate-700">₱{monthlyFee.toLocaleString()}</span>
        </div>
        {perBookingFee > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-slate-500">
              Per {bookingNoun} · ₱{perBookingFee} × {bookings} completed
            </span>
            <span className="font-medium text-slate-700">₱{bookingCharge.toLocaleString()}</span>
          </div>
        )}
        {paid > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Paid</span>
            <span className="font-medium text-emerald-700">− ₱{paid.toLocaleString()}</span>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-slate-100 pt-1">
          <span className="font-semibold text-slate-700">Balance due</span>
          <span className={`text-base font-bold ${balance > 0 ? 'text-slate-800' : 'text-emerald-700'}`}>
            {balance > 0 ? `₱${balance.toLocaleString()}` : '✓ Settled'}
          </span>
        </div>
      </div>
      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          onClick={() => setShowSoa(true)}
          className="flex-1 rounded-lg border border-slate-300 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          📄 View SOA
        </button>
        {balance > 0 && (
          <button
            type="button"
            onClick={() => setShowSoa(true)}
            className="flex-1 rounded-lg bg-[#0f766e] py-2 text-xs font-semibold text-white hover:bg-[#0b5f59]"
          >
            Pay via E-Wallet
          </button>
        )}
      </div>

      <PlatformFeeSoa
        open={showSoa}
        onClose={() => setShowSoa(false)}
        periodLabel={periodLabel}
        lines={[]}
        chargeLines={chargeLines}
        linesLabel="Charges"
        charged={charged}
        paid={paid}
        payments={periodPayments}
        account={platformGcashAccount}
        onPay={(amount, reference) => {
          recordPlatformFeePayment({
            id: `pfp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            payerRole,
            payerId,
            payerName,
            amount,
            method: 'gcash',
            reference,
            proofDataUrl: null,
            paidAt: new Date().toISOString(),
          })
        }}
      />
    </section>
  )
}
