import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OUT_OF_AREA_PER_KM,
  DEFAULT_TARIFF_SETTINGS,
  DEFAULT_TODA_RADIUS_KM,
  estimateFare,
  estimateFareBreakdown,
  estimateOutOfAreaBreakdown,
  getFreeTodaDrivers,
  orderByDispatchDistance,
  resolveTariff,
} from '../../mock/data'
import { errandBaseFare } from '../../context/RideContext'
import { isRideVisibleToDriver } from '../tracking'
import { buildNearbyRequests } from '../../components/NearbyRequestsBoard'
import { readFileSync } from 'node:fs'
import type { Driver, GeoCoords, MockLocation, PendingFareApproval, Ride, TariffSettings, Terminal, TodaOrganization } from '../../types'

// These are the numbers customers argue about at the kerb, so they are pinned
// here rather than left to be discovered on someone's phone. Every case below
// is a rule the app already claims to follow; the test is what stops a change
// in one screen from quietly disagreeing with another.

const tariff: TariffSettings = DEFAULT_TARIFF_SETTINGS

function place(id: string, lat: number, lng: number): MockLocation {
  return {
    id,
    label: id,
    coords: { x: 0, y: 0 },
    province: 'Nueva Ecija',
    city: 'Science City of Muñoz',
    barangay: 'CLSU',
    gps: { lat, lng },
  }
}

// ~4.1 km apart, which puts it comfortably past the 2 km the standard rate
// covers — the ordinary shape of a real trip here.
const clsu = place('CLSU Main Gate', 15.7333, 120.9333)
const market = place('Muñoz Public Market', 15.7167, 120.9)

describe('ride fares', () => {
  it('charges the standard rate plus the distance beyond what it covers', () => {
    const b = estimateFareBreakdown(clsu, market, tariff, {
      isStudent: false,
      isPwdSenior: false,
      passengerCount: 1,
    })
    expect(b.baseRate).toBe(tariff.standardRate)
    expect(b.extraKm).toBeCloseTo(b.distanceKm - tariff.standardKmCovered, 5)
    expect(b.total).toBe(Math.round(b.baseRate + b.extraKmFee + b.extraPassengers))
  })

  it('never charges for distance on a trip that goes nowhere', () => {
    const b = estimateFareBreakdown(clsu, clsu, tariff, {
      isStudent: false,
      isPwdSenior: false,
      passengerCount: 1,
    })
    expect(b.distanceKm).toBe(0)
    expect(b.extraKmFee).toBe(0)
    expect(b.total).toBe(tariff.standardRate)
  })

  it('gives students and PWD/senior riders their discounted base rate', () => {
    const student = estimateFareBreakdown(clsu, market, tariff, {
      isStudent: true,
      isPwdSenior: false,
      passengerCount: 1,
    })
    const pwd = estimateFareBreakdown(clsu, market, tariff, {
      isStudent: false,
      isPwdSenior: true,
      passengerCount: 1,
    })
    expect(student.baseRate).toBe(tariff.studentRate)
    expect(pwd.baseRate).toBe(tariff.pwdSeniorRate)
    expect(student.total).toBeLessThan(
      estimateFare(clsu, market, tariff, { isStudent: false, isPwdSenior: false, passengerCount: 1 }),
    )
  })

  it('lets PWD/senior win when a rider somehow qualifies for both', () => {
    const both = estimateFareBreakdown(clsu, market, tariff, {
      isStudent: true,
      isPwdSenior: true,
      passengerCount: 1,
    })
    expect(both.baseRate).toBe(tariff.pwdSeniorRate)
  })

  it('applies the group discount for 2-4 standard riders instead of a per-head fee', () => {
    const group = estimateFareBreakdown(clsu, market, tariff, {
      isStudent: false,
      isPwdSenior: false,
      passengerCount: 3,
    })
    expect(group.extraPassengers).toBe(0)
    expect(group.baseRate).toBeCloseTo(tariff.standardRate * 3 * (1 - tariff.groupRideDiscountPct / 100), 5)
  })

  it('falls back to the flat per-head fee for a group too big to share one tricycle', () => {
    const five = estimateFareBreakdown(clsu, market, tariff, {
      isStudent: false,
      isPwdSenior: false,
      passengerCount: 5,
    })
    expect(five.baseRate).toBe(tariff.standardRate)
    expect(five.extraPassengers).toBe(4 * tariff.extraPassengerFee)
  })
})

