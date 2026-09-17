import { useState } from 'react'
import type { Driver, Passenger, Ride, SosAlert, SosEvent, TodaOrganization } from '../types'
import { INCIDENT_STATUS_LABEL, TRIGGER_SOURCE_LABEL, isActiveAlert, responseSeconds, resolutionSeconds } from '../lib/safety'
import { formatTripRoute } from '../lib/addressFormat'
import { SosPeopleLocations } from './SosPeopleLocations'

// One incident, everything a responder needs, and the actions the incident
// workflow allows from its current state. Used by the App Admin safety
// desk, the Super Admin's read-only view and the TODA admin page.
//
// Calls are the phone's dialler; tapping one is written to the incident's
// log. A queued SMS is the same shape: it sits as 'pending' until someone
// here taps Send, which is the one thing here that reaches outside the app
// on its own — see RideContext's sendContactSms. Nothing resolves an
// incident on its own.

export interface IncidentActor {
  name: string
  role: SosEvent['actorRole']
}

interface SafetyIncidentCardProps {
  alert: SosAlert
  rides: Ride[]
  drivers: Driver[]
  passengers: Passenger[]
  todaOrganizations: TodaOrganization[]
  actor: IncidentActor
  // False for a viewer who may look but not act (Super Admin oversight,
  // a read-only partner view).
  canAct: boolean
  onAcknowledge: (id: string) => void
  onResponding: (id: string) => void
  onResolve: (id: string, notes: string) => void
  onCancel: (id: string, notes: string) => void
  onNote: (id: string, text: string) => void
  onLogCall: (id: string, kind: 'call_passenger' | 'call_driver' | 'call_toda', summary: string) => void
  onSendSms: (alertId: string, notificationId: string) => Promise<void>
}

const STATUS_STYLE: Record<SosAlert['status'], string> = {
  open: 'bg-danger-600 text-white animate-pulse',
  acknowledged: 'bg-amber-500 text-white',
  responding: 'bg-blue-600 text-white',
  resolved: 'bg-emerald-600 text-white',
  cancelled: 'bg-slate-400 text-white',
}

const SEVERITY_STYLE = { medium: 'text-amber-700', high: 'text-danger-700', critical: 'text-danger-900 font-black' }

