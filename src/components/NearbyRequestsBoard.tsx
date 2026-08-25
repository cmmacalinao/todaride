import { formatKm, haversineDistanceMeters } from '../lib/geo'
import { formatTripRoute } from '../lib/addressFormat'
import { getActiveTodaCommission } from '../mock/data'
import { getDispatchWindow } from '../lib/tracking'
import type { Driver, GeoCoords, Ride, TodaOrganization } from '../types'

const SERVICE_ICON: Record<string, string> = {
  pabili: '🛍️',
  buy_medicine: '💊',
  ride: '🛵',
}

// What a driver is really choosing between. The fare alone doesn't answer it:
// a ₱60 ride with a ₱20 tip pays better than a ₱70 one with none, and neither
// number tells you how far you have to drive before you start earning it.
export interface NearbyRequest {
  ride: Ride
  // Metres from the driver to the pickup; null when either end has no pin.
  distanceMeters: number | null
  fare: number
  tips: number
  total: number
  // What actually lands in the driver's pocket: the total less the platform
  // fee and the TODA's cut, both of which only ever touch the base fare.
  takeHome: number
  // Null when the driver may take it right now; otherwise why they cannot.
  blockedReason: string | null
  // Which kind of block, so callers can judge it. The two are not alike: a
  // passenger already deciding on another driver's offer is spoken for,
  // while a terminal-Pila hold is only about whose turn it is in the line.
  blockedKind: 'pending_other' | 'queue_hold' | null
}

export function buildNearbyRequests(
  rides: Ride[],
  driver: Driver,
  driverGps: GeoCoords | null,
  orgs: TodaOrganization[],
  drivers: Driver[],
  commissionPerRide: number,
  todaQueueWindowMs: number,
  specialPickupEscalationMs: number,
): NearbyRequest[] {
  const myOrg = driver.todaOrgId ? orgs.find((o) => o.id === driver.todaOrgId) : null
  const todaCut = getActiveTodaCommission(myOrg)
  return rides
    .filter((r) => r.status === 'requested' && !(r.declinedByDriverIds ?? []).includes(driver.id))
    .map((r) => {
      const fare = r.fareEstimate
      const tips = r.pabiliTip + (r.tipOffer || 0)
      const platformFee = Math.min(fare, commissionPerRide)
      const commission = Math.min(Math.max(0, fare - platformFee), todaCut)
      const { openToAll } = getDispatchWindow(r, todaQueueWindowMs, specialPickupEscalationMs)
      // A ride someone is already deciding on, or that is still another
      // driver's turn, is listed but not takeable — a driver should be able
      // to see what is about to come free without being able to jump it.
      let blockedReason: string | null = null
      let blockedKind: NearbyRequest['blockedKind'] = null
      if (r.pendingApproval && r.pendingApproval.driverId !== driver.id) {
        blockedReason = 'Another driver is waiting on the passenger'
        blockedKind = 'pending_other'
      } else if (!openToAll && r.priorityQueueOfferedDriverId !== null && r.priorityQueueOfferedDriverId !== driver.id) {
        const holder = drivers.find((d) => d.id === r.priorityQueueOfferedDriverId)
        blockedReason = `${holder?.name ?? 'Another driver'} is being offered this first`
        blockedKind = 'queue_hold'
      }
      return {
        ride: r,
        distanceMeters:
          driverGps && r.pickup.gps ? Math.round(haversineDistanceMeters(driverGps, r.pickup.gps)) : null,
        fare,
        tips,
        total: fare + tips,
        takeHome: Math.max(0, fare - platformFee - commission) + tips,
        blockedReason,
        blockedKind,
      }
    })
    .sort((a, b) => {
      // Takeable work first — a driver scanning this list wants the ones they
      // can actually press, not the ones they have to wait out.
      if (!a.blockedReason !== !b.blockedReason) return a.blockedReason ? 1 : -1
      return (a.distanceMeters ?? Number.POSITIVE_INFINITY) - (b.distanceMeters ?? Number.POSITIVE_INFINITY)
    })
}

function formatDistance(meters: number | null): string {
  if (meters === null) return 'Distance unknown'
  return `${formatKm(meters)} away`
}

interface NearbyRequestsBoardProps {
  requests: NearbyRequest[]
  onAccept: (rideId: string) => void
  onDecline: (rideId: string) => void
  // Set while the driver already has a trip: the board goes read-only rather
  // than disappearing, so they can still see what is waiting for them next.
  busyNote?: string | null
}

export function NearbyRequestsBoard({ requests, onAccept, onDecline, busyNote = null }: NearbyRequestsBoardProps) {
  if (requests.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-400">
        No passengers waiting nearby right now. New requests appear here the moment someone books.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {busyNote && (
        <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800">{busyNote}</p>
      )}
      {requests.map(({ ride, distanceMeters, fare, tips, total, takeHome, blockedReason }) => (
        <div
          key={ride.id}
          className={`rounded-lg border p-3 ${blockedReason || busyNote ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-white'}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-700">
                {SERVICE_ICON[ride.serviceType] ?? SERVICE_ICON.ride} {ride.passengerName}
              </p>
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {formatTripRoute(ride.pickup.label, ride.dropoff.label, 3)}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
              📍 {formatDistance(distanceMeters)}
            </span>
          </div>

          {/* The three numbers the choice turns on, in a row so two requests
              can be compared straight down the column instead of read as
              prose. */}
          <div className="mt-2 flex items-stretch gap-1 text-center">
            <div className="flex-1 rounded-lg bg-slate-50 px-1 py-1.5">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Fare</p>
              <p className="text-sm font-semibold text-slate-700">₱{fare}</p>
            </div>
            <div className="flex-1 rounded-lg bg-slate-50 px-1 py-1.5">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Tip</p>
              <p className={`text-sm font-semibold ${tips > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>₱{tips}</p>
            </div>
            <div className="flex-1 rounded-lg bg-navy-900 px-1 py-1.5">
              <p className="text-[10px] uppercase tracking-wide text-gold-400">Total</p>
              <p className="text-sm font-bold text-white">₱{total}</p>
            </div>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            You keep <span className="font-semibold text-slate-700">₱{takeHome}</span> after the platform fee and
            TODA share — tips are yours in full.
          </p>

          {ride.specialPickupRequested && (
            <p className="mt-1.5 rounded-lg bg-amber-50 p-2 text-[11px] font-medium text-amber-700">
              📍 Special pickup — go to the passenger&apos;s exact pin, not the Terminal (+₱{ride.specialPickupFee}{' '}
              detour fee already in the fare)
            </p>
          )}
          {(ride.serviceType === 'pabili' || ride.serviceType === 'buy_medicine') && ride.pabiliItems && (
            <p className="mt-1.5 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">🛒 {ride.pabiliItems}</p>
          )}
          {ride.passengerCount > 1 && (
            <p className="mt-1 text-[11px] font-medium text-slate-500">👥 {ride.passengerCount} passengers</p>
          )}

          {blockedReason ? (
            <p className="mt-2 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-medium text-slate-500">
              ⏳ {blockedReason} — it comes to you if they pass.
            </p>
          ) : (
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={!!busyNote}
                onClick={() => onAccept(ride.id)}
                className="flex-1 rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
              >
                Take this one
              </button>
              <button
                type="button"
                disabled={!!busyNote}
                onClick={() => onDecline(ride.id)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
              >
                Pass
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
