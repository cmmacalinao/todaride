import { formatTripRoute } from '../lib/addressFormat'
import { useRides } from '../context/RideContext'
import type { SosAlert } from '../types'

// The "someone you are responsible for is in trouble" card. Used where the
// viewer is a concerned party rather than the responder — a parent watching a
// student, a member of the TODA involved — so it reports and does not offer a
// Resolve button. Only Admin, Super Admin and the TODA's own admin close an
// alert; a bystander clearing it would lose the incident.
export function SosConcernNotice({
  alerts,
  title,
  emptyWhenNone = true,
}: {
  alerts: SosAlert[]
  title: string
  emptyWhenNone?: boolean
}) {
  const { rides, passengers, drivers } = useRides()
  // Someone pressing the panic button and the app noticing a trip wander
  // off-route are not the same event, and must never look the same. Reading
  // "Emergency" over an automatic route notice tells a parent their child hit
  // SOS when nobody touched it.
  const open = alerts.filter((a) => a.status === 'open')
  const emergencies = open.filter((a) => a.type === 'sos')
  const concerns = open.filter((a) => a.type !== 'sos')
  if (open.length === 0 && emptyWhenNone) return null

  function who(a: SosAlert): string {
    if (a.triggeredByRole === 'driver') {
      const d = drivers.find((x) => x.id === a.triggeredBy)
      return d ? `🛵 ${d.name} (${d.plateNumber})` : '🛵 Driver'
    }
    const ride = a.rideId ? rides.find((r) => r.id === a.rideId) : null
    const p = ride ? passengers.find((x) => x.id === ride.passengerId) : null
    return p ? `🧑 ${p.name}` : '🧑 Passenger'
  }

  // One row of an alert, in whichever palette its severity earns.
  function row(a: SosAlert, tone: 'danger' | 'warn') {
    const ride = a.rideId ? rides.find((r) => r.id === a.rideId) : null
    const border = tone === 'danger' ? 'border-danger-300' : 'border-amber-300'
    const name = tone === 'danger' ? 'text-danger-900' : 'text-amber-900'
    const time = tone === 'danger' ? 'text-danger-600' : 'text-amber-600'
    return (
      <div key={a.id} className={`rounded-lg border ${border} bg-white p-2.5 text-xs`}>
        <div className="flex items-start justify-between gap-2">
          <span className={`font-semibold ${name}`}>{who(a)}</span>
          <span className={`shrink-0 text-[10px] ${time}`}>{new Date(a.createdAt).toLocaleTimeString()}</span>
        </div>
        <p className="mt-0.5 text-slate-700">{a.notes}</p>
        {ride && (
          <p className="mt-0.5 text-[11px] text-slate-500">
            {formatTripRoute(ride.pickup.label, ride.dropoff.label, 2)}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {emergencies.length > 0 && (
        <section className="rounded-xl border-2 border-danger-600 bg-danger-50 p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-danger-900">🆘 {title}</h2>
            <span className="shrink-0 rounded-full bg-danger-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              Live
            </span>
          </div>
          <div className="space-y-1.5">{emergencies.map((a) => row(a, 'danger'))}</div>
          <p className="mt-2 text-[11px] text-danger-800">
            TODA Ride Mobility support and the TODA office have been alerted. Call emergency services if you are in
            immediate danger.
          </p>
        </section>
      )}

      {concerns.length > 0 && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-amber-900">👀 Worth checking — walang nag-SOS</h2>
            <span className="shrink-0 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              Notice
            </span>
          </div>
          <div className="space-y-1.5">{concerns.map((a) => row(a, 'warn'))}</div>
          <p className="mt-2 text-[11px] text-amber-800">
            Automatic notice from the app — nobody pressed the emergency button. A route can differ for ordinary
            reasons: traffic, a closed road, or another passenger dropped off along the way.
          </p>
        </section>
      )}
    </div>
  )
}
