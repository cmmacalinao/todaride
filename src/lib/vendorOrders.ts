import type { Ride } from '../types'

// A delivery ride built from a vendor/pharmacy order (see
// buildMedsDeliveryRide in RideContext.tsx): the pickup IS the store — its
// MockLocation carries the pharmacy's own id — which is how the driver's
// screens tell "bring this food from Aling Nena's" apart from a Pabili
// errand somebody typed by hand.
export function isVendorDeliveryRide(ride: Pick<Ride, 'serviceType' | 'pickup'>): boolean {
  return (ride.serviceType === 'pabili' || ride.serviceType === 'buy_medicine') && /^(pharm|vendor)-/.test(ride.pickup.id)
}
