import { useRides } from '../context/RideContext'
import {
  TODA_REFERRAL_REWARD_PER_RIDE,
  formatPeso,
  registeredMemberCount,
  todaQualifiesForReward,
} from '../lib/marketingProgram'

// The TODA's side of the Driver Marketing Promotion Program: how close it is
// to having every member registered (the requirement), and what the ₱0.30
// per recruit ride has paid it so far.
export function TodaMarketingRewardCard({ orgId }: { orgId: string }) {
  const { todaOrganizations, drivers, rides } = useRides()
  const org = todaOrganizations.find((o) => o.id === orgId)
  if (!org) return null
  const registered = registeredMemberCount(orgId, drivers)
  const official = org.officialMemberCount ?? null
  const qualifies = todaQualifiesForReward(org, drivers)
  const earned = rides
    .filter((r) => r.status === 'completed' && r.payment?.todaReferralOrgId === orgId)
    .reduce((sum, r) => sum + (r.payment?.todaReferralReward ?? 0), 0)
  const pct = official ? Math.min(100, Math.round((registered / official) * 100)) : 0

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700">📣 Driver Marketing Promotion</h2>
      <p className="text-xs leading-relaxed text-slate-500">
        Your TODA earns {formatPeso(TODA_REFERRAL_REWARD_PER_RIDE)} for every ride completed by a member who joined
        through a partner's referral code — once <span className="font-semibold">all your members</span> are
        registered in the app.
      </p>
      {official ? (
        <div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600">Members registered</span>
            <span className="font-bold text-slate-800">
              {registered} of {official}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full ${qualifies ? 'bg-emerald-500' : 'bg-gold-400'}`} style={{ width: `${pct}%` }} />
          </div>
          <p className={`mt-1 text-[11px] font-semibold ${qualifies ? 'text-emerald-700' : 'text-amber-700'}`}>
            {qualifies
              ? '✓ All members registered — your TODA is earning rewards.'
              : `${official - registered} more member${official - registered === 1 ? '' : 's'} to register before rewards start.`}
          </p>
        </div>
      ) : (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          Your official member count has not been set yet. Ask the App Admin to set it — rewards start once that many
          members are registered.
        </p>
      )}
      <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
        <span className="text-slate-600">Rewards earned</span>
        <span className="text-base font-bold text-emerald-700">{formatPeso(earned)}</span>
      </div>
    </section>
  )
}