describe('errand (Pabili) fares', () => {
  const oneWay = estimateFare(clsu, market, tariff, {
    isStudent: false,
    isPwdSenior: false,
    passengerCount: 1,
  })

  it('charges an errand like an ordinary ride on the standard basis', () => {
    expect(errandBaseFare(oneWay, 'standard', 50)).toBe(oneWay)
  })

  it('charges the flat rate on the fixed basis, whatever the distance', () => {
    expect(errandBaseFare(oneWay, 'fixed', 50)).toBe(50)
    // Same fixed rate for a trip of a completely different length.
    const shortHop = estimateFare(clsu, place('next street', 15.7334, 120.9334), tariff, {
      isStudent: false,
      isPwdSenior: false,
      passengerCount: 1,
    })
    expect(errandBaseFare(shortHop, 'fixed', 50)).toBe(50)
  })

  it('never doubles the distance fare — the round-trip basis is gone', () => {
    expect(errandBaseFare(oneWay, 'standard', 50)).not.toBe(oneWay * 2)
  })
})

describe('out-of-area approach', () => {
  const terminal = { lat: 15.7333, lng: 120.9333 }

  it('adds nothing for a driver inside the TODA area', () => {
    // ~1.1 km out, well within the 3 km default radius.
    const inside = { lat: 15.7433, lng: 120.9333 }
    const b = estimateOutOfAreaBreakdown(inside, terminal, DEFAULT_TODA_RADIUS_KM, DEFAULT_OUT_OF_AREA_PER_KM)
    expect(b.extraKm).toBe(0)
    expect(b.fee).toBe(0)
  })

  it('charges only the distance beyond the radius, at the admin rate', () => {
    // ~5.6 km north of the terminal.
    const outside = { lat: 15.7833, lng: 120.9333 }
    const b = estimateOutOfAreaBreakdown(outside, terminal, DEFAULT_TODA_RADIUS_KM, DEFAULT_OUT_OF_AREA_PER_KM)
    expect(b.distanceKm).toBeGreaterThan(DEFAULT_TODA_RADIUS_KM)
    expect(b.extraKm).toBeCloseTo(b.distanceKm - DEFAULT_TODA_RADIUS_KM, 5)
    expect(b.fee).toBe(Math.round(b.extraKm * DEFAULT_OUT_OF_AREA_PER_KM))
  })

  it('charges nothing when either position is unknown', () => {
    expect(estimateOutOfAreaBreakdown(null, terminal, 3, 8).fee).toBe(0)
    expect(estimateOutOfAreaBreakdown({ lat: 15.9, lng: 120.9 }, null, 3, 8).fee).toBe(0)
  })
})

describe('dispatch visibility', () => {
  const driver = (id: string): Driver =>
    ({ id, accessStatus: 'active' }) as unknown as Driver

  const baseRide = (over: Partial<Ride>): Ride =>
    ({
      id: 'ride-1',
      status: 'requested',
      requestedAt: new Date().toISOString(),
      priorityTodaOrgId: 'toda-1',
      priorityQueueOfferedDriverId: 'drv-1',
      priorityQueueOfferedAt: new Date().toISOString(),
      priorityQueueLog: [],
      pendingApproval: null,
      specialPickupRequested: false,
      ...over,
    }) as unknown as Ride

  const offer = (driverId: string): PendingFareApproval => ({
    driverId,
    driverName: 'Someone',
    driverOriginGps: null,
    outOfAreaKm: 0,
    outOfAreaFee: 0,
    fareBefore: 26,
    fareAfter: 26,
    proposedAt: new Date().toISOString(),
  })

  it('offers a fresh request only to the driver whose turn it is', () => {
    const ride = baseRide({})
    expect(isRideVisibleToDriver(ride, driver('drv-1'), 30_000, 60_000)).toBe(true)
    expect(isRideVisibleToDriver(ride, driver('drv-2'), 30_000, 60_000)).toBe(false)
  })

  it('opens the request to everyone once the TODA window has passed', () => {
    const stale = baseRide({ requestedAt: new Date(Date.now() - 120_000).toISOString() })
    expect(isRideVisibleToDriver(stale, driver('drv-2'), 30_000, 60_000)).toBe(true)
  })

  it('hides a ride from everyone but the driver waiting on the passenger', () => {
    // Even with the window long expired: an offer the passenger is still
    // deciding on is not a job anyone else can take.
    const pending = baseRide({
      requestedAt: new Date(Date.now() - 120_000).toISOString(),
      pendingApproval: offer('drv-1'),
    })
    expect(isRideVisibleToDriver(pending, driver('drv-1'), 30_000, 60_000)).toBe(true)
    expect(isRideVisibleToDriver(pending, driver('drv-2'), 30_000, 60_000)).toBe(false)
  })

  it('never offers a ride to a paused or terminated driver', () => {
    const ride = baseRide({})
    const paused = { id: 'drv-1', accessStatus: 'paused' } as unknown as Driver
    expect(isRideVisibleToDriver(ride, paused, 30_000, 60_000)).toBe(false)
  })
})

