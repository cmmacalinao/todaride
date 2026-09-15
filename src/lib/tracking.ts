import { ETA_SECONDS_PER_LEG } from '../context/RideContext'
import { DRIVER_BASE_COORDS, DRIVER_BASE_GPS, DRIVER_BASE_LABEL } from '../mock/data'
import { haversineDistanceMeters } from './geo'
import { interpolateGps } from './liveTracking'
import { pointAlongRoute, type RouteInfo } from './routing'
import type { Driver, GeoCoords, Ride, RideStatus } from '../types'

export function getLegInfo(ride: Ride) {
  const isOngoing = ride.status === 'ongoing'
  const origin = isOngoing ? ride.pickup.coords : DRIVER_BASE_COORDS
  const destination = isOngoing ? ride.dropoff.coords : ride.pickup.coords
  const originLabel = isOngoing ? ride.pickup.label : DRIVER_BASE_LABEL
  const destinationLabel = isOngoing ? ride.dropoff.label : ride.pickup.label
  const etaSeconds = Math.round((1 - ride.legProgress) * ETA_SECONDS_PER_LEG)

  return { origin, destination, originLabel, destinationLabel, etaSeconds, arrived: ride.legProgress >= 1 }
}

// The driver's real-map position: their actual live GPS if they've opted in
// to sharing it for this ride; otherwise walked along the real OSRM road
// route (if one was fetched — see lib/routing.ts's useRoute) using the same
// legProgress that already drives the abstract simulation grid, so the
// simulated pace is unchanged but the marker now follows actual streets
// instead of cutting a straight line through them. Falls further back to
// straight-line interpolation if no route is available yet (still loading,
// or the routing server failed) — the real map is never empty either way.
// How the trip map is framed at each stage. Both the passenger's TripMonitor
// and the driver's own map use this, so the two are never framed differently
// while watching the same ride.
//
// Waiting and on the way to the pickup: the tricycle, the pickup and the
// destination together — the whole trip at a glance. Once the trip is
// underway the pickup is behind you, and keeping it in frame zooms the map
// out around a place nobody is going back to; from there it is the tricycle
// and the destination.
//
// The returned phase changes at each of those moments, which is the signal
// the map re-frames on — including arrival at the pickup.
// A trip that is happening without having been started: the driver reached
// the pickup, the passenger is aboard, and nobody pressed the button. Left
// alone the ride sits at "driver arriving" for its whole duration — the
// passenger's app says the driver is still on the way, the TODA sees a trip
// that never began, and the fare clock never starts.
//
// Two tells, either of which is enough. Moving away from the pickup is the
// certain one: the tricycle only leaves once someone is in it. Sitting at the
// pickup past a grace period is the common one — long enough not to nag a
// driver still helping someone into the seat.
export const FORGOT_START_GRACE_SECONDS = 30
export const FORGOT_START_MOVED_METERS = 150

export function forgotToStartTrip(
  ride: Ride,
  driverGps: GeoCoords | null,
  now: number = Date.now(),
): { show: boolean; movedAway: boolean; metersAway: number | null } {
  if (ride.status !== 'driver_arriving' || ride.legProgress < 1) {
    return { show: false, movedAway: false, metersAway: null }
  }
  const metersAway =
    driverGps && ride.pickup.gps ? Math.round(haversineDistanceMeters(driverGps, ride.pickup.gps)) : null
  const movedAway = metersAway !== null && metersAway > FORGOT_START_MOVED_METERS
  // The last position ping is when the approach finished, i.e. when the
  // driver got there — shared ride data, so both apps judge the same moment
  // rather than each timing from when its own screen happened to open.
  const lastPing = ride.locationLog[ride.locationLog.length - 1]
  const waited = lastPing ? (now - new Date(lastPing.ts).getTime()) / 1000 : 0
  return { show: movedAway || waited >= FORGOT_START_GRACE_SECONDS, movedAway, metersAway }
}

// How long past the estimate a driver has to be before the passenger is
// offered a way out.
//
// Not zero: an estimate is an estimate, and a passenger told "your driver is
// late" the second it lapses learns to distrust the number rather than the
// driver. Three minutes is long enough that the ones who are merely slow have
// arrived, and short enough to matter to someone standing on a road.
export const DRIVER_LATE_GRACE_SECONDS = 180

