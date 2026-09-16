import { formatAddressLine } from '../lib/addressFormat'
import { isActiveAlert, passengerEmergencyContacts } from '../lib/safety'
import { EmergencySheet } from './EmergencySheet'
import { CrashPromptModal } from './CrashPromptModal'
import { useCrashDetection } from '../lib/crashDetection'
import { rideServiceTag } from '../lib/vendorOrders'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ETA_SECONDS_PER_LEG, useRides } from '../context/RideContext'
import { DRIVER_BASE_GPS, MOCK_DRIVERS, PAYMENT_METHODS } from '../mock/data'
import { showInMiddle, showInMiddleWhenSettled } from '../lib/showInMiddle'
import { StatusBadge } from './StatusBadge'
import { RealLiveMap, preloadNavMap, type MapPoint } from './RealLiveMap'
import { AlertBanner } from './AlertBanner'
import { PhotoCaptureButton } from './PhotoCaptureButton'
import { PhotoGallery } from './PhotoGallery'
import { buildTimeline, driverPickupOverdue, formatArrives, formatEta, getDispatchWindow, getLegInfo, getPassengerMapGps, primaryAboardRide, sharedDriverMapGps, tripMapFraming } from '../lib/tracking'
import { formatKm, haversineDistanceMeters } from '../lib/geo'
import { remainingLeg } from '../lib/legRemaining'
import { reverseGeocodeToPhAddress } from '../lib/customLocation'
import { useNow, useWatchPosition } from '../lib/liveTracking'
import { useRoute } from '../lib/routing'
import { nextRerouteDecision } from '../lib/reroute'
import { nextSeparationDecision, type SeparationState } from '../lib/separation'
import { GpsDiagnosticLine } from './GpsDiagnosticLine'
import { EmergencyHotlines } from './EmergencyHotlines'
import { RIDE_CANCELLATION_REASON_LABELS } from '../types'
import type { GeoCoords, Ride } from '../types'

interface CallContact {
  label: string
  phone: string
}

interface TripMonitorProps {
  title: string
  ride: Ride
  sosActorId: string
  sosLabel: string
  showCancel?: boolean
  onCancel?: () => void
  // Closes a trip the passenger has already stepped out of. See the panel
  // near the bottom of this file for why the passenger needs this at all.
  onFinishTrip?: () => void
  // Lets the caller stop showing this ride in the "current trip" slot once
  // it's completed, so the passenger can start a new booking without first
  // having to tap a payment method — see PassengerPage's dismissedRideId.
  // The ride itself isn't affected; it's still fully visible in Trip History
  // either way (ReceiptCard there doesn't depend on paymentAcknowledged).
  onDismiss?: () => void
  extraContacts?: CallContact[]
  // Only the passenger's own screen should be able to toggle live GPS
  // sharing for themselves — a parent viewing the same ride can see the map
  // but shouldn't get a share toggle for a location that isn't theirs.
  allowLiveGpsToggle?: boolean
  // Only the rider actually sitting in the tricycle can say they've gotten
  // out of it — a parent watching from home, or someone tracking a Pabili
  // errand with no passenger aboard, shouldn't see this at all.
  allowGotOffCheck?: boolean
  // Look up this passenger's own guardian and offer to call them directly —
  // set only on the passenger's own screen (PassengerPage). A parent's own
  // screen already names who to call via extraContacts; looking a guardian
  // up there would either point them at their own number or, worse, at a
  // parent link that has nothing to do with who they actually are.
  showGuardianContact?: boolean
}

