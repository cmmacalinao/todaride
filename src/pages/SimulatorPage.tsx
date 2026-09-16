import { useEffect, useRef, useState } from 'react'
import { useRides } from '../context/RideContext'
import { sharedRideScenario, type ScenarioContext, type ScenarioStep } from '../lib/scenarios'
import { createCustomLocation } from '../lib/customLocation'
import { simulatedDriverOrigin } from '../lib/geo'
import { getClsuPlaceGps, getTerminalGps } from '../mock/data'
import { TerminalQuickPanel } from '../components/TerminalQuickPanel'
import { TodaBoundariesPanel } from '../components/TodaBoundariesPanel'
import type { GeoCoords, MockLocation } from '../types'

const EARTH_RADIUS_METERS = 6371000

// A point at an exact distance from `origin`, along the bearing from
// `origin` towards `towards` — great-circle "destination point given
// distance and bearing," not a straight lat/lng interpolation. So "3 km"
// and "1 km" in a scenario are real, checkable distances along one road
// instead of an approximate stand-in.
function pointAtDistance(origin: GeoCoords, towards: GeoCoords, meters: number, label: string): MockLocation {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const toDeg = (rad: number) => (rad * 180) / Math.PI
  const lat1 = toRad(origin.lat)
  const lng1 = toRad(origin.lng)
  const lat2t = toRad(towards.lat)
  const lng2t = toRad(towards.lng)
  const bearing = Math.atan2(
    Math.sin(lng2t - lng1) * Math.cos(lat2t),
    Math.cos(lat1) * Math.sin(lat2t) - Math.sin(lat1) * Math.cos(lat2t) * Math.cos(lng2t - lng1),
  )
  const angular = meters / EARTH_RADIUS_METERS
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing))
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    )
  const gps = { lat: toDeg(lat2), lng: toDeg(lng2) }
  return createCustomLocation(label, gps, { province: 'Nueva Ecija', city: 'Science City of Muñoz', barangay: 'Poblacion' })
}

type PaneRole = 'passenger' | 'parent' | 'driver' | 'pharmacy'

const PANE_PATH: Record<PaneRole, string> = {
  passenger: '/book',
  parent: '/book',
  driver: '/drive',
  pharmacy: '/pharmacy',
}

const ROLE_OPTIONS: { id: PaneRole; name: string }[] = [
  { id: 'passenger', name: 'Passenger' },
  { id: 'parent', name: 'Parent' },
  { id: 'driver', name: 'Driver' },
  { id: 'pharmacy', name: 'Pharmacy / Store' },
]

const PANE_ICON: Record<PaneRole, string> = {
  passenger: '🧑',
  parent: '👪',
  driver: '🛵',
  pharmacy: '💊',
}

