import type { ParentLink, Ride, Driver, SosAlert } from '../types'

// Who an SOS concerns, resolved in one place so the TODA dashboard, a fellow
// driver's screen and a parent's screen never disagree about it.
//
// A driver-raised SOS already carries its own todaOrgId. A passenger-raised
// one carries only a rideId, so the TODA it concerns has to be walked:
// ride → assigned driver → that driver's TODA. Without this, a passenger
// pressing the panic button was invisible to the very organisation whose
// member was driving.
export function alertTodaOrgId(alert: SosAlert, rides: Ride[], drivers: Driver[]): string | null {
  if (alert.triggeredByRole === 'driver') return alert.todaOrgId ?? null
  if (!alert.rideId) return null
  const ride = rides.find((r) => r.id === alert.rideId)
  if (!ride?.driverId) return null
  return drivers.find((d) => d.id === ride.driverId)?.todaOrgId ?? null
}

export function alertsForToda(
  alerts: SosAlert[],
  orgId: string | null,
  rides: Ride[],
  drivers: Driver[],
): SosAlert[] {
  if (!orgId) return []
  return alerts.filter((a) => alertTodaOrgId(a, rides, drivers) === orgId)
}

// Every open alert raised on a trip taken by a student this parent watches —
// whoever pressed the button, the passenger or the driver.
export function alertsForParent(
  alerts: SosAlert[],
  parentId: string,
  parentLinks: ParentLink[],
  rides: Ride[],
): SosAlert[] {
  const studentIds = new Set(
    parentLinks.filter((l) => l.parentId === parentId).map((l) => l.studentPassengerId),
  )
  if (studentIds.size === 0) return []
  const watchedRideIds = new Set(rides.filter((r) => studentIds.has(r.passengerId)).map((r) => r.id))
  return alerts.filter((a) => (a.rideId ? watchedRideIds.has(a.rideId) : false))
}
