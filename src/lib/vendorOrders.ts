import { haversineDistanceMeters } from './geo'
import type { GeoCoords, MedsOrder, Ride } from '../types'

// A cash-on-delivery vendor order rides on a fare equal to the whole order
// total: the driver pays the store for the goods at pickup and is repaid at
// the door, so the money that changes hands is the total. What the driver
// actually earns is only the fee part; the goods pass straight through.
// Null for anything that is not a cash vendor delivery.
export function codBreakdown(
  ride: Ride,
  orders: MedsOrder[],
): { fee: number; goods: number; collect: number } | null {
  if (ride.paymentMethod !== 'cash') return null
  const order = orders.find((o) => o.linkedRideId === ride.id)
  if (!order || order.paymentMethod !== 'cash') return null
  return { fee: order.deliveryFee + order.serviceFee, goods: order.subtotal, collect: order.total }
}

export function distanceKm(a: GeoCoords | null, b: GeoCoords | null | undefined): number | null {
  if (!a || !b) return null
  return Math.round((haversineDistanceMeters(a, b) / 1000) * 10) / 10
}

// A delivery ride built from a vendor/pharmacy order (see
// buildMedsDeliveryRide in RideContext.tsx): the pickup IS the store — its
// MockLocation carries the pharmacy's own id — which is how the driver's
// screens tell "bring this food from Aling Nena's" apart from a Pabili
// errand somebody typed by hand. 'pabili' is still checked alongside the
// dedicated 'vendor_order' type for any ride created before that type
// existed — old data keeps reading correctly, nothing to migrate.
export function isVendorDeliveryRide(ride: Pick<Ride, 'serviceType' | 'pickup'>): boolean {
  return (
    (ride.serviceType === 'vendor_order' || ride.serviceType === 'pabili' || ride.serviceType === 'buy_medicine') &&
    /^(pharm|vendor)-/.test(ride.pickup.id)
  )
}

// What to call a ride that is not a plain passenger trip, everywhere a
// list or a monitor tags one. Food Express is what a Registered Vendor
// checkout (Food Order or PaDeliver Store — 'vendor_order', or 'pabili' on
// older data, see isVendorDeliveryRide) shows as, since that's the service
// name a passenger actually picked. A freeform Pabili errand, a pharmacy
// order, and a Padala courier request keep their own plainer labels. Null
// for a plain ride.
export function rideServiceTag(ride: Pick<Ride, 'serviceType' | 'pickup'>): { icon: string; label: string } | null {
  if (isVendorDeliveryRide(ride)) return { icon: '🍽️', label: 'Food Express' }
  if (ride.serviceType === 'vendor_order') return { icon: '🍽️', label: 'Food Express' }
  if (ride.serviceType === 'pabili') return { icon: '🛍️', label: 'Errand' }
  if (ride.serviceType === 'buy_medicine') return { icon: '💊', label: 'Medicine' }
  if (ride.serviceType === 'padala') return { icon: '📦', label: 'Padala' }
  return null
}