function PickerMenu({
  value,
  options,
  onChange,
  title,
  widthClass,
}: {
  value: string
  // A flat list of every driver in the city is a list nobody can find
  // anyone in. Options carry the TODA they belong to, and the menu keeps
  // them under that heading.
  options: { id: string; name: string; group?: string }[]
  onChange: (id: string) => void
  title: string
  widthClass: string
}) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  // Clicking anywhere else closes it — the one thing a native select gives
  // you for free.
  useEffect(() => {
    if (!open) return
    function onDocDown(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [open])

  const current = options.find((o) => o.id === value)

  return (
    <div ref={boxRef} className={`relative ${widthClass}`}>
      <button
        type="button"
        title={title}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-left text-xs text-slate-700 hover:bg-slate-50"
      >
        <span className="truncate">{current?.name ?? '—'}</span>
        <span aria-hidden className="shrink-0 text-[9px] text-slate-400">
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 max-h-64 w-full min-w-[180px] overflow-y-auto rounded-lg border border-slate-300 bg-white p-1 shadow-lg">
          {options.length === 0 && <p className="p-2 text-[11px] text-slate-400">Nothing to pick.</p>}
          {options.map((o, i) => (
            <div key={o.id}>
            {o.group && o.group !== options[i - 1]?.group && (
              <p className="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {o.group}
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                onChange(o.id)
                setOpen(false)
              }}
              className={`block w-full rounded-md px-2 py-1.5 text-left text-xs transition ${
                o.id === value ? 'bg-brand-50 font-semibold text-brand-800' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {o.name}
            </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Two accounts, one ride, side by side on one screen.
//
// Both panes are the real app in an iframe, not a mock-up — same origin, same
// stored state — so an action in one shows up in the other through the same
// cross-tab sync the app already uses. What makes it possible at all is the
// `?as=` pinned session (see SessionContext): the whole app shares one session
// key, so without pinning, the second pane to load would overwrite the first
// and both would end up as the same account. A pinned pane also never writes
// its identity back, so opening this page cannot disturb whoever is really
// logged in.
//
// Simulation aid, not a product surface: it only ever hands out seeded demo
// identities.
// A switch that reads as on or off at a glance — the simulator toolbar is
// scanned, not read, and a checkbox in a row of buttons does not carry that.
function ServiceToggle({
  label,
  title,
  on,
  onChange,
  hint,
}: {
  label: string
  title?: string
  on: boolean
  onChange: (next: boolean) => void
  hint?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      title={`${title ?? label} is ${on ? 'on' : 'off'} for every account — same setting as Admin › Settings & Fees`}
      className={`flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-medium transition ${
        on ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-300 bg-white text-slate-400'
      }`}
    >
      <span
        className={`relative h-3 w-6 rounded-full transition ${on ? 'bg-brand-600' : 'bg-slate-300'}`}
        aria-hidden="true"
      >
        <span
          className={`absolute top-0.5 h-2 w-2 rounded-full bg-white transition-all ${on ? 'left-3.5' : 'left-0.5'}`}
        />
      </span>
      {label}
      {hint && <span className="text-[10px] font-normal text-amber-600">· {hint}</span>}
    </button>
  )
}


function Picker({
  label,
  role,
  id,
  options,
  optionsForRole,
  onRole,
  onId,
}: {
  label: string
  role: PaneRole
  id: string
  options: { id: string; name: string; group?: string }[]
  optionsForRole: (r: PaneRole) => { id: string; name: string; group?: string }[]
  onRole: (r: PaneRole) => void
  onId: (v: string) => void
}) {
  return (
    <div className="flex min-w-[220px] flex-1 basis-[240px] items-center gap-1">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <PickerMenu
        title="Which kind of account this pane shows"
        value={role}
        options={ROLE_OPTIONS}
        widthClass="w-[104px] shrink-0"
        onChange={(next) => {
          onRole(next as PaneRole)
          onId(optionsForRole(next as PaneRole)[0]?.id ?? '')
        }}
      />
      <PickerMenu
        title="Which account of that kind"
        value={id}
        options={options}
        widthClass="min-w-0 flex-1"
        onChange={onId}
      />
    </div>
  )
}

export function SimulatorPage() {
  const {
    passengers,
    parents,
    parentLinks,
    drivers,
    pharmacies,
    rides,
    clearAllRides,
    medsEnabled,
    vendorsEnabled,
    setMedsEnabled,
    setVendorsEnabled,
    terminals,
    todaOrganizations,
    addTerminal,
    removeTerminal,
    setTerminalGps,
    boundaries,
    saveBoundary,
    deleteBoundary,
    requestedDrivers,
    tripLegSeconds,
    setTripLegSeconds,
    requestRide,
    driverProposeAccept,
    approveProposedFare,
    startRide,
    completeRide,
    acknowledgeRidePayment,
    cancelRide,
    simulateMovementEnabled,
    setSimulateMovementEnabled,
  } = useRides()

  // The scripted run. Each tick asks the current step whether the app has
  // reached the state it was waiting for, and only then acts — so the
  // scenario keeps pace with the simulation instead of racing it.
  const [scenarioStep, setScenarioStep] = useState<number | null>(null)
  const [scenarioRiders, setScenarioRiders] = useState(2)
  const scenarioRef = useRef<ScenarioContext | null>(null)
  const scenarioStepsRef = useRef<ScenarioStep[]>([])

  // Driver always on the left — one fixed anchor pane, with every other
  // pane a passenger, is easier to scan across 2/3/4 screens than the
  // driver's position moving depending on how many panes are open.
  const [leftRole, setLeftRole] = useState<PaneRole>('driver')
  const [leftId, setLeftId] = useState(drivers[0]?.id ?? '')
  const [rightRole, setRightRole] = useState<PaneRole>('passenger')
  const [rightId, setRightId] = useState(passengers[0]?.id ?? '')
  // A third, optional pane — parent-watching-the-trip is the common reason to
  // want a third phone up alongside the passenger and driver. Fourth and
  // fifth are the same idea further still: a bigger shared ride has more
  // than one other passenger worth watching at once.
  const [paneCount, setPaneCount] = useState<1 | 2 | 3 | 4 | 5>(2)
  const [thirdRole, setThirdRole] = useState<PaneRole>('parent')
  const [thirdId, setThirdId] = useState(parents[0]?.id ?? '')
  const [fourthRole, setFourthRole] = useState<PaneRole>('passenger')
  const [fourthId, setFourthId] = useState(passengers[1]?.id ?? '')
  const [fifthRole, setFifthRole] = useState<PaneRole>('passenger')
  const [fifthId, setFifthId] = useState(passengers[2]?.id ?? '')
  // Collapsed by default: with 4-5 panes, that many Left/Right/Third/Fourth/
  // Fifth pickers is most of the toolbar's width for something the Saved
  // button already sets up correctly — expand only when a pane needs a
  // manual override.
  const [pickersOpen, setPickersOpen] = useState(false)
  // Same idea for the screen-count buttons themselves — four of them (2/3/4/
  // 5 screens) is a lot of toolbar real estate for a setting that's "pick
  // once and leave alone" the rest of a session.
  const [screenCountOpen, setScreenCountOpen] = useState(false)
  // Bumping this remounts both iframes — the only way to force a reload of a
  // cross-document frame we do not otherwise control.
  const [reloadKey, setReloadKey] = useState(0)

  // When the passenger on one side picks a driver, bring that driver up on
  // the other. The whole point of the split screen is watching both ends of
  // one interaction, and a choice you cannot see the far side of is half a
  // test. Only ever moves the opposite pane, and only to a driver.
  const leftPick = leftRole === 'passenger' ? requestedDrivers[leftId] : null
  useEffect(() => {
    if (!leftPick) return
    setRightRole('driver')
    setRightId(leftPick)
  }, [leftPick])
  const rightPick = rightRole === 'passenger' ? requestedDrivers[rightId] : null
  useEffect(() => {
    if (!rightPick) return
    setLeftRole('driver')
    setLeftId(rightPick)
  }, [rightPick])

  // Whoever actually took the passenger's ride. The pick above only covers
  // the driver a passenger asked for — most trips are taken by whoever
  // dispatch reached, and until now the other pane stayed on some unrelated
  // driver while the trip ran on a phone nobody was looking at.
  function liveDriverFor(passengerId: string): string | null {
    const ride = rides.find(
      (r) =>
        r.passengerId === passengerId &&
        r.driverId !== null &&
        ['accepted', 'driver_arriving', 'ongoing'].includes(r.status),
    )
    return ride?.driverId ?? null
  }
  const leftTripDriver = leftRole === 'passenger' ? liveDriverFor(leftId) : null
  useEffect(() => {
    if (!leftTripDriver) return
    setRightRole('driver')
    setRightId(leftTripDriver)
  }, [leftTripDriver])
  const rightTripDriver = rightRole === 'passenger' ? liveDriverFor(rightId) : null
  useEffect(() => {
    if (!rightTripDriver) return
    setLeftRole('driver')
    setLeftId(rightTripDriver)
  }, [rightTripDriver])

  // Auto-open the concerned members, but only once — the first active ride it
  // catches. Pull that ride's passenger, its driver, and — when the passenger
  // is a linked student — the parent watching, onto the panes, then leave the
  // panes to the user; a scripted run or a new booking later must not keep
  // yanking the panes away from wherever they were manually moved to.
  // Re-enabling the toggle re-arms it, same as a fresh page load.
  const [autoOpenConcerned, setAutoOpenConcerned] = useState(true)
  const autoOpenedRef = useRef(false)
  useEffect(() => {
    if (autoOpenConcerned) autoOpenedRef.current = false
  }, [autoOpenConcerned])
  const activeRide = [...rides]
    .filter((r) => !['completed', 'cancelled', 'declined'].includes(r.status))
    .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())[0]
  useEffect(() => {
    if (!autoOpenConcerned || autoOpenedRef.current || !activeRide) return
    autoOpenedRef.current = true
    setRightRole('passenger')
    setRightId(activeRide.passengerId)
    if (activeRide.driverId) {
      setLeftRole('driver')
      setLeftId(activeRide.driverId)
    }
    const link = parentLinks.find((l) => l.studentPassengerId === activeRide.passengerId)
    if (link) {
      setThirdRole('parent')
      setThirdId(link.parentId)
      setPaneCount((c) => (c === 2 ? 3 : c))
    }
  }, [autoOpenConcerned, activeRide, parentLinks])

  const [addingTerminal, setAddingTerminal] = useState(false)
  const [drawingJurisdiction, setDrawingJurisdiction] = useState(false)
  // Two taps to wipe: a reset that fires on a stray click during a demo is
  // worse than no reset at all.
  const [confirmingReset, setConfirmingReset] = useState(false)
  // How wide each pane is allowed to be. "Phone" pins them to a real handset
  // width so what you see is what a rider sees; "Responsive" lets them fill
  // the window, which is the better view for reading two long forms side by
  // side on a laptop. Layout bugs hide in both, so the toggle matters.
  const [paneMode, setPaneMode] = useState<'phone' | 'responsive'>('responsive')
  // Read inside the resize handler, which is registered once — a ref keeps it
  // current without re-registering the observer on every toggle.
  const paneModeRef = useRef(paneMode)
  paneModeRef.current = paneMode
  // The panes have to end where the window ends, or whatever a phone pins to
  // its bottom edge — the service bar, a sticky action — lands below the fold
  // and looks cut in half. The chrome above them is not a fixed number: the
  // toolbar wraps to a second row on a narrow window, and the announcement
  // strip comes and goes. So measure where the row actually starts rather
  // than subtracting a guess.
  const paneRowRef = useRef<HTMLDivElement>(null)
  const [paneHeight, setPaneHeight] = useState(520)
  useEffect(() => {
    function measure() {
      // The iframe's own top, not the row's: each pane puts a name strip
      // above its frame, and measuring from the row hands that strip's height
      // to the frame as well — which is exactly how much of the phone's
      // bottom bar ended up below the window.
      const frame = paneRowRef.current?.querySelector('iframe')
      const top = frame?.getBoundingClientRect().top ?? paneRowRef.current?.getBoundingClientRect().top
      if (top === undefined) return
      // Measured against the window, not the document, so a page that scrolls
      // does not feed its own scroll back into the height. 14px keeps the
      // pane clear of the window edge rather than butting against it.
      const fits = Math.max(360, Math.round(window.innerHeight - top - 14))
      // 844 is the iPhone 14/15 viewport height at 390 wide — the cap, not
      // a floor: whichever is smaller, the phone's height or the room left
      // under the toolbar, is what the frame gets.
      const next = paneModeRef.current === 'phone' ? Math.min(844, fits) : fits
      setPaneHeight((prev) => (Math.abs(prev - next) > 1 ? next : prev))
    }
    const raf = requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    // One measurement after paint is not enough: the announcement strip
    // arrives late and the toolbar rewraps, each shifting the row down after
    // the height was already chosen. Watching the page above the panes keeps
    // the two in step instead of leaving a stale number behind.
    const observer = new ResizeObserver(measure)
    observer.observe(document.body)
    if (paneRowRef.current?.parentElement) observer.observe(paneRowRef.current.parentElement)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
      observer.disconnect()
    }
  }, [paneMode])

  function optionsFor(role: PaneRole) {
    if (role === 'driver') {
      return [...drivers]
        .map((d) => {
          const org = d.todaOrgId ? todaOrganizations.find((o) => o.id === d.todaOrgId) : null
          const terminal = d.homeTerminalId ? terminals.find((t) => t.id === d.homeTerminalId) : null
          return {
            id: d.id,
            name: `${d.name} · ${d.plateNumber}${terminal ? ` · ${terminal.name}` : ''}`,
            group: org?.name ?? 'Freelance (no TODA)',
          }
        })
        .sort((a, b) =>
          a.group === b.group ? a.name.localeCompare(b.name) : a.group.localeCompare(b.group),
        )
    }
    if (role === 'parent') return parents.map((p) => ({ id: p.id, name: p.name }))
    // Every partner, not just pharmacies — a Pabili store portal is the same
    // surface and is just as worth watching from the other pane.
    if (role === 'pharmacy') return pharmacies.map((p) => ({ id: p.id, name: p.name }))
    return passengers.map((p) => ({ id: p.id, name: p.name }))
  }

  function srcFor(role: PaneRole, id: string) {
    return `${PANE_PATH[role]}?as=${role}&asId=${encodeURIComponent(id)}`
  }

  const activeRides = rides.filter((r) => !['completed', 'cancelled', 'declined'].includes(r.status))

  // Picking a screen count from the toolbar (2/3/4/5) isn't just a resize —
  // it should also point the newly-available panes at whoever is actually
  // live right now, the same "who's in this ride" logic Auto-open concerned
  // uses for the first two panes, extended to fill third/fourth/fifth with
  // the rest of the live cast (other riders sharing a driver, other active
  // bookings) instead of leaving them on stale picks.
  function autoFillActiveMembers(count: 1 | 2 | 3 | 4 | 5) {
    setPaneCount(count)
    const sorted = [...activeRides].sort(
      (a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime(),
    )
    const primary = sorted[0]
    if (!primary) return
    setRightRole('passenger')
    setRightId(primary.passengerId)
    if (primary.driverId) {
      setLeftRole('driver')
      setLeftId(primary.driverId)
    }
    const shown = new Set([primary.passengerId, primary.driverId].filter(Boolean) as string[])
    const extras: { role: PaneRole; id: string }[] = []
    const link = parentLinks.find((l) => l.studentPassengerId === primary.passengerId)
    if (link) extras.push({ role: 'parent', id: link.parentId })
    for (const ride of sorted.slice(1)) {
      if (extras.length >= 3) break
      if (!shown.has(ride.passengerId)) {
        extras.push({ role: 'passenger', id: ride.passengerId })
        shown.add(ride.passengerId)
      }
    }
    const setters: Array<[(r: PaneRole) => void, (id: string) => void]> = [
      [setThirdRole, setThirdId],
      [setFourthRole, setFourthId],
      [setFifthRole, setFifthId],
    ]
    setters.forEach(([setRole, setId], i) => {
      const extra = extras[i]
      if (extra && i < count - 2) {
        setRole(extra.role)
        setId(extra.id)
      }
    })
  }

  // Where the scripted run happens: a real terminal, real campus landmarks and
  // a barangay out of town, so the distances the scenario is about are the
  // app's own and not made up for the demo.
  function buildScenarioContext(riderCount: number): ScenarioContext | null {
    const driver = drivers.find((d) => d.homeTerminalId && d.accessStatus === 'active') ?? drivers[0]
    // Ordinary passengers, not a linked student — this scripted run is about
    // an everyday shared ride, and mixing in a student pulls a parent's
    // attention into a scenario that was never about them.
    const cast = passengers.filter((p) => !p.isStudent).slice(0, riderCount)
    if (!driver || cast.length < riderCount) return null
    const org = todaOrganizations.find((o) => o.id === driver.todaOrgId) ?? null
    const terminal = terminals.find((t) => t.id === driver.homeTerminalId)
    // The terminal is where the places are measured from — the first
    // passenger boards at it, and every destination is walked out along a
    // bearing that starts there.
    const terminalGps = terminal?.gps ?? getTerminalGps(org)
    // The driver, though, starts a short way off it rather than standing
    // exactly on the pickup. A run that begins with driver and passenger at
    // the same coordinate never exercises the approach, the arrival, or the
    // proximity check that guards "Start trip" — which is the part of a
    // pickup most worth rehearsing. 20-30m out (see simulatedDriverOrigin)
    // covers all three in a few seconds.
    const driverGps = terminalGps ? simulatedDriverOrigin(terminalGps, driver.id) : null
    const clsu = { province: 'Nueva Ecija', city: 'Science City of Muñoz', barangay: 'CLSU' }
    const place = (name: string) => createCustomLocation(`${name}, CLSU, Muñoz`, getClsuPlaceGps(name), clsu)
    // The first passenger boards right at the terminal — not a campus
    // landmark near it, the terminal itself — and rides to the nearer of the
    // two stops. Named rather than jittered, since a passenger's own pickup
    // being off by a few hundred meters would be the wrong kind of realism.
    const terminalStop = terminalGps ? createCustomLocation(terminal?.name ?? 'Terminal', terminalGps, clsu) : place('Main Gate')
    // The whole trip, and the "Pumara" flag-down partway through it, at real
    // distances rather than jittered campus points — bearing taken towards
    // Old Market (the same road used elsewhere), then walked out to exact
    // marks along it. Each rider gets their OWN, increasingly farther
    // destination rather than all four converging on one stop: a shared
    // ride's whole story is that different people are going different
    // places, and it's what gives the dynamic passenger panes below
    // something to actually alternate between — four people completing at
    // the same instant would never hand a pane to a later rider at all.
    const bearingTowards = getClsuPlaceGps('Old Market')
    const destinationAt = (meters: number, label: string) =>
      terminalGps ? pointAtDistance(terminalGps, bearingTowards, meters, label) : place('Old Market')
    const destinations = [
      destinationAt(3000, 'Poblacion, Muñoz'),
      destinationAt(4500, 'Bantug, Muñoz'),
      destinationAt(6000, 'Bagong Sikat, Muñoz'),
      destinationAt(7500, 'Villa Cuiz, Muñoz'),
    ]
    const midway = terminalGps ? pointAtDistance(terminalGps, bearingTowards, 1000, 'Crossing, Muñoz') : place('CBAA')
    return {
      rides,
      driverId: driver.id,
      driverGps,
      // Passenger 1 rides the whole 3 km leg from the terminal. Passenger 2
      // flags the tricycle down 1 km in — "Pumara" partway through the trip
      // already underway. Anyone past the second boards further along
      // still, at a nearby campus point.
      riders: cast.map((p, i) => ({
        id: p.id,
        name: p.name,
        pickup:
          i === 0
            ? terminalStop
            : i === 1
              ? midway
              : place(['College of Education', 'Administration Building'][i - 2] ?? 'CBAA'),
        dropoff: destinations[i] ?? destinations[destinations.length - 1],
      })),
      actions: {
        requestRide: (args) =>
          requestRide({
            passengerId: args.passengerId,
            passengerName: args.passengerName,
            pickup: args.pickup,
            dropoff: args.dropoff,
            paymentMethod: 'cash',
            isStudentRide: false,
            isPwdSeniorRide: false,
            pickupGps: args.pickup.gps ?? null,
            passengerCount: 1,
            requestedDriverId: args.requestedDriverId ?? null,
          }),
        driverProposeAccept,
        approveProposedFare,
        startRide,
        completeRide: (rideId) => completeRide(rideId),
        acknowledgeRidePayment: (rideId) => acknowledgeRidePayment(rideId, 'cash'),
      },
    }
  }

  // Mostly driven by the state itself — reacting to `rides` changing is
  // simpler and exactly right, since the step's precondition is a question
  // about the state. But this simulator has its own RideContext instance
  // (the top page, separate from each pane's iframe), synced only through
  // the cross-tab storage-event relay and a single-owner tick lease — and a
  // ride sitting in "requested" with a fare already offered produces no
  // further movement/queue-timeout ticks of its own to relay. If this
  // window loses the lease race, or a relay tick is missed, `rides` can go
  // a long stretch without a new reference and the run stalls on a step
  // that was ready ticks ago. The heartbeat re-asks regardless, so a stuck
  // relay can never wedge a scripted run — it only costs one extra check.
  const scenarioActedAtRef = useRef(0)
  const [scenarioHeartbeat, setScenarioHeartbeat] = useState(0)
  useEffect(() => {
    if (scenarioStep === null) return
    const id = setInterval(() => setScenarioHeartbeat((n) => n + 1), 500)
    return () => clearInterval(id)
  }, [scenarioStep])
  useEffect(() => {
    if (scenarioStep === null) return
    const step = scenarioStepsRef.current[scenarioStep]
    if (!step) {
      setScenarioStep(null)
      return
    }
    const base = scenarioRef.current
    if (!base) return
    if (Date.now() - scenarioActedAtRef.current < 700) return
    const ctx: ScenarioContext = { ...base, rides }
    const subject = step.ready(ctx)
    if (!subject) return
    scenarioActedAtRef.current = Date.now()
    step.run(ctx, subject)
    setScenarioStep((n) => (n === null ? null : n + 1))
  }, [scenarioStep, rides, scenarioHeartbeat])

  function startScenario(riderCount: number) {
    const ctx = buildScenarioContext(riderCount)
    if (!ctx) return
    // The driver's own payment-received card auto-dismisses itself only
    // while movement simulation is on (see DriverPage) — off, it would sit
    // waiting for a tap nobody is there to give during a scripted run. A
    // saved scenario is meant to run start to finish unattended, so it
    // switches this on rather than silently stalling on a Super Admin
    // setting from outside this page.
    if (!simulateMovementEnabled) setSimulateMovementEnabled(true)
    // Long enough to actually watch each passenger's own start and take-off
    // rather than blink and miss it — a scripted run's whole point is
    // showing the pickups and drop-offs happening, not just the end state.
    setTripLegSeconds(60)
    scenarioStepsRef.current = sharedRideScenario(riderCount)
    // From a clean slate. A half-finished run leaves rides attached to the
    // driver — one still waiting to be picked up, say — and the next run then
    // plays out on top of them: extra names in the callout, seats already
    // taken, a trip nobody in the story booked.
    rides
      .filter((r) => ['requested', 'driver_arriving', 'ongoing'].includes(r.status))
      .forEach((r) => cancelRide(r.id))
    scenarioRef.current = ctx
    // Both phones pointed at the people in the story before it begins —
    // driver on the left, first rider on the right.
    setLeftRole('driver')
    setLeftId(ctx.driverId)
    setRightRole('passenger')
    setRightId(ctx.riders[0].id)
    // A third rider is the whole point of the "picked up later, going
    // farther" story — no student in this cast means no parent to fill the
    // third pane, so the second passenger takes it instead, watching
    // themselves flag the tricycle down and ride past the first stop. Every
    // rider past that gets their own pane too, one each, up to a fifth —
    // the whole cast visible and active at once rather than the dynamic-
    // pane effect below having to hide one until a seat frees up.
    if (ctx.riders.length > 1) {
      setThirdRole('passenger')
      setThirdId(ctx.riders[1].id)
      if (ctx.riders.length > 2) {
        setFourthRole('passenger')
        setFourthId(ctx.riders[2].id)
        if (ctx.riders.length > 3) {
          setFifthRole('passenger')
          setFifthId(ctx.riders[3].id)
          setPaneCount(5)
        } else {
          setPaneCount(4)
        }
      } else {
        setPaneCount(3)
      }
    }
    setScenarioStep(0)
  }

  // While a scripted run is active, keep the passenger panes on whoever in
  // the cast currently has a live ride — not a rider who has already been
  // dropped off and paid, whose screen has nothing left to watch. Hides a
  // completed passenger by handing their pane to the next cast member who's
  // still active, so the two passenger slots alternate across the whole
  // cast as the run progresses instead of freezing on the first two riders.
  useEffect(() => {
    if (scenarioStep === null) return
    const cast = scenarioRef.current?.riders ?? []
    if (cast.length === 0) return
    const isActive = (id: string) =>
      rides.some((r) => r.passengerId === id && !['completed', 'cancelled', 'declined'].includes(r.status))
    const activeCastIds = cast.map((r) => r.id).filter(isActive)
    if (activeCastIds.length === 0) return
    const shown = new Set<string>()
    if (leftRole === 'passenger') shown.add(leftId)
    if (rightRole === 'passenger') shown.add(rightId)
    function reassign(currentRole: PaneRole, currentId: string, set: (id: string) => void) {
      if (currentRole !== 'passenger' || isActive(currentId)) {
        if (currentRole === 'passenger') shown.add(currentId)
        return
      }
      const next = activeCastIds.find((id) => !shown.has(id))
      if (next) {
        set(next)
        shown.add(next)
      }
    }
    reassign(thirdRole, thirdId, setThirdId)
    if (paneCount >= 4) reassign(fourthRole, fourthId, setFourthId)
    if (paneCount === 5) reassign(fifthRole, fifthId, setFifthId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioStep, rides, paneCount])


  return (
    <div className="w-full space-y-1.5 px-3 pb-3 pt-1.5">
      {/* Sticky under the fixed header (46px on this page — see NavBar's
          isSimulatorPage branch) rather than scrolling away with the panes
          below it, the same "always at the top" default the app's own
          header already uses — so the reload/reset commands stay reachable
          without hunting for them while scrolled into a tall pane. */}
      {/* Two rows on a phone, wrapping freely above sm.
          //
          Sixteen controls wrapped onto five lines on a handset — half the
          screen spent on a toolbar, above panes that are the actual subject.
          Filling exactly two rows column by column (grid-flow-col with
          grid-rows-2) and scrolling sideways spends two lines instead, and
          the controls stay in the same order. A laptop has the width to wrap
          them properly, so above sm nothing changes. */}
      <section className="sticky top-[46px] z-10 grid auto-cols-max grid-flow-col grid-rows-2 items-center gap-x-1.5 gap-y-1 overflow-x-auto rounded-xl border border-slate-200 bg-white px-2 py-1.5 shadow-sm sm:flex sm:flex-wrap sm:grid-rows-1 sm:overflow-x-visible">
        {/* The saved scenario, one tap away regardless of whatever the pax
            dropdown below is currently set to: Celeste rides the terminal's
            full 3 km leg, Lola Nena pumaras 1 km in and rides on with her,
            and two more (Ces, Elito) flag the tricycle down further along
            still — five panes up (driver + all four riders), everyone
            visible and active at once rather than taking turns for a seat. */}
        <button
          type="button"
          onClick={() => startScenario(4)}
          title="Saved: Celeste (terminal → 3 km) + 3 more flagging the tricycle down along the way — driver and all 4 riders each get their own pane, five screens up"
          className="shrink-0 rounded-lg bg-navy-900 px-2 py-1 text-[11px] font-bold text-gold-400 hover:bg-navy-800"
        >
          👥4 Saved
        </button>
        <button
          type="button"
          onClick={() => setPickersOpen((v) => !v)}
          aria-expanded={pickersOpen}
          title={pickersOpen ? 'Hide the pane pickers' : 'Show the pane pickers — which account each screen displays'}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
        >
          <span aria-hidden className={`inline-block text-[9px] transition-transform ${pickersOpen ? 'rotate-90' : ''}`}>
            ▶
          </span>
          Panes
        </button>
        {pickersOpen && (
          <>
            <Picker
              label="Left"
              role={leftRole}
              id={leftId}
              options={optionsFor(leftRole)}
              optionsForRole={optionsFor}
              onRole={setLeftRole}
              onId={setLeftId}
            />
            <Picker
              label="Right"
              role={rightRole}
              id={rightId}
              options={optionsFor(rightRole)}
              optionsForRole={optionsFor}
              onRole={setRightRole}
              onId={setRightId}
            />
            {paneCount >= 3 && (
              <Picker
                label="Third"
                role={thirdRole}
                id={thirdId}
                options={optionsFor(thirdRole)}
                optionsForRole={optionsFor}
                onRole={setThirdRole}
                onId={setThirdId}
              />
            )}
            {paneCount >= 4 && (
              <Picker
                label="Fourth"
                role={fourthRole}
                id={fourthId}
                options={optionsFor(fourthRole)}
                optionsForRole={optionsFor}
                onRole={setFourthRole}
                onId={setFourthId}
              />
            )}
            {paneCount === 5 && (
              <Picker
                label="Fifth"
                role={fifthRole}
                id={fifthId}
                options={optionsFor(fifthRole)}
                optionsForRole={optionsFor}
                onRole={setFifthRole}
                onId={setFifthId}
              />
            )}
          </>
        )}
        {/* One icon, not four separate buttons — the screen count is a
            pick-once-and-leave-alone setting, so it stays out of the way
            the same as the Panes pickers above until someone actually wants
            to change it. */}
        <button
          type="button"
          onClick={() => setScreenCountOpen((v) => !v)}
          aria-expanded={screenCountOpen}
          title={screenCountOpen ? 'Hide screen count options' : `Currently ${paneCount} screens — tap to change`}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
        >
          <span aria-hidden className={`inline-block text-[9px] transition-transform ${screenCountOpen ? 'rotate-90' : ''}`}>
            ▶
          </span>
          {'⧉'.repeat(paneCount - 1)} {paneCount} screens
        </button>
        {screenCountOpen && (
          <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
            {([1, 2, 3, 4, 5] as const).map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => {
                  autoFillActiveMembers(count)
                  setScreenCountOpen(false)
                }}
                title={`Show ${count} panes side by side, auto-opened to whoever's live right now`}
                className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                  paneCount === count ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {count}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => setAutoOpenConcerned((v) => !v)}
          aria-pressed={autoOpenConcerned}
          title="When on, opens the passenger, driver, and (if a linked student) parent of the first active ride onto the panes — once only, so picks after that are yours"
          className={`shrink-0 rounded-lg border px-2 py-0.5 text-[11px] font-medium transition ${
            autoOpenConcerned
              ? 'border-brand-300 bg-brand-50 text-brand-700'
              : 'border-slate-300 text-slate-600 hover:bg-slate-50'
          }`}
        >
          🔗 Auto-open concerned
        </button>
        <span className="shrink-0 whitespace-nowrap px-0.5 text-[11px] text-slate-400">
          {activeRides.length > 0 ? `${activeRides.length} ride(s) live` : 'no ride yet'}
        </span>
        {/* Plays a whole situation through by itself — booking, accepting,
            approving the fare, starting, the second passenger flagging the
            tricycle down, and both fares settling — so a scenario can be
            watched rather than assembled. */}
        <button
          type="button"
          onClick={() => (scenarioStep === null ? startScenario(scenarioRiders) : setScenarioStep(null))}
          title="Play the two-passenger shared ride from start to finish"
          className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold ${
            scenarioStep === null
              ? 'bg-brand-600 text-white hover:bg-brand-700'
              : 'bg-amber-500 text-white hover:bg-amber-600'
          }`}
        >
          {scenarioStep === null ? `▶ Share-a-ride ×${scenarioRiders}` : '■ Stop'}
        </button>
        {scenarioStep === null && (
          <label
            title="How many passengers share the tricycle in the scripted run"
            className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600"
          >
            🧍
            <select
              value={scenarioRiders}
              onChange={(e) => setScenarioRiders(Number(e.target.value))}
              className="bg-transparent text-[11px] font-semibold outline-none"
            >
              <option value={2}>2 pax</option>
              <option value={3}>3 pax</option>
              <option value={4}>4 pax</option>
            </select>
          </label>
        )}
        {scenarioStep !== null && (
          <span className="shrink-0 whitespace-nowrap px-0.5 text-[11px] font-semibold text-brand-700">
            {scenarioStepsRef.current[scenarioStep]?.label ?? 'Done'}
          </span>
        )}
        <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
          {(['phone', 'responsive'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setPaneMode(mode)}
              title={
                mode === 'phone'
                  ? 'Pin both panes to a real phone width (390px)'
                  : 'Let both panes fill the window'
              }
              className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                paneMode === mode ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {mode === 'phone' ? '📱 Phone' : '↔ Responsive'}
            </button>
          ))}
        </div>
        <ServiceToggle label="💊" title="Medicine" on={medsEnabled} onChange={setMedsEnabled} />
        <ServiceToggle label="🍽️" title="Food" on={vendorsEnabled} onChange={setVendorsEnabled} />
        <label
          title="How long a simulated leg takes. Slower is for showing someone; faster is for testing."
          className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600"
        >
          🐢
          <select
            value={tripLegSeconds}
            onChange={(e) => setTripLegSeconds(Number(e.target.value))}
            className="bg-transparent text-[11px] font-semibold outline-none"
          >
            <option value={12}>12s leg</option>
            <option value={30}>30s leg</option>
            <option value={60}>1 min leg</option>
            <option value={120}>2 min leg</option>
            <option value={300}>5 min leg</option>
            <option value={600}>10 min leg</option>
          </select>
        </label>

        <button
          type="button"
          onClick={() => {
            setDrawingJurisdiction((v) => !v)
            setAddingTerminal(false)
          }}
          aria-expanded={drawingJurisdiction}
          title="Draw a boundary without leaving the simulation"
          className={`shrink-0 rounded-lg border px-2 py-0.5 text-[11px] font-medium transition ${
            drawingJurisdiction
              ? 'border-brand-300 bg-brand-50 text-brand-700'
              : 'border-slate-300 text-slate-600 hover:bg-slate-50'
          }`}
        >
          🗺️ Boundaries
        </button>
        <button
          type="button"
          onClick={() => {
            setAddingTerminal((v) => !v)
            setDrawingJurisdiction(false)
          }}
          aria-expanded={addingTerminal}
          title="Add a terminal without leaving the simulation"
          className={`shrink-0 rounded-lg border px-2 py-0.5 text-[11px] font-medium transition ${
            addingTerminal
              ? 'border-brand-300 bg-brand-50 text-brand-700'
              : 'border-slate-300 text-slate-600 hover:bg-slate-50'
          }`}
        >
          🚏 Terminal
        </button>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="shrink-0 rounded-lg border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
        >
          ↻
        </button>
        {confirmingReset ? (
          <span className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => {
                clearAllRides()
                setConfirmingReset(false)
                setReloadKey((k) => k + 1)
              }}
              className="rounded-lg bg-amber-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-amber-700"
            >
              Clear all rides
            </button>
            <button
              type="button"
              onClick={() => setConfirmingReset(false)}
              className="rounded-lg border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingReset(true)}
            title="Clear every ride and alert so the panes start clean. Accounts and settings are untouched."
            className="shrink-0 rounded-lg border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
          >
            ⟲
          </button>
        )}
      </section>

      {drawingJurisdiction && (
        <TodaBoundariesPanel
          orgs={todaOrganizations.filter((o) => o.verificationStatus === 'approved')}
          terminals={terminals}
          boundaries={boundaries}
          onSave={saveBoundary}
          onDelete={deleteBoundary}
          onClose={() => setDrawingJurisdiction(false)}
        />
      )}

      {addingTerminal && (
        <TerminalQuickPanel
          orgs={todaOrganizations.filter((o) => o.verificationStatus === 'approved')}
          terminals={terminals}
          onAdd={addTerminal}
          onRemove={removeTerminal}
          onMove={setTerminalGps}
          onClose={() => setAddingTerminal(false)}
        />
      )}

      {/* Side by side is the default — seeing driver and passenger at once is
          usually the point, and a stacked layout would just be the two tabs
          again. 1 screen drops down to just the LEFT pane, for when only one
          account's own view matters. In responsive mode each pane's minimum
          width shrinks as more panes join, so three or four panes fit the
          window instead of forcing a scroll that two never needed. Phone
          mode keeps every pane at a real handset width; if the window
          cannot fit all of them at that width, this scrolls sideways
          instead of shrinking them into uselessness. */}
      {/* Phone panes snap. On a real phone the row is wider than the screen
          by design — that is what makes it a row of handsets — so swiping
          sideways used to stop wherever the finger let go, leaving two half
          panes on screen and neither of them readable. snap-mandatory lands
          every swipe on one whole pane. */}
      <div
        ref={paneRowRef}
        className={`flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 sm:snap-none ${
          paneMode === 'phone' ? 'justify-center' : ''
        }`}
      >
        {[
          { key: 'left', role: leftRole, id: leftId },
          ...(paneCount >= 2 ? [{ key: 'right', role: rightRole, id: rightId }] : []),
          ...(paneCount >= 3 ? [{ key: 'third', role: thirdRole, id: thirdId }] : []),
          ...(paneCount >= 4 ? [{ key: 'fourth', role: fourthRole, id: fourthId }] : []),
          ...(paneCount === 5 ? [{ key: 'fifth', role: fifthRole, id: fifthId }] : []),
        ].map((pane) => (
          <div
            key={pane.key}
            // One pane per screen on a phone, whatever the mode.
            //
            // Both modes used to divide the window instead: phone mode fixed
            // each pane at 390px, which is wider than a 375px handset, and
            // responsive mode split the width between them — five panes on a
            // phone came out 180px each, so you were always looking at two
            // half-screens and could read neither. Below sm every pane is the
            // full width of the window and the row snaps to it; from sm up,
            // where there is room to compare panes side by side, the original
            // rules take over.
            className={`flex w-full shrink-0 snap-center flex-col overflow-hidden rounded-xl border bg-white shadow-sm ${
              paneMode === 'phone'
                ? 'max-w-[390px] border-slate-400 shadow-md'
                : paneCount === 5
                  ? 'sm:w-auto sm:min-w-[180px] sm:shrink sm:flex-1 sm:basis-0 border-slate-300'
                  : paneCount === 4
                    ? 'sm:w-auto sm:min-w-[220px] sm:shrink sm:flex-1 sm:basis-0 border-slate-300'
                    : paneCount === 3
                      ? 'sm:w-auto sm:min-w-[280px] sm:shrink sm:flex-1 sm:basis-0 border-slate-300'
                      : 'sm:w-auto sm:min-w-[360px] sm:shrink sm:flex-1 border-slate-300'
            }`}
          >
            <div className="border-b border-slate-200 bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
              {PANE_ICON[pane.role]}{' '}
              {optionsFor(pane.role).find((o) => o.id === pane.id)?.name ?? pane.role}
            </div>
            <iframe
              key={`${pane.key}-${pane.role}-${pane.id}-${reloadKey}`}
              title={`${pane.key} pane`}
              src={srcFor(pane.role, pane.id)}
              style={{ height: paneHeight }}
              className="w-full border-0"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
