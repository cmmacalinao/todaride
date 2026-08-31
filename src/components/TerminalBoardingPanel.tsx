import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRides } from '../context/RideContext'
import { useSession } from '../context/SessionContext'
import { useWatchPosition } from '../lib/liveTracking'
import { formatKm, haversineDistanceMeters } from '../lib/geo'
import { SUSTAINED_MS, movingTogether, trimTrack, type Fix } from '../lib/rideTogether'
import { createCustomLocation } from '../lib/customLocation'
import { CLSU_GPS, driverDispatchGps } from '../mock/data'
import { terminalRideIsFree } from '../lib/terminalFee'
import { PhotoCaptureButton } from './PhotoCaptureButton'
import type { Driver, MockLocation, RidePhoto } from '../types'

// Two tricycles at a terminal can be a few metres apart, so this is the
// radius inside which the app is willing to say "you are probably in this
// one" — wide enough for ordinary GPS wobble on a phone, tight enough that
// it does not sweep in the whole rank.
const SAME_TRICYCLE_METERS = 80

// "Sakay sa Terminal o Pumara" — inline now, not its own page. It used to
// carry its own map (you + every terminal plotted), but that was showing
// almost the same picture as the booking map already on screen above this
// panel — a passenger picking their tricycle doesn't need two maps open to
// do it, they need the one list this actually runs on: which TRC number is
// next to them right now. mapSlot is that same page map, handed down by
// PassengerPage so it renders here — right where "tap map above" actually
// points — instead of a second instance.
export function TerminalBoardingPanel({ onClose, mapSlot }: { onClose: () => void; mapSlot?: ReactNode }) {
  const {
    drivers,
    passengers,
    terminals,
    todaOrganizations,
    rides,
    requestRide,
    setRequestedDriver,
    terminalQrFeeWaived,
    commissionPerRide,
    triggerPassengerSos,
    completeRide,
    alerts,
  } = useRides()
  const feeFree = terminalRideIsFree(terminalQrFeeWaived, commissionPerRide)
  const { currentPassengerId } = useSession()
  const {
    position: watched,
    speedMps: watchedSpeed,
    headingDegrees: watchedHeading,
  } = useWatchPosition(true)
  // This pilot assumes location is on. Where the browser has no fix to give
  // — a laptop, a headless run, a phone still warming up its GPS — the panel
  // carries on from the default booking coordinate rather than stopping to
  // argue about permissions.
  const position = watched ?? CLSU_GPS
  // Fires the auto-start once. Candidates flicker while GPS settles, and a
  // second pass would record a second trip for the same ride.
  const startedRef = useRef(false)
  // Where the passenger has been, and where each nearby tricycle has been,
  // over the last few seconds. Refs rather than state: these are written on
  // every GPS tick and read only by the rule below, so re-rendering the
  // panel for each one would buy nothing.
  const passengerTrack = useRef<Fix[]>([])
  const driverTracks = useRef<Map<string, Fix[]>>(new Map())
  const [heldMs, setHeldMs] = useState(0)
  // More than one tricycle matching at once — see the effect below.
  const [ambiguous, setAmbiguous] = useState(false)
  // Photographs taken before there is a trip to attach them to. Held here
  // and handed to the ride the moment one is recorded — a plate
  // photographed while deciding whether to get in is the same evidence as
  // one photographed after, and throwing it away because the paperwork
  // did not exist yet would be absurd.
  const [pendingPhotos, setPendingPhotos] = useState<RidePhoto[]>([])
  // An SOS this passenger has already raised and nobody has closed yet.
  // Pressing it twice should not file a second one.
  const openSosForMe = alerts.find(
    (a) => a.type === 'sos' && a.status === 'open' && a.triggeredBy === currentPassengerId && !a.rideId,
  )
  // Manual fallback for when the tricycle you are actually in did not make
  // the GPS-radius list — a driver's phone can lag, or you stepped a little
  // past SAME_TRICYCLE_METERS. Typing the plate number everyone can already
  // see painted on the tricycle works regardless of GPS.
  const [trcInput, setTrcInput] = useState('')

  const passengerHasTrip = rides.some(
    (r) => r.passengerId === currentPassengerId && ['requested', 'accepted', 'driver_arriving', 'ongoing'].includes(r.status),
  )


  // Whose GPS matches the passenger's. Drivers already on someone else's trip
  // are excluded — being near them means the tricycle went past, not that you
  // are in it.
  const busyIds = useMemo(
    () =>
      new Set(
        rides
          .filter((r) => r.driverId && ['accepted', 'driver_arriving', 'ongoing'].includes(r.status))
          .map((r) => r.driverId!),
      ),
    [rides],
  )

  const candidates = useMemo(() => {
    if (!position) return []
    return drivers
      .filter((d) => d.verificationStatus === 'approved' && d.accessStatus === 'active' && !busyIds.has(d.id))
      .map((d) => {
        const gps = driverDispatchGps(d, terminals, todaOrganizations)
        return { driver: d, meters: gps ? Math.round(haversineDistanceMeters(gps, position)) : Number.POSITIVE_INFINITY }
      })
      .filter((c) => c.meters <= SAME_TRICYCLE_METERS)
      .sort((a, b) => a.meters - b.meters)
  }, [drivers, terminals, todaOrganizations, position, busyIds])

  // The trip this screen is currently watching, if there is one.
  //
  // A recorded trip belongs here rather than on the booking page: this is the
  // screen somebody opens to answer "is it recording, and where am I", and it
  // already has the map that question is asked against.
  const activeRide = rides.find(
    (r) => r.passengerId === currentPassengerId && ['requested', 'accepted', 'driver_arriving', 'ongoing'].includes(r.status),
  )
  const isRecordingTrip = activeRide?.safetyRecord === true && activeRide.status === 'ongoing'
  const recordedDriver = activeRide?.driverId ? drivers.find((d) => d.id === activeRide.driverId) : null

  // What the app is doing while nothing has been recorded yet, in the order
  // the passenger would ask it: is my phone answering, is there a tricycle
  // near me, is it clear which one, and how much longer.
  const recordingStatus = !watched
    ? "Waiting for your phone's GPS. If you would rather not turn it on, just type the TRC No. below."
    : candidates.length === 0
      ? 'No tricycle near you according to GPS — just type the TRC No. below.'
      : ambiguous
        ? 'Two tricycles are travelling with you — pick the one you are riding in from the list below.'
        : heldMs > 0
          ? `You are moving — recording your trip in ${Math.max(1, Math.ceil((SUSTAINED_MS - heldMs) / 1000))}s…`
          : 'Waiting for the tricycle to move off. Your trip records itself once you set out.'

  // The question that separates the tricycle a passenger is IN from the
  // four they are standing beside: did it pull out when they did, in the
  // same direction, and is it still with them a few seconds later.
  //
  // Proximity alone cannot answer it. At a terminal every tricycle in the
  // rank is within arm's reach and all but one of them is the wrong answer,
  // so the earlier version of this — record whoever is nearest — would have
  // written a stranger's plate into the passenger's history and a trip the
  // driver never made into theirs.
  //
  // Runs on the GPS tick, which is the only clock that matters here, and
  // only on a real fix: the CLSU fallback below is a guess about where the
  // phone is, and a guess is not something to record a trip on.
  useEffect(() => {
    if (startedRef.current || passengerHasTrip) return
    if (!watched || !currentPassengerId) return
    const now = Date.now()
    // Carry the phone's own speed and heading into the track. The boarding
    // rule prefers them over the pair it would otherwise derive — see Fix in
    // rideTogether — and they are the difference between "these two fixes
    // imply movement" and "the phone says it is moving".
    passengerTrack.current = trimTrack(
      [
        ...passengerTrack.current,
        { gps: watched, at: now, speedMps: watchedSpeed, headingDegrees: watchedHeading },
      ],
      now,
    )

    let longestHeld = 0
    const qualified: Driver[] = []
    for (const { driver } of candidates) {
      const gps = driverDispatchGps(driver, terminals, todaOrganizations)
      if (!gps) continue
      const track = trimTrack([...(driverTracks.current.get(driver.id) ?? []), { gps, at: now }], now)
      driverTracks.current.set(driver.id, track)
      const verdict = movingTogether(passengerTrack.current, track)
      if (verdict.together) qualified.push(driver)
      longestHeld = Math.max(longestHeld, verdict.heldMs)
    }

    // Only when the answer is the ONE tricycle. Two can satisfy the rule at
    // once — a tricycle that pulled out a few seconds ahead is on the same
    // road, at the same speed, still inside the separation limit, and looks
    // from the outside exactly like the one carrying you. Taking the nearest
    // of them would be settling a stranger's plate on a coin flip, so the
    // panel keeps waiting instead, and the list below stays available.
    if (qualified.length === 1) {
      startedRef.current = true
      startRecording(qualified[0])
      return
    }
    setAmbiguous(qualified.length > 1)
    setHeldMs(longestHeld)
  }, [watched, candidates, passengerHasTrip, currentPassengerId, terminals, todaOrganizations])

  // Matched against every eligible driver, not just the nearby list — typing
  // the plate is the fallback for exactly the case where GPS missed you.
  // "UTS-2001", "uts2001", or bare "2001" all find the same tricycle.
  const typedMatch = useMemo(() => {
    const q = trcInput.trim().toUpperCase().replace(/^UTS-?/, '')
    if (!q) return null
    return (
      drivers.find(
        (d) =>
          d.verificationStatus === 'approved' &&
          d.accessStatus === 'active' &&
          !busyIds.has(d.id) &&
          d.plateNumber.toUpperCase().replace(/^UTS-?/, '') === q,
      ) ?? null
    )
  }, [trcInput, drivers, busyIds])

  // Either a tricycle this app knows, or just the number painted on the
  // side of one it does not.
  function startRecording(driver: Driver | null, plate?: string) {
    if (!currentPassengerId || !position) return
    // The pickup is simply where they are. No barangay dropdown, no map tap —
    // the phone already knows, and asking would be theatre.
    const pickup: MockLocation = createCustomLocation('FROM', position)
    // Only a registered driver can be "requested" — an unregistered plate
    // has no account to point at.
    if (driver) setRequestedDriver(currentPassengerId, driver.id)
    requestRide({
      passengerId: currentPassengerId,
      passengerName: passengers.find((p) => p.id === currentPassengerId)?.name ?? 'Pasahero',
      pickup,
      // Stands in until the passenger says where they are going. The fare is
      // re-priced the moment they do (see SET_RIDE_DESTINATION).
      dropoff: pickup,
      paymentMethod: 'cash',
      isStudentRide: false,
      isPwdSeniorRide: false,
      pickupGps: position,
      passengerCount: 1,
      requestedDriverId: driver?.id ?? null,
      bookedAtTerminal: true,
      destinationPending: true,
      // The trip is already happening; this records it rather than asking
      // for it. Creates the ride underway, with no platform fee.
      boardedWithDriverId: driver?.id ?? null,
      unregisteredPlate: driver ? null : (plate ?? null),
      initialPhotos: pendingPhotos,
    } as never)
    // Deliberately stays on this screen.
    //
    // It used to navigate straight to the booking page the moment recording
    // began, which took the passenger away from the map they were watching to
    // a page about booking a ride they had already started. The strip above
    // flips to "Recording" here instead, so the answer to "is it recording?"
    // is on the screen they were already looking at.
  }

  return (
    <section className="space-y-2 rounded-xl border border-gold-400 bg-white p-3 shadow-sm">
      <div className="overflow-hidden rounded-lg border-2 border-gold-400 bg-navy-900">
        <p className="bg-gold-400 px-3 py-1.5 text-xs font-extrabold italic tracking-tight text-navy-900">
          Nasa tricycle ka na?
        </p>
        <div className="px-3 py-2.5">
          <p className="text-sm font-extrabold leading-tight text-white">Record mo ang Biyahe</p>
          <p className="text-[11px] text-blue-100">
            Kusang mare-record ito kapag umandar na kayo — hindi mo na kailangang pindutin. Ang destination na
            lang ang itatanong, para sa safety. Libre ito, walang app fee.
          </p>
        </div>
      </div>

      {mapSlot}

      {/* The strip that says whether anything is being recorded yet.
          Nothing is, on this screen — recording begins when the phone and one
          tricycle are measurably travelling together, and at that moment the
          panel closes and the trip screen takes over with the same strip
          reading "Recording". Saying "Record your Trip" here, greyed, is the
          honest half of that pair: this is what is about to happen, and it
          has not happened yet.

          The line beneath is what the app is actually doing meanwhile —
          without it the panel looks inert during the seconds it spends
          deciding, and a passenger who has just sat down starts hunting for a
          button to press, which is the tapping this whole rule exists to
          remove. Shown even with no GPS fix and no tricycle in range: the one
          person who most needs telling is whoever's phone has not answered. */}
      {isRecordingTrip && activeRide ? (
        <div className="rounded-lg border-2 border-danger-300 bg-danger-50 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-extrabold text-danger-800">
              <span aria-hidden className="animate-pulse text-sm leading-none">🔴</span>
              Recording
            </span>
            <button
              type="button"
              onClick={() => completeRide(activeRide.id, activeRide.paymentMethod)}
              className="shrink-0 rounded-lg border border-danger-400 bg-white px-2.5 py-1 text-[11px] font-bold text-danger-800 transition hover:bg-danger-100"
            >
              ⏹ Stop Recording
            </button>
          </div>
          {/* Who, in one line. No address box: the destination is set with
              the red Destination tab and the map above, which is one place to
              answer it and a tap rather than three dropdowns typed on a
              moving tricycle. */}
          <p className="mt-1 text-[11px] leading-snug text-danger-800/80">
            {activeRide.driverName ?? 'Ang driver'}
            {/* Some plates already carry the TRC prefix in the data and some
                do not, so prefixing unconditionally printed "TRC TRC-1023". */}
            {recordedDriver?.plateNumber
              ? ` · ${/^TRC/i.test(recordedDriver.plateNumber) ? '' : 'TRC '}${recordedDriver.plateNumber}`
              : ''}
          </p>
        </div>
      ) : (
        !passengerHasTrip && (
          <div className="rounded-lg border-2 border-slate-200 bg-white px-3 py-2">
            <p className="flex items-center gap-1.5 text-xs font-extrabold text-slate-700">
              <span aria-hidden className="text-sm leading-none opacity-40">🔴</span>
              Record your Trip
            </p>
            <p className="mt-1 text-[11px] leading-snug text-slate-600">{recordingStatus}</p>
          </div>
        )
      )}

      {/* The camera and the panic button, before boarding rather than after.
          Both used to appear only once a trip existed, which put them on the
          far side of the decision they are most needed for: a passenger
          looking at a tricycle and not liking it has no trip, and had no
          button. Photographs taken here travel into the trip if one is
          recorded; the SOS stands on its own and needs no ride at all. */}
      <div className="flex items-center gap-2">
        <PhotoCaptureButton
          onCapture={(dataUrl) =>
            setPendingPhotos((prev) =>
              [
                ...prev,
                {
                  id: `photo-${Date.now()}-${prev.length}`,
                  dataUrl,
                  takenBy: currentPassengerId ?? 'passenger',
                  takenAt: new Date().toISOString(),
                },
              ].slice(-6),
            )
          }
        />
        <p className="min-w-0 flex-1 text-center text-[10px] leading-snug text-slate-500">
          {pendingPhotos.length > 0
            ? `${pendingPhotos.length} litrato — isasama sa record ng biyahe.`
            : 'Kunan ng litrato ang plaka o ang loob bago ka sumakay.'}
        </p>
        <button
          type="button"
          onClick={() => currentPassengerId && triggerPassengerSos(currentPassengerId, watched ?? null)}
          disabled={!currentPassengerId || !!openSosForMe}
          aria-label="SOS"
          className={`flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 transition disabled:cursor-not-allowed ${
            openSosForMe
              ? 'animate-pulse border-danger-700 bg-danger-600 text-white'
              : 'border-danger-300 bg-danger-50 text-danger-800 hover:bg-danger-100'
          }`}
        >
          <span className="text-base leading-none">🆘</span>
          <span className="text-[11px] font-semibold">{openSosForMe ? 'Sent' : 'SOS'}</span>
        </button>
      </div>

      {/* A way back, not just a refusal.
          This used to be a sentence telling the passenger they already had a
          trip and should finish it first — true, but it left them on a screen
          that could do nothing for them, with no way to reach the trip it was
          talking about. It is the trip screen they want; this takes them
          there. */}
      {passengerHasTrip && !isRecordingTrip && (
        <button
          type="button"
          onClick={onClose}
          className="flex w-full items-center gap-2 rounded-lg border-2 border-amber-400 bg-amber-50 px-3 py-2 text-left transition hover:bg-amber-100"
        >
          <span aria-hidden className="animate-pulse text-sm leading-none">🔴</span>
          <span className="min-w-0 flex-1 text-xs font-extrabold text-amber-900">
            You have an ongoing trip — Go back to booking page
          </span>
          <span aria-hidden className="text-lg text-amber-900/60">›</span>
        </button>
      )}


      {!passengerHasTrip && (
        <div>
          {/* The sticker route, which used to live on the previous screen
              and sent people back a page to use. It belongs here, beside
              the typed TRC it is the shortcut for: scanning is the same
              answer to the same question, arrived at without typing. The QR
              is an ordinary link opened by the phone's own camera, so the
              app never asks for camera permission. */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs font-semibold text-slate-700">Point your phone camera at the sticker</p>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
              Open your camera and hold it over the QR inside the tricycle. It opens this app on your
              driver&apos;s trip — no typing.
            </p>
          </div>

          <h2 className="mt-2.5 text-xs font-semibold text-slate-700">Sticker missing? Alin ang TRC No. sa loob?</h2>

          {/* Type it in — the fallback for whenever the tricycle you're
              actually in didn't make the GPS list below (driver's phone
              lagging, or you're just outside the radius). The plate is
              painted right on the tricycle, so this always works. */}
          <div className="mt-1.5 flex items-center gap-1.5">
            <input
              type="text"
              value={trcInput}
              onChange={(e) => setTrcInput(e.target.value)}
              placeholder="I-type ang TRC No. (hal. UTS-2001)"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-brand-500"
            />
            {typedMatch && (
              <button
                type="button"
                onClick={() => {
                  setTrcInput('')
                  startRecording(typedMatch)
                }}
                className="shrink-0 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-brand-700"
              >
                Gamitin
              </button>
            )}
          </div>
          {/* A plate this app has never seen is still worth recording.

              Not every tricycle on the road is a registered TODA SafeRide
              driver, and somebody riding in one of those is exactly who
              most needs a record of where they are. Nothing can be checked
              about it — no account, no phone reporting its position, so no
              movement to compare against — and the panel says so rather
              than implying the app knows more than it does.

              This can only ever be deliberate: the passenger typed the
              number themselves. */}
          {trcInput.trim().length > 0 && !typedMatch && (
            <div className="mt-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2">
              <p className="text-[11px] font-semibold text-amber-900">
                Walang nahanap na TRC {trcInput.trim()}.
              </p>
              <p className="mt-0.5 text-[10px] leading-snug text-amber-800">
                Hindi rehistrado sa TODA SafeRide. Mare-record pa rin ang plaka at kung nasaan ka — pero walang
                pangalan ng driver, at hindi ito kusang magsisimula.
              </p>
              <button
                type="button"
                onClick={() => {
                  const plate = trcInput.trim().toUpperCase()
                  setTrcInput('')
                  startRecording(null, plate)
                }}
                className="mt-1.5 w-full rounded-lg bg-amber-600 py-1.5 text-[11px] font-bold text-white hover:bg-amber-700"
              >
                I-record pa rin ang biyahe
              </button>
            </div>
          )}

          {candidates.length > 0 ? (
            <>
              <p className="mb-1.5 mt-2.5 text-[10px] text-slate-500">
                I-tap ang sinasakyan mo — mare-record agad ang biyahe.
              </p>
              <div className="space-y-1">
                {candidates.map(({ driver, meters }) => {
                  return (
                    <button
                      key={driver.id}
                      type="button"
                      onClick={() => startRecording(driver)}
                      className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left transition hover:bg-slate-50"
                    >
                      <span className="min-w-0 flex-1 truncate text-xs">
                        <span className="font-bold text-slate-800">TRC {driver.plateNumber}</span>
                        <span className="text-slate-500">
                          {' '}
                          · {driver.name}
                          {driver.ratingCount > 0 && ` · ★ ${driver.rating.toFixed(1)}`}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                        {formatKm(meters)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            position && (
              <p className="mt-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-center text-[11px] text-slate-500">
                Walang nakitang tricycle sa tabi mo ayon sa GPS — i-type na lang ang TRC No. sa itaas.
              </p>
            )
          )}
        </div>
      )}

      <p className="text-[11px] leading-snug text-slate-400">
        {feeFree ? 'Walang booking app fee sa biyaheng ito. ' : ''}Naka-record ang pangalan at plaka ng driver,
        kita ng pamilya mo kung nasaan ka, at may SOS kung kailangan.
      </p>
    </section>
  )
}