// Whether the driver who accepted this ride is now overdue at the pickup.
//
// The honest reasons a tricycle never turns up are mundane — no load to text
// with, a dead battery, a chain that went, a road that closed — and none of
// them produce a cancellation from the driver's side, because the phone that
// would send it is the thing that failed. From the passenger's side it just
// looks like waiting. This is what turns that wait into a decision they can
// act on.
//
// Measured from acceptedAt against the estimate the app itself showed, so the
// app is held to its own promise rather than to a number invented here.
export function driverPickupOverdue(
  ride: Ride,
  expectedApproachSeconds: number | null,
  now: number = Date.now(),
): { late: boolean; waitedSeconds: number; expectedSeconds: number } {
  const expected = (expectedApproachSeconds ?? ETA_SECONDS_PER_LEG) + DRIVER_LATE_GRACE_SECONDS
  // Only while still being approached. Once the tricycle is there — or the
  // trip has started, or it ended — there is nothing to be late for.
  if (ride.status !== 'driver_arriving' || !ride.acceptedAt || ride.legProgress >= 1) {
    return { late: false, waitedSeconds: 0, expectedSeconds: expected }
  }
  const waitedSeconds = Math.max(0, Math.round((now - new Date(ride.acceptedAt).getTime()) / 1000))
  return { late: waitedSeconds > expected, waitedSeconds, expectedSeconds: expected }
}

export function tripMapFraming(status: RideStatus, legProgress: number): {
  phase: string
  fitPointIds?: string[]
  // Keeps everyone in the trip inside the frame as they move — see
  // RealLiveMap's followAll.
  followAll?: boolean
  frozen: boolean
} {
  // Frame the journey, not the remaining stub of it: both ends of the trip,
  // so the passenger can see where they got on, where they are going, and
  // the tricycle somewhere between the two.
  //
  // Not frozen. Freezing turned off dragging, pinch-zoom, double-tap zoom and
  // the zoom buttons for the whole ride — a passenger could not look ahead at
  // their own drop-off. It was a blunt way to stop the map re-framing itself
  // every time the tricycle moved, and FitBounds already solves that properly:
  // it stops re-fitting the moment the reader touches the map.
  // Every phase frames the same two fixed points. Naming them matters more
  // than it looks: with no list the map fits *everything on it*, and the
  // tricycle marker is one of those things.
  //
  // (alongside pickup/dropoff) centered on screen for the whole ride rather
  // than fitting once and leaving the viewer to hunt for a marker that has
  // drifted off to one side. FitBounds still yields to a reader who has
  // touched the map, so this is "keep it centered until they say otherwise",
  // not a forced camera.
  // While the trip is actually running the frame holds everyone in it — the
  // tricycle, every passenger aboard, and the pickup and drop-off dots at
  // either end — and re-fits as they move. Naming pickup/dropoff alone was
  // not enough: the tricycle is the thing actually travelling, and it kept
  // sliding out of a frame built around two fixed points. Terminals are left
  // out (see followAll): they are scenery, and fitting them drags the view
  // across the province.
  //
  // Waiting for a driver is a different screen even though it shares this
  // component: nothing is moving yet that the passenger cannot already see,
  // and there is no reason the map should keep recentring itself under
  // someone who is trying to look at a street a few blocks over. It still
  // gets one fit the moment the screen appears — see the fallback below
  // followAll gates in VectorLiveMap's FitBounds — it just does not keep
  // reasserting that fit as the driver's estimated position ticks forward.
  if (status === 'ongoing') return { phase: 'ongoing', followAll: true, frozen: false }
  if (status === 'driver_arriving' && legProgress >= 1) return { phase: 'at-pickup', frozen: false }
  if (status === 'driver_arriving') return { phase: 'driver_arriving', frozen: false }
  return { phase: status, frozen: false }
}

