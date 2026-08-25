import { useMemo, useState } from 'react'
import { useAdminViewMode } from '../lib/adminViewMode'
import { AdminSectionTabs } from '../components/AdminSectionTabs'
import { ParentDetailModal } from '../components/AccountDetailModals'
import { ActivityLogPanel } from '../components/ActivityLogPanel'
import { SosAlertBanner } from '../components/SosAlertBanner'
import { activeSuspension } from '../lib/accountOps'
import { useRides } from '../context/RideContext'

const ALL = '__all__'

function Tile({ label, value, tone = 'plain' }: { label: string; value: string; tone?: 'plain' | 'warn' }) {
  return (
    <div
      className={`rounded-xl border p-3 shadow-sm ${
        tone === 'warn' ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'
      }`}
    >
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-bold leading-tight text-slate-800">{value}</p>
    </div>
  )
}

// Parent tab of the internal ops view. The thing worth monitoring here is the
// guardian link itself — who is watching which student, whether consent was
// recorded, and whether the children being watched are actually travelling.
export function AdminParentMonitorPage() {
  const { containerClass } = useAdminViewMode()
  const { parents, passengers, parentLinks, rides, alerts, accountSuspensions, activityLog } = useRides()
  const [consentFilter, setConsentFilter] = useState(ALL)
  const [openId, setOpenId] = useState<string | null>(null)

  const links = useMemo(
    () =>
      consentFilter === ALL
        ? parentLinks
        : parentLinks.filter((l) => (consentFilter === 'given' ? l.consentGiven : !l.consentGiven)),
    [parentLinks, consentFilter],
  )

  const watchedIds = useMemo(() => new Set(links.map((l) => l.studentPassengerId)), [links])
  const watchedRides = useMemo(() => rides.filter((r) => watchedIds.has(r.passengerId)), [rides, watchedIds])
  const completed = watchedRides.filter((r) => r.status === 'completed')
  const active = watchedRides.filter((r) => !['completed', 'cancelled', 'declined'].includes(r.status))
  const missingConsent = parentLinks.filter((l) => !l.consentGiven).length
  const alertsOnWatched = alerts.filter((a) => {
    const ride = rides.find((r) => r.id === a.rideId)
    return ride ? watchedIds.has(ride.passengerId) : false
  })

  const parentName = (id: string) => parents.find((p) => p.id === id)?.name ?? 'Unknown parent'
  const studentName = (id: string) => passengers.find((p) => p.id === id)?.name ?? 'Unknown student'
  const tripsFor = (studentId: string) => rides.filter((r) => r.passengerId === studentId)

  return (
    <div className={`mx-auto ${containerClass} space-y-3 px-4 pb-6 pt-1`}>
      <SosAlertBanner />
      <AdminSectionTabs />
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-sm font-semibold text-slate-700">Parent monitoring</h1>
        <p className="mt-0.5 text-xs text-slate-500">
          Guardian links, consent records, and the trips each watched student has taken.
        </p>
        <label className="mt-3 block text-[11px] font-medium text-slate-500">Filter by consent</label>
        <select
          value={consentFilter}
          onChange={(e) => setConsentFilter(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value={ALL}>All links ({parentLinks.length})</option>
          <option value="given">Consent recorded ({parentLinks.filter((l) => l.consentGiven).length})</option>
          <option value="missing">Consent missing ({missingConsent})</option>
        </select>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <Tile label="Parents" value={String(parents.length)} />
        <Tile label="Guardian links" value={String(links.length)} />
        <Tile label="Students watched" value={String(watchedIds.size)} />
        <Tile label="Trips watched" value={String(completed.length)} />
        <Tile label="Trips in progress" value={String(active.length)} />
        <Tile
          label="Consent missing"
          value={String(missingConsent)}
          tone={missingConsent > 0 ? 'warn' : 'plain'}
        />
      </div>

      {alertsOnWatched.length > 0 && (
        <section className="rounded-xl border border-danger-300 bg-danger-50 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-danger-900">🆘 Alerts on watched students</h2>
          <p className="mt-0.5 text-xs text-danger-800">
            {alertsOnWatched.length} raised on a trip a parent is watching. Detail and resolution are on Rides &amp;
            Safety.
          </p>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-700">Parent records</h2>
        <p className="mb-2 text-[11px] text-slate-500">
          Tap a name to open the full record — linked students, watched trips, incident reports — and to pause the
          account or send a note.
        </p>
        <div className="space-y-1">
          {parents.map((p) => {
            const suspended = activeSuspension(accountSuspensions, 'parent', p.id)
            const kids = parentLinks.filter((l) => l.parentId === p.id).length
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setOpenId(p.id)}
                className="w-full rounded-lg border border-slate-200 p-2 text-left text-xs transition hover:border-brand-300 hover:bg-slate-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-medium text-slate-700">{p.name}</span>
                  {suspended ? (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                      ⏸ paused
                    </span>
                  ) : (
                    <span className="shrink-0 text-[10px] text-slate-400">{kids} student(s)</span>
                  )}
                </div>
                <p className="truncate text-[11px] text-slate-400">
                  {p.phone} · {p.barangay}, {p.city}
                </p>
              </button>
            )
          })}
        </div>
      </section>

      {openId && <ParentDetailModal parentId={openId} onClose={() => setOpenId(null)} />}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Guardian links</h2>
        {links.length === 0 ? (
          <p className="text-xs text-slate-400">No links for this selection.</p>
        ) : (
          <div className="space-y-1.5">
            {links.map((l) => {
              const trips = tripsFor(l.studentPassengerId)
              const done = trips.filter((r) => r.status === 'completed').length
              return (
                <div
                  key={`${l.parentId}-${l.studentPassengerId}`}
                  className="rounded-lg border border-slate-200 p-2.5 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="font-medium text-slate-700">{parentName(l.parentId)}</span>
                      <span className="text-slate-400"> watches </span>
                      <span className="font-medium text-slate-700">{studentName(l.studentPassengerId)}</span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        l.consentGiven ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {l.consentGiven ? '✓ consent' : 'no consent'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {l.relationship} · {done} completed of {trips.length} trip(s)
                    {l.proofOfAuthorityDataUrl ? ' · proof on file' : ' · no proof uploaded'}
                  </p>
                  {l.consentedAt && (
                    <p className="text-[10px] text-slate-400">
                      Consent recorded {new Date(l.consentedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <ActivityLogPanel
        title="Parent monitoring — Log History"
        entries={activityLog.filter((e) => e.actorRole === 'admin')}
        emptyMessage="No Admin changes logged yet."
      />
    </div>
  )
}