function fmtSeconds(s: number | null): string {
  if (s === null) return '—'
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`
}

export function SafetyIncidentCard({
  alert,
  rides,
  drivers,
  passengers,
  todaOrganizations,
  actor,
  canAct,
  onAcknowledge,
  onResponding,
  onResolve,
  onCancel,
  onNote,
  onLogCall,
  onSendSms,
}: SafetyIncidentCardProps) {
  const [showLog, setShowLog] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [resolveText, setResolveText] = useState('')
  const [resolving, setResolving] = useState(false)
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set())

  async function handleSendSms(notificationId: string) {
    setSendingIds((prev) => new Set(prev).add(notificationId))
    try {
      await onSendSms(alert.id, notificationId)
    } finally {
      setSendingIds((prev) => {
        const next = new Set(prev)
        next.delete(notificationId)
        return next
      })
    }
  }

  const ride = alert.rideId ? rides.find((r) => r.id === alert.rideId) ?? null : null
  const driverId = alert.driverId ?? (alert.triggeredByRole === 'driver' ? alert.triggeredBy : ride?.driverId ?? null)
  const driver = driverId ? drivers.find((d) => d.id === driverId) ?? null : null
  const passengerId = alert.passengerId ?? (alert.triggeredByRole !== 'driver' ? (ride?.passengerId ?? alert.triggeredBy) : ride?.passengerId ?? null)
  const passenger = passengerId ? passengers.find((p) => p.id === passengerId) ?? null : null
  const todaId = alert.todaOrgId ?? driver?.todaOrgId ?? null
  const toda = todaId ? todaOrganizations.find((o) => o.id === todaId) ?? null : null
  const source = alert.triggerSource ?? (alert.triggeredByRole === 'driver' ? 'driver' : 'passenger')
  const active = isActiveAlert(alert)
  const title =
    alert.type === 'possible_crash'
      ? 'Possible crash'
      : alert.type === 'route_deviation'
        ? 'Route deviation'
        : TRIGGER_SOURCE_LABEL[source]
  const who = alert.triggeredByRole === 'driver' ? driver?.name ?? 'A driver' : passenger?.name ?? ride?.passengerName ?? 'A passenger'
  const passengerPhone = passenger?.phone ?? ride?.passengerPhone ?? alert.guardianNotifiedPhone ?? null
  const delivered = (alert.notifications ?? []).filter((n) => n.status === 'delivered')
  const pendingSms = (alert.notifications ?? []).filter((n) => n.channel === 'sms' && n.status === 'pending')
  const skipped = (alert.notifications ?? []).filter((n) => n.status !== 'delivered' && n.status !== 'pending')
  // A trip has two people on it, and an SOS raised after they part needs both
  // of them found — see SosPeopleLocations.
  const hasTwoSeats = !!(ride || alert.passengerLocation || alert.driverLocation)
  const mapsUrl = alert.location ? `https://www.google.com/maps?q=${alert.location.lat},${alert.location.lng}` : null

  return (
    <div className={`rounded-xl border p-3 text-xs ${active ? 'border-danger-300 bg-danger-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`font-bold ${active ? 'text-danger-900' : 'text-slate-700'}`}>
            {title} · {who}
          </p>
          <p className="text-[11px] text-slate-500">
            {new Date(alert.createdAt).toLocaleString()}
            {alert.severity && <span className={`ml-1.5 uppercase ${SEVERITY_STYLE[alert.severity]}`}>{alert.severity}</span>}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[alert.status]}`}>
          {INCIDENT_STATUS_LABEL[alert.status]}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
        {ride && <p className="col-span-2">🛣️ {formatTripRoute(ride.pickup.label, ride.dropoff.label, 3)}</p>}
        {!ride && alert.origin && <p className="col-span-2">🛣️ {alert.origin} → {alert.destination}</p>}
        <p>🧑 {passenger?.name ?? ride?.passengerName ?? '—'}</p>
        <p>🛺 {driver ? `${driver.name} · ${driver.plateNumber}` : '—'}</p>
        <p>🏢 {toda?.name ?? 'No TODA'}</p>
        <p>📋 {alert.tripStatus ?? ride?.status ?? 'no trip'}</p>
        {!hasTwoSeats && (
        <p className="col-span-2">
          📍{' '}
          {alert.location ? (
            <a href={mapsUrl ?? '#'} target="_blank" rel="noreferrer" className="text-brand-700 underline">
              {alert.location.lat.toFixed(5)}, {alert.location.lng.toFixed(5)} · open map
            </a>
          ) : (
            'location not captured'
          )}
        </p>
        )}
      </div>
      {hasTwoSeats && (
        <div className="mt-2">
          <SosPeopleLocations
            alert={alert}
            ride={ride}
            passengerName={passenger?.name ?? ride?.passengerName ?? 'Passenger'}
            driverLabel={driver ? `${driver.name} · ${driver.plateNumber}` : 'Tricycle'}
            showMap
          />
        </div>
      )}

      {alert.notes && <p className="mt-1.5 text-slate-700">{alert.notes}</p>}

      <p className="mt-1.5 text-[11px] text-slate-600">
        <span className="font-semibold">Notified:</span>{' '}
        {delivered.length > 0 ? delivered.map((n) => n.recipientName).join(', ') : 'nobody yet'}
        {skipped.length > 0 && <span className="text-slate-400"> · not sent: {skipped.map((n) => `${n.recipientName} (${n.note ?? n.status})`).join(', ')}</span>}
      </p>
      {(alert.acknowledgedAt || alert.resolvedAt) && (
        <p className="text-[11px] text-slate-500">
          Response {fmtSeconds(responseSeconds(alert))} · resolution {fmtSeconds(resolutionSeconds(alert))}
          {alert.resolvedBy ? ` · by ${alert.resolvedBy}` : ''}
        </p>
      )}
      {alert.resolutionNotes && <p className="text-[11px] text-slate-600">📝 {alert.resolutionNotes}</p>}

      {(alert.events ?? []).length > 0 && (
        <div className="mt-2">
          <button type="button" onClick={() => setShowLog((v) => !v)} className="text-[11px] font-medium text-brand-700 underline">
            {showLog ? 'Hide' : 'Show'} event log ({(alert.events ?? []).length})
          </button>
          {showLog && (
            <ol className="mt-1 space-y-0.5 rounded-lg bg-white p-2 text-[11px] text-slate-600">
              {(alert.events ?? []).map((e) => (
                <li key={e.id} className="flex gap-2">
                  <span className="shrink-0 tabular-nums text-slate-400">{new Date(e.at).toLocaleTimeString()}</span>
                  <span>{e.summary}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {canAct && (
        <div className="mt-2 space-y-1.5">
          <div className="flex flex-wrap gap-1.5">
            {passengerPhone && (
              <a
                href={`tel:${passengerPhone}`}
                onClick={() => onLogCall(alert.id, 'call_passenger', `${actor.name} called the passenger`)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
              >
                📞 Passenger
              </a>
            )}
            {driver?.phone && (
              <a
                href={`tel:${driver.phone}`}
                onClick={() => onLogCall(alert.id, 'call_driver', `${actor.name} called the driver`)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
              >
                📞 Driver
              </a>
            )}
            {toda?.contactPhone && (
              <a
                href={`tel:${toda.contactPhone}`}
                onClick={() => onLogCall(alert.id, 'call_toda', `${actor.name} called ${toda.name}`)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
              >
                📞 TODA
              </a>
            )}
          </div>
          {pendingSms.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {pendingSms.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  disabled={sendingIds.has(n.id)}
                  onClick={() => handleSendSms(n.id)}
                  className="rounded-lg border border-brand-300 bg-brand-50 px-2.5 py-1 text-[11px] font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50"
                >
                  {sendingIds.has(n.id) ? 'Sending…' : `📱 Send SMS to ${n.recipientName}`}
                </button>
              ))}
            </div>
          )}
          {active && (
            <div className="flex flex-wrap gap-1.5">
              {alert.status === 'open' && (
                <button type="button" onClick={() => onAcknowledge(alert.id)} className="rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-amber-600">
                  Acknowledge
                </button>
              )}
              {alert.status !== 'responding' && (
                <button type="button" onClick={() => onResponding(alert.id)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700">
                  Responding
                </button>
              )}
              <button type="button" onClick={() => setResolving((v) => !v)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700">
                Resolve…
              </button>
              {alert.status !== 'responding' && (
                <button
                  type="button"
                  onClick={() => onCancel(alert.id, 'Cancelled by the safety desk')}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                >
                  False alarm
                </button>
              )}
            </div>
          )}
          {active && resolving && (
            <div className="flex gap-1.5">
              <input
                value={resolveText}
                onChange={(e) => setResolveText(e.target.value)}
                placeholder="What happened and how it ended"
                className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-[11px]"
              />
              <button
                type="button"
                onClick={() => {
                  onResolve(alert.id, resolveText)
                  setResolveText('')
                  setResolving(false)
                }}
                className="rounded-lg bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
              >
                Mark resolved
              </button>
            </div>
          )}
          <div className="flex gap-1.5">
            <input
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add a note to the incident"
              className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-[11px]"
            />
            <button
              type="button"
              disabled={!noteText.trim()}
              onClick={() => {
                onNote(alert.id, noteText.trim())
                setNoteText('')
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Note
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
