import { useMemo, useState } from 'react'
import type { SosAlert } from '../types'
import { useRides } from '../context/RideContext'
import { isActiveAlert } from '../lib/safety'
import { RealLiveMap, type MapPoint } from './RealLiveMap'
import { SafetyIncidentCard, type IncidentActor } from './SafetyIncidentCard'

// The safety desk. Active incidents first and loud, then possible crashes,
// then what has been dealt with, with a map of where the live ones are and
// enough filters to find one incident among many. Every action goes
// through the incident workflow (see lib/safety.ts) and lands in the
// incident's event log; nothing resolves on its own.
//
// `alerts` is whatever the caller is allowed to see — every incident for
// the App Admin, one TODA's for its admin — so access is decided before
// this renders, not inside it.

interface SafetyDashboardProps {
  alerts: SosAlert[]
  actor: IncidentActor
  canAct: boolean
  // Called after every action so the caller can also write its own
  // activity-feed line, as Admin does today.
  onActed?: (summary: string) => void
  title?: string
}

type Filter = 'active' | 'crash' | 'acknowledged' | 'responding' | 'resolved' | 'history'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'crash', label: 'Possible crashes' },
  { key: 'acknowledged', label: 'Acknowledged' },
  { key: 'responding', label: 'Responding' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'history', label: 'All history' },
]

