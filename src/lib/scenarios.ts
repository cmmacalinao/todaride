import { haversineDistanceMeters } from './geo'
import type { GeoCoords, MockLocation, Ride } from '../types'

// A scripted scenario the simulator plays by itself.
//
// Driving both phones by hand is fine for one step and hopeless for six: by
// the time you have switched panes, found the button and tapped Accept, the
// tricycle has moved on and the situation you were setting up no longer
// exists. Each step here states what it is waiting for and what it does when
// that becomes true, so the runner can advance at the app's pace rather than
// a person's.
export interface ScenarioStep {
  // Shown in the simulator while this step is the current one.
  label: string
  // Advance only when this returns something; the value is handed to run().
  ready: (ctx: ScenarioContext) => Ride | true | null
  run: (ctx: ScenarioContext, subject: Ride | true) => void
}

export interface ScenarioRider {
  id: string
  name: string
  pickup: MockLocation
  dropoff: MockLocation
}

export interface ScenarioContext {
  rides: Ride[]
  driverId: string
  driverGps: GeoCoords | null
  // In boarding order: the first is the passenger the tricycle sets off with,
  // the rest flag it down along the way.
  riders: ScenarioRider[]
  actions: {
    requestRide: (args: {
      passengerId: string
      passengerName: string
      pickup: MockLocation
      dropoff: MockLocation
      requestedDriverId?: string | null
    }) => void
    driverProposeAccept: (rideId: string, driverId: string, originGps: GeoCoords | null) => void
    approveProposedFare: (rideId: string) => void
    startRide: (rideId: string) => void
    completeRide: (rideId: string) => void
    acknowledgeRidePayment: (rideId: string) => void
  }
}

const waiting = (ctx: ScenarioContext, passengerId: string) =>
  ctx.rides.find((r) => r.passengerId === passengerId && r.status === 'requested' && !r.pendingApproval) ?? null

const offered = (ctx: ScenarioContext, passengerId: string) =>
  ctx.rides.find(
    (r) => r.passengerId === passengerId && r.status === 'requested' && r.pendingApproval?.driverId === ctx.driverId,
  ) ?? null

const atStatus = (ctx: ScenarioContext, passengerId: string, status: Ride['status']) =>
  ctx.rides.find((r) => r.passengerId === passengerId && r.status === status) ?? null

const unpaid = (ctx: ScenarioContext, passengerId: string) =>
  ctx.rides.find((r) => r.passengerId === passengerId && r.status === 'completed' && !r.paymentAcknowledged) ?? null

// Where the tricycle is, from the leg it is actually driving.
function vehicleGps(ctx: ScenarioContext): GeoCoords | null {
  const driving = ctx.rides.find((r) => r.driverId === ctx.driverId && r.status === 'ongoing')
  if (!driving) return null
  if (driving.driverLiveGps) return driving.driverLiveGps
  const a = driving.pickup.gps
  const b = driving.dropoff.gps
  if (!a || !b) return null
  const f = driving.legProgress
  return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f }
}

const ordinal = (i: number) => ['1st', '2nd', '3rd', '4th'][i] ?? `${i + 1}th`

// One tricycle filling up along its route: the first passenger sets off, and
// each of the others flags it down further along and rides on. Written for any
// number of them because two and four are the same story — the seat count is
// the only thing that changes, and that is exactly what a pilot needs to try.
export function sharedRideScenario(riderCount: number): ScenarioStep[] {
  const steps: ScenarioStep[] = []
  const rider = (ctx: ScenarioContext, i: number) => ctx.riders[i]

  for (let i = 0; i < riderCount; i++) {
    const who = ordinal(i)

    steps.push({
      label: i === 0 ? 'Passenger 1 books' : `Passenger ${i + 1} flags the tricycle down`,
      ready: (ctx) => {
        const me = rider(ctx, i)
        if (!me) return null
        // Everyone after the first only appears once the tricycle is moving.
        if (i > 0 && !ctx.rides.some((r) => r.driverId === ctx.driverId && r.status === 'ongoing')) return null
        return waiting(ctx, me.id) || atStatus(ctx, me.id, 'ongoing') || atStatus(ctx, me.id, 'driver_arriving')
          ? null
          : true
      },
      run: (ctx) => {
        const me = rider(ctx, i)
        if (!me) return
        ctx.actions.requestRide({
          passengerId: me.id,
          passengerName: me.name,
          pickup: me.pickup,
          dropoff: me.dropoff,
          // Only the first is hailed by name; the rest are picked up off the
          // road, which is the whole point of the along-the-way rule.
          requestedDriverId: i === 0 ? ctx.driverId : null,
        })
      },
    })

    steps.push({
      label: i === 0 ? 'Driver accepts passenger 1' : `Driver picks up the ${who} passenger`,
      ready: (ctx) => (rider(ctx, i) ? waiting(ctx, rider(ctx, i).id) : null),
      run: (ctx, ride) => ctx.actions.driverProposeAccept((ride as Ride).id, ctx.driverId, ctx.driverGps),
    })

    steps.push({
      label: `Passenger ${i + 1} approves the fare`,
      ready: (ctx) => (rider(ctx, i) ? offered(ctx, rider(ctx, i).id) : null),
      run: (ctx, ride) => ctx.actions.approveProposedFare((ride as Ride).id),
    })

    steps.push({
      label: i === 0 ? 'Trip 1 starts' : `Driving to passenger ${i + 1}`,
      ready: (ctx) => {
        const me = rider(ctx, i)
        if (!me) return null
        const waitingRide = atStatus(ctx, me.id, 'driver_arriving')
        if (!waitingRide) return null
        // Aboard when the tricycle actually reaches them — not when the fare
        // was agreed. Starting on acceptance put their name in the callout
        // while they were still standing on the kerb.
        if (i === 0) return waitingRide
        const here = vehicleGps(ctx)
        const kerb = waitingRide.pickupGps ?? waitingRide.pickup.gps
        if (!here || !kerb) return waitingRide
        return haversineDistanceMeters(here, kerb) <= 150 ? waitingRide : null
      },
      run: (ctx, ride) => ctx.actions.startRide((ride as Ride).id),
    })
  }

  steps.push({
    label: riderCount > 2 ? `Riding together — ${riderCount} aboard` : 'Riding together',
    ready: (ctx) => {
      const first = rider(ctx, 0)
      const a = first ? atStatus(ctx, first.id, 'ongoing') : null
      return a && a.legProgress >= 1 ? a : null
    },
    run: (ctx, ride) => ctx.actions.completeRide((ride as Ride).id),
  })

  // Each fare settles as its passenger reaches their own stop.
  for (let i = 0; i < riderCount; i++) {
    if (i > 0) {
      steps.push({
        label: `Passenger ${i + 1} reaches their stop`,
        ready: (ctx) => {
          const me = rider(ctx, i)
          const r = me ? atStatus(ctx, me.id, 'ongoing') : null
          return r && r.legProgress >= 1 ? r : null
        },
        run: (ctx, ride) => ctx.actions.completeRide((ride as Ride).id),
      })
    }
    steps.push({
      label: `Passenger ${i + 1} pays`,
      ready: (ctx) => (rider(ctx, i) ? unpaid(ctx, rider(ctx, i).id) : null),
      run: (ctx, ride) => ctx.actions.acknowledgeRidePayment((ride as Ride).id),
    })
  }

  return steps
}