// The ×2 Pabili bug did not live in the shared helper — it lived in a second
// copy of the sum, inline in a booking form nobody thought to update. Testing
// errandBaseFare alone would never have seen it. So this checks the thing that
// actually went wrong: that no screen prices an errand by hand.
describe('no screen prices an errand by hand', () => {
  const bookingScreens = [
    'src/pages/PassengerPage.tsx',
    'src/components/QuickBookingForm.tsx',
    'src/components/MedsBooking.tsx',
  ]

  it.each(bookingScreens)('%s uses the shared fare helper, not its own arithmetic', (file) => {
    const source = readFileSync(file, 'utf8')
    // Any of these is a second implementation of a rule that already exists.
    expect(source).not.toMatch(/oneWayFare\s*\*\s*2/)
    expect(source).not.toMatch(/\*\s*\(is(Errand|Pabili)\s*\?\s*2\s*:\s*1\)/)
  })
})

// Who gets the request. A passenger's wait is the distance between them and
// whoever is sent, so dispatch offers to the nearest driver first — counting
// both the line at the terminal and members who are online with no passenger.
describe('nearest-driver dispatch', () => {
  const pickup = { lat: 15.7330, lng: 120.9314 } // CLSU Main Gate
  const farTerminal: Terminal = { id: 'T-far', gps: { lat: 15.7386, lng: 120.9350 } } as unknown as Terminal
  const nearTerminal: Terminal = { id: 'T-near', gps: { lat: 15.7331, lng: 120.9315 } } as unknown as Terminal
  const terminals = [farTerminal, nearTerminal]
  const orgs: TodaOrganization[] = []

  const at = (id: string, terminalId: string, joinedAt: string): Driver =>
    ({ id, homeTerminalId: terminalId, queueJoinedAt: joinedAt }) as unknown as Driver

  it('offers to the closest driver even when someone else joined the queue first', () => {
    const earlyButFar = at('drv-far', 'T-far', '2026-08-22T08:00:00.000Z')
    const lateButNear = at('drv-near', 'T-near', '2026-08-22T09:00:00.000Z')
    const order = orderByDispatchDistance([earlyButFar, lateButNear], pickup, terminals, orgs)
    expect(order.map((d) => d.id)).toEqual(['drv-near', 'drv-far'])
  })

  it('keeps the terminal line intact among drivers standing in the same place', () => {
    const first = at('drv-1', 'T-near', '2026-08-22T08:00:00.000Z')
    const second = at('drv-2', 'T-near', '2026-08-22T08:30:00.000Z')
    const third = at('drv-3', 'T-near', '2026-08-22T09:00:00.000Z')
    // Same terminal means the same distance, so join order is what is left
    // to sort on — the pila still means something.
    const order = orderByDispatchDistance([first, second, third], pickup, terminals, orgs)
    expect(order.map((d) => d.id)).toEqual(['drv-1', 'drv-2', 'drv-3'])
  })

  it('measures from a real GPS reading when the driver has handed one over', () => {
    const atFarTerminalButStandingNear = {
      ...at('drv-roaming', 'T-far', '2026-08-22T08:00:00.000Z'),
      lastKnownGps: { lat: 15.73301, lng: 120.93141 },
    } as Driver
    const queuedAtNear = at('drv-near', 'T-near', '2026-08-22T08:00:00.000Z')
    const order = orderByDispatchDistance([queuedAtNear, atFarTerminalButStandingNear], pickup, terminals, orgs)
    expect(order[0].id).toBe('drv-roaming')
  })

  it('places a driver the app cannot locate at the back, not the front', () => {
    const unplaceable = ({ id: 'drv-nowhere', queueJoinedAt: '2026-08-22T07:00:00.000Z' }) as unknown as Driver
    const known = at('drv-known', 'T-far', '2026-08-22T09:00:00.000Z')
    const order = orderByDispatchDistance([unplaceable, known], pickup, terminals, orgs)
    expect(order.map((d) => d.id)).toEqual(['drv-known', 'drv-nowhere'])
  })

  it('counts online members with no passenger, and skips the ones on a trip', () => {
    const free = ({
      id: 'drv-free',
      todaOrgId: 'toda-1',
      verificationStatus: 'approved',
      accessStatus: 'active',
      online: true,
      queueJoinedAt: null,
    }) as unknown as Driver
    const busy = { ...free, id: 'drv-busy' } as Driver
    const offline = { ...free, id: 'drv-offline', online: false } as Driver
    const found = getFreeTodaDrivers('toda-1', [free, busy, offline], new Set(['drv-busy']))
    expect(found.map((d) => d.id)).toEqual(['drv-free'])
  })
})

