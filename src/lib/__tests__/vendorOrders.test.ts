import { describe, expect, it } from 'vitest'
import { isVendorDeliveryRide, rideServiceTag } from '../vendorOrders'
import type { Ride } from '../../types'

// Covers the Pabili/PaDeliver split this session made: Food Order and
// PaDeliver's Store now build their own 'vendor_order' rides
// (buildMedsDeliveryRide in RideContext.tsx) instead of literally being
// 'pabili' underneath. These tests pin both the new behavior and backward
// compatibility with rides created before that type existed.

function ride(overrides: Partial<Ride>): Pick<Ride, 'serviceType' | 'pickup'> {
  return {
    serviceType: 'ride',
    pickup: { id: 'loc-1', label: 'Somewhere', coords: '', gps: null, province: '', city: '', barangay: '' },
    ...overrides,
  } as Pick<Ride, 'serviceType' | 'pickup'>
}

describe('isVendorDeliveryRide', () => {
  it('recognizes a vendor_order ride with a vendor pickup id', () => {
    expect(isVendorDeliveryRide(ride({ serviceType: 'vendor_order', pickup: { ...ride({}).pickup, id: 'vendor-99' } }))).toBe(true)
  })

  it('still recognizes old data: a legacy pabili ride with a vendor pickup id', () => {
    expect(isVendorDeliveryRide(ride({ serviceType: 'pabili', pickup: { ...ride({}).pickup, id: 'pharm-1' } }))).toBe(true)
  })

  it('does not treat a freeform pabili errand (no vendor pickup) as a vendor delivery', () => {
    expect(isVendorDeliveryRide(ride({ serviceType: 'pabili', pickup: { ...ride({}).pickup, id: 'loc-somewhere' } }))).toBe(false)
  })

  it('does not treat a padala (Book a Delivery) ride as a vendor delivery, even from a vendor-shaped pickup id', () => {
    expect(isVendorDeliveryRide(ride({ serviceType: 'padala', pickup: { ...ride({}).pickup, id: 'vendor-99' } }))).toBe(false)
  })
})

describe('rideServiceTag', () => {
  it('labels a vendor_order ride "Food Express", same as a legacy vendor pabili ride', () => {
    const vendorOrder = ride({ serviceType: 'vendor_order', pickup: { ...ride({}).pickup, id: 'vendor-1' } })
    const legacy = ride({ serviceType: 'pabili', pickup: { ...ride({}).pickup, id: 'vendor-1' } })
    expect(rideServiceTag(vendorOrder)).toEqual({ icon: '🍽️', label: 'Food Express' })
    expect(rideServiceTag(legacy)).toEqual({ icon: '🍽️', label: 'Food Express' })
  })

  it('still labels a freeform pabili errand "Errand", not Food Express', () => {
    expect(rideServiceTag(ride({ serviceType: 'pabili', pickup: { ...ride({}).pickup, id: 'loc-somewhere' } }))).toEqual({
      icon: '🛍️',
      label: 'Errand',
    })
  })

  it('leaves padala labelled on its own, unaffected by the vendor_order split', () => {
    expect(rideServiceTag(ride({ serviceType: 'padala' }))).toEqual({ icon: '📦', label: 'Padala' })
  })
})
