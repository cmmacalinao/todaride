import { useRides } from '../context/RideContext'
import { isActiveAlert } from './safety'
import { useSession } from '../context/SessionContext'

// A ride still actively happening — as opposed to finished, cancelled, or
// never accepted. Shared by anything that needs to wait for a trip to be
// truly over before doing something disruptive (a reload, an update sheet).
export const IN_FLIGHT = new Set(['requested', 'accepted', 'driver_arriving', 'ongoing'])

// Whether the account signed into THIS device is the passenger, parent, or
// driver on a ride still in flight, or has an open SOS.
//
// Both callers of this (AppUpdateWatcher's reload, AppUpdateBanner's sheet)
// used to check the whole fleet's rides for anything in flight, unfiltered —
// a passenger who requested a ride yesterday and simply closed the app
// without cancelling left one sitting in the shared database, and that alone
// silenced updates for every phone on the pilot, on both the web and this
// checker, indefinitely. What actually has to wait is this device's own
// trip, not a stranger's.
export function useHasMyOwnTripInFlight(): boolean {
  const { rides, alerts } = useRides()
  const { authedAccount } = useSession()
  if (!authedAccount) return false
  const { role, id } = authedAccount

  const isMine = (r: (typeof rides)[number]) =>
    (role === 'passenger' && r.passengerId === id) ||
    (role === 'parent' && r.bookedByParentId === id) ||
    (role === 'driver' && r.driverId === id)

  if (rides.some((r) => IN_FLIGHT.has(r.status) && isMine(r))) return true

  // Not gated on the ride still being in flight: an SOS opened mid-trip has
  // to keep holding a reload back even if the ride itself was closed out
  // while the emergency is still open. Covers a driver-initiated SOS
  // (rideId null) triggered by this account, and a parent watching the ride
  // their child triggered the alert from.
  const myRideIds = new Set(rides.filter(isMine).map((r) => r.id))
  return alerts.some(
    (a) => isActiveAlert(a) && (a.triggeredBy === id || (a.rideId && myRideIds.has(a.rideId))),
  )
}