// The numbers on a request card decide which job a driver drives to, so the
// three of them have to add up in public: fare, tip, total — and what is
// actually left after the platform fee and the TODA's share.
describe('nearby request board', () => {
  const me = ({
    id: 'drv-me',
    todaOrgId: null,
    accessStatus: 'active',
    verificationStatus: 'approved',
  }) as unknown as Driver

  const waiting = (over: Partial<Ride>): Ride =>
    ({
      id: 'ride-x',
      status: 'requested',
      requestedAt: new Date().toISOString(),
      fareEstimate: 60,
      pabiliTip: 0,
      tipOffer: 0,
      serviceType: 'ride',
      passengerName: 'Passenger',
      passengerCount: 1,
      pickup: { label: 'A', gps: { lat: 15.73, lng: 120.93 } },
      dropoff: { label: 'B', gps: null },
      priorityTodaOrgId: null,
      priorityQueueOfferedDriverId: null,
      priorityQueueOfferedAt: null,
      priorityQueueLog: [],
      pendingApproval: null,
      specialPickupRequested: false,
      declinedByDriverIds: [],
      ...over,
    }) as unknown as Ride

  const build = (rides: Ride[]) => buildNearbyRequests(rides, me, null, [], [], 10, 30_000, 60_000)

  it('totals the fare and every kind of tip, and shows what is left after the cut', () => {
    const [row] = build([waiting({ fareEstimate: 60, tipOffer: 15, pabiliTip: 5 })])
    expect(row.fare).toBe(60)
    expect(row.tips).toBe(20)
    expect(row.total).toBe(80)
    // ₱10 platform fee off the base fare only — the ₱20 of tips is untouched.
    expect(row.takeHome).toBe(70)
  })

  it('lists a request held by another driver, but does not let this one take it', () => {
    const [row] = build([waiting({ priorityTodaOrgId: 'toda-1', priorityQueueOfferedDriverId: 'drv-other' })])
    expect(row.blockedReason).toBeTruthy()
  })

  it('leaves a request the driver already passed on out of the list entirely', () => {
    expect(build([waiting({ declinedByDriverIds: ['drv-me'] })])).toHaveLength(0)
  })

  it('puts takeable work above work that is still someone else s turn', () => {
    const held = waiting({ id: 'held', priorityTodaOrgId: 't', priorityQueueOfferedDriverId: 'drv-other' })
    const open = waiting({ id: 'open' })
    expect(build([held, open]).map((r) => r.ride.id)).toEqual(['open', 'held'])
  })
})

