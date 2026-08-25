import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRides } from '../context/RideContext'
import { useSession } from '../context/SessionContext'
import { useWatchPosition } from '../lib/liveTracking'
import { haversineDistanceMeters } from '../lib/geo'
import { createCustomLocation } from '../lib/customLocation'
import { CLSU_GPS, driverDispatchGps } from '../mock/data'
import { terminalRideIsFree } from '../lib/terminalFee'
import type { Driver, MockLocation } from '../types'

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
  } = useRides()
  const feeFree = terminalRideIsFree(terminalQrFeeWaived, commissionPerRide)
  const { currentPassengerId } = useSession()
  const { position: watched } = useWatchPosition(true)
  // This pilot assumes location is on. Where the browser has no fix to give
  // — a laptop, a headless run, a phone still warming up its GPS — the panel
  // carries on from the default booking coordinate rather than stopping to
  // argue about permissions.
  const position = watched ?? CLSU_GPS
  const [confirming, setConfirming] = useState<Driver | null>(null)
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

  // Exactly one tricycle in the same spot is not a choice, it is an answer.
  useEffect(() => {
    if (!confirming && candidates.length === 1) setConfirming(candidates[0].driver)
  }, [candidates, confirming])

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

  function startRecording(driver: Driver) {
    if (!currentPassengerId || !position) return
    // The pickup is simply where they are. No barangay dropdown, no map tap —
    // the phone already knows, and asking would be theatre.
    const pickup: MockLocation = createCustomLocation('Kung nasaan ka ngayon', position)
    setRequestedDriver(currentPassengerId, driver.id)
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
      requestedDriverId: driver.id,
      bookedAtTerminal: true,
      destinationPending: true,
    } as never)
    onClose()
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
            Hindi mo na kailangang i-type kung saan ka galing — alam na ng app. I-type lang kung saan ang
            Destination mo.
          </p>
        </div>
      </div>

      {mapSlot}

      {passengerHasTrip && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          May biyahe ka pa ngayon. Tapusin muna iyon bago mag-record ng bago.
        </p>
      )}

      {!passengerHasTrip && (
        <div>
          <h2 className="text-xs font-semibold text-slate-700">Alin ang TRC No. sa loob?</h2>

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
                  setConfirming(typedMatch)
                  setTrcInput('')
                }}
                className="shrink-0 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-brand-700"
              >
                Gamitin
              </button>
            )}
          </div>
          {trcInput.trim().length > 0 && !typedMatch && (
            <p className="mt-1 text-[10px] text-slate-400">Walang nahanap na TRC {trcInput.trim()}.</p>
          )}

          {candidates.length > 0 ? (
            <>
              <p className="mb-1.5 mt-2.5 text-[10px] text-slate-500">
                O piliin — ito ang mga tricycle na nasa tabi mo ngayon, ayon sa GPS.
              </p>
              <div className="space-y-1">
                {candidates.map(({ driver, meters }) => {
                  const isPicked = confirming?.id === driver.id
                  return (
                    <button
                      key={driver.id}
                      type="button"
                      onClick={() => setConfirming(isPicked ? null : driver)}
                      className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition ${
                        isPicked ? 'border-brand-600 bg-brand-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
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
                        {meters} m
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

      {confirming && !passengerHasTrip && (
        <div className="rounded-xl border-2 border-brand-600 bg-white p-3 shadow-sm">
          <p className="text-xs text-slate-600">
            Ire-record ang biyahe mo kay{' '}
            <span className="font-bold text-slate-800">
              {confirming.name} · TRC {confirming.plateNumber}
            </span>
            . Itatanong namin kung saan ka pupunta habang bumibiyahe ka na.
          </p>
          <button
            type="button"
            onClick={() => startRecording(confirming)}
            className="mt-2 w-full rounded-lg bg-brand-600 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
          >
            📍 Record my Trip
          </button>
        </div>
      )}

      <p className="text-[11px] leading-snug text-slate-400">
        {feeFree ? 'Walang booking app fee sa biyaheng ito. ' : ''}Naka-record ang pangalan at plaka ng driver,
        kita ng pamilya mo kung nasaan ka, at may SOS kung kailangan.
      </p>
    </section>
  )
}