export function getDriverMapGps(ride: Ride, route?: RouteInfo | null): { gps: GeoCoords; isLive: boolean } | null {
  if (ride.status !== 'driver_arriving' && ride.status !== 'ongoing') return null
  if (ride.driverLiveGps) return { gps: ride.driverLiveGps, isLive: true }
  const isOngoing = ride.status === 'ongoing'
  // Where the driver actually was when they took the job, not a fixed
  // depot on the other side of the province. DRIVER_BASE_GPS is ~9 km from
  // CLSU, so using it as the start of the drive-to-pickup leg put the
  // tricycle marker in San Jose and dragged the map's fit out with it —
  // and since the marker crawls in from there every tick, the frame kept
  // re-fitting and the map appeared to zoom in and out without settling.
  const origin = isOngoing ? ride.pickup.gps : ride.driverOriginGps ?? DRIVER_BASE_GPS
  const destination = isOngoing ? ride.dropoff.gps : ride.pickup.gps
  // Defensive: a MockLocation from before `gps` existed (stale localStorage)
  // has no real coordinate to interpolate from — fall back to live-only.
  if (!origin || !destination) return null
  // The route belongs to whichever leg was last resolved, and resolving a new
  // one takes a network round trip. At the moment the trip starts, the leg
  // flips to pickup-to-dropoff while the route still holds terminal-to-pickup
  // — and reading progress 0 off that stale route puts the tricycle back at
  // the terminal, kilometres away. It lasts only until the new route lands,
  // but that is exactly when the map re-frames, so the frame gets built
  // around a position the driver is nowhere near. Trust the route only when
  // it starts where this leg starts.
  const routeMatchesLeg =
    !!route && route.points.length > 1 && haversineDistanceMeters(route.points[0], origin) <= 250
  if (route && routeMatchesLeg) {
    return { gps: pointAlongRoute(route.points, ride.legProgress), isLive: false }
  }
  return { gps: interpolateGps(origin, destination, ride.legProgress), isLive: false }
}

// The passenger's real-map position while waiting for pickup: their live-
// shared GPS if they've opted in, else the one-time exact pin captured at
// booking, else nothing (no marker rather than a guess).
// Which of a driver's rides is the one actually being driven right now: the
// first they took. Everything about the vehicle — where it is, and which
// road it is on — comes from this ride, so the marker and the drawn line
// never disagree.
export function primaryAboardRide(ride: Ride, allRides: Ride[]): Ride {
  if (!ride.driverId) return ride
  const aboard = allRides.filter(
    (r) => r.driverId === ride.driverId && (r.status === 'driver_arriving' || r.status === 'ongoing'),
  )
  if (aboard.length <= 1) return ride
  return aboard.reduce((a, b) =>
    new Date(a.requestedAt).getTime() <= new Date(b.requestedAt).getTime() ? a : b,
  )
}

// One tricycle, one position.
//
// Every ride animates the driver along its own pickup→drop-off line, which
// is right until the same driver is carrying two of them: then the vehicle
// is drawn twice, in two different streets, moving on two different routes.
// It cannot be in both. The trip the driver is actually driving — the one
// they took first — says where the tricycle is, and every other ride aboard
// borrows that answer.
export function sharedDriverMapGps(
  ride: Ride,
  allRides: Ride[],
  route?: RouteInfo | null,
): { gps: GeoCoords; isLive: boolean } | null {
  if (!ride.driverId) return getDriverMapGps(ride, route)
  const aboard = allRides.filter(
    (r) => r.driverId === ride.driverId && (r.status === 'driver_arriving' || r.status === 'ongoing'),
  )
  if (aboard.length <= 1) return getDriverMapGps(ride, route)
  const primary = primaryAboardRide(ride, allRides)
  if (primary.id === ride.id) return getDriverMapGps(ride, route)
  // The caller resolves its route for the leg being driven (see
  // primaryAboardRide), so it belongs to this position — and passing it is
  // what keeps the marker walking the road rather than cutting across it.
  // getDriverMapGps checks the route really starts at that leg's origin
  // before trusting it.
  return getDriverMapGps(primary, route)
}

export function getPassengerMapGps(ride: Ride): { gps: GeoCoords; isLive: boolean } | null {
  if (ride.status !== 'driver_arriving') return null
  if (ride.passengerLiveGps) return { gps: ride.passengerLiveGps, isLive: true }
  if (ride.pickupGps) return { gps: ride.pickupGps, isLive: false }
  return null
}

