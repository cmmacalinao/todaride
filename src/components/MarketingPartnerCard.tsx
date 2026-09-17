import { useState } from 'react'
import { useRides } from '../context/RideContext'
import {
  PARTNER_COMMISSION_PER_RIDE,
  REFERRAL_WINDOW_DAYS,
  formatPeso,
  referralActive,
  referralEndsAt,
} from '../lib/marketingProgram'
import type { Driver } from '../types'

// The driver's side of the Driver Marketing Promotion Program: join (instant,
// no approval), then share the code and see what recruits have earned them.
export function MarketingPartnerCard({ driver }: { driver: Driver }) {
  const { drivers, rides, joinMarketingPartner } = useRides()
  const [copied, setCopied] = useState(false)

  if (!driver.partnerCode) {
    return (
      <section className="space-y-2 rounded-xl border-2 border-gold-400 bg-gold-50 p-4">
        <h2 className="text-sm font-bold text-navy-900">📣 Earn extra as a Marketing Partner</h2>
        <p className="text-xs leading-relaxed text-slate-700">
          Invite other tricycle drivers to join TODARide Mobility. For every ride your recruits complete, you earn{' '}
          <span className="font-bold">{formatPeso(PARTNER_COMMISSION_PER_RIDE)}</span> — for a full year from the day
          each one signs up. It does not come out of their pay.
        </p>
        <button
          type="button"
          onClick={() => joinMarketingPartner(driver.id)}
          className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
        >
          Apply as Marketing Partner — get my code
        </button>
      </section>
    )
  }

  const recruits = drivers.filter((d) => d.referredByDriverId === driver.id)
  const activeRecruits = recruits.filter((d) => referralActive(d))
  const commissionRides = rides.filter((r) => r.status === 'completed' && r.payment?.partnerDriverId === driver.id)
  const total = commissionRides.reduce((sum, r) => sum + (r.payment?.partnerCommission ?? 0), 0)
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const thisMonth = commissionRides
    .filter((r) => r.completedAt && new Date(r.completedAt) >= monthStart)
    .reduce((sum, r) => sum + (r.payment?.partnerCommission ?? 0), 0)

  async function share() {
    const text = `Join TODARide Mobility as a driver and use my referral code ${driver.partnerCode} when you sign up.`
    try {
      if (navigator.share) {
        await navigator.share({ text })
        return
      }
      await navigator.clipboard.writeText(driver.partnerCode ?? '')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Share sheet dismissed, or clipboard blocked — nothing to recover.
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold text-navy-900">📣 Marketing Partner</h2>
      <div className="flex items-center justify-between gap-2 rounded-lg bg-gold-50 px-3 py-2">
        <div>
          <p className="text-[11px] text-slate-500">Your referral code</p>
          <p className="font-mono text-lg font-extrabold tracking-wider text-navy-900">{driver.partnerCode}</p>
        </div>
        <button
          type="button"
          onClick={() => void share()}
          className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700"
        >
          {copied ? 'Copied ✓' : 'Share code'}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 p-2">
          <p className="text-[11px] text-slate-500">Recruits</p>
          <p className="text-base font-bold text-slate-800">
            {activeRecruits.length}
            {recruits.length > activeRecruits.length && (
              <span className="text-[11px] font-normal text-slate-400"> / {recruits.length}</span>
            )}
          </p>
        </div>
        <div className="rounded-lg bg-slate-50 p-2">
          <p className="text-[11px] text-slate-500">This month</p>
          <p className="text-base font-bold text-emerald-700">{formatPeso(thisMonth)}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-2">
          <p className="text-[11px] text-slate-500">Total earned</p>
          <p className="text-base font-bold text-emerald-700">{formatPeso(total)}</p>
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500">
        {formatPeso(PARTNER_COMMISSION_PER_RIDE)} for every completed ride by a driver who signed up with your code,
        for {REFERRAL_WINDOW_DAYS} days from their sign-up.
      </p>
      {recruits.length > 0 && (
        <ul className="space-y-1">
          {recruits.map((r) => {
            const ends = referralEndsAt(r)
            return (
              <li key={r.id} className="flex items-center justify-between text-xs">
                <span className="text-slate-700">{r.name}</span>
                <span className={referralActive(r) ? 'text-emerald-700' : 'text-slate-400'}>
                  {referralActive(r) ? 'Earning until' : 'Ended'}{' '}
                  {ends ? new Date(ends).toLocaleDateString() : ''}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
