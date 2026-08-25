import { formatAddressLine } from '../lib/addressFormat'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ETA_SECONDS_PER_LEG, useRides } from '../context/RideContext'
import { DRIVER_BASE_GPS, MOCK_DRIVERS, PAYMENT_METHODS } from '../mock/data'
import { showInMiddle, showInMiddleWhenSettled } from '../lib/showInMiddle'
import { StatusBadge } from './StatusBadge'
import { BarangayAddressPicker } from './BarangayAddressPicker'
import { resolvePhAddress, type PhAddressTags } from '../lib/customLocation'
import { DEFAULT_BOOKING_CITY, DEFAULT_BOOKING_PROVINCE, defaultBarangayForCity } from '../mock/data'
import { RealLiveMap, type MapPoint } from './RealLiveMap'
import { AlertBanner } from './AlertBanner'
import { PhotoCaptureButton } from './PhotoCaptureButton'
import { PhotoGallery } from './PhotoGallery'
import { buildTimeline, driverPickupOverdue, formatEta, getDispatchWindow, getLegInfo, getPassengerMapGps, primaryAboardRide, sharedDriverMapGps, tripMapFraming } from '../lib/tracking'
import { haversineDistanceMeters } from '../lib/geo'
import { reverseGeocodeToPhAddress } from '../lib/customLocation'
import { useNow, useWatchPosition } from '../lib/liveTracking'
import { useRoute } from '../lib/routing'
import { RIDE_CANCELLATION_REASON_LABELS } from '../types'
import type { Ride } from '../types'

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
}

