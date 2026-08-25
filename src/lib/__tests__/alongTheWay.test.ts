import { describe, expect, it } from 'vitest'
import { alongTheWayFit, isSpecialTrip, metersOffRoute, seatsLeft } from '../alongTheWay'
import type { GeoCoords, Ride } from '../../types'

// The real coordinates this scenario runs on, taken from the app's own data:
// A is the CLSU Main Gate pin, B is where Brgy. Bantug geocodes to. The two
// waypoints are computed along that line, so "1 km in" and "3 km out" mean
// the distances they say.
const A: GeoCoords = { lat: 15.73299, lng: 120.931426 }
const B: GeoCoords = { lat: 15.7209768, lng: 120.919912 }
const AT_1KM: GeoCoords = { lat: 15.72638, lng: 120.925091 }
const AT_3KM: GeoCoords = { lat: 15.71316, lng: 120.91242 }

function ride(over: Partial<Ride>): Ride {
  return {
    id: 'r1',
    passengerId: 'pax-1',
    passengerName: 'Test',
    pickup: { id: 'p', label: 'pickup', coords: { x: 0, y: 0 }, gps: AT_1KM, province: '', city: '', barangay: '' },
    dropoff: { id: 'd', label: 'dropoff', coords: { x: 0, y: 0 }, gps: AT_3KM, province: '', city: '', barangay: '' },
    status: 'requested',
    serviceType: 'ride',
    passengerCount: 1,
    ...over,
  } as Ride
}

describe('picking up along the way', () => {
  it('measures the 2 km trip the scenario is built on', () => {
    // Sanity: A to B is the ~2 km leg, and the boarding point really is a
    // kilometre in rather than merely "somewhere in the middle".
    expect(metersOffRoute(A, B, AT_1KM)).toBeLessThanOrEqual(5)
  })

  it('takes a passenger who flags the tricycle down 1 km in and rides 1 km past the drop-off', () => {
    const fit = alongTheWayFit(A, B, ride({}))
    expect(fit).not.toBeNull()
    expect(fit!.offRouteMeters).toBeLessThanOrEqual(50)
    // Point C is 3 km from A while the passenger aboard gets off at 1.8 km,
    // so this second trip carries on past them — the case that used to be
    // rejected outright.
    expect(fit!.beyondCurrentDropoff).toBe(true)
    expect(fit!.beyondMeters).toBeGreaterThan(1000)
    expect(fit!.beyondMeters).toBeLessThan(1400)
  })

  it('refuses a passenger going back the way the tricycle came', () => {
    // Same boarding point, but heading to where this trip started.
    expect(alongTheWayFit(A, B, ride({ dropoff: { ...ride({}).pickup, gps: A } }))).toBeNull()
  })

  it('refuses a pickup that is behind the driver', () => {
    // Standing at A when the tricycle is already a kilometre down the road.
    expect(alongTheWayFit(AT_1KM, B, ride({ pickup: { ...ride({}).pickup, gps: A } }))).toBeNull()
  })

  it('leaves seats for the people already aboard', () => {
    expect(seatsLeft([ride({ passengerCount: 1 }), ride({ passengerCount: 2 })])).toBe(1)
    expect(seatsLeft([ride({ passengerCount: 4 })])).toBe(0)
  })

  it('treats a special trip and an errand as nobody else s to join', () => {
    expect(isSpecialTrip(ride({ specialTrip: true }))).toBe(true)
    expect(isSpecialTrip(ride({ serviceType: 'pabili' }))).toBe(true)
    expect(isSpecialTrip(ride({}))).toBe(false)
  })
})
