import { useState } from 'react'
import { useRides } from '../context/RideContext'
import { ContactSheet } from './ContactSheet'
import { OrderChat } from './OrderChat'
import { RealLiveMap, type MapPoint } from './RealLiveMap'
import { StatusBadge } from './StatusBadge'
import { formatAddressLine } from '../lib/addressFormat'
import { useNow } from '../lib/liveTracking'
import { useRoute } from '../lib/routing'
import { buildTimeline, formatEta, getLegInfo, sharedDriverMapGps } from '../lib/tracking'
import { formatKm } from '../lib/geo'
import { remainingLeg } from '../lib/legRemaining'
import type { MedsOrder, Pharmacy, Ride } from '../types'

// Which rides still count as a delivery in progress from the vendor's side.
// Everything else — completed, cancelled, declined — is history.
export const ACTIVE_RIDE_STATUSES = new Set<Ride['status']>(['requested', 'accepted', 'driver_arriving', 'ongoing'])

// What one delivery is doing right now, in the vendor's own words. The
// ride's StatusBadge says "Waiting for driver"/"Ride ongoing" — true, but
// written for a passenger; a kitchen wants to know whether to start plating.
export function deliveryPhaseLabel(ride: Ride): string {
  switch (ride.status) {
    case 'requested':
      return 'Finding a TODA Ride Mobility driver…'
    case 'accepted':
      return `${ride.driverName ?? 'Driver'} accepted — heading to you for pickup`
    case 'driver_arriving':
      return ride.legProgress >= 1 ? `${ride.driverName ?? 'Driver'} is at your store — hand over the order` : `${ride.driverName ?? 'Driver'} is on the way to pick up`
    case 'ongoing':
      return 'Picked up — on the way to the customer'
    case 'completed':
      return 'Delivered'
    case 'cancelled':
      return 'Delivery cancelled'
    case 'declined':
      return 'Driver declined — not delivered'
  }
}

