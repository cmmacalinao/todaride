import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useRides } from '../context/RideContext'
import { useAdminViewMode } from '../lib/adminViewMode'
import { AdminSectionTabs } from '../components/AdminSectionTabs'
import { StarRating } from '../components/StarRating'
import {
  estimatedMonthlyTodaFee,
  getActiveTodaCommission,
  terminalsForOrg,
} from '../mock/data'
import { TERMINAL_TYPE_LABELS } from '../types'
import type { TodaOrgVerificationStatus } from '../types'

const STATUS_STYLES: Record<TodaOrgVerificationStatus, string> = {
  approved: 'bg-brand-100 text-brand-700',
  pending: 'bg-amber-100 text-amber-800',
  rejected: 'bg-rose-100 text-rose-700',
  unregistered: 'bg-slate-100 text-slate-600',
}

const STATUS_LABELS: Record<TodaOrgVerificationStatus, string> = {
  approved: 'Accredited',
  pending: 'Under review',
  rejected: 'Rejected',
  unregistered: 'Named by drivers — not yet registered',
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="shrink-0 text-xs text-slate-500">{label}</span>
      <span className="text-right text-xs font-medium text-slate-700">{value}</span>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold text-slate-700">{title}</h2>
      {children}
    </section>
  )
}

// One TODA, everything Admin knows about it, on its own page. The TODAs tab
// answers "what needs my attention"; this answers "who exactly is this
// organization" — the question that used to mean reading four panels and
// cross-referencing driver rows by hand.
export function AdminTodaProfilePage() {
  const { todaOrgId } = useParams<{ todaOrgId: string }>()
  const navigate = useNavigate()
  const { containerClass } = useAdminViewMode()
  const {
    todaOrganizations,
    drivers,
    rides,
    terminals,
    operators,
    approveTodaOrg,
    rejectTodaOrg,
    setTodaOrgPendingNote,
    logActivity,
  } = useRides()
  const [note, setNote] = useState('')
  const [deadlineDays, setDeadlineDays] = useState('')

  const org = todaOrganizations.find((o) => o.id === todaOrgId)
  const members = useMemo(() => drivers.filter((d) => d.todaOrgId === todaOrgId), [drivers, todaOrgId])

  const memberIds = useMemo(() => new Set(members.map((d) => d.id)), [members])
  const orgRides = useMemo(
    () => rides.filter((r) => r.driverId && memberIds.has(r.driverId)),
    [rides, memberIds],
  )
  const completed = orgRides.filter((r) => r.status === 'completed')
  const commissionEarned = completed.reduce((sum, r) => sum + (r.payment?.todaCommission ?? 0), 0)
  const memberEarnings = completed.reduce((sum, r) => sum + (r.payment?.driverPayout ?? 0), 0)

  const goBack = (
    <button
      type="button"
      onClick={() => navigate('/admin?tab=todas')}
      className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
    >
      ‹ Go back
    </button>
  )

  if (!org) {
    return (
      <div className={`mx-auto ${containerClass} space-y-3 px-4 py-6`}>
        <AdminSectionTabs />
        {goBack}
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          That TODA is no longer on file.
        </p>
      </div>
    )
  }

  const orgTerminals = terminalsForOrg(terminals, org.id)
  const operator = org.operatorId ? operators.find((o) => o.id === org.operatorId) : null
  const activeCommission = getActiveTodaCommission(org)

  return (
    <div className={`mx-auto ${containerClass} space-y-3 px-4 py-6`}>
      <AdminSectionTabs />

      <div className="flex items-center gap-2">
        {goBack}
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-slate-800">{org.name}</h1>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[org.verificationStatus]}`}>
          {STATUS_LABELS[org.verificationStatus]}
        </span>
      </div>

      {org.verificationStatus === 'unregistered' && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Drivers named this TODA when they signed up, so it exists as a record with members — but its officers have
          not registered it yet. When they do, that application claims this same record and everyone listed below is
          accredited with it.
        </p>
      )}

      {/* The application is decided here as well as in the queue. Reading a
          TODA's full profile is exactly when an Admin knows whether to
          approve it, and having to navigate back to the queue to act on what
          they just read is how applications sit for a week. Same three
          actions, same meanings: "Approve as noted" leaves it pending with a
          note and a resubmission deadline rather than accrediting it. */}
      {org.verificationStatus === 'pending' && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-900">Decide this application</h2>
          <p className="mt-0.5 text-xs text-amber-800">
            {members.length > 0
              ? `Approving accredits this TODA with the ${members.length} driver${
                  members.length === 1 ? '' : 's'
                } already listed under it.`
              : 'No drivers have signed up under this TODA yet.'}
          </p>
          <textarea
            value={note || org.registrationNote || ''}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note to the applicant — e.g. what's missing or needs fixing"
            rows={2}
            className="mt-2 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
          />
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={deadlineDays}
              onChange={(e) => setDeadlineDays(e.target.value)}
              placeholder="Days to resubmit"
              className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
            />
            <span className="text-[11px] text-amber-800">deadline for "Approve as noted" below</span>
          </div>
          <div className="mt-2 flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => {
                approveTodaOrg(org.id)
                logActivity({
                  actorRole: 'admin',
                  actorName: 'Admin',
                  todaOrgId: org.id,
                  action: 'Approved TODA org',
                  summary: `Approved "${org.name}"'s registration.`,
                })
              }}
              className="flex-1 rounded-lg bg-brand-600 py-1.5 font-semibold text-white hover:bg-brand-700"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => {
                const trimmed = (note || org.registrationNote || '').trim() || null
                const days = Number(deadlineDays)
                const deadline =
                  Number.isFinite(days) && days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null
                setTodaOrgPendingNote(org.id, trimmed, deadline)
                logActivity({
                  actorRole: 'admin',
                  actorName: 'Admin',
                  todaOrgId: org.id,
                  action: 'Approved TODA org as noted',
                  summary: `Approved "${org.name}" as noted${trimmed ? ` — "${trimmed}"` : ''}${
                    deadline ? `, resubmit by ${new Date(deadline).toLocaleDateString()}` : ''
                  }.`,
                })
              }}
              className="flex-1 rounded-lg border border-amber-400 bg-white py-1.5 font-medium text-amber-800 hover:bg-amber-100"
            >
              Approve as noted
            </button>
            <button
              type="button"
              onClick={() => {
                rejectTodaOrg(org.id)
                logActivity({
                  actorRole: 'admin',
                  actorName: 'Admin',
                  todaOrgId: org.id,
                  action: 'Rejected TODA org',
                  summary: `Rejected "${org.name}"'s registration.`,
                })
              }}
              className="flex-1 rounded-lg border border-slate-300 bg-white py-1.5 font-medium text-slate-600 hover:bg-slate-50"
            >
              Reject
            </button>
          </div>
        </section>
      )}

      {org.registrationNote && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <span className="font-semibold">Note sent to applicant: </span>
          {org.registrationNote}
          {org.registrationNoteDeadline &&
            ` (resubmit by ${new Date(org.registrationNoteDeadline).toLocaleDateString()})`}
        </p>
      )}

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-[11px] text-slate-500">Members</p>
          <p className="text-lg font-bold text-slate-800">{members.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-[11px] text-slate-500">Completed rides</p>
          <p className="text-lg font-bold text-slate-800">{completed.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-[11px] text-slate-500">Commission earned</p>
          <p className="text-lg font-bold text-slate-800">₱{commissionEarned}</p>
        </div>
      </div>

      <Panel title="Organization">
        <Row label="Officers" value={org.officers.map((o) => `${o.name} (${o.role})`).join(', ') || 'None on file'} />
        <Row
          label="Address"
          value={
            [org.addressDetail, org.barangay && `Barangay ${org.barangay}`, org.city, org.province]
              .filter(Boolean)
              .join(', ') || 'Not given'
          }
        />
        <Row
          label="Terminal GPS"
          value={
            org.terminalGps
              ? `${org.terminalGps.lat.toFixed(6)}, ${org.terminalGps.lng.toFixed(6)}`
              : 'Not captured'
          }
        />
        <Row label="Officer PIN" value={org.adminPin ? '•••• (set)' : 'Not set'} />
        <div className="flex items-center justify-between gap-3 py-1">
          <span className="text-xs text-slate-500">Passenger rating</span>
          {org.ratingCount > 0 ? (
            <span className="flex items-center gap-1.5">
              <StarRating value={org.rating} />
              <span className="text-xs text-slate-500">({org.ratingCount})</span>
            </span>
          ) : (
            <span className="text-xs font-medium text-slate-400">No ratings yet</span>
          )}
        </div>
      </Panel>

      <Panel title={`Members (${members.length})`}>
        {members.length === 0 ? (
          <p className="text-xs text-slate-400">No drivers have signed up under this TODA yet.</p>
        ) : (
          <div className="space-y-1.5">
            {members.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => navigate('/driver')}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-2 text-left hover:bg-slate-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium text-slate-700">{d.name}</span>
                  <span className="block truncate text-[11px] text-slate-500">
                    {d.plateNumber} · {d.phone}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {d.online && (
                    <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                      online
                    </span>
                  )}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      d.verificationStatus === 'approved'
                        ? 'bg-brand-100 text-brand-700'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {d.verificationStatus}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </Panel>

      <Panel title={`Terminals (${orgTerminals.length})`}>
        {orgTerminals.length === 0 ? (
          <p className="text-xs text-slate-400">No terminal has been recorded for this TODA.</p>
        ) : (
          <div className="space-y-1.5">
            {orgTerminals.map((t) => (
              <div key={t.id} className="rounded-lg border border-slate-200 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-medium text-slate-700">🚏 {t.name}</p>
                  <span className="shrink-0 text-[10px] font-medium text-slate-500">
                    {TERMINAL_TYPE_LABELS[t.type]}
                    {!t.isActive && ' · inactive'}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {[t.addressDetail, t.barangay, t.city].filter(Boolean).join(', ')}
                  {t.gps ? ` · ${t.gps.lat.toFixed(5)}, ${t.gps.lng.toFixed(5)}` : ' · no pin yet'}
                </p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Money">
        <Row
          label="Per-ride commission"
          value={
            activeCommission > 0
              ? `₱${activeCommission} (active)`
              : org.proposedCommissionPerRide !== null
                ? `₱${org.proposedCommissionPerRide} proposed — ${
                    org.commissionApprovedByMembers ? 'members signed off' : 'members have not signed off'
                  }, ${org.commissionApprovedByAdmin ? 'Admin signed off' : 'Admin has not signed off'}`
                : 'None proposed'
          }
        />
        <Row label="Members' payouts to date" value={`₱${memberEarnings}`} />
        <Row label="SaaS plan" value={org.saasPlan} />
        <Row label="Monthly platform fee" value={`₱${org.monthlyPlatformFee}`} />
        <Row
          label="Per-booking fee"
          value={org.perBookingFee > 0 ? `₱${org.perBookingFee} per completed ride` : 'None'}
        />
        <Row label="Estimated this month" value={`₱${estimatedMonthlyTodaFee(org, drivers, rides)}`} />
        <Row label="Reports to" value={operator ? operator.name : 'TODASafeRide HQ (direct)'} />
      </Panel>
    </div>
  )
}