// The rule at a terminal is the pila, and the rule away from one is distance.
// Both are exercised here because the second used to be the only rule, and a
// few metres of GPS drift could put a driver ahead of the person who had been
// waiting in line since eight in the morning.
describe('pila order at the terminal', () => {
  const terminalGps = { lat: 15.73299, lng: 120.931426 } // CLSU Main Gate
  const terminal = {
    id: 'T-main',
    todaOrgId: 'toda-1',
    gps: terminalGps,
    isActive: true,
  } as unknown as Terminal

  const queued = (id: string, joinedAt: string, gps: GeoCoords | null): Driver =>
    ({
      id,
      todaOrgId: 'toda-1',
      homeTerminalId: 'T-main',
      queueJoinedAt: joinedAt,
      verificationStatus: 'approved',
      accessStatus: 'active',
      online: true,
      lastKnownGps: gps,
    }) as unknown as Driver

  // #1 in line, but standing a few metres further from the kerb than #2 —
  // exactly the case where raw distance gets the wrong answer.
  const first = queued('drv-1', '2026-08-22T08:00:00.000Z', { lat: 15.73305, lng: 120.93150 })
  const second = queued('drv-2', '2026-08-22T09:00:00.000Z', terminalGps)

  it('sorts by distance when nothing anchors the pickup to a terminal', () => {
    const order = orderByDispatchDistance([first, second], terminalGps, [terminal], [])
    // Pure distance: the one physically closest comes first, line be damned.
    expect(order[0].id).toBe('drv-2')
  })

  it('keeps the line intact for drivers the app cannot separate by distance', () => {
    const a = queued('drv-a', '2026-08-22T08:00:00.000Z', null)
    const b = queued('drv-b', '2026-08-22T09:00:00.000Z', null)
    const order = orderByDispatchDistance([b, a], terminalGps, [terminal], [])
    // Both fall back to the terminal's own pin, so they tie — and a stable
    // sort leaves getTodaQueue's join order untouched.
    expect(order.map((d) => d.id)).toEqual(['drv-b', 'drv-a'])
  })
})

describe('pricing a group by published fare rather than percentage', () => {
  const base = { ...DEFAULT_TARIFF_SETTINGS, standardRate: 15, groupRideDiscountPct: 10 }
  const near = (count: number, tariff: typeof base) =>
    estimateFareBreakdown(clsu, clsu, tariff, {
      isStudent: false,
      isPwdSenior: false,
      passengerCount: count,
    }).total

  it('uses the percentage until told otherwise', () => {
    expect(near(2, base)).toBe(27)
  })

  it('charges the published fare in flat mode', () => {
    // An LGU that has printed "P40 for three" should be able to type 40,
    // rather than reverse-engineering a percentage that lands near it.
    const flat = { ...base, groupRideFareMode: 'flat' as const, groupRideFlatRate3: 40 }
    expect(near(3, flat)).toBe(40)
  })

  it('falls back to the percentage for a size left unset', () => {
    // A half-filled form must not hand somebody a free ride.
    const flat = { ...base, groupRideFareMode: 'flat' as const, groupRideFlatRate4: 0 }
    expect(near(4, flat)).toBe(54)
  })

  it('leaves solo riders alone in either mode', () => {
    const flat = { ...base, groupRideFareMode: 'flat' as const, groupRideFlatRate2: 99 }
    expect(near(1, flat)).toBe(near(1, base))
  })
})

describe('whose taripa applies', () => {
  const base = { ...DEFAULT_TARIFF_SETTINGS, standardRate: 15 }
  const munoz = { ...DEFAULT_TARIFF_SETTINGS, standardRate: 20 }
  const clsuToda = { ...DEFAULT_TARIFF_SETTINGS, standardRate: 25 }

  it('uses the platform default when nobody has set anything', () => {
    expect(resolveTariff(base, {}, {}, 'Science City of Muñoz', 'toda-clsu')).toBe(base)
  })

  it("uses the city's taripa where the LGU has published one", () => {
    // A taripa is a fact about a city, not about the app: Muñoz and San Jose
    // publish different ones and both are correct.
    const cities = { 'Science City of Muñoz': munoz }
    expect(resolveTariff(base, cities, {}, 'Science City of Muñoz', null)).toBe(munoz)
    expect(resolveTariff(base, cities, {}, 'San Jose City', null)).toBe(base)
  })

  it('lets a TODA override its own city', () => {
    // Some are granted their own schedule inside a city.
    const cities = { 'Science City of Muñoz': munoz }
    const todas = { 'toda-clsu': clsuToda }
    expect(resolveTariff(base, cities, todas, 'Science City of Muñoz', 'toda-clsu')).toBe(clsuToda)
  })

  it('falls back past a TODA with no schedule of its own', () => {
    const cities = { 'Science City of Muñoz': munoz }
    const todas = { 'toda-clsu': clsuToda }
    expect(resolveTariff(base, cities, todas, 'Science City of Muñoz', 'toda-sanisidro')).toBe(munoz)
  })

  it('survives a ride with no city or TODA attached', () => {
    expect(resolveTariff(base, { x: munoz }, { y: clsuToda }, null, null)).toBe(base)
    expect(resolveTariff(base, undefined, undefined, 'Anywhere', 'any')).toBe(base)
  })
})