export function SafetyDashboard({ alerts, actor, canAct, onActed, title = '🆘 Safety desk' }: SafetyDashboardProps) {
  const { rides, drivers, passengers, todaOrganizations, acknowledgeAlert, setAlertResponding, resolveAlert, cancelAlert, logAlertEvent, sendContactSms, safetySettings } = useRides()
  const [filter, setFilter] = useState<Filter>('active')
  const [search, setSearch] = useState('')
  const [todaFilter, setTodaFilter] = useState<string>('all')
  const [triggerFilter, setTriggerFilter] = useState<'all' | 'passenger' | 'driver' | 'automatic_crash_detection'>('all')

  const active = alerts.filter((a) => isActiveAlert(a) && a.type !== 'possible_crash')
  const crashes = alerts.filter((a) => a.type === 'possible_crash' || a.triggerSource === 'automatic_crash_detection')

  const shown = useMemo(() => {
    let list: SosAlert[]
    switch (filter) {
      case 'active':
        list = active
        break
      case 'crash':
        list = crashes
        break
      case 'acknowledged':
        list = alerts.filter((a) => a.status === 'acknowledged')
        break
      case 'responding':
        list = alerts.filter((a) => a.status === 'responding')
        break
      case 'resolved':
        list = alerts.filter((a) => a.status === 'resolved')
        break
      default:
        list = alerts
    }
    if (todaFilter !== 'all') list = list.filter((a) => (a.todaOrgId ?? '') === todaFilter)
    if (triggerFilter !== 'all') list = list.filter((a) => (a.triggerSource ?? (a.triggeredByRole === 'driver' ? 'driver' : 'passenger')) === triggerFilter)
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((a) => {
        const ride = a.rideId ? rides.find((r) => r.id === a.rideId) : null
        const driver = drivers.find((d) => d.id === (a.driverId ?? ride?.driverId ?? (a.triggeredByRole === 'driver' ? a.triggeredBy : '')))
        const hay = [a.notes, a.origin, a.destination, a.vehiclePlate, ride?.passengerName, ride?.pickup.label, ride?.dropoff.label, driver?.name, driver?.plateNumber, a.resolutionNotes, new Date(a.createdAt).toLocaleDateString()]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
    }
    return [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [alerts, active, crashes, filter, todaFilter, triggerFilter, search, rides, drivers])

  const mapPoints: MapPoint[] = active
    .filter((a) => a.location)
    .map((a) => ({
      id: `sos-${a.id}`,
      gps: a.location!,
      color: '#dc2626',
      label: `🆘 ${a.triggeredByRole === 'driver' ? 'Driver' : 'Passenger'} · ${new Date(a.createdAt).toLocaleTimeString()}`,
      pulse: true,
    }))

  const counts = {
    active: active.length,
    crash: crashes.filter((a) => isActiveAlert(a)).length,
    acknowledged: alerts.filter((a) => a.status === 'acknowledged').length,
    responding: alerts.filter((a) => a.status === 'responding').length,
    resolved: alerts.filter((a) => a.status === 'resolved').length,
    history: alerts.length,
  }

  function acted(summary: string) {
    onActed?.(summary)
  }

  // Phase 1: no alerts can come in, so the desk is a one-line note — unless
  // something is still open from before the switch went off, which still
  // needs closing.
  if (!safetySettings.sosAlertsEnabled && active.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        <p className="mt-0.5 text-[11px] text-slate-500">
          SOS alerts are off for Phase 1 — riders get call buttons only. Super Admin → Safety settings turns them on.
        </p>
      </section>
    )
  }

  return (
    <section className={`rounded-xl border p-4 shadow-sm ${active.length > 0 ? 'border-danger-600 bg-white' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className={`text-sm font-semibold ${active.length > 0 ? 'text-danger-900' : 'text-slate-700'}`}>{title}</h2>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${active.length > 0 ? 'animate-pulse bg-danger-600 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
          {active.length > 0 ? `${active.length} ACTIVE` : 'All clear'}
        </span>
      </div>

      {mapPoints.length > 0 && (
        <div className="mt-2">
          <RealLiveMap points={mapPoints} height="220px" hideLegend />
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
              filter === f.key ? 'bg-navy-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {f.label} · {counts[f.key]}
          </button>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, plate, place, date…"
          className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-[11px]"
        />
        <select value={triggerFilter} onChange={(e) => setTriggerFilter(e.target.value as typeof triggerFilter)} className="rounded border border-slate-300 px-2 py-1 text-[11px]">
          <option value="all">Any trigger</option>
          <option value="passenger">Passenger SOS</option>
          <option value="driver">Driver SOS</option>
          <option value="automatic_crash_detection">Automatic</option>
        </select>
        {todaOrganizations.length > 1 && (
          <select value={todaFilter} onChange={(e) => setTodaFilter(e.target.value)} className="rounded border border-slate-300 px-2 py-1 text-[11px]">
            <option value="all">Any TODA</option>
            {todaOrganizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
            <option value="">No TODA</option>
          </select>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">
          {filter === 'active' ? 'No open emergency right now.' : 'Nothing here.'}
        </p>
      ) : (
        <div className="mt-3 max-h-[640px] space-y-2 overflow-y-auto pr-1">
          {shown.map((a) => (
            <SafetyIncidentCard
              key={a.id}
              alert={a}
              rides={rides}
              drivers={drivers}
              passengers={passengers}
              todaOrganizations={todaOrganizations}
              actor={actor}
              canAct={canAct}
              onAcknowledge={(id) => {
                acknowledgeAlert(id, actor.name, actor.role)
                acted('Acknowledged an emergency incident')
              }}
              onResponding={(id) => {
                setAlertResponding(id, actor.name, actor.role)
                acted('Marked an emergency incident as responding')
              }}
              onResolve={(id, notes) => {
                resolveAlert(id, actor.name, actor.role, notes)
                acted(`Resolved an emergency incident${notes ? ` — ${notes}` : ''}`)
              }}
              onCancel={(id, notes) => {
                cancelAlert(id, actor.name, actor.role, notes)
                acted('Cancelled an emergency incident as a false alarm')
              }}
              onNote={(id, text) => logAlertEvent(id, 'note', text, actor.name, actor.role)}
              onLogCall={(id, kind, summary) => logAlertEvent(id, kind, summary, actor.name, actor.role)}
              onSendSms={(alertId, notificationId) => sendContactSms(alertId, notificationId, actor.name)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