// Admin sets how many days back the Trip History lists (Passenger, Driver)
// show — older rides stay in state (earnings totals, ratings, admin reports
// all still see them) but drop out of that display list. See
// RideContext's tripHistoryRetentionDays/SET_TRIP_HISTORY_RETENTION_DAYS.
export function isWithinRetentionDays(dateIso: string, retentionDays: number): boolean {
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  return new Date(dateIso).getTime() >= cutoffMs
}

// Hours and minutes, never seconds: "12s away" read as a countdown nobody
// could trust, and under a minute out the honest word is that you are
// arriving. "4 min", "1 h 12 min", "2 h" — the caller says "Arrives".
// The clock time that many seconds from now — "2:52 PM" — for a passenger
// deciding whether to wait at the gate or finish their coffee.
export function formatArrivalClock(seconds: number, now: number = Date.now()): string {
  return new Date(now + Math.max(0, seconds) * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

// "Arrives 4 min (~2:52 PM)", or plainly "Arriving now" — never "Arrives
// Arriving now".
export function formatArrives(seconds: number, withClock = false): string {
  if (seconds <= 45) return 'Arriving now'
  return `Arrives ${formatEta(seconds)}${withClock ? ` (~${formatArrivalClock(seconds)})` : ''}`
}

export function formatEta(seconds: number): string {
  if (seconds <= 45) return 'Arriving now'
  const minutes = Math.max(1, Math.ceil(seconds / 60))
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

export function buildTimeline(ride: Ride): { label: string; ts: string }[] {
  const events: { label: string; ts: string }[] = [{ label: 'Ride booked', ts: ride.requestedAt }]
  if (ride.acceptedAt) events.push({ label: `Driver assigned: ${ride.driverName}`, ts: ride.acceptedAt })
  if (ride.startedAt) events.push({ label: 'Ride started', ts: ride.startedAt })
  if (ride.completedAt) events.push({ label: 'Ride completed', ts: ride.completedAt })
  return events
}

// Priority TODA dispatch: the ride's own TODA terminal queue gets first
// crack at accepting it (one driver at a time, in queue order — see
// isRideVisibleToDriver); everyone else (other TODAs, freelancers) only
// sees it once the priority window elapses or the queue runs out. A special
// pickup (driver detours from the terminal to the passenger's exact spot —
// see Ride.specialPickupRequested) is a harder ask, so it gets the longer
// specialPickupEscalationMs window instead of the general todaQueueWindowMs
// before falling open to everyone.
export function getDispatchWindow(ride: Ride, todaQueueWindowMs: number, specialPickupEscalationMs: number) {
  const effectiveWindowMs = ride.specialPickupRequested ? specialPickupEscalationMs : todaQueueWindowMs
  const elapsedMs = Date.now() - new Date(ride.requestedAt).getTime()
  const remainingMs = Math.max(0, effectiveWindowMs - elapsedMs)
  // The queue can also run dry before the timer does — e.g. an empty
  // terminal, or everyone in it already passed on this ride — in which
  // case there's no reason to keep making everyone else wait.
  const queueExhausted = ride.priorityTodaOrgId !== null && ride.priorityQueueOfferedDriverId === null
  return { openToAll: remainingMs <= 0 || queueExhausted, remainingSeconds: Math.ceil(remainingMs / 1000) }
}

export function isRideVisibleToDriver(
  ride: Ride,
  driver: Driver,
  todaQueueWindowMs: number,
  specialPickupEscalationMs: number,
): boolean {
  // Paused/terminated drivers never receive ride offers, regardless of
  // queue position or the open-to-all fallback — only the App Admin can
  // restore this.
  if (driver.accessStatus !== 'active') return false
  // Someone has already offered and the passenger is deciding. The ride is
  // spoken for until they answer — showing it to anyone else offers a job
  // that cannot be taken.
  if (ride.pendingApproval) return ride.pendingApproval.driverId === driver.id
  const { openToAll } = getDispatchWindow(ride, todaQueueWindowMs, specialPickupEscalationMs)
  if (openToAll) return true
  // Sequential terminal-queue dispatch: only the driver currently "up" can
  // see/accept it — not a broadcast to the whole TODA.
  return ride.priorityQueueOfferedDriverId === driver.id
}
