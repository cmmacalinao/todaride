import { formatTripRoute } from '../lib/addressFormat'
import { INCIDENT_STATUS_LABEL, isActiveAlert } from '../lib/safety'
import { useNavigate } from 'react-router-dom'
import { useRides } from '../context/RideContext'
import { useSession } from '../context/SessionContext'

// Every open SOS, on every Admin and Super Admin screen.
//
// The incident feed already existed, but it lived inside one tab of one page —
// an operator standing on Drivers or Announcements had no way of knowing a
// panic button had been pressed. This banner is the escalation: it follows the
// operator around instead of waiting to be found.
//
// Red is deliberate and correct here. It is reserved app-wide for exactly this
// — a real emergency — which is why a suspension or a rejected registration is
// amber and this is not.
export function SosAlertBanner() {
  const navigate = useNavigate()
  const { alerts, rides, drivers, passengers, acknowledgeAlert, logActivity } = useRides()
  const { authedAccount } = useSession()

  const open = alerts.filter((a) => isActiveAlert(a))
  if (open.length === 0) return null

  const actorName = authedAccount?.role === 'super_admin' ? 'Super Admin' : 'Admin'

  function who(alert: (typeof open)[number]): string {
    if (alert.triggeredByRole === 'driver') {
      const d = drivers.find((x) => x.id === alert.triggeredBy)
      return d ? `🛵 Driver — ${d.name} (${d.plateNumber})` : '🛵 Driver'
    }
    const ride = alert.rideId ? rides.find((r) => r.id === alert.rideId) : null
    const p = ride ? passengers.find((x) => x.id === ride.passengerId) : null
    return p ? `🧑 Passenger — ${p.name}` : '🧑 Passenger'
  }

  return (
    <section className="rounded-xl border-2 border-danger-600 bg-danger-50 p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-danger-900">
          🆘 {open.length} open emergency alert{open.length === 1 ? '' : 's'}
        </h2>
        <span className="shrink-0 rounded-full bg-danger-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          Live
        </span>
      </div>

      <div className="space-y-1.5">
        {open.map((a) => {
          const ride = a.rideId ? rides.find((r) => r.id === a.rideId) : null
          return (
            <div key={a.id} className="rounded-lg border border-danger-300 bg-white p-2.5 text-xs">
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-danger-900">
                  {who(a)} · <span className="font-normal text-danger-700">{INCIDENT_STATUS_LABEL[a.status]}</span>
                </span>
                <span className="shrink-0 text-[10px] text-danger-600">
                  {new Date(a.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="mt-0.5 text-slate-700">{a.notes}</p>
              {ride && (
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {formatTripRoute(ride.pickup.label, ride.dropoff.label, 2)}
                </p>
              )}
              {a.location && (
                <p className="text-[11px] text-slate-500">
                  📍 {a.location.lat.toFixed(5)}, {a.location.lng.toFixed(5)}
                </p>
              )}
              {a.guardianNotifiedPhone && (
                <p className="text-[11px] font-medium text-danger-700">
                  Emergency contact notified: {a.guardianNotifiedPhone}
                </p>
              )}
              <div className="mt-2 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => navigate('/admin?tab=rides')}
                  className="flex-1 rounded-lg border border-danger-300 py-1.5 text-[11px] font-medium text-danger-800 hover:bg-danger-50"
                >
                  Open safety desk
                </button>
                <button
                  type="button"
                  onClick={() => {
                    acknowledgeAlert(a.id, actorName, authedAccount?.role === 'super_admin' ? 'super_admin' : 'admin')
                    logActivity({
                      actorRole: 'admin',
                      actorName,
                      todaOrgId: null,
                      action: 'Acknowledged emergency alert',
                      summary: `${who(a)} — ${a.notes}`,
                    })
                  }}
                  className="flex-1 rounded-lg bg-danger-600 py-1.5 text-[11px] font-semibold text-white hover:bg-danger-700"
                >
                  Acknowledge
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