// The vendor's view of one order out with a driver: who is bringing it,
// where they are on the map right now, and how far along the delivery is.
// Deliberately not TripMonitor — that screen is the passenger's seat in the
// tricycle (it publishes the phone's own GPS as the passenger, offers tips,
// asks "have you gotten off?"), none of which is the vendor's to do. This
// reads the same ride the driver and customer are on, and only reads it.
export function VendorDeliveryTracker({ order, ride, vendor }: { order: MedsOrder; ride: Ride; vendor: Pharmacy }) {
  const { drivers, sendMedsOrderMessage, vendorSwitchToOtherDelivery } = useRides()
  const driver = ride.driverId ? drivers.find((d) => d.id === ride.driverId) : undefined
  const [contact, setContact] = useState<{ name: string; phone: string } | null>(null)
  const [showTimeline, setShowTimeline] = useState(false)
  const [confirmSwitch, setConfirmSwitch] = useState(false)
  // Keeps the ETA ticking between state updates while the ride is live.
  useNow(15000, ACTIVE_RIDE_STATUSES.has(ride.status))

  const leg = getLegInfo(ride)
  const driverGps = sharedDriverMapGps(ride, [ride])
  // The real road path for the leg in progress — driver to store while
  // arriving, store to customer once picked up — so the line on the map
  // follows streets rather than cutting across the barangay.
  const legOrigin = ride.status === 'ongoing' ? ride.pickup.gps : driverGps?.gps ?? null
  const legDestination = ride.status === 'ongoing' ? ride.dropoff.gps : ride.pickup.gps
  const route = useRoute(ACTIVE_RIDE_STATUSES.has(ride.status) && legOrigin ? legOrigin : null, legDestination)
  const remaining = remainingLeg({ route, vehicleGps: driverGps?.gps ?? null, destination: legDestination, legProgress: ride.legProgress })

  const storeIcon = vendor.businessType === 'pharmacy' || vendor.businessType === 'store' ? 'pharmacy' : 'resto'
  const points: MapPoint[] = [
    { id: 'store', gps: ride.pickup.gps, color: '#ea580c', label: vendor.name, icon: storeIcon },
    { id: 'customer', gps: ride.dropoff.gps, color: '#e11d48', label: `Deliver to — ${formatAddressLine(ride.dropoff.label)}` },
    ...(driverGps
      ? [
          {
            id: 'driver',
            gps: driverGps.gps,
            color: '#1d4ed8',
            label: driver ? `${driver.name} — ${driver.plateNumber}` : ride.driverName ?? 'Driver',
            icon: 'tricycle' as const,
            pulse: driverGps.isLive,
          },
        ]
      : []),
  ]

  const showEta = ride.status === 'driver_arriving' || ride.status === 'ongoing'

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-medium text-slate-700">
          {order.customerName}
          {order.vendorBooked && <span className="ml-1 text-[10px] font-semibold uppercase text-sky-700">booked by you</span>}
        </span>
        <StatusBadge status={ride.status} />
      </div>
      <p className="mt-0.5 text-xs text-slate-600">{order.items.map((item) => `${item.quantity}x ${item.name}`).join(', ')}</p>
      <p className="text-[11px] text-slate-500">
        🏁 {order.deliveryAddress.label} · ₱{order.total} {order.paidOnline ? '— paid' : '— cash on delivery'}
      </p>

      <p className="mt-2 text-xs font-semibold text-sky-800">{deliveryPhaseLabel(ride)}</p>

      {/* No TODA member or official rider has taken this yet — give the
          vendor a way out instead of leaving them stuck watching "Finding a
          driver…" indefinitely. Gone the moment someone accepts (ride.status
          moves past 'requested'), since pulling the ride out from under a
          driver already on the way is a cancellation, not a delivery-method
          switch. */}
      {ride.status === 'requested' && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
          {confirmSwitch ? (
            <div className="space-y-1.5">
              <p className="text-[11px] text-amber-800">
                Stop waiting for a TODA rider and deliver this order another way (yourself, or another courier)?
              </p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => vendorSwitchToOtherDelivery(order.id)}
                  className="flex-1 rounded-md bg-amber-600 py-1.5 text-[11px] font-semibold text-white hover:bg-amber-700"
                >
                  Yes, switch delivery method
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmSwitch(false)}
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                >
                  Keep waiting
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmSwitch(true)}
              className="text-[11px] font-semibold text-amber-800 hover:underline"
            >
              No TODA rider accepting? Switch delivery method →
            </button>
          )}
        </div>
      )}

      {showEta && (
        <p className="text-[11px] text-slate-600">
          {ride.status === 'ongoing' ? 'To the customer: ' : 'To your store: '}
          {leg.arrived ? 'arrived' : remaining ? `${formatKm(remaining.meters)} · ${formatEta(remaining.seconds)}` : formatEta(leg.etaSeconds)}
          {route ? ` · ${(route.distanceMeters / 1000).toFixed(1)} km` : ''}
        </p>
      )}

      {/* The driver, once there is one — name and plate so the vendor knows
          who to hand the order to, and a way to reach them about it. */}
      {(driver || ride.driverName) && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-700">🛺 {driver?.name ?? ride.driverName}</p>
            {driver && <p className="text-[11px] text-slate-500">Plate {driver.plateNumber}</p>}
          </div>
          {driver?.phone && (
            <button
              type="button"
              onClick={() => setContact({ name: driver.name, phone: driver.phone })}
              className="shrink-0 rounded-md border border-brand-300 bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-100"
            >
              ☎ Call / text driver
            </button>
          )}
        </div>
      )}
      {order.contactPhone && (
        <button
          type="button"
          onClick={() => setContact({ name: order.customerName, phone: order.contactPhone! })}
          className="mt-1.5 text-[11px] font-medium text-brand-700 hover:underline"
        >
          ☎ {order.contactPhone} — Call or text customer
        </button>
      )}
      {contact && <ContactSheet name={contact.name} phone={contact.phone} onClose={() => setContact(null)} />}

      <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
        <RealLiveMap
          points={points}
          routeLine={route?.points}
          progressPointId="driver"
          routeIsReal={!!route}
          routeVariant={ride.status === 'ongoing' ? 'trip' : 'pickup'}
          followAll
          height="220px"
        />
      </div>

      <button
        type="button"
        onClick={() => setShowTimeline((v) => !v)}
        className="mt-2 text-[11px] font-medium text-slate-500 hover:text-slate-700"
      >
        {showTimeline ? '▲ Hide timeline' : '▼ Timeline'}
      </button>
      {showTimeline && (
        <ul className="mt-1 space-y-0.5 text-[11px] text-slate-600">
          {buildTimeline(ride).map((e) => (
            <li key={`${e.label}-${e.ts}`}>
              <span className="text-slate-400">{new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span> · {e.label}
            </li>
          ))}
        </ul>
      )}

      {!order.vendorBooked && (
        <div className="mt-2">
          <OrderChat
            messages={order.messages}
            viewerRole="pharmacy"
            otherPartyLabel={order.customerName}
            onSend={(text) => sendMedsOrderMessage(order.id, 'pharmacy', text)}
          />
        </div>
      )}
    </div>
  )
}
