import { haversineDistanceMeters } from './geo'
import { DEFAULT_MEDS_DELIVERY_FEE } from '../mock/data'
import type { GeoCoords, Ride } from '../types'

// The rider fee a vendor quotes for a delivery: the flat base covers the
// first few kilometres, then a per-kilometre step beyond that, on the
// straight-line distance from the store to the customer's pin. Suggested,
// not imposed — the vendor sees it in the quotation form and can change it
// before sending (see NewVendorOrderCard).
export const RIDER_FEE_BASE_KM = 2
export const RIDER_FEE_PER_EXTRA_KM = 10

export function suggestedRiderFee(storeGps: GeoCoords | null, dropGps: GeoCoords | null | undefined): number {
  if (!storeGps || !dropGps) return DEFAULT_MEDS_DELIVERY_FEE
  const km = haversineDistanceMeters(storeGps, dropGps) / 1000
  const extra = Math.max(0, Math.ceil(km - RIDER_FEE_BASE_KM))
  return DEFAULT_MEDS_DELIVERY_FEE + extra * RIDER_FEE_PER_EXTRA_KM
}

export function distanceKm(a: GeoCoords | null, b: GeoCoords | null | undefined): number | null {
  if (!a || !b) return null
  return Math.round((haversineDistanceMeters(a, b) / 1000) * 10) / 10
}

// A delivery ride built from a vendor/pharmacy order (see
// buildMedsDeliveryRide in RideContext.tsx): the pickup IS the store — its
// MockLocation carries the pharmacy's own id — which is how the driver's
// screens tell "bring this food from Aling Nena's" apart from a Pabili
// errand somebody typed by hand.
export function isVendorDeliveryRide(ride: Pick<Ride, 'serviceType' | 'pickup'>): boolean {
  return (ride.serviceType === 'pabili' || ride.serviceType === 'buy_medicine') && /^(pharm|vendor)-/.test(ride.pickup.id)
}