export function TripMonitor({
  title,
  ride,
  sosActorId,
  sosLabel,
  showCancel,
  onCancel,
  onDismiss,
  extraContacts,
  allowLiveGpsToggle,
  allowGotOffCheck,
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
    resolveAlert,
    addSafetyPhoto,
    updatePassengerLiveGps,
    addTipOffer,
    acknowledgeRidePayment,
    confirmPassengerArrival,
    approveProposedFare,
    declineProposedFare,
    terminals,
    setRideDestination,
  } = useRides()
  const [shareLiveGps, setShareLiveGps] = useState(false)
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
  const { position: livePassengerGps, error: liveGpsError } = useWatchPosition(shareLiveGps)

  useEffect(() => {
    updatePassengerLiveGps(ride.id, shareLiveGps ? livePassengerGps : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePassengerGps, shareLiveGps, ride.id])

  const driver = ride.driverId ? MOCK_DRIVERS.find((d) => d.id === ride.driverId) : null
  // Who is driving and which tricycle it is, shown together while the trip
  // runs. The plate is the thing a passenger can check against the number in
  // front of them, and the thing they would give to anyone who asked where
  // they were.
  const tricycleLabel = driver ? `${driver.name} · TRC ${driver.plateNumber}` : ride.driverName
  const leg = getLegInfo(ride)
  const timeline = buildTimeline(ride)
  const isTerminal = ride.status === 'completed' || ride.status === 'declined' || ride.status === 'cancelled'
  const openSos = alerts.find((a) => a.rideId === ride.id && a.type === 'sos' && a.status === 'open')
  // A booking just placed. The map is the answer to "did that work?" — it is
  // where the pickup pin and, in a moment, the driver coming for it are — so
  // it is put in the middle of the screen the instant the trip appears,
  // rather than left below the fold the booking form was scrolled to. Keyed
  // on the ride's id so it fires once per trip, not on every re-render.
  const rideId = ride.id
  useEffect(() => showInMiddleWhenSettled(mapSectionRef.current), [rideId])
  const needsDestination = ride.destinationPending === true
  const [askDestination, setAskDestination] = useState(false)
  const movingWithoutDestination = needsDestination && (ride.status === 'ongoing' || ride.status === 'driver_arriving')
  useEffect(() => {
    if (movingWithoutDestination) setAskDestination(true)
  }, [movingWithoutDestination])
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
  const contacts: CallContact[] = [
    ...(hasDriver && driver?.phone ? [{ label: `Call ${driver.name}`, phone: driver.phone }] : []),
    ...(hasDriver ? (extraContacts ?? []).filter((c) => c.phone) : []),
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
  const route = useRoute(routeLineOriginForRoute ?? null, routeLineDestinationForRoute ?? null)
  // Independent of ride status/leg — always the pickup→destination trip
  // itself, so "how long will the actual ride take" stays visible even
  // while still waiting for a driver, alongside the driver's own ETA to
  // reach you. Falls back to the same simulated per-leg duration the ETA
  // countdown itself uses whenever a real route isn't available yet.
  const tripRoute = useRoute(ride.pickup.gps ?? null, ride.dropoff.gps ?? null)
  const tripDurationSeconds = tripRoute?.durationSeconds ?? ETA_SECONDS_PER_LEG

  const driverGpsInfo = sharedDriverMapGps(ride, rides, route)

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
            // Riding: one marker carries both of them, because they are in
            // the same tricycle. The number comes first — it is the thing
            // being checked — and "Ako" says the passenger is aboard rather
            // than watching a driver come towards them.
            label: onBoard
              ? `${driver?.plateNumber ?? 'Tricycle'} · 🧍 Me${sharingWith > 0 ? ` +${sharingWith}` : ''}`
              : `${ride.driverName ?? 'Driver'} — ${driverGpsInfo.isLive ? 'live GPS' : 'estimated'}`,
            callout: onBoard,
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
  ]
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

  return (
    <section className="space-y-3 rounded-xl border border-brand-200 bg-brand-50 p-4 shadow-sm">
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
      {(ride.serviceType === 'pabili' || ride.serviceType === 'buy_medicine') && (
        <p className="text-sm text-slate-700">
          {ride.serviceType === 'pabili' ? '🛍️ Pabili' : '💊 Buy Medicine'}
        </p>
      )}
      {(ride.serviceType === 'pabili' || ride.serviceType === 'buy_medicine') && ride.pabiliItems && (
        <p className="rounded-lg bg-white p-2 text-xs text-slate-600">🛒 {ride.pabiliItems}</p>
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

      {needsDestination && (
        <button
          type="button"
          onClick={() => setAskDestination(true)}
          className="w-full rounded-lg border-2 border-amber-400 bg-amber-50 px-3 py-2 text-left"
        >
          <span className="block text-xs font-extrabold text-amber-900">Saan ka pupunta?</span>
          <span className="block text-[11px] text-amber-800">
            Kailangan pa ng destination para makuha ang tamang pamasahe — tap to add it.
          </span>
        </button>
      )}

      <p className="text-lg font-bold text-slate-800">Fare: ₱{ride.fareEstimate}</p>
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

      {contacts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {contacts.map((c) => (
            <a
              key={c.phone}
              href={`tel:${c.phone}`}
              className="flex items-center gap-1.5 rounded-lg border border-brand-300 bg-white px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
            >
              📞 {c.label}
            </a>
          ))}
        </div>
      )}

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
              {shareLiveGps && liveGpsError && <p className="text-[11px] text-amber-700">{liveGpsError}</p>}
            </>
          )}
          <RealLiveMap
            points={mapPoints}
            routeLine={routeLine}
            routeIsReal={!!route}
            routeVariant={ride.status === 'driver_arriving' ? 'pickup' : 'trip'}
            refitSignal={framing.phase}
            followAll={framing.followAll}
            fitPointIds={fitPointIds}
            frozen={framing.frozen}
          />
          {needsDestination && (
            <button
              type="button"
              onClick={() => setAskDestination(true)}
              className="flex w-full items-center gap-2 rounded-lg bg-gold-400 px-3 py-2 text-left shadow-sm transition hover:bg-gold-500"
            >
              <span aria-hidden className="text-lg leading-none">🏁</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold italic tracking-tight text-navy-900">
                  Saan ka punta?
                </span>
                <span className="block text-[10px] font-bold text-navy-900/80">
                  I-tap para ilagay ang destination — para tama ang pamasahe.
                </span>
              </span>
              <span aria-hidden className="text-lg text-navy-900/60">›</span>
            </button>
          )}
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
                    {formatEta(leg.etaSeconds)}
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
              onClick={() => triggerSos(ride.id, sosActorId)}
              disabled={!!openSos}
              aria-label={sosLabel}
              title={sosLabel}
              className={`flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 transition disabled:cursor-not-allowed ${
                openSos
                  ? 'animate-pulse border-danger-700 bg-danger-600 text-white'
                  : 'border-danger-300 bg-danger-50 text-danger-800 hover:bg-danger-100'
              }`}
            >
              <span className="text-base leading-none">🆘</span>
              <span className="text-[11px] font-semibold">{openSos ? 'Sent' : 'SOS'}</span>
            </button>
          </div>

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

      {/* Safety check for getting out of the tricycle. Only offered while a
          trip is actually underway — before that the rider hasn't boarded,
          and afterwards the ride is already closed. */}
      {allowGotOffCheck && isOngoingLeg && !openSos && (
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
                <p className="text-xs font-semibold text-amber-900">Did you get off safely?</p>
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
                }}
                className="w-full rounded-lg border border-danger-500 bg-danger-600 py-2 text-xs font-semibold text-white hover:bg-danger-700"
              >
                🆘 No — I need help, send SOS now
              </button>
              <button
                type="button"
                onClick={() => setGotOffAsked(false)}
                className="w-full text-[11px] font-medium text-amber-800 underline"
              >
                Never mind, I'm still on board
              </button>
            </div>
          )}
        </div>
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
              <button
                type="button"
                onClick={() => resolveAlert(openSos.id)}
                className="mt-2 w-full rounded-lg border border-danger-300 bg-white py-2 text-xs font-semibold text-danger-800 hover:bg-danger-50"
              >
                ✕ False alarm — cancel this SOS
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

      {askDestination && needsDestination && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Saan ka pupunta"
        >
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <p className="text-sm font-bold text-slate-800">Saan ka pupunta?</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Naka-record na ang biyahe mo{tricycleLabel ? ` kay ${tricycleLabel}` : ''}. Sabihin lang kung saan
              ka bababa para makuha ang tamang pamasahe.
            </p>
            <div className="mt-2 rounded-lg bg-slate-50/70 p-2">
              <BarangayAddressPicker
                label=""
                hideRegionSelects
                defaultProvince={ride.dropoff.province || DEFAULT_BOOKING_PROVINCE}
                defaultCity={ride.dropoff.city || DEFAULT_BOOKING_CITY}
                defaultBarangay={defaultBarangayForCity(ride.dropoff.city || DEFAULT_BOOKING_CITY)}
                onResolve={async (address: PhAddressTags) => {
                  const location = await resolvePhAddress(address)
                  setRideDestination(ride.id, location)
                  setAskDestination(false)
                }}
                onConfirm={() => setAskDestination(false)}
              />
            </div>
            <button
              type="button"
              onClick={() => setAskDestination(false)}
              className="mt-1.5 w-full rounded-lg py-1.5 text-[11px] font-medium text-slate-500 hover:bg-slate-50"
            >
              Mamaya na
            </button>
          </div>
        </div>
      )}


    </section>
  )
}