export function TripMonitor({
  title,
  ride,
  sosActorId,
  sosLabel,
  showCancel,
  onCancel,
  onFinishTrip,
  onDismiss,
  extraContacts,
  allowLiveGpsToggle,
  allowGotOffCheck,
  showGuardianContact,
}: TripMonitorProps) {
  const navigate = useNavigate()
  const {
    alerts,
    drivers,
    todaOrganizations,
    todaQueueWindowMs,
    specialPickupEscalationMs,
    rides,
    triggerSos,
    cancelAlert,
    logAlertEvent,
    safetySettings,
    logPossibleCrash,
    passengers,
    addSafetyPhoto,
    updatePassengerLiveGps,
    addTipOffer,
    acknowledgeRidePayment,
    confirmPassengerArrival,
    approveProposedFare,
    declineProposedFare,
    terminals,
    liveGpsEnabled,
    simulateMovementEnabled,
    parents,
    parentLinks,
  } = useRides()
  // On by default. Live position is the whole point of the trip screen —
  // it is how the driver finds the passenger and how the family watching at
  // home can see the tricycle move. Off by default meant the safety feature
  // was there only for whoever went looking for the button. The toggle
  // stays, so anyone can stop sharing.
  const [shareLiveGps, setShareLiveGps] = useState(true)
  // The emergency screen (see EmergencySheet): SOS with its countdown,
  // Call 911, the contacts on file. Opened from the SOS button.
  const [emergencyOpen, setEmergencyOpen] = useState(false)
  // "Possible accident detected. Are you OK?" — see lib/crashDetection and
  // CrashPromptModal. Only while this trip is actually under way, and only
  // when Super Admin has turned the detector on.
  const [crashPromptOpen, setCrashPromptOpen] = useState(false)
  const crashDetectionActive = safetySettings.crashDetectionEnabled && ride.status === 'ongoing'
  useCrashDetection(crashDetectionActive, safetySettings.crashSensitivity, () => setCrashPromptOpen(true))
  // A driver waiting on an answer is a driver not moving, and the card that
  // asks for it can arrive while the passenger is scrolled somewhere else on
  // the page. It brings itself into view when it appears.
  const fareApprovalRef = useRef<HTMLDivElement | null>(null)
  const mapSectionRef = useRef<HTMLDivElement | null>(null)
  // Set when the rider taps "I've gotten off" — opens the safety check
  // asking whether they got out where they meant to, or need help.
  const [gotOffAsked, setGotOffAsked] = useState(false)
  // The safety wording is four lines of text above the two buttons that
  // actually answer the question. Behind a ⓘ it stays one tap away for
  // whoever needs it, without standing between everyone else and the answer.
  const [gotOffHelpOpen, setGotOffHelpOpen] = useState(false)
  const [customTipInput, setCustomTipInput] = useState('')
  const {
    position: livePassengerGps,
    error: liveGpsError,
    accuracy: livePassengerAccuracy,
    // The passenger's own phone is in the tricycle once they are aboard, so
    // its heading is the tricycle's heading — see navCamera below.
    headingDegrees: livePassengerHeading,
    speedMps: livePassengerSpeed,
  } = useWatchPosition(liveGpsEnabled || shareLiveGps)

  // Publish this phone's position — often while the driver is still coming,
  // sparingly once the trip is under way.
  //
  // Both phones write the same ride row and each write replaces it whole. At
  // roughly a fix a second from each device, the driver's write carries this
  // phone's last-known passenger position and this phone's write carries the
  // driver's last-known position, so the two spend the trip reverting each
  // other's newest coordinate to a stale copy. The tricycle marker is the
  // visible casualty: it flips between where the driver is and where the
  // driver was, which looks a great deal like a marker that has stopped.
  //
  // While the driver is still on their way, this position is how they find
  // the passenger, so it goes out at full rate; the tricycle marker is
  // interpolated then anyway, so there is little to lose.
  //
  // Once aboard, it goes out every ten seconds instead. Nothing draws it —
  // the passenger's dot comes from this phone directly — but the driver's
  // screen needs it to notice the two phones parting at the kerb (see
  // separation.ts), and that question is asked in tens of seconds, not tenths.
  // One write per ten driver writes is a collision the marker survives.
  const ONGOING_PUBLISH_MS = 10000
  const lastPublishedAtRef = useRef(0)
  useEffect(() => {
    if (!shareLiveGps) {
      updatePassengerLiveGps(ride.id, null)
      return
    }
    if (ride.status === 'ongoing') {
      const now = Date.now()
      if (now - lastPublishedAtRef.current < ONGOING_PUBLISH_MS) return
      lastPublishedAtRef.current = now
    }
    updatePassengerLiveGps(ride.id, livePassengerGps)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePassengerGps, shareLiveGps, ride.status, ride.id])

  const driver = ride.driverId ? MOCK_DRIVERS.find((d) => d.id === ride.driverId) : null
  // Who is driving and which tricycle it is, shown together while the trip
  // runs. The plate is the thing a passenger can check against the number in
  // front of them, and the thing they would give to anyone who asked where
  // they were.
  const tricycleLabel = driver ? `${driver.name} · TRC ${driver.plateNumber}` : ride.driverName
  const leg = getLegInfo(ride)
  const timeline = buildTimeline(ride)
  const isTerminal = ride.status === 'completed' || ride.status === 'declined' || ride.status === 'cancelled'
  const openSos = alerts.find((a) => a.rideId === ride.id && a.type === 'sos' && isActiveAlert(a))
  // Who is pressing the button — the passenger on this ride, or the guardian
  // watching it — for the incident's log.
  const sosPassenger = passengers.find((p) => p.id === ride.passengerId) ?? null
  const sosActorName =
    sosActorId === ride.passengerId
      ? ride.passengerName
      : parents.find((p) => p.id === sosActorId)?.name ?? passengers.find((p) => p.id === sosActorId)?.name ?? 'Passenger'
  const sosContacts = sosPassenger ? passengerEmergencyContacts(sosPassenger) : []
  const sosDriver = ride.driverId ? drivers.find((d) => d.id === ride.driverId) ?? null : null
  const sosToda = sosDriver?.todaOrgId ? todaOrganizations.find((o) => o.id === sosDriver.todaOrgId) ?? null : null
  // A driver-raised SOS on this trip is told to the passenger in that seat.
  const driverSos = alerts.find(
    (a) => a.triggeredByRole === 'driver' && a.type === 'sos' && isActiveAlert(a) && (a.notifications ?? []).some((n) => n.recipientKind === 'counterpart' && n.recipientId === ride.passengerId),
  )
  // A booking just placed. The map is the answer to "did that work?" — it is
  // where the pickup pin and, in a moment, the driver coming for it are — so
  // it is put in the middle of the screen the instant the trip appears,
  // rather than left below the fold the booking form was scrolled to. Keyed
  // on the ride's id so it fires once per trip, not on every re-render.
  const rideId = ride.id
  useEffect(() => showInMiddleWhenSettled(mapSectionRef.current), [rideId])
  const tripJustStarted = ride.status === 'ongoing'
  useEffect(() => {
    if (!tripJustStarted) return
    const id = requestAnimationFrame(() => showInMiddle(mapSectionRef.current))
    return () => cancelAnimationFrame(id)
  }, [tripJustStarted])
  const awaitingFareApproval = !!ride.pendingApproval
  useEffect(() => {
    if (!awaitingFareApproval) return
    const id = requestAnimationFrame(() => showInMiddle(fareApprovalRef.current))
    return () => cancelAnimationFrame(id)
  }, [awaitingFareApproval])
  const hasDriver = ride.status === 'driver_arriving' || ride.status === 'ongoing'
  // Only a link the parent has actually consented to counts. An unconsented
  // link exists as a pending request, not a working relationship — calling
  // someone who never agreed to be a passenger's guardian is not a safety
  // feature, it's a stranger's phone ringing.
  const guardianLink = showGuardianContact
    ? parentLinks.find((l) => l.studentPassengerId === ride.passengerId && l.consentGiven)
    : null
  const guardian = guardianLink ? parents.find((p) => p.id === guardianLink.parentId) : null
  const contacts: CallContact[] = [
    ...(hasDriver && driver?.phone ? [{ label: `Call ${driver.name}`, phone: driver.phone }] : []),
    ...(hasDriver ? (extraContacts ?? []).filter((c) => c.phone) : []),
    ...(guardian?.phone ? [{ label: `Call ${guardian.name} (guardian)`, phone: guardian.phone }] : []),
  ]

  const isOngoingLeg = ride.status === 'ongoing'
  // DRIVER_BASE_GPS only makes sense as a route endpoint once a driver is
  // actually assigned (driver_arriving) — getDriverMapGps then walks a
  // marker along this exact line, so the two stay visually connected. While
  // still 'requested' there's no driver yet and nothing plots at
  // DRIVER_BASE_GPS, so that line would dead-end at an unmarked point;
  // previewing the trip's own pickup→dropoff route instead keeps the line
  // anchored to the two pins actually shown on the map.
  // On a shared ride the tricycle is driving the first passenger's leg, so
  // that is the road to draw: the marker rides the line instead of floating
  // beside it.
  const legRide = primaryAboardRide(ride, rides)
  const legOngoing = legRide.status === 'ongoing'
  const routeLineOriginForRoute = legOngoing
    ? legRide.pickup.gps
    : hasDriver
      ? legRide.driverLiveGps ?? legRide.driverOriginGps ?? DRIVER_BASE_GPS
      : legRide.pickup.gps
  const routeLineDestinationForRoute = legOngoing
    ? legRide.dropoff.gps
    : hasDriver
      ? legRide.pickup.gps
      : legRide.dropoff.gps
  // Where the drawn route starts from.
  //
  // Normally the leg's own origin — the pickup, or wherever the driver set
  // out. Once the tricycle has demonstrably left that route (see reroute.ts)
  // this becomes the position it actually reached, and useRoute fetches a
  // fresh path from there. Without it the blue line kept describing a road
  // nobody was on for the rest of the trip, along with the distance and the
  // arrival time resting on it.
  const [rerouteFrom, setRerouteFrom] = useState<GeoCoords | null>(null)
  const route = useRoute(rerouteFrom ?? routeLineOriginForRoute ?? null, routeLineDestinationForRoute ?? null)
  // Independent of ride status/leg — always the pickup→destination trip
  // itself, so "how long will the actual ride take" stays visible even
  // while still waiting for a driver, alongside the driver's own ETA to
  // reach you. Falls back to the same simulated per-leg duration the ETA
  // countdown itself uses whenever a real route isn't available yet.
  const tripRoute = useRoute(ride.pickup.gps ?? null, ride.dropoff.gps ?? null)
  const tripDurationSeconds = tripRoute?.durationSeconds ?? ETA_SECONDS_PER_LEG

  const driverGpsInfo = sharedDriverMapGps(ride, rides, route)
  // Road and minutes still ahead, from where the tricycle actually is —
  // shrinking as it moves. See lib/legRemaining.
  const remaining = remainingLeg({
    route,
    vehicleGps: driverGpsInfo?.gps ?? null,
    destination: routeLineDestinationForRoute ?? null,
    legProgress: legRide.legProgress,
  })

  // Anything under this is "close enough to the booked drop-off" — GPS drift
  // and the width of a street should not turn a normal arrival into a
  // "stopped early" record, and the booked place name reads far better than
  // a coordinate.
  const EARLY_DROPOFF_METERS = 150

  // The passenger is in the tricycle, so the vehicle's position is theirs.
  async function confirmArrivalHere() {
    const here = driverGpsInfo?.gps ?? null
    const booked = ride.dropoff.gps ?? null
    if (!here || !booked) {
      confirmPassengerArrival(ride.id)
      return
    }
    const metersShort = Math.round(haversineDistanceMeters(here, booked))
    if (metersShort <= EARLY_DROPOFF_METERS) {
      confirmPassengerArrival(ride.id)
      return
    }
    // Record it now, with coordinates for a name.
    const coordLabel = `${here.lat.toFixed(5)}, ${here.lng.toFixed(5)}`
    confirmPassengerArrival(ride.id, { gps: here, label: coordLabel, metersShort })

    // Then upgrade the name to a real address if the lookup answers within a
    // few seconds. A second dispatch is safe: the reducer keeps the original
    // arrival timestamp, so this only ever replaces the label.
    try {
      const resolved = await Promise.race([
        reverseGeocodeToPhAddress(here),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
      ])
      if (resolved?.label) {
        confirmPassengerArrival(ride.id, { gps: here, label: resolved.label, metersShort })
      }
    } catch {
      // Coordinates stand.
    }
  }
  const passengerGpsInfo = getPassengerMapGps(ride)
  const framing = tripMapFraming(ride.status, ride.legProgress)
  // Ticks while a driver is on the way, so "late" becomes true on its own
  // rather than waiting for something else to redraw the screen.
  const now = useNow(10000, ride.status === 'driver_arriving')
  // Faster, and only while riding: the strip below counts the seconds since
  // the driver's last published fix, and a ten-second tick would make a
  // healthy feed look like it was stalling.
  const tripTick = useNow(1000, ride.status === 'ongoing')
  // Held to the estimate the app actually showed: the real road route where
  // one resolved, the simulated leg otherwise.
  const overdue = driverPickupOverdue(ride, route ? route.durationSeconds : null, now)
  const [keepWaiting, setKeepWaiting] = useState(false)
  // The same shopping list the driver is ticking off, from the customer's
  // side — waiting for an errand is otherwise entirely blind, and "2 of 5
  // bought" is the difference between a driver who is working and one who
  // has forgotten you.
  const errandItems =
    (ride.serviceType === 'pabili' || ride.serviceType === 'buy_medicine') && ride.pabiliItems
      ? ride.pabiliItems.split(',').map((p) => p.trim()).filter(Boolean)
      : []
  const errandBought = errandItems.filter((_, i) => ride.pabiliBoughtIndexes.includes(i)).length
  // Defensive: a MockLocation from before `gps` existed (stale localStorage)
  // has no real coordinate to plot — skip that point rather than crash.
  // Aboard, not waiting: the passenger and the tricycle are the same dot.
  const onBoard = ride.status === 'ongoing'
  // Whoever is actually in the tricycle. A ride booked for somebody else
  // carries their name on it, and that is the person the dot belongs to.
  const passengerDisplayName = ride.passengerName?.trim() || 'You'
  // Anyone else riding with this driver. The "+N" on the tricycle marker
  // counts only who's actually aboard right now (ongoing) — that label is
  // about who's physically in the vehicle. The map dot for where they're
  // headed is looser on purpose: it shows as soon as someone else has
  // booked this driver at all (requested or already being driven to),
  // not only once they've climbed in — a passenger who booked alone
  // should see a stop coming up on their own screen before the tricycle
  // actually pulls over for it, not be surprised by it at the kerb.
  const coRidersOnboard = ride.driverId
    ? rides.filter((r) => r.driverId === ride.driverId && r.status === 'ongoing' && r.id !== ride.id)
    : []
  const coRidersBooked = ride.driverId
    ? rides.filter(
        (r) =>
          r.driverId === ride.driverId &&
          ['requested', 'driver_arriving', 'ongoing'].includes(r.status) &&
          r.id !== ride.id,
      )
    : []
  const sharingWith = coRidersOnboard.length
  const mapPoints: MapPoint[] = [
    // The TODA's terminals, drawn under the trip's own pins. They are not
    // part of this journey, but a passenger watching the map uses them to
    // place themselves — "we just passed the Second Gate" is how people
    // actually read where they are, not by coordinates.
    ...terminals
      .filter((t) => t.isActive && t.gps)
      .map((t) => ({
        id: `terminal-${t.id}`,
        gps: t.gps!,
        color: '#64748b',
        label: t.name,
        icon: 'terminal' as const,
      })),
    ...(ride.pickup.gps ? [{ id: 'pickup', gps: ride.pickup.gps, color: '#0d9488', label: formatAddressLine(ride.pickup.label) }] : []),
    ...(ride.dropoff.gps ? [{ id: 'dropoff', gps: ride.dropoff.gps, color: '#e11d48', label: formatAddressLine(ride.dropoff.label) }] : []),
    // Where everyone else riding along shares off — orange, not the rose
    // this passenger's own dropoff wears, so their own stop still reads as
    // the one that matters at a glance. Same reasoning as the marker label
    // above: a stop nobody here booked shouldn't be a surprise at the kerb.
    ...coRidersBooked
      .filter((r) => r.dropoff.gps)
      .map((r) => ({
        id: `co-dropoff-${r.id}`,
        gps: r.dropoff.gps!,
        color: '#f97316',
        label: `${r.passengerName || 'Another passenger'}'s stop — ${formatAddressLine(r.dropoff.label)}`,
      })),
    ...(driverGpsInfo
      ? [
          {
            id: 'driver',
            gps: driverGpsInfo.gps,
            color: '#2563eb',
            // Riding: the plate, which is the thing being checked. It no
            // longer says "Me" as well — there is a separate dot for that
            // now, drawn from this phone's own GPS, and one marker claiming
            // to be both was the reason the passenger's position looked
            // wrong.
            // Riding: which tricycle, then who is driving it — plate first,
            // same order the driver's own map uses for this dot (see
            // Short: the plate's own digits, then who is riding — mirrors how
            // a driver reads a call sheet ("2005, Celeste"), not the fuller
            // "TRC UTS-2005 · Kuya Nilo" this used to say. The passenger's
            // own name here, not the driver's: the callout is answering
            // "which tricycle is mine", and the fastest check against the
            // plate bolted to the sidecar is the digits, not the letters.
            label: `${driver?.plateNumber?.match(/\d+/)?.[0] ?? driver?.plateNumber ?? 'Tricycle'}-${
              ride.passengerName?.trim().split(/\s+/)[0] ?? 'You'
            }${onBoard && sharingWith > 0 ? ` · +${sharingWith}` : ''}`,
            // Named without waiting for the Names toggle, and named from the
            // moment a driver is assigned rather than only once aboard.
            //
            // Your own dot has always carried your name, so a map with only
            // one label on it named the passenger and left the tricycle — the
            // thing they are actually watching for — as an anonymous marker.
            // Whichever dot is unnamed is the one you then have to work out.
            callout: true,
            alwaysLabel: true,
            pulse: true,
            icon: 'tricycle' as const,
          },
        ]
      : []),
    ...(ride.driverOriginGps && ride.status === 'requested'
      ? [
          {
            id: 'driver-origin',
            gps: ride.driverOriginGps,
            color: '#7c3aed',
            label: `${ride.pendingApproval?.driverName ?? 'Driver'} is starting here`,
            icon: 'tricycle' as const,
          },
        ]
      : []),
    ...(passengerGpsInfo
      ? [
          {
            id: 'passenger',
            gps: passengerGpsInfo.gps,
            color: '#4f46e5',
            label: passengerGpsInfo.isLive ? 'You — live GPS' : 'You — shared pin',
            pulse: passengerGpsInfo.isLive,
          },
        ]
      : []),
    // Your own dot, from your own phone, while the trip is running.
    //
    // Until now the only marker aboard was the tricycle, drawn from the
    // driver's published position — and drivers publish every 30 seconds. The
    // camera meanwhile follows this phone's GPS, which arrives every second.
    // At 25 km/h those are 200 metres apart, so the marker drifted off centre
    // and snapped back twice a minute while the map underneath moved
    // smoothly. On the driver's own screen both came from the same fix, which
    // is why theirs looked right and the passenger's did not.
    //
    // Reading your position from the phone in your hand is both more accurate
    // and more honest: it is where YOU are, not where the tricycle last said
    // it was.
    ...(onBoard && livePassengerGps
      ? [
          {
            id: 'me',
            gps: livePassengerGps,
            color: '#2563eb',
            // Your own name, not "You": the same map is read over a
            // passenger's shoulder and by a parent watching from home, and
            // "You are here" answers a different question for each of them.
            label: passengerDisplayName,
            // No callout of its own. The tricycle above already floats one
            // reading "<plate digits>-<your first name>", so a second bubble
            // naming the passenger put the same name on the map twice, on two
            // dots a few metres apart — and the one worth reading is the one
            // carrying the plate, since that is what gets checked against the
            // sidecar. The name stays on the marker for the legend and the
            // Names toggle; it just stops floating.
            pulse: true,
            icon: 'me' as const,
          },
        ]
      : []),
  ]
  // Whether the two moving dots are actually being fed, said on the map.
  //
  // A marker that has stopped updating looks exactly like one that is
  // standing still, so "the tricycle and the passenger did not move" is a
  // report nobody on either end can act on: it does not say whether the
  // driver's phone stopped publishing, this phone's GPS was refused, or the
  // two devices simply lost each other. Each dot now says where its position
  // came from and how old it is, so the next trip that goes wrong says which
  // half went wrong.
  const liveFeedStrip = (() => {
    const ageSeconds = (iso: string | null | undefined) =>
      iso ? Math.max(0, Math.round((tripTick - new Date(iso).getTime()) / 1000)) : null
    const driverAge = ageSeconds(legRide.driverLiveGpsAt)
    const meState = liveGpsError
      ? { tone: 'text-rose-700', text: 'no GPS' }
      : livePassengerGps
        ? { tone: 'text-emerald-700', text: 'live' }
        : { tone: 'text-amber-700', text: 'waiting for GPS' }
    const driverState = !driverGpsInfo
      ? { tone: 'text-rose-700', text: 'no position' }
      : driverGpsInfo.isLive
        ? { tone: 'text-emerald-700', text: driverAge === null ? 'live' : `live ${driverAge}s ago` }
        : { tone: 'text-amber-700', text: 'estimated — no GPS from driver' }
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1 text-[10px] shadow-lg">
        <span className="flex min-w-0 flex-1 items-center gap-1 truncate">
          <span aria-hidden>🛺</span>
          <span className={`font-semibold ${driverState.tone}`}>{driverState.text}</span>
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-1 truncate">
          <span aria-hidden>🧍</span>
          <span className={`font-semibold ${meState.tone}`}>{meState.text}</span>
        </span>
      </div>
    )
  })()

  const routeLine =
    route && route.points.length > 1
      ? route.points
      : routeLineOriginForRoute && routeLineDestinationForRoute
        ? [routeLineOriginForRoute, routeLineDestinationForRoute]
        : undefined
  // Once underway, framing narrows to just pickup/dropoff (see
  // tripMapFraming) so the view doesn't zoom out around a place nobody's
  // going back to — a co-passenger's stop would fall out of that same
  // narrowing unless it's added back in explicitly.
  const fitPointIds = framing.fitPointIds
    ? [...framing.fitPointIds, ...coRidersBooked.filter((r) => r.dropoff.gps).map((r) => `co-dropoff-${r.id}`)]
    : framing.fitPointIds

  // The map faces the way the ride is going, but only once the passenger is
  // in the tricycle and it is moving.
  //
  // While waiting for a driver, the passenger is standing on a kerb: their
  // phone's heading is whichever way they happen to be facing, and a map that
  // swings round every time they look up the road for the tricycle is a map
  // nobody can use. Waiting is also exactly when they want the wide view of
  // the driver coming towards them, which is what the north-up frame gives.
  //
  // The camera sits on the passenger's own fix rather than the driver's,
  // because it has to agree with the heading turning it — and the heading is
  // coming from this phone.
  // While the tricycle is on its way here, fetch the navigation map. It is
  // wanted the moment this passenger climbs in, which is a bad moment to start
  // downloading a fifth of a megabyte.
  useEffect(() => {
    if (ride.status === 'driver_arriving') preloadNavMap()
  }, [ride.status])

  // Watches the tricycle against the route it is supposed to be on, and asks
  // for a new one when it has clearly gone somewhere else. The streak and the
  // distance thresholds live in reroute.ts, tested there; this only carries
  // the count between readings and moves the origin when it trips.
  const strayRef = useRef({ strayCount: 0 })
  const followedGps = driverGpsInfo?.isLive ? driverGpsInfo.gps : livePassengerGps
  // Said out loud, not only acted on. The reroute above was silent by design
  // — nobody wants a popup for a detour around a jeepney — but silent is the
  // wrong choice for the one case that also matters for safety: the tricycle
  // is now somewhere the plan never described, and family watching from home
  // deserve to know that in the same moment the app does, not by noticing the
  // line on the map has moved.
  const [offRouteMeters, setOffRouteMeters] = useState<number | null>(null)
  // Folded away until asked for. The dialog's real job is answered in one
  // line — a new way is already being found — so a full directory of numbers
  // sitting open by default would make the one time it is actually needed
  // look like every other time it fires.
  const [offRouteNumbersOpen, setOffRouteNumbersOpen] = useState(false)
  useEffect(() => {
    if (ride.status !== 'ongoing' && ride.status !== 'driver_arriving') return
    const decision = nextRerouteDecision(followedGps ?? null, route?.points, strayRef.current)
    strayRef.current = { strayCount: decision.strayCount }
    if (decision.reroute && followedGps) {
      setRerouteFrom(followedGps)
      setOffRouteMeters(Math.round(decision.metersOff))
    }
  }, [followedGps, route, ride.status])

  // Noticing that you have got out.
  //
  // Nobody presses anything at the kerb. The passenger has their bag and
  // their fare in hand and walks off, and the trip stays open behind them —
  // which is how a ride ends at midnight three barangays away, and how a
  // driver's next job starts with the last one still running.
  //
  // When this phone and the tricycle have plainly parted, the safety check
  // this screen already has is opened for them: same question, same answers,
  // just asked at the moment it applies instead of waiting to be found. See
  // separation.ts for why it takes three readings and not one.
  const separationRef = useRef<SeparationState>({ apartCount: 0, asked: false })
  const [apartMeters, setApartMeters] = useState<number | null>(null)
  useEffect(() => {
    if (ride.status !== 'ongoing') {
      separationRef.current = { apartCount: 0, asked: false }
      return
    }
    // Only against a real published position. The interpolated one is drawn
    // from legProgress and would part from this phone the moment the
    // simulation and the road disagree, which is not the passenger leaving.
    const tricycleGps = driverGpsInfo?.isLive ? driverGpsInfo.gps : null
    const decision = nextSeparationDecision(livePassengerGps, tricycleGps, separationRef.current)
    separationRef.current = { apartCount: decision.apartCount, asked: decision.asked }
    if (decision.separated) {
      setApartMeters(Math.round(decision.metersApart ?? 0))
      setGotOffAsked(true)
      setGotOffHelpOpen(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePassengerGps, driverGpsInfo?.gps.lat, driverGpsInfo?.gps.lng, ride.status])

  // A new leg is a new route. Without this the origin stays pinned to
  // wherever the last re-route happened, and arriving at the pickup would
  // draw the trip from a point already behind you.
  useEffect(() => {
    setRerouteFrom(null)
    setOffRouteMeters(null)
    setOffRouteNumbersOpen(false)
    strayRef.current = { strayCount: 0 }
  }, [ride.status, ride.dropoff.gps?.lat, ride.dropoff.gps?.lng])

  // Simulated movement drives the tricycle marker, not this phone — which
  // sits still on a desk — so in that mode the camera follows the marker;
  // centred on the phone, the tricycle drove off the screen as it neared
  // the drop-off. On a real ride the phone in the tricycle is the better
  // fix and stays in use.
  const navCenter = simulateMovementEnabled && driverGpsInfo ? driverGpsInfo.gps : livePassengerGps
  const navCamera =
    ride.status === 'ongoing' && onBoard && navCenter
      ? {
          center: navCenter,
          heading: livePassengerHeading,
          speedMps: livePassengerSpeed,
          rotatePointId: 'driver',
        }
      : null

  // The controls a passenger reaches for mid-trip, pulled out as values
  // rather than left inline: full screen is a fixed layer over the whole
  // page (see RealLiveMap), so anything drawn only in the normal flow below
  // the map — exactly where these two lived — is left behind the moment the
  // map takes the screen. Naming them lets the same JSX render in both
  // places instead of forking it.
  const photoRouteSosRow = (
    <div className="flex items-center gap-2">
      {hasDriver && (
        <PhotoCaptureButton onCapture={(dataUrl) => addSafetyPhoto(ride.id, dataUrl, sosActorId)} />
      )}
      <div className="min-w-0 flex-1 text-center">
        {route && (
          <p className="text-[11px] text-slate-400">
            🛣️ Real road route: {(route.distanceMeters / 1000).toFixed(1)} km · ~
            {Math.max(1, Math.round(route.durationSeconds / 60))} min drive
          </p>
        )}
        {hasDriver ? (
          <p className="flex flex-wrap items-center justify-center gap-x-2 text-xs font-medium text-brand-700">
            <span>
              🛺 {ride.status === 'driver_arriving' ? 'Driver arriving: ' : 'To destination: '}
              {remaining ? `${formatArrives(remaining.seconds, true)} · Distance ${formatKm(remaining.meters)}` : formatEta(leg.etaSeconds)}
            </span>
            <span className="text-[11px] font-medium text-slate-500">
              🏁 ~{Math.max(1, Math.round(tripDurationSeconds / 60))} min trip
            </span>
          </p>
        ) : (
          <p className="text-xs font-medium text-slate-400">
            Map will show your driver's live position once someone accepts.
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => setEmergencyOpen(true)}
        aria-label={sosLabel}
        title={sosLabel}
        className={`flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 transition ${
          openSos
            ? 'animate-pulse border-danger-700 bg-danger-600 text-white'
            : 'border-danger-300 bg-danger-50 text-danger-800 hover:bg-danger-100'
        }`}
      >
        <span className="text-base leading-none">🆘</span>
        <span className="text-[11px] font-semibold">{openSos ? 'Sent' : 'SOS'}</span>
      </button>
    </div>
  )

  // Same reasoning, same fix. Withdrawn once arrival is already confirmed —
  // see the block this replaced for why.
  const gotOffCard =
    allowGotOffCheck && isOngoingLeg && !openSos && !ride.passengerArrivedAt ? (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
        {!gotOffAsked ? (
          <button
            type="button"
            onClick={() => setGotOffAsked(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-400 bg-white py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100"
          >
            <span className="text-base leading-none">🚶</span>
            I've gotten off the tricycle
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-amber-900">
                {apartMeters === null
                  ? 'Did you get off safely?'
                  : `You have moved ${apartMeters}m from the tricycle — did you get off safely?`}
              </p>

              <button
                type="button"
                onClick={() => setGotOffHelpOpen((v) => !v)}
                aria-expanded={gotOffHelpOpen}
                aria-label={gotOffHelpOpen ? 'Hide what this means' : 'What does this mean?'}
                title={gotOffHelpOpen ? 'Hide what this means' : 'What does this mean?'}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold transition ${
                  gotOffHelpOpen
                    ? 'border-amber-500 bg-amber-500 text-white'
                    : 'border-amber-400 bg-white text-amber-700 hover:bg-amber-100'
                }`}
              >
                ⓘ
              </button>
            </div>
            {gotOffHelpOpen && (
              <p className="text-[11px] text-amber-800">
                If you're where you meant to be, finish the ride so your driver and TODA know the trip is done. If
                something's wrong — you were dropped somewhere else, or you don't feel safe — send an SOS instead.
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                void confirmArrivalHere()
                setGotOffAsked(false)
                setApartMeters(null)
              }}
              className="w-full rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700"
            >
              ✅ Yes — I arrived safely
            </button>
            <button
              type="button"
              onClick={() => {
                triggerSos(ride.id, sosActorId)
                setGotOffAsked(false)
                setApartMeters(null)
              }}
              className="w-full rounded-lg border border-danger-500 bg-danger-600 py-2 text-xs font-semibold text-white hover:bg-danger-700"
            >
              🆘 No — I need help, send SOS now
            </button>
            <button
              type="button"
              onClick={() => {
                setGotOffAsked(false)
                setApartMeters(null)
              }}
              className="w-full text-[11px] font-medium text-amber-800 underline"
            >
              Never mind, I'm still on board
            </button>
          </div>
        )}
      </div>
    ) : null

  return (
    <section className="space-y-3 rounded-xl border border-brand-200 bg-brand-50 p-4 shadow-sm">
      {/* The tricycle has plainly left the planned road.
          A quiet reroute already fixed the route the moment this fired — see
          the effect above — so this dialog is not asking permission to do
          that. It exists for the other half of "the road changed": somebody
          should be told, on purpose, rather than left to notice the blue line
          had moved on its own. Proceed says the detour is expected — a closed
          street, a shortcut, a passenger picked up along the way — and SOS
          and the numbers below stay one tap away for the times it is not.

          Held back while the got-off check or an open SOS is already up. A
          single large jump in position can trip both the reroute detector and
          the separation detector at once — the tricycle looks like it left
          the road AND the passenger looks like they left the tricycle — and
          showing both asks the same underlying question twice in two
          different costumes. The got-off check is the more direct one:
          it is asking about the passenger's own safety, not the road's, so
          it wins. */}
      {offRouteMeters !== null && !gotOffAsked && !openSos && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Off the planned route"
        >
          <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-xl border border-amber-300 bg-white shadow-xl">
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5">
              <p className="text-sm font-bold text-amber-900">🚧 OFF WAY</p>
              <p className="mt-0.5 text-[11px] leading-snug text-amber-800">
                {tricycleLabel ?? 'The tricycle'} is now {offRouteMeters}m off the planned road. A new way to{' '}
                {formatAddressLine(ride.dropoff.label)} is already being found.
              </p>
            </div>

            <div className="space-y-2 px-4 py-3">
              <button
                type="button"
                onClick={() => {
                  setOffRouteMeters(null)
                  setOffRouteNumbersOpen(false)
                }}
                className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700"
              >
                ✅ Proceed — this is expected
              </button>
              <button
                type="button"
                onClick={() => triggerSos(ride.id, sosActorId)}
                disabled={!!openSos}
                className="w-full rounded-lg border border-danger-500 bg-danger-600 py-2.5 text-sm font-bold text-white transition hover:bg-danger-700 disabled:cursor-not-allowed disabled:border-danger-300 disabled:bg-danger-300"
              >
                {openSos ? '🆘 SOS sent' : '🆘 Send SOS'}
              </button>

              <button
                type="button"
                onClick={() => setOffRouteNumbersOpen((v) => !v)}
                aria-expanded={offRouteNumbersOpen}
                className="w-full rounded-lg border border-slate-300 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                {offRouteNumbersOpen ? '▼' : '▶'} 📞 Contact numbers
              </button>

              {offRouteNumbersOpen && (
                <div className="space-y-2">
                  {contacts.length > 0 && (
                    <div className="space-y-1.5">
                      {contacts.map((c) => (
                        <a
                          key={c.phone}
                          href={`tel:${c.phone}`}
                          className="flex items-center justify-between gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-800 hover:bg-brand-100"
                        >
                          <span className="truncate">📞 {c.label}</span>
                          <span className="shrink-0 text-brand-600">{c.phone}</span>
                        </a>
                      ))}
                    </div>
                  )}
                  {/* The full directory, scoped to where this trip is — a
                      guardian and the driver are two numbers; a genuine
                      emergency may need police, fire or medical instead, and
                      those live here rather than being invented on this
                      screen. */}
                  <EmergencyHotlines
                    province={ride.pickup.province}
                    city={ride.pickup.city}
                    title="SOS numbers"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {ride.status === 'completed' && onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="w-full rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700"
        >
          {ride.payment?.status === 'paid' ? '✓ Done — book another ride' : 'Book another ride'}
        </button>
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-brand-800">{title}</h2>
        <StatusBadge status={ride.status} />
      </div>
      {(() => {
        const tag = rideServiceTag(ride)
        return tag ? (
          <p className="text-sm text-slate-700">
            {tag.icon} {tag.label}
          </p>
        ) : null
      })()}
      {(ride.serviceType === 'pabili' || ride.serviceType === 'buy_medicine') && ride.pabiliItems && (
        <p className="rounded-lg bg-white p-2 text-xs text-slate-600">🛒 {ride.pabiliItems}</p>
      )}
      {ride.serviceType === 'padala' && ride.packageNote && (
        <p className="rounded-lg bg-white p-2 text-xs text-slate-600">📦 {ride.packageNote}</p>
      )}
      {ride.serviceType === 'buy_medicine' &&
        (ride.prescriptionDataUrls.length > 0 || ride.seniorIdDataUrl || ride.otherDocDataUrl) && (
          <div className="space-y-1 rounded-lg bg-white p-2">
            <p className="text-[11px] font-medium text-slate-500">Documents to show the pharmacy</p>
            <div className="flex flex-wrap gap-2">
              {ride.prescriptionDataUrls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer">
                  <img src={url} alt={`Prescription page ${i + 1}`} className="h-14 w-14 rounded-md object-cover" />
                </a>
              ))}
              {ride.seniorIdDataUrl && (
                <a href={ride.seniorIdDataUrl} target="_blank" rel="noreferrer">
                  <img src={ride.seniorIdDataUrl} alt="Senior Citizen ID" className="h-14 w-14 rounded-md object-cover" />
                </a>
              )}
              {ride.otherDocDataUrl && (
                <a href={ride.otherDocDataUrl} target="_blank" rel="noreferrer">
                  <img src={ride.otherDocDataUrl} alt="Other document" className="h-14 w-14 rounded-md object-cover" />
                </a>
              )}
            </div>
          </div>
        )}
      {tricycleLabel && ride.status !== 'requested' && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
          <span aria-hidden className="text-lg leading-none">🛺</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-extrabold text-slate-800">{tricycleLabel}</span>
            <span className="block text-[10px] text-slate-500">Naka-record ang biyahe mo sa tricycle na ito.</span>
          </span>
        </div>
      )}

      {/* The destination is asked for once, in the strip under the map. It
          used to be asked here as well, and in a modal over the whole screen
          — three places for one answer. */}

      <p className="text-sm font-bold text-slate-800">Fare: ₱{ride.fareEstimate}</p>
      {(ride.pabiliTip > 0 || ride.tipOffer > 0 || ride.passengerCount > 1) && (
        <p className="text-xs text-slate-500">
          {[
            ride.pabiliTip > 0 ? `+₱${ride.pabiliTip} tip` : null,
            ride.tipOffer > 0 ? `+₱${ride.tipOffer} tip offer` : null,
            ride.passengerCount > 1 ? `👥 ${ride.passengerCount} passengers` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}

      {/* Locked in and non-interactive until the trip is actually
          completed, so there was nothing to do here while riding — hidden
          for that whole stretch instead of shown disabled. Reappears the
          moment it does something: confirming/correcting how the fare was
          paid, which is what closes the ride out and returns to booking. */}
      {ride.status === 'completed' && (
        <div>
          <div className="mb-1 flex items-center gap-2">
            <p className="text-xs font-medium text-slate-500">Payment method</p>
            {ride.payment?.status === 'paid' && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                ✓ Paid
              </span>
            )}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {PAYMENT_METHODS.map((m) => {
              const isSelected = ride.paymentMethod === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    acknowledgeRidePayment(ride.id, m.id)
                    // Straight back to the booking menu — the ride is settled
                    // and there is nothing left to read on this card.
                    onDismiss?.()
                  }}
                  className={`rounded-lg border py-2 text-xs font-medium transition hover:bg-slate-50 ${
                    isSelected ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 text-slate-600'
                  }`}
                >
                  {m.label}
                </button>
              )
            })}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            {ride.payment?.status === 'paid'
              ? `Paid ${PAYMENT_METHODS.find((m) => m.id === ride.paymentMethod)?.label ?? ''} — tap another method only if that is wrong.`
              : 'Trip complete — tap how you paid to finish and return to booking.'}
          </p>
        </div>
      )}

      {ride.bookedByParentId && <p className="text-xs text-slate-500">📋 Booked by parent</p>}
      {ride.pickupGps && ride.status === 'driver_arriving' && (
        <p className="text-xs text-emerald-700">✓ Your exact GPS location was shared with the driver.</p>
      )}
      {ride.specialPickupRequested && (
        <p className="rounded-lg bg-amber-50 p-2 text-xs font-medium text-amber-700">
          📍 Special pickup requested — the driver comes to your exact spot instead of the Terminal (+₱
          {ride.specialPickupFee} included in the fare above).
        </p>
      )}

      {ride.pendingApproval && (
        <div ref={fareApprovalRef} className="space-y-2 scroll-mt-24 rounded-lg border-2 border-gold-400 bg-gold-50 p-3">
          <p className="text-sm font-semibold text-slate-800">
            🛺 {ride.pendingApproval.driverName} wants to take your ride
          </p>
          {ride.pendingApproval.outOfAreaFee > 0 ? (
            <>
              <p className="text-xs text-slate-600">
                They are starting {ride.pendingApproval.outOfAreaKm.toFixed(1)} km outside your TODA's area, which adds
                ₱{ride.pendingApproval.outOfAreaFee} to the fare.
              </p>
              <div className="rounded-lg bg-white px-2.5 py-1.5 text-xs">
                <div className="flex items-center justify-between text-slate-500">
                  <span>Fare you booked</span>
                  <span>₱{ride.pendingApproval.fareBefore}</span>
                </div>
                <div className="flex items-center justify-between text-slate-500">
                  <span>Out-of-area approach</span>
                  <span>+₱{ride.pendingApproval.outOfAreaFee}</span>
                </div>
                <div className="mt-0.5 flex items-center justify-between border-t border-slate-200 pt-0.5 text-sm font-semibold text-slate-800">
                  <span>New total</span>
                  <span>₱{ride.pendingApproval.fareAfter}</span>
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-600">
              They are inside your TODA's area, so the fare stays ₱{ride.pendingApproval.fareAfter}.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => declineProposedFare(ride.id)}
              className="rounded-lg border border-slate-300 bg-white py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              No — find another
            </button>
            <button
              type="button"
              onClick={() => {
                approveProposedFare(ride.id)
                // The map is what the passenger watches from here on, so it
                // comes to the middle as the card that asked disappears.
                showInMiddle(mapSectionRef.current)
              }}
              className="rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700"
            >
              Accept ₱{ride.pendingApproval.fareAfter}
            </button>
          </div>
        </div>
      )}

      {/* The out-of-area fee, said plainly rather than asked about.
          The approval card above used to be the only place this appeared, and
          the ride no longer waits on it — so without this line a passenger
          whose driver set off from two towns over would simply find the fare
          had changed, with nothing on the screen saying why. Shown once the
          driver is assigned, and only when there is actually a fee. */}
      {ride.outOfAreaFee > 0 && (ride.status === 'driver_arriving' || ride.status === 'ongoing') && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-900">
          <span className="font-semibold">+₱{ride.outOfAreaFee}</span> added to your fare — {ride.driverName ?? 'your driver'} is
          starting {ride.outOfAreaKm.toFixed(1)} km outside your TODA's area. Your total is ₱{ride.fareEstimate}.
        </div>
      )}

      {ride.status === 'cancelled' && ride.cancelledBy === 'driver' && (
        <div className="rounded-lg border-2 border-amber-400 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
          <p className="text-sm font-semibold">This trip was cancelled by your driver</p>
          {ride.cancellationReason && (
            <p className="mt-0.5 font-medium">{RIDE_CANCELLATION_REASON_LABELS[ride.cancellationReason]}</p>
          )}
          {ride.cancellationNote && <p className="mt-0.5">"{ride.cancellationNote}"</p>}
          <p className="mt-1 text-[11px]">
            You have not been charged. Book again and the request goes back out to nearby drivers.
          </p>
          {/* The notice tells them to book again; this is the booking. A
              stranded passenger should not have to find their own way back
              to the form.

              Yellow on purpose, and not the `gold` token: gold is themed, and
              the Royal Blue theme remaps it to a cool steel-grey. That is the
              right call for the quiet accents it was chosen for, but it made
              the one button a stranded passenger needs read as disabled. This
              is the way out of a cancelled trip, so it stays yellow in every
              theme, and only goes grey when it genuinely cannot be pressed. */}
          <button
            type="button"
            onClick={() => (onDismiss ? onDismiss() : navigate('/book'))}
            className="mt-2 flex w-full items-center gap-2 rounded-lg bg-gold-400 px-3 py-2 text-left shadow-sm transition hover:bg-gold-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
          >
            <span aria-hidden className="text-lg leading-none">🛵</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-extrabold uppercase tracking-wide text-navy-900">
                Book a new ride
              </span>
              <span className="block text-[10px] font-bold text-navy-900/80">
                Ipapadala ulit ang request sa mga driver malapit sa iyo
              </span>
            </span>
            <span aria-hidden className="text-lg text-navy-900/60">›</span>
          </button>
        </div>
      )}

      {ride.routeAlert && (
        <AlertBanner message="Route deviation detected — the tricycle has drifted off the expected path." />
      )}

      {ride.status === 'driver_arriving' && errandItems.length > 0 && errandBought > 0 && (
        <div className="rounded-lg border border-gold-400/70 bg-gold-50 px-3 py-2.5 text-xs">
          <p className="font-semibold text-slate-700">
            🛒 Shopping — {errandBought} of {errandItems.length} bought
          </p>
          <div className="mt-1 space-y-0.5">
            {errandItems.map((item, i) => (
              <p
                key={`${i}-${item}`}
                className={
                  ride.pabiliBoughtIndexes.includes(i)
                    ? 'text-emerald-700 line-through opacity-70'
                    : 'text-slate-600'
                }
              >
                {ride.pabiliBoughtIndexes.includes(i) ? '☑️' : '⬜'} {item}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* "Your trip hasn't been started yet" used to sit here, asking the
          passenger to remind their driver to press something. The trip now
          starts itself when the tricycle reaches them (see DriverPage), so
          that notice would be telling a passenger to chase a driver about a
          step neither of them has to take.

          What replaces it is the one thing a waiting passenger genuinely
          cannot resolve alone: a driver who is not coming. The reasons are
          mundane — no load, a dead battery, a chain that went — and none of
          them produce a cancellation from the driver's side, because the
          phone that would send it is the thing that failed. */}
      {overdue.late && !keepWaiting && showCancel && onCancel && (
        <div className="space-y-2 rounded-lg border-2 border-amber-400 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
          <p className="text-sm font-semibold">
            🕒 {ride.driverName ?? 'Your driver'} is running late
          </p>
          <p>
            Tinanggap nila ang biyahe {Math.round(overdue.waitedSeconds / 60)} minuto na ang nakalipas at wala pa
            rin sila. Baka walang load, lowbat, o naipit sa daan — hindi nila kayang mag-cancel kung patay ang
            phone.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg bg-amber-600 py-2 text-xs font-bold text-white transition hover:bg-amber-700"
            >
              Cancel · maghanap ng iba
            </button>
            <button
              type="button"
              onClick={() => setKeepWaiting(true)}
              className="rounded-lg border border-amber-300 bg-white py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
            >
              Hintayin ko pa
            </button>
          </div>
        </div>
      )}

      {hasDriver &&
        (driver ? (
          <div className="flex items-center gap-3 rounded-lg bg-white p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
              {driver.name.charAt(0)}
            </div>
            <div className="text-sm">
              <p className="font-medium text-slate-800">{driver.name}</p>
              <p className="text-xs text-slate-500">
                Plate {driver.plateNumber} · ★ {driver.rating}
              </p>
            </div>
          </div>
        ) : null)}

      {/* No "Call <driver>" row here any more — the footer's Contact tile
          already lists the driver, and the off-route panel below keeps its
          own copy of the numbers for the moment they are actually needed. */}
      {!driver && !isTerminal && ride.status === 'requested' && (
        <div className="space-y-1">
          <p className="text-xs text-slate-500">
            Looking for a nearby driver…{' '}
            {(() => {
              const { openToAll, remainingSeconds } = getDispatchWindow(ride, todaQueueWindowMs, specialPickupEscalationMs)
              if (openToAll) return 'open to all nearby TODAs.'
              const org = todaOrganizations.find((o) => o.id === ride.priorityTodaOrgId)
              const offeredDriver = drivers.find((d) => d.id === ride.priorityQueueOfferedDriverId)
              const escalationNote = ride.specialPickupRequested
                ? `${Math.ceil(remainingSeconds / 60)}m left before it opens to any of ${org?.name ?? 'the TODA'}'s members and freelance drivers`
                : `${remainingSeconds}s left before it opens to other TODAs/freelancers`
              return `currently offered to ${offeredDriver?.name ?? 'the next driver'} at ${
                org?.name ?? 'the nearest TODA'
              }'s terminal Pila — ${escalationNote}.`
            })()}
          </p>
          {ride.priorityQueueLog.length > 0 && (
            <p className="text-[11px] text-slate-400">
              Already passed:{' '}
              {ride.priorityQueueLog
                .map((entry) => `${entry.driverName} (${entry.outcome === 'declined' ? 'declined' : 'no response'})`)
                .join(', ')}
            </p>
          )}

          <div className="rounded-lg border border-dashed border-brand-300 bg-white p-2.5">
            <p className="text-xs font-medium text-slate-700">
              {ride.tipOffer > 0 ? `Tip offer: ₱${ride.tipOffer}` : 'No driver yet? Add a tip to get noticed.'}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {[10, 20, 50].map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => addTipOffer(ride.id, amount)}
                  className="rounded-full border border-brand-300 px-2.5 py-1 text-[11px] font-medium text-brand-700 hover:bg-brand-50"
                >
                  +₱{amount}
                </button>
              ))}
              <input
                type="number"
                min={1}
                value={customTipInput}
                onChange={(e) => setCustomTipInput(e.target.value)}
                placeholder="Custom"
                className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-[11px]"
              />
              <button
                type="button"
                onClick={() => {
                  const amount = Math.round(Number(customTipInput))
                  if (!Number.isFinite(amount) || amount <= 0) return
                  addTipOffer(ride.id, amount)
                  setCustomTipInput('')
                }}
                className="rounded-full border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {!isTerminal && (
        <div ref={mapSectionRef} className="scroll-mt-24 space-y-1.5">
          {allowLiveGpsToggle && ride.status === 'driver_arriving' && (
            <>
              <button
                type="button"
                onClick={() => setShareLiveGps((v) => !v)}
                className={`w-full rounded-lg border py-1.5 text-xs font-medium transition ${
                  shareLiveGps
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {shareLiveGps
                  ? '📡 Sharing your live GPS location — tap to stop'
                  : '📡 Share my live GPS location while I wait'}
              </button>
              {/* Same line the driver gets, for the same reason: a dot that
                  does not move has several causes and they are indistinguish-
                  able from the map. See GpsDiagnosticLine. */}
              <GpsDiagnosticLine
                enabled={shareLiveGps}
                position={livePassengerGps}
                accuracy={livePassengerAccuracy}
                error={liveGpsError}
              />
            </>
          )}
          <RealLiveMap
            points={mapPoints}
            routeLine={routeLine}
            progressPointId="driver"
            // Both ends are settled on a trip screen; the pickup/destination
            // label reads them out, so no legend — it sits at the top instead.
            hideLegend
            routeIsReal={!!route}
            routeVariant={ride.status === 'driver_arriving' ? 'pickup' : 'trip'}
            refitSignal={framing.phase}
            followAll={framing.followAll}
            fitPointIds={fitPointIds}
            frozen={framing.frozen}
            nav={navCamera}
            // Drawn by the map as a row above itself, under its toolbar —
            // outside the map, so no road is hidden under it, yet still
            // inside the frame that goes full screen, so it comes along.
            // Matches the same header on the driver's own map: the same
            // trip, read the same way from either seat.
            overlayTop={
              <div className="space-y-0.5 text-[11px] leading-tight">
                <p className="truncate">
                  <span className="font-semibold text-pickup-accent">📍 </span>
                  {formatAddressLine(ride.pickup.label)}
                </p>
                <p className="truncate">
                  <span className="font-semibold text-dest-accent">🏁 </span>
                  {formatAddressLine(ride.dropoff.label)}
                </p>
              </div>
            }
            overlayBottom={
              onBoard
                ? (fullscreen) => (
                    <div className="space-y-1.5">
                      {liveFeedStrip}
                      {/* Full screen leaves everything below the map behind —
                          the same problem overlayTop already solves for the
                          addresses above it. The photo, the route/ETA
                          readout, SOS, and the "I got off" check are what a
                          passenger actually reaches for mid-trip, so they
                          come along too rather than requiring a trip back out
                          of full screen first. Wrapped for legibility over
                          the map itself — normal flow keeps its own plain
                          background, which already sits on the page. */}
                      {fullscreen && (
                        <>
                          <div className="rounded-lg bg-white/90 p-1.5 shadow-lg backdrop-blur-sm">
                            {photoRouteSosRow}
                          </div>
                          {gotOffCard}
                        </>
                      )}
                    </div>
                  )
                : undefined
            }
            // This is the map a passenger or a parent is actually watching
            // for the length of a ride, not one sitting mid-page among other
            // things to read — the trap a locked map protects against on a
            // booking form doesn't apply here, and a lock only cost every
            // reader a tap on the palm icon before they could look closer.
            alwaysInteractive
          />
          {/* A trip nobody booked needs to say out loud that it exists.
              The passenger got into a tricycle off the street and the app
              recorded it without being asked, so the one thing it owes them
              is the plain statement that it did — who they are with, and
              that someone else can see it. Sitting directly above the camera
              and the SOS, because those are the two things a person reaches
              for when a ride stops feeling right. */}
          {photoRouteSosRow}

        </div>
      )}

      {/* Directly under the map, and outside its block: the terminal flow
          draws no map at all, and a passenger there needs the way out just
          as much as one watching a tricycle approach.

          It used to disappear the moment a driver accepted — the exact moment
          a passenger is most likely to want it. Plans change, someone else
          stops, the wait turns out longer than the walk. Leaving them no way
          out taught them to stand the driver up instead, which costs the
          driver more than a cancellation would.

          It stops once the trip is underway: cancelling a ride you are
          sitting in is not a cancellation, it is getting out, and the
          drop-off flow handles that with a fare attached. */}
      {showCancel && onCancel && (ride.status === 'requested' || ride.status === 'driver_arriving') && (
        <div className="space-y-1">
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-lg border border-amber-300 bg-white py-2 text-sm font-medium text-amber-700 hover:bg-amber-50"
          >
            {ride.status === 'requested' ? 'Cancel request' : 'Cancel trip'}
          </button>
          {ride.status === 'driver_arriving' && (
            <p className="text-center text-[11px] text-slate-500">
              {ride.driverName ?? 'Your driver'} is already on the way — cancel only if you really cannot ride.
            </p>
          )}
        </div>
      )}

      {/* The passenger said they were out, and the trip is still running.
          Confirming arrival stamps a time and an actual drop-off point — it
          is a safety record, and deliberately does not end the ride, because
          normally the driver closes it out a moment later with the fare
          settled between them.

          When that moment never comes, the passenger is stranded inside a
          trip they have already left: an ongoing ride blocks the next
          booking, so the app becomes unusable until someone else acts. A
          driver whose phone died, or who simply forgot, should not be able
          to lock a passenger out of the service.

          So the passenger can close it themselves, but only after saying
          they got off, and only while the driver has not — the ordinary path
          is untouched and this appears solely when it has failed. */}
      {onFinishTrip && ride.passengerArrivedAt && ride.status === 'ongoing' && (
        <div className="rounded-xl border border-slate-300 bg-white p-3">
          <p className="text-xs text-slate-600">
            Hindi pa tinatapos ng driver ang biyahe. Kung nakababa ka na, ikaw na ang magsara nito para
            makapag-book ulit.
          </p>
          <button
            type="button"
            onClick={onFinishTrip}
            className="mt-2 w-full rounded-lg border border-slate-400 bg-white py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Tapusin ang biyahe
          </button>
        </div>
      )}

      {/* Safety check for getting out of the tricycle. Only offered while a
          trip is actually underway — before that the rider hasn't boarded,
          and afterwards the ride is already closed. Withdrawn once arrival
          is already confirmed: without this, a passenger who has just
          answered "yes, I got off safely" kept seeing the exact same
          question sitting right next to "Tapusin ang biyahe" — the fallback
          for a driver who never closed the ride — as if nothing had
          happened yet. */}
      {gotOffCard}

      {driverSos && !openSos && (
        <div className="rounded-lg border-2 border-danger-600 bg-danger-100 p-3">
          <p className="text-xs font-bold text-danger-900">🚨 Your driver raised an emergency SOS</p>
          <p className="mt-0.5 text-[11px] text-danger-800">TodaSafeRide and the TODA have been told. If you are in danger, use the SOS or call 911.</p>
          <button
            type="button"
            onClick={() => setEmergencyOpen(true)}
            className="mt-2 w-full rounded-lg bg-danger-600 py-2 text-xs font-semibold text-white hover:bg-danger-700"
          >
            Open emergency screen
          </button>
        </div>
      )}

      {crashPromptOpen && (
        <CrashPromptModal
          timeoutSeconds={safetySettings.crashTimeoutSeconds}
          onOk={() => {
            logPossibleCrash({ actorId: sosActorId, role: 'passenger', rideId: ride.id, location: livePassengerGps ?? driverGpsInfo?.gps ?? null, outcome: 'ok' })
            setCrashPromptOpen(false)
          }}
          onSendSos={() => {
            setCrashPromptOpen(false)
            triggerSos(ride.id, sosActorId)
          }}
          onTimeout={() => {
            logPossibleCrash({ actorId: sosActorId, role: 'passenger', rideId: ride.id, location: livePassengerGps ?? driverGpsInfo?.gps ?? null, outcome: 'timeout' })
            setCrashPromptOpen(false)
            triggerSos(ride.id, sosActorId, 'automatic_crash_detection', livePassengerGps ?? driverGpsInfo?.gps ?? null)
          }}
        />
      )}

      {emergencyOpen && (
        <EmergencySheet
          role="passenger"
          ride={ride}
          actorName={sosActorName}
          location={livePassengerGps ?? driverGpsInfo?.gps ?? null}
          contacts={sosContacts}
          counterpart={sosDriver?.phone ? { label: sosDriver.name, phone: sosDriver.phone } : null}
          toda={sosToda?.contactPhone ? { name: sosToda.name, phone: sosToda.contactPhone } : null}
          activeAlert={openSos ?? null}
          countdownSeconds={safetySettings.sosCountdownSeconds}
          onSendSos={() => triggerSos(ride.id, sosActorId)}
          onCancelSos={(id) => cancelAlert(id, sosActorName, 'passenger')}
          onLogEvent={(id, kind, summary) => logAlertEvent(id, kind, summary, sosActorName, 'passenger')}
          onClose={() => setEmergencyOpen(false)}
        />
      )}

      {openSos && (
        <div className="overflow-hidden rounded-lg border-2 border-danger-600 bg-danger-100">
          <p className="animate-pulse px-3 pt-2 text-xs font-bold text-danger-900">🚨 EMERGENCY — SOS sent</p>
          <div className="px-3 pb-3 pt-1">
              <p className="text-xs text-danger-800">{openSos.notes}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {openSos.guardianNotifiedPhone && (
                  <a
                    href={`tel:${openSos.guardianNotifiedPhone}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-danger-500 bg-white px-3 py-1.5 text-xs font-semibold text-danger-800 hover:bg-danger-50"
                  >
                    📞 Call guardian {openSos.guardianNotifiedPhone}
                  </a>
                )}
                <a
                  href="tel:911"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-danger-600 bg-danger-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-danger-700"
                >
                  🚑 Call 911
                </a>
              </div>
              {(openSos.status === 'open' || openSos.status === 'acknowledged') && (
                <button
                  type="button"
                  onClick={() => cancelAlert(openSos.id, sosActorName, 'passenger')}
                  className="mt-2 w-full rounded-lg border border-danger-300 bg-white py-2 text-xs font-semibold text-danger-800 hover:bg-danger-50"
                >
                  ✕ False alarm — cancel this SOS
                </button>
              )}
              <button
                type="button"
                onClick={() => setEmergencyOpen(true)}
                className="mt-2 w-full rounded-lg bg-danger-600 py-2 text-xs font-semibold text-white hover:bg-danger-700"
              >
                Open emergency screen
              </button>
          </div>
        </div>
      )}

      {hasDriver && <PhotoGallery photos={ride.safetyPhotos} />}

      <div className="space-y-1 rounded-lg bg-white p-3">
        <p className="mb-1 text-xs font-semibold text-slate-600">Notifications</p>
        {timeline.map((e) => (
          <div key={e.label} className="flex items-center justify-between text-xs text-slate-500">
            <span>{e.label}</span>
            <span>{new Date(e.ts).toLocaleTimeString()}</span>
          </div>
        ))}
      </div>



    </section>
  )
}
