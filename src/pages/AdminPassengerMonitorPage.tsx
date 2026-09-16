import { formatTripRoute } from '../lib/addressFormat'
import { isActiveAlert } from '../lib/safety'
import { useMemo, useState } from 'react'
import { useAdminViewMode } from '../lib/adminViewMode'
import { AdminSectionTabs } from '../components/AdminSectionTabs'
import { AdminPassengerDirectory } from '../components/AdminPassengerDirectory'
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

// Passenger tab of the internal ops view. Like the Driver tab, this used to
// render the passenger's own booking screen — useful for demoing a booking,
// useless for monitoring. The booking flow still exists for riders at /book.
export function AdminPassengerMonitorPage() {
  const { containerClass } = useAdminViewMode()
  const { passengers, parents, parentLinks, rides, alerts, driverReports, activityLog } = useRides()
  const [cityFilter, setCityFilter] = useState(ALL)

  const cities = useMemo(
    () => [...new Set(passengers.map((p) => p.city).filter(Boolean))].sort(),
    [passengers],
  )

  const inScope = useMemo(
    () => (cityFilter === ALL ? passengers : passengers.filter((p) => p.city === cityFilter)),
    [passengers, cityFilter],
  )
  const scopeIds = useMemo(() => new Set(inScope.map((p) => p.id)), [inScope])
  const scopedRides = useMemo(() => rides.filter((r) => scopeIds.has(r.passengerId)), [rides, scopeIds])
  const completed = scopedRides.filter((r) => r.status === 'completed')
  const cancelled = scopedRides.filter((r) => r.status === 'cancelled')

  const spend = completed.reduce((sum, r) => sum + (r.payment?.amount ?? r.fareEstimate ?? 0), 0)
  const students = inScope.filter((p) => p.isStudent).length
  const linked = parentLinks.filter((l) => scopeIds.has(l.studentPassengerId)).length
  const openAlerts = alerts.filter((a) => isActiveAlert(a))
  const reportsFiled = driverReports.filter((r) => scopeIds.has(r.passengerId))

  const rated = completed.filter((r) => typeof r.driverRating === 'number')
  const avgGiven = rated.length > 0 ? rated.reduce((s, r) => s + (r.driverRating ?? 0), 0) / rated.length : null

  const recent = [...scopedRides]
    .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())
    .slice(0, 8)

  const nameOf = (id: string) => passengers.find((p) => p.id === id)?.name ?? 'Guest'
  const parentOf = (passengerId: string) => {
    const link = parentLinks.find((l) => l.studentPassengerId === passengerId)
    return link ? parents.find((p) => p.id === link.parentId)?.name ?? null : null
  }

  return (
    <div className={`mx-auto ${containerClass} space-y-3 px-4 pb-6 pt-1`}>
      <SosAlertBanner />
      <AdminSectionTabs />
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-sm font-semibold text-slate-700">Passenger monitoring</h1>
        <p className="mt-0.5 text-xs text-slate-500">
          Trips, spend, ratings given, reports filed and safety alerts across riders.
        </p>
        <label className="mt-3 block text-[11px] font-medium text-slate-500">Filter by city</label>
        <select
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value={ALL}>All cities ({passengers.length})</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c} ({passengers.filter((p) => p.city === c).length})
            </option>
          ))}
        </select>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <Tile label="Passengers" value={String(inScope.length)} />
        <Tile label="Students" value={String(students)} />
        <Tile label="Completed trips" value={String(completed.length)} />
        <Tile label="Total spend" value={`₱${spend.toLocaleString()}`} />
        <Tile label="Avg rating given" value={avgGiven ? `★ ${avgGiven.toFixed(2)}` : '—'} />
        <Tile label="Cancelled" value={String(cancelled.length)} tone={cancelled.length > 0 ? 'warn' : 'plain'} />
        <Tile label="Linked to a parent" value={String(linked)} />
        <Tile
          label="Reports filed"
          value={String(reportsFiled.length)}
          tone={reportsFiled.some((r) => r.status === 'open') ? 'warn' : 'plain'}
        />
      </div>

      {openAlerts.length > 0 && (
        <section className="rounded-xl border border-danger-300 bg-danger-50 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-danger-900">🆘 Open safety alerts</h2>
          <p className="mt-0.5 text-xs text-danger-800">
            {openAlerts.length} unresolved. Full detail and the resolve action live on Rides &amp; Safety.
          </p>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Recent trips</h2>
        {recent.length === 0 ? (
          <p className="text-xs text-slate-400">No trips yet for this selection.</p>
        ) : (
          <div className="space-y-1.5">
            {recent.map((r) => {
              const guardian = parentOf(r.passengerId)
              return (
                <div key={r.id} className="rounded-lg border border-slate-200 p-2 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="font-medium text-slate-700">{nameOf(r.passengerId)}</span>{' '}
                      <span className="text-slate-400">· {r.status.replace(/_/g, ' ')}</span>
                    </span>
                    <span className="shrink-0 text-slate-500">
                      ₱{r.payment?.amount ?? r.fareEstimate ?? 0}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-slate-500">
                    {formatTripRoute(r.pickup.label, r.dropoff.label)}
                  </p>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-slate-400">{new Date(r.requestedAt).toLocaleString()}</p>
                    {typeof r.driverRating === 'number' && <StarRating value={r.driverRating} size="sm" />}
                  </div>
                  {guardian && <p className="text-[10px] text-brand-600">Watched by {guardian}</p>}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Reports filed by passengers</h2>
        {reportsFiled.length === 0 ? (
          <p className="text-xs text-slate-400">No reports filed for this selection.</p>
        ) : (
          <div className="space-y-1.5">
            {reportsFiled.slice(0, 8).map((r) => (
              <div key={r.id} className="rounded-lg border border-slate-200 p-2 text-xs">
                <p className="font-medium text-slate-700">
                  {r.passengerName} → {r.driverName}
                </p>
                <p className="text-slate-500">
                  {DRIVER_REPORT_REASON_LABELS[r.reason]} ·{' '}
                  <span className={r.status === 'open' ? 'text-amber-700' : 'text-emerald-700'}>{r.status}</span>
                </p>
                {r.details && <p className="mt-0.5 text-slate-600">{r.details}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* The roster keeps its existing component — it already does search,
          per-passenger expansion and linked-parent detail. */}
      <AdminPassengerDirectory />

      <ActivityLogPanel
        title="Passenger monitoring — Log History"
        entries={activityLog.filter((e) => e.actorRole === 'admin')}
        emptyMessage="No Admin changes logged yet."
      />
    </div>
  )
}
