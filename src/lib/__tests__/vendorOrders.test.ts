import { describe, expect, it } from 'vitest'
import { codBreakdown, isVendorDeliveryRide, rideServiceTag } from '../vendorOrders'
import type { MedsOrder, Ride } from '../../types'

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

// A store that could not get its delivery taken at the tariff can add to the
// rider's fare to get it moving (MedsOrder.vendorFareTopUp). The money has to
// come out of the store's own share and not the customer's bill, and it has
// to be visible to the rider deciding — these pin both, because getting it
// wrong means either a customer billed for the app failing to find a rider,
// or a rider promised money that never arrives.
describe('codBreakdown with a store-funded fare top-up', () => {
  function codOrder(overrides: Partial<MedsOrder> = {}): MedsOrder {
    // goods 200 + fare 50 + booking 10 = 260 collected at the door.
    return {
      id: 'order-1',
      linkedRideId: 'ride-1',
      paymentMethod: 'cash',
      subtotal: 200,
      deliveryFee: 50,
      serviceFee: 10,
      total: 260,
      ...overrides,
    } as MedsOrder
  }
  const cashRide = { id: 'ride-1', paymentMethod: 'cash' } as Ride

  it('leaves an untopped-up order exactly as before', () => {
    expect(codBreakdown(cashRide, [codOrder()])).toEqual({ fee: 60, goods: 200, collect: 260 })
  })

  it('pays the top-up to the rider out of the goods money, not the customer', () => {
    const split = codBreakdown(cashRide, [codOrder({ vendorFareTopUp: 20 })])
    // The rider's own money went up by the top-up...
    expect(split?.fee).toBe(80)
    // ...the store receives that much less of the goods money...
    expect(split?.goods).toBe(180)
    // ...and the customer still pays what they approved.
    expect(split?.collect).toBe(260)
  })

  it('keeps fee + goods === collect, so the cash at the door always balances', () => {
    for (const topUp of [0, 5, 20, 60]) {
      const split = codBreakdown(cashRide, [codOrder({ vendorFareTopUp: topUp })])
      expect(split!.fee + split!.goods).toBe(split!.collect)
    }
  })
})
