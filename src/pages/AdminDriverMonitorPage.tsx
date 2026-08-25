import { formatTripRoute } from '../lib/addressFormat'
import { useMemo, useState } from 'react'
import { useAdminViewMode } from '../lib/adminViewMode'
import { AdminSectionTabs } from '../components/AdminSectionTabs'
import { AdminDriverDirectory } from '../components/AdminDriverDirectory'
import { AdminDriverQueue } from '../components/AdminDriverQueue'
import { ActivityLogPanel } from '../components/ActivityLogPanel'
import { SosAlertBanner } from '../components/SosAlertBanner'
import { StarRating } from '../components/StarRating'
import { useRides } from '../context/RideContext'
import { DRIVER_REPORT_REASON_LABELS } from '../mock/data'

const ALL = '__all__'

function Tile({ label, value, tone = 'plain' }: { label: string; value: string; tone?: 'plain' | 'warn' | 'good' }) {
  const ring =
    tone === 'warn' ? 'border-amber-300 bg-amber-50' : tone === 'good' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'
  return (
    <div className={`rounded-xl border p-3 shadow-sm ${ring}`}>
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-bold leading-tight text-slate-800">{value}</p>
    </div>
  )
}

// The Driver tab of the internal ops view. An Admin is not a driver, so this
// used to render the driver *login* — a dead end. It is now what an operator
// actually needs from that tab: who is out there, what they earned, what
// passengers said about them, and which applications are waiting.
export function AdminDriverMonitorPage() {
  const { containerClass } = useAdminViewMode()
  const {
    drivers,
    rides,
    todaOrganizations,
    driverReports,
    resolveDriverReport,
    logActivity,
    activityLog,
  } = useRides()
  const [todaFilter, setTodaFilter] = useState(ALL)

  const inScope = useMemo(
    () =>
      todaFilter === ALL
        ? drivers
        : drivers.filter((d) => (todaFilter === 'freelance' ? d.todaOrgId === null : d.todaOrgId === todaFilter)),
    [drivers, todaFilter],
  )
  const scopeIds = useMemo(() => new Set(inScope.map((d) => d.id)), [inScope])
  const scopedRides = useMemo(() => rides.filter((r) => r.driverId && scopeIds.has(r.driverId)), [rides, scopeIds])
  const completed = scopedRides.filter((r) => r.status === 'completed')

  const earnings = completed.reduce((sum, r) => sum + (r.payment?.driverPayout ?? 0), 0)
  const online = inScope.filter((d) => d.online).length
  const pending = inScope.filter((d) => d.verificationStatus === 'pending').length
  const paused = inScope.filter((d) => d.accessStatus !== 'active').length
  const openReports = driverReports.filter((r) => r.status === 'open' && scopeIds.has(r.driverId))

  const rated = completed.filter((r) => typeof r.driverRating === 'number')
  const avgRating = rated.length > 0 ? rated.reduce((s, r) => s + (r.driverRating ?? 0), 0) / rated.length : null

  // Most recent activity across the filtered fleet — the "what is happening
  // right now" view an ops person opens this tab for.
  const recent = [...scopedRides]
    .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())
    .slice(0, 8)

  const reviews = completed
    .filter((r) => r.driverReviewText)
    .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())
    .slice(0, 6)

  const driverName = (id: string | null) => drivers.find((d) => d.id === id)?.name ?? 'Unassigned'

  return (
    <div className={`mx-auto ${containerClass} space-y-3 px-4 pb-6 pt-1`}>
      <SosAlertBanner />
      <AdminSectionTabs />
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-sm font-semibold text-slate-700">Driver monitoring</h1>
        <p className="mt-0.5 text-xs text-slate-500">
          Activity, earnings, ratings and passenger reports across the fleet. Approve applications here too.
        </p>
        <label className="mt-3 block text-[11px] font-medium text-slate-500">Filter by TODA organization</label>
        <select
          value={todaFilter}
          onChange={(e) => setTodaFilter(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value={ALL}>All drivers ({drivers.length})</option>
          {todaOrganizations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} ({drivers.filter((d) => d.todaOrgId === o.id).length})
            </option>
          ))}
          <option value="freelance">Freelance — no TODA ({drivers.filter((d) => d.todaOrgId === null).length})</option>
        </select>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <Tile label="Drivers in scope" value={String(inScope.length)} />
        <Tile label="Online now" value={String(online)} tone={online > 0 ? 'good' : 'plain'} />
        <Tile label="Completed trips" value={String(completed.length)} />
        <Tile label="Driver earnings" value={`₱${earnings.toLocaleString()}`} />
        <Tile label="Average rating" value={avgRating ? `★ ${avgRating.toFixed(2)}` : '—'} />
        <Tile
          label="Open reports"
          value={String(openReports.length)}
          tone={openReports.length > 0 ? 'warn' : 'plain'}
        />
        {pending > 0 && <Tile label="Awaiting approval" value={String(pending)} tone="warn" />}
        {paused > 0 && <Tile label="Paused / terminated" value={String(paused)} tone="warn" />}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Recent activity</h2>
        {recent.length === 0 ? (
          <p className="text-xs text-slate-400">No trips yet for this selection.</p>
        ) : (
          <div className="space-y-1.5">
            {recent.map((r) => (
              <div key={r.id} className="rounded-lg border border-slate-200 p-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="font-medium text-slate-700">{driverName(r.driverId)}</span>{' '}
                    <span className="text-slate-400">· {r.status.replace(/_/g, ' ')}</span>
                  </span>
                  <span className="shrink-0 text-slate-500">
                    {r.payment?.driverPayout ? `₱${r.payment.driverPayout}` : '—'}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-slate-500">
                  {formatTripRoute(r.pickup.label, r.dropoff.label)}
                </p>
                <p className="text-[10px] text-slate-400">{new Date(r.requestedAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Passenger reports</h2>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
            {openReports.length} open
          </span>
        </div>
        {openReports.length === 0 ? (
          <p className="text-xs text-slate-400">No open reports for this selection.</p>
        ) : (
          <div className="space-y-2">
            {openReports.map((r) => (
              <div key={r.id} className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs">
                <p className="font-semibold text-amber-800">
                  {r.driverName} · {DRIVER_REPORT_REASON_LABELS[r.reason]}
                </p>
                <p className="text-slate-500">Reported by {r.passengerName}</p>
                {r.details && <p className="mt-1 text-slate-600">{r.details}</p>}
                <button
                  type="button"
                  onClick={() => {
                    resolveDriverReport(r.id)
                    logActivity({
                      actorRole: 'admin',
                      actorName: 'Admin',
                      todaOrgId: null,
                      action: 'Reviewed driver report',
                      summary: `Marked report against ${r.driverName} (${DRIVER_REPORT_REASON_LABELS[r.reason]}) reviewed.`,
                    })
                  }}
                  className="mt-2 w-full rounded-lg bg-amber-700 py-1.5 text-[11px] font-semibold text-white hover:bg-amber-800"
                >
                  Mark reviewed
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Latest passenger ratings</h2>
        {reviews.length === 0 ? (
          <p className="text-xs text-slate-400">No written reviews yet for this selection.</p>
        ) : (
          <div className="space-y-1.5">
            {reviews.map((r) => (
              <div key={r.id} className="rounded-lg border border-slate-200 p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-700">{driverName(r.driverId)}</span>
                  {typeof r.driverRating === 'number' && <StarRating value={r.driverRating} size="sm" />}
                </div>
                <p className="mt-0.5 text-slate-600">"{r.driverReviewText}"</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Applications and the full roster keep their existing components —
          both already do exactly this job on the Admin tab, so duplicating
          them here would mean two copies to keep in step. */}
      <AdminDriverQueue />
      <AdminDriverDirectory />

      <ActivityLogPanel
        title="Driver monitoring — Log History"
        entries={activityLog.filter((e) => e.actorRole === 'admin')}
        emptyMessage="No Admin changes logged yet."
      />
    </div>
  )
}
