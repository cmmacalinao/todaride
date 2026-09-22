import { formatKm, haversineDistanceMeters } from '../lib/geo'
import { formatTripRoute } from '../lib/addressFormat'
import { getActiveTodaCommission } from '../mock/data'
import { getDispatchWindow } from '../lib/tracking'
import type { Driver, GeoCoords, MedsOrder, Ride, TodaOrganization } from '../types'
import { codBreakdown, rideServiceTag } from '../lib/vendorOrders'

const SERVICE_ICON: Record<string, string> = {
  pabili: '🛍️',
  buy_medicine: '💊',
  padala: '📦',
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
  // A cash-on-delivery vendor order: what to collect at the door and what
  // to hand the store, so the fare above can be the driver's own fee rather
  // than the whole order total (see codBreakdown).
  cod: { fee: number; goods: number; collect: number } | null
  // Null when the driver may take it right now; otherwise why they cannot.
  blockedReason: string | null
  // Which kind of block, so callers can judge it. The two are not alike: a
  // passenger already deciding on another driver's offer is spoken for,
  // while a terminal-Pila hold is only about whose turn it is in the line.
  blockedKind: 'pending_other' | 'queue_hold' | null
  // Set when this card stands for a whole Group Ride: everyone in the same
  // booking, shown and taken as one job (see ACCEPT_RIDE). The money above is
  // then the group's total.
  // pickups: each rider's own pickup — they differ on a Family pick-up run
  // (a stop at each school, one destination), and are all the same otherwise.
  group: { count: number; names: string[]; stops: string[]; pickups: string[] } | null
}

// A rider's first name for the group card — but an unnamed rider, booked as
// 'Rider 2', keeps the number, or three of them read 'Rider, Rider, Rider'.
function groupRiderName(name: string): string {
  return /^Rider \d+$/.test(name) ? name : name.split(' ')[0]
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
  orders: MedsOrder[] = [],
): NearbyRequest[] {
  const myOrg = driver.todaOrgId ? orgs.find((o) => o.id === driver.todaOrgId) : null
  const todaCut = getActiveTodaCommission(myOrg)
  return rides
    // A child's ride held for their parent is not work yet — it reaches
    // drivers only once the parent approves it (see APPROVE_FAMILY_RIDE).
    .filter(
      (r) => r.status === 'requested' && !r.awaitingFamilyApproval && !(r.declinedByDriverIds ?? []).includes(driver.id),
    )
    .map((r) => {
      const cod = codBreakdown(r, orders)
      // The driver's own money: the fee on a cash delivery, the fare otherwise.
      const fare = cod ? cod.fee : r.fareEstimate
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
        cod,
        blockedReason,
        blockedKind,
        group: null as NearbyRequest['group'],
      }
    })
    // One card per Group Ride: the riders of one booking fold into the first
    // of them, with the fares added up and every stop listed. A driver takes
    // the group or passes on it, never one rider out of it.
    .reduce<NearbyRequest[]>((cards, card) => {
      const groupId = card.ride.groupBookingId
      const lead = groupId ? cards.find((c) => c.ride.groupBookingId === groupId) : undefined
      if (!lead) {
        cards.push(
          groupId
            ? {
                ...card,
                group: {
                  count: 1,
                  names: [groupRiderName(card.ride.passengerName)],
                  stops: [card.ride.dropoff.label.split(',')[0].trim()],
                  pickups: [card.ride.pickup.label.split(',')[0].trim()],
                },
              }
            : card,
        )
        return cards
      }
      lead.fare += card.fare
      lead.tips += card.tips
      lead.total += card.total
      lead.takeHome += card.takeHome
      lead.group!.count += 1
      lead.group!.names.push(groupRiderName(card.ride.passengerName))
      lead.group!.stops.push(card.ride.dropoff.label.split(',')[0].trim())
      lead.group!.pickups.push(card.ride.pickup.label.split(',')[0].trim())
      return cards
    }, [])
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
      {requests.map(({ ride, distanceMeters, fare, tips, total, takeHome, cod, blockedReason, group }) => (
        <div
          key={ride.id}
          className={`rounded-lg border p-3 ${blockedReason || busyNote ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-white'}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {group && group.count > 1 ? (
                <>
                  <p className="truncate text-sm font-semibold text-slate-700">
                    👥 Group Ride · {group.count} riders
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{group.names.join(', ')}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {new Set(group.pickups).size > 1
                      ? // Several pickups, one destination: collect each, then drop all.
                        `Pick up ${group.pickups.map((s, i) => `${i + 1}. ${s} (${group.names[i]})`).join(' · ')} → ${group.stops[0]}`
                      : `${ride.pickup.label.split(',')[0]} → ${group.stops.map((s, i) => `${i + 1}. ${s}`).join(' · ')}`}
                  </p>
                </>
              ) : (
                <>
                  <p className="truncate text-sm font-semibold text-slate-700">
                    {rideServiceTag(ride)?.icon ?? SERVICE_ICON.ride} {ride.passengerName}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {formatTripRoute(ride.pickup.label, ride.dropoff.label, 3)}
                  </p>
                </>
              )}
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
          {cod && (
            <p className="mt-1.5 rounded-lg bg-amber-50 p-2 text-[11px] font-medium text-amber-700">
              💵 Cash on delivery — pay the store ₱{cod.goods} for the goods, collect ₱{cod.collect} from the
              customer. The ₱{cod.fee} fee is yours.
            </p>
          )}

          {ride.specialPickupRequested && (
            <p className="mt-1.5 rounded-lg bg-amber-50 p-2 text-[11px] font-medium text-amber-700">
              📍 Special pickup — go to the passenger&apos;s exact pin, not the Terminal (+₱{ride.specialPickupFee}{' '}
              detour fee already in the fare)
            </p>
          )}
          {(ride.serviceType === 'pabili' || ride.serviceType === 'buy_medicine' || ride.serviceType === 'vendor_order') && ride.pabiliItems && (
            <p className="mt-1.5 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">🛒 {ride.pabiliItems}</p>
          )}
          {ride.serviceType === 'padala' && ride.packageNote && (
            <p className="mt-1.5 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">📦 {ride.packageNote}</p>
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
                {group && group.count > 1 ? `Take all ${group.count}` : 'Take this one'}
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
