import { formatAddressLine } from '../lib/addressFormat'
import { formatTripRoute } from '../lib/addressFormat'
import { showInMiddle, showInMiddleWhenSettled, scrollViewToTop } from '../lib/showInMiddle'
import { DriverFooterNav } from '../components/DriverFooterNav'
import { PlatformFeeSoa, buildSoa } from '../components/PlatformFeeSoa'
import { DriverPilaPage } from '../components/DriverPilaPage'
import { DriverWalletPanel } from '../components/DriverWalletPanel'
import { TricycleQrPanel } from '../components/TricycleQrPanel'
import { NearbyRequestsBoard, buildNearbyRequests } from '../components/NearbyRequestsBoard'
import type { DrawerSection } from '../components/NavDrawer'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ETA_SECONDS_PER_LEG, useRides } from '../context/RideContext'
import { useSession } from '../context/SessionContext'
import { StatusBadge } from '../components/StatusBadge'
import { RealLiveMap, type MapPoint } from '../components/RealLiveMap'
import { DriverAuthGate } from '../components/DriverAuthGate'
import { alongTheWayFit, isSpecialTrip, seatsLeft } from '../lib/alongTheWay'
import { aboardLabel, shortName } from '../lib/names'
import { EmergencyNumbersButton, EmergencyNumbersPanel } from '../components/EmergencyNumbersPanel'
import { getActiveTodaCommission, DRIVER_BASE_GPS, estimateOutOfAreaBreakdown, getTerminalGps, getTodaQueue, nearestTerminal, PAYMENT_METHODS, terminalsForOrg } from '../mock/data'
import {
  primaryAboardRide,
  formatEta,
  getDispatchWindow,
  getDriverMapGps,
  sharedDriverMapGps,
  getLegInfo,
  getPassengerMapGps,
  isRideVisibleToDriver,
  isWithinRetentionDays,
  tripMapFraming,
  forgotToStartTrip,
} from '../lib/tracking'
import {
  DROPOFF_PROXIMITY_METERS,
  AUTO_START_METERS,
  formatKm,
  simulatedDriverOrigin,
  PICKUP_PROXIMITY_METERS,
  TERMINAL_PROXIMITY_METERS,
  getCurrentGeoPosition,
  haversineDistanceMeters,
} from '../lib/geo'
import { useNow, useWatchPosition } from '../lib/liveTracking'
import { useRoute } from '../lib/routing'
import { TodaAdminPage } from './TodaAdminPage'
import { alertsForToda } from '../lib/alertRouting'
import { AnnouncementFeed } from '../components/AnnouncementFeed'
import { RIDE_CANCELLATION_REASON_LABELS } from '../types'
import type { GeoCoords, PaymentMethod, Ride, RideCancellationReason } from '../types'

type EarningsFilter = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'all'

const EARNINGS_FILTER_LABELS: Record<EarningsFilter, string> = {
  daily: 'Today',
  weekly: 'This week',
  monthly: 'This month',
  yearly: 'This year',
  all: 'All time',
}

function matchesEarningsFilter(ride: Ride, filter: EarningsFilter): boolean {
  if (filter === 'all') return true
  if (!ride.completedAt) return false
  const completed = new Date(ride.completedAt)
  const now = new Date()
  if (filter === 'daily') return completed.toDateString() === now.toDateString()
  if (filter === 'weekly') {
    const weekStart = new Date(now)
    weekStart.setHours(0, 0, 0, 0)
    const dayOfWeek = (weekStart.getDay() + 6) % 7 // Monday = 0
    weekStart.setDate(weekStart.getDate() - dayOfWeek)
    return completed >= weekStart
  }
  if (filter === 'monthly') {
    return completed.getFullYear() === now.getFullYear() && completed.getMonth() === now.getMonth()
  }
  return completed.getFullYear() === now.getFullYear()
}

export function DriverPage() {
  const {
    rides,
    drivers,
    passengers,
    alerts,
    todaQueueWindowMs,
    specialPickupEscalationMs,
    commissionPerRide,
    platformFeePayments,
    platformGcashAccount,
    recordPlatformFeePayment,
    todaOrganizations,
    terminals,
    tripHistoryRetentionDays,
    declineRide,
    driverProposeAccept,
    todaRadiusKm,
    outOfAreaPerKm,
    startRide,
    completeRide,
    joinTerminalQueue,
    leaveTerminalQueue,
    setDriverHomeTerminal,
    setDriverPabiliPriority,
    setDriverPaymentAccount,
    pabiliEnabled,
    simulateMovementEnabled,
    triggerDriverSos,
    resolveAlert,
  } = useRides()
  const { loggedInDriverId, setLoggedInDriverId, loggedInTodaAdminOrgId, setLoggedInTodaAdminOrgId } = useSession()
  const { position: myLiveGps } = useWatchPosition(true)
  const [queueNotice, setQueueNotice] = useState<{ title: string; body: string } | null>(null)
  const [checkingLocation, setCheckingLocation] = useState(false)
  const [sosSending, setSosSending] = useState(false)
  const [sosNotes, setSosNotes] = useState('')
  const [showHotlines, setShowHotlines] = useState(false)
  const [showRequests, setShowRequests] = useState(false)
  // Requests and the Pila are pages of their own rather than panels on the
  // dashboard: both are lists a driver reads top to bottom while deciding,
  // and neither survives being squeezed under an active trip card.
  const [driverView, setDriverView] = useState<'dashboard' | 'requests' | 'pila' | 'earnings'>('dashboard')
  useEffect(() => {
    if (driverView === 'dashboard') return
    const id = requestAnimationFrame(() => scrollViewToTop(pageTopRef.current))
    return () => cancelAnimationFrame(id)
  }, [driverView])
  const [showSoa, setShowSoa] = useState(false)
  // Rides whose payment notice the driver has already seen and waved away.
  const [dismissedPaidIds, setDismissedPaidIds] = useState<string[]>([])
  const requestsPanelRef = useRef<HTMLDivElement | null>(null)
  // Opening the panel from the alert bar brings it to just under that bar —
  // a driver who taps a blinking alert while scrolled down was being shown
  // nothing, because the panel opened above the fold they were on.
  useEffect(() => {
    if (!showRequests) return
    requestAnimationFrame(() => requestsPanelRef.current?.scrollIntoView({ block: 'start' }))
  }, [showRequests])
  // Starts collapsed, same as the passenger app's own "Trip history" — a
  // long, low-priority list that shouldn't push the active-trip card down.
  const [showTripHistory, setShowTripHistory] = useState(false)
  const [earningsFilter, setEarningsFilter] = useState<EarningsFilter>('all')
  // The total is the answer a driver opens this for; the trip-by-trip list is
  // what they check occasionally. Folded, the section stays two lines instead
  // of as many lines as they have driven today.
  const [showEarningsBreakdown, setShowEarningsBreakdown] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  // Scroll targets for the hamburger drawer's menu items (see
  // NavBar.tsx/NavDrawer.tsx) — "Current Ride" and "Ride Requests" share one
  // ref since they're the same mutually-exclusive DOM slot (myActiveRide ?
  // ActiveTripCard : Incoming requests).
  // "Home" scrolls to this rather than calling window.scrollTo, because the
  // page is not always the thing that scrolls: inside the split-screen
  // simulator each phone is its own overflow container, and a window scroll
  // there moves nothing. scrollIntoView finds whichever ancestor is actually
  // scrolling, so one call is right in both places.
  const topSentinelRef = useRef<HTMLDivElement>(null)
  // Opening a page keeps whatever scroll position the last one had, so the
  // Pila could open halfway down its own list. Each page starts at its own
  // top instead — scrollIntoView finds whichever ancestor actually scrolls,
  // which the split-screen panes need (see topSentinelRef above).
  const pageTopRef = useRef<HTMLDivElement>(null)
  const currentOrRequestsSectionRef = useRef<HTMLDivElement>(null)
  const earningsSectionRef = useRef<HTMLElement>(null)
  const tripHistorySectionRef = useRef<HTMLElement>(null)
  // Only rendered when homeToda is set (see below) — a freelance driver has
  // no terminal queue, so this ref just stays null and the 'queue' deep-link
  // silently no-ops for them instead of erroring.

  // Which footer tab reads as current. Set by whichever route the driver
  // took — the hamburger drawer or the footer bar itself.
  const [footerSection, setFooterSection] = useState<DrawerSection | null>('home')

  // One place that knows where each section lives on this page, so the
  // drawer and the bottom bar can't drift apart on where "Earnings" is.
  function goToSection(section: string) {
    setFooterSection(section as DrawerSection)
    // Two of the tabs open a page; the rest scroll the dashboard, so any tab
    // pressed from inside a page has to bring the dashboard back first.
    if (section === 'requests') {
      setDriverView('requests')
      return
    }
    if (section === 'queue') {
      setDriverView('pila')
      return
    }
    if (section === 'earnings') {
      setDriverView('earnings')
      setShowEarningsBreakdown(true)
      return
    }
    setDriverView('dashboard')
    switch (section) {
      case 'home':
        setTimeout(() => topSentinelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
        break
      case 'current':
        // The map is the point of this tab — put it in the middle of the
        // screen rather than at the top edge, where half of it sits under
        // the sticky header on a phone.
        setTimeout(() => showInMiddle(currentOrRequestsSectionRef.current), 60)
        break
      case 'history':
        setShowTripHistory(true)
        setTimeout(() => tripHistorySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
        break
      default:
        break
    }
  }

  // Hooks must run unconditionally before the early returns below (Rules of
  // Hooks) — this effect only touches state/refs declared above, so it's
  // safe to run even on renders that bail out to TodaAdminPage/DriverAuthGate
  // right after.
  useEffect(() => {
    const section = (location.state as { section?: string } | null)?.section
    if (!section) return
    navigate(location.pathname, { replace: true, state: {} })
    goToSection(section)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  if (loggedInTodaAdminOrgId) {
    return <TodaAdminPage orgId={loggedInTodaAdminOrgId} onLogOut={() => setLoggedInTodaAdminOrgId(null)} />
  }

  const driver = drivers.find((d) => d.id === loggedInDriverId)

  if (!driver) {
    return <DriverAuthGate onLoggedIn={setLoggedInDriverId} onTodaAdminLoggedIn={setLoggedInTodaAdminOrgId} />
  }

  const currentDriverId = driver.id
  // Where this driver is standing when they take a job. Their shared GPS if
  // they have it on, otherwise the terminal they are queued at — which is
  // where a driver waiting for work genuinely is, and is the honest fallback
  // when no device position is available.
  const myTerminalOrg = todaOrganizations.find((o) => o.id === driver.todaOrgId)
  const myOriginGps = myLiveGps ?? getTerminalGps(myTerminalOrg) ?? null

  // Where this driver is taken to be standing for THIS job.
  //
  // A real position always wins: shared GPS if the phone is giving it, the
  // terminal otherwise, which is where a driver waiting for work genuinely
  // is. But with movement simulation on, nobody is driving anywhere — the
  // terminal is kilometres from most pickups, so every rehearsal opened with
  // a leg that had to be waited out before the part being tested could even
  // begin. Simulated runs start 20-30m out instead: close enough that the
  // proximity check passes at once, far enough that the tricycle still
  // arrives rather than appearing on top of the passenger.
  //
  // Turning simulation OFF (Super Admin's real-GPS mode) restores the honest
  // answer, which is the whole point of that switch — a road test must not be
  // handed a position nobody is standing at.
  function originGpsForRide(ride: Ride | undefined): GeoCoords | null {
    if (myLiveGps) return myLiveGps
    if (simulateMovementEnabled && ride?.pickup.gps) {
      return simulatedDriverOrigin(ride.pickup.gps, ride.id)
    }
    return myOriginGps
  }
  const myActiveRides = rides
    .filter((r) => r.driverId === currentDriverId && (r.status === 'driver_arriving' || r.status === 'ongoing'))
    // Oldest first: the trip the driver is actually driving owns the map, the
    // route line and the screen. Array order is not that — a ride updated
    // later can sit ahead of one booked earlier, which put the map on the
    // newer fare and left the older one as a footnote.
    .sort((a, b) => new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime())
  const myActiveRide = myActiveRides[0]

  // Keyed by ride *and* status, so it centres twice over a trip's life: when
  // the fare is accepted, and again when Start trip turns it into a journey.
  // Not on every render — a driver panning the map mid-trip must not have it
  // snatched back.
  // The ride this driver has taken but the passenger has not answered yet —
  // their own Accept is what creates it.
  const myAwaitingApproval = rides.find(
    (r) => r.pendingApproval?.driverId === currentDriverId && r.status === 'requested',
  )
  const scrolledForRideRef = useRef<string | null>(null)
  useEffect(() => {
    const stage = myActiveRide
      ? `${myActiveRide.id}:${myActiveRide.status}`
      : myAwaitingApproval
        ? `${myAwaitingApproval.id}:awaiting`
        : null
    if (!stage) {
      scrolledForRideRef.current = null
      return
    }
    if (scrolledForRideRef.current === stage) return
    scrolledForRideRef.current = stage
    // Come back to the dashboard first. A driver takes a job from the
    // Requests page, so that is where they are standing when the trip
    // begins — and the trip card is on the dashboard, which is not even
    // mounted. The scroll below was aiming at a ref that did not exist,
    // which is why the trip appeared to open nowhere.
    setDriverView('dashboard')
    setFooterSection('current')
    // Two passes for the same reason the booking map needs them: the
    // dashboard is still being laid out on the first frame after the swap.
    return showInMiddleWhenSettled(currentOrRequestsSectionRef.current)
  }, [myActiveRide, myAwaitingApproval])

  // Paused/terminated drivers can still log in to see why and finish a trip
  // already in progress, but get no dashboard beyond that — no new
  // requests, no queue. Only the App Admin can lift this.
  if (driver.accessStatus !== 'active' && !myActiveRide) {
    return (
      <div className="mx-auto max-w-lg space-y-3 px-4 py-6">
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center shadow-sm">
          <p className="text-sm font-semibold text-amber-900">
            Your account is currently {driver.accessStatus === 'terminated' ? 'terminated' : 'paused'}.
          </p>
          <p className="mt-2 text-xs text-amber-800">
            {driver.accessNote ?? 'Contact your TODA or Admin for details.'}
          </p>
          <p className="mt-3 text-xs text-slate-500">
            Only the App Admin can restore your access — once any outstanding issue is resolved, ask them to
            reinstate your account.
          </p>
          <button
            onClick={() => setLoggedInDriverId(null)}
            className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Log out
          </button>
        </section>
      </div>
    )
  }

  const allRequested = rides.filter((r) => r.status === 'requested')
  const incoming = allRequested.filter(
    (r) =>
      // A ride this driver already turned down stays out of their list. It is
      // still live for everyone else — declining is "not me", not "cancel it".
      !(r.declinedByDriverIds ?? []).includes(driver.id) &&
      isRideVisibleToDriver(r, driver, todaQueueWindowMs, specialPickupEscalationMs),
  )
  const hiddenCount = allRequested.length - incoming.length
  // Admin-configurable — see AdminPage's "Trip history retention" setting.
  // Older rides aren't lost, they just drop out of this list (earnings
  // totals below still see the full history regardless).
  const myRides = rides
    .filter((r) => r.driverId === currentDriverId && isWithinRetentionDays(r.requestedAt, tripHistoryRetentionDays))
    .slice()
    .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())
  const myCompletedRides = rides.filter((r) => r.driverId === currentDriverId && r.status === 'completed')
  const filteredCompletedRides = myCompletedRides.filter((r) => matchesEarningsFilter(r, earningsFilter))
  const totalEarnings = filteredCompletedRides.reduce((sum, r) => sum + (r.payment?.driverPayout ?? 0), 0)

  // A trip ends on the passenger's phone, not the driver's: they tap
  // "Complete", the card disappears, and whether the fare was actually
  // settled happens somewhere they cannot see. This is that answer, and it is
  // worth interrupting for — an unpaid fare is the driver's own money.
  const justPaidRide = rides.find(
    (r) =>
      r.driverId === currentDriverId &&
      r.status === 'completed' &&
      r.paymentAcknowledged &&
      !!r.payment &&
      // Recent only. A driver opening the app tomorrow does not want to be
      // told about yesterday's fare as though it just happened.
      Date.now() - new Date(r.payment.paidAt).getTime() < 15 * 60 * 1000 &&
      !dismissedPaidIds.includes(r.id),
  )
  // In simulated-movement mode nobody is actually driving, so the payment
  // notice has no thumb waiting to dismiss it — it would sit over the map for
  // the rest of a scripted run. Long enough to read, then it steps aside. On a
  // real phone, with real GPS, it waits to be tapped like any other receipt.
  const justPaidId = justPaidRide?.id ?? null
  useEffect(() => {
    if (!justPaidId || !simulateMovementEnabled) return
    const id = setTimeout(() => setDismissedPaidIds((prev) => [...prev, justPaidId]), 5000)
    return () => clearTimeout(id)
  }, [justPaidId, simulateMovementEnabled])

  const justPaidName =
    (justPaidRide &&
      (justPaidRide.passengerName.trim() ||
        passengers.find((p) => p.id === justPaidRide.passengerId)?.name)) ||
    'pasahero'

  const homeToda = driver.todaOrgId ? todaOrganizations.find((o) => o.id === driver.todaOrgId) : null
  // Driver first so it wins the centre of the fit, then every waiting pickup.
  // DRIVER_BASE_GPS is the fallback for a driver who has not shared a live
  // position yet — an empty map would be worse than an approximate one.
  const myOrgTerminals = homeToda ? terminalsForOrg(terminals, homeToda.id) : []
  const myHomeTerminal = myOrgTerminals.find((t) => t.id === driver.homeTerminalId) ?? null
  const dashboardMapPoints: MapPoint[] = [
    // Every terminal the TODA has saved. The driver's own is one of them and
    // is drawn again below in blue; the rest are where the other lines are —
    // which is what a driver deciding whether to move across campus needs to
    // see, and what the map showed nothing of before.
    ...terminals
      .filter((t) => t.isActive && t.gps && (!homeToda || t.todaOrgId === homeToda.id))
      .map((t) => ({
        id: `terminal-${t.id}`,
        gps: t.gps!,
        color: '#64748b',
        label: `${t.id} — ${t.name}`,
        icon: 'terminal' as const,
      })),
    {
      id: 'me',
      // The terminal the driver actually picked, then the org's single pin,
      // then DRIVER_BASE_GPS for a freelance driver with no terminal at all.
      gps: myHomeTerminal?.gps ?? homeToda?.terminalGps ?? DRIVER_BASE_GPS,
      color: '#1d4ed8',
      label: myHomeTerminal
        ? `You — ${driver.plateNumber} · ${myHomeTerminal.name}`
        : homeToda
          ? `${homeToda.name} terminal`
          : `You — ${driver.plateNumber}`,
    },
    ...incoming
      .filter((r) => !!r.pickup.gps)
      .map((r) => ({
        id: `req-${r.id}`,
        gps: r.pickup.gps!,
        color: '#f59e0b',
        label: `${r.passengerName} — ${formatAddressLine(r.pickup.label)}`,
      })),
  ]
  // The terminals this driver could work out of, and the one they picked.
  // A queue is a line at a place: with several terminals, the line a driver
  // is in is the one at their own terminal, not everyone in the TODA.
  const orgQueue = driver.todaOrgId ? getTodaQueue(driver.todaOrgId, drivers) : []
  const todaQueue = myHomeTerminal
    ? orgQueue.filter((d) => d.homeTerminalId === myHomeTerminal.id)
    : orgQueue
  // Every waiting booking, nearest first, with what each one actually pays.
  // Wider than the offer list above it: this is the board a driver browses,
  // so it shows work that is currently someone else's turn too, marked as
  // such rather than hidden.
  const nearbyRequests = buildNearbyRequests(
    rides,
    driver,
    myOriginGps,
    todaOrganizations,
    drivers,
    commissionPerRide,
    todaQueueWindowMs,
    specialPickupEscalationMs,
  )
  // Passengers standing on the road this driver is already driving down.
  //
  // A tricycle passes people every trip; the only reason not to stop is that
  // the seat is spoken for. So the test is exactly that — seats left, and a
  // trip nobody bought outright — plus the honest geometry: the pickup and
  // the drop-off both have to lie ahead, or it is a second trip pretending
  // to be a shared one.
  const sharingBlocked = myActiveRide ? isSpecialTrip(myActiveRide) : false
  const freeSeats = seatsLeft(myActiveRides)
  // Where the tricycle is *now*, not where it set off from. Halfway through a
  // trip the terminal is behind the driver, and measuring the corridor from
  // there would offer them passengers they have already driven past.
  const driverNowGps =
    myLiveGps ?? (myActiveRide ? getDriverMapGps(myActiveRide)?.gps ?? myOriginGps : myOriginGps)
  const alongTheWay: {
    request: (typeof nearbyRequests)[number]
    offRouteMeters: number
    detourMeters: number
    beyondCurrentDropoff: boolean
    beyondMeters: number
  }[] = []
  if (myActiveRide && !sharingBlocked && freeSeats > 0) {
    nearbyRequests.forEach((n) => {
      // The Pila decides whose turn it is at the terminal. A driver already
      // carrying someone is not standing in that line, so a passenger on the
      // road they are already driving is theirs to pick up — waiting out
      // another driver's turn would mean driving past someone with an empty
      // seat. A passenger mid-negotiation with another driver is still off
      // limits: that is a promise, not a queue position.
      if (n.blockedKind === 'pending_other' || n.ride.passengerCount > freeSeats) return
      const fit = alongTheWayFit(driverNowGps, myActiveRide.dropoff.gps, n.ride)
      if (!fit) return
      alongTheWay.push({
        request: n,
        offRouteMeters: fit.offRouteMeters,
        detourMeters: fit.detourMeters,
        beyondCurrentDropoff: fit.beyondCurrentDropoff,
        beyondMeters: fit.beyondMeters,
      })
    })
    alongTheWay.sort((a, b) => a.detourMeters - b.detourMeters)
  }

  // Everyone else's stops, for the one map the driver actually reads.
  const sharedStopPoints: MapPoint[] = []
  // The thin line between the fares. Drawn from where the passenger already
  // aboard is going to where the next one is standing, so the driver reads
  // the two as one journey rather than two errands.
  const sharedHintLine: GeoCoords[] = []
  if (myActiveRides.length > 1) {
    const first = myActiveRides[0]
    const next = myActiveRides[1]
    const from = first.dropoff.gps
    const to = next.status === 'driver_arriving' ? next.pickup.gps : next.dropoff.gps
    if (from && to) sharedHintLine.push(from, to)
  }
  myActiveRides.slice(1).forEach((r) => {
    const who = shortName(r.passengerName)
    if (r.pickup.gps && r.status === 'driver_arriving')
      sharedStopPoints.push({ id: `x-pickup-${r.id}`, gps: r.pickup.gps, color: '#0d9488', label: `${who} — sakay` })
    if (r.dropoff.gps)
      sharedStopPoints.push({ id: `x-drop-${r.id}`, gps: r.dropoff.gps, color: '#e11d48', label: `${who} — baba` })
  })

  // How long each of this TODA's other lines is, so a driver deciding where
  // to wait can see it without driving over to look.
  // This driver's own completed trips this calendar month, and what was
  // actually deducted from them — read off each ride's stored payment rather
  // than recomputed, so the total always matches the trip rows above it even
  // if a rate changed mid-month.
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const myMonthCompleted = myCompletedRides.filter((r) => new Date(r.requestedAt) >= monthStart)
  const myMonthCommission = myMonthCompleted.reduce(
    (sum, r) => sum + (r.payment?.platformFee ?? 0) + (r.payment?.todaCommission ?? 0),
    0,
  )
  const todaCommissionPerRide = getActiveTodaCommission(homeToda)
  // The statement, and what has been settled against it. Only payments made
  // in this same period count — a settlement for last month must not make
  // this month look paid.
  const soa = buildSoa(rides, driver.id, monthStart)
  const myPeriodPayments = platformFeePayments.filter(
    (p) => p.payerRole === 'driver' && p.payerId === driver.id && new Date(p.paidAt) >= monthStart,
  )
  const soaPaid = myPeriodPayments.reduce((sum, p) => sum + p.amount, 0)
  const soaBalance = Math.max(0, soa.charged - soaPaid)
  const periodLabel = monthStart.toLocaleDateString([], { month: 'long', year: 'numeric' })

  const otherTerminals = myOrgTerminals
    .filter((t) => t.id !== myHomeTerminal?.id)
    .map((t) => ({ terminal: t, waiting: orgQueue.filter((d) => d.homeTerminalId === t.id).length }))

  // My own most recent open SOS (if any) — disables/relabels the button and
  // shows a "help is on the way" banner instead of letting a second alert
  // stack on top of it.
  const myOpenSos = alerts.find((a) => a.triggeredBy === driver.id && a.triggeredByRole === 'driver' && a.status === 'open')
  // Fellow members' open alerts — same TODA, not mine — so a driver gets
  // situational awareness of a colleague in trouble even outside an active
  // ride. Only TODA Admin can resolve these (see TodaAdminPage.tsx); this is
  // read-only visibility, same "each level sees, but doesn't manage, one
  // another's stuff" boundary used everywhere else in this hierarchy.
  const fellowOpenAlerts = (driver.todaOrgId
    ? alertsForToda(alerts, driver.todaOrgId, rides, drivers).filter(
        (a) => a.status === 'open' && a.triggeredBy !== driver.id,
      )
    : []
  ).map((a) => ({ alert: a, driver: drivers.find((d) => d.id === a.triggeredBy) }))

  async function handleJoinQueue() {
    if (!homeToda) return
    setQueueNotice(null)
    const orgTerminals = terminalsForOrg(terminals, homeToda.id)
    const chosen = orgTerminals.find((t) => t.id === driver?.homeTerminalId) ?? null
    // Nothing to check presence against — no terminal recorded and no pin on
    // the organisation — so the join goes through as before.
    if (orgTerminals.length === 0 && !homeToda.terminalGps) {
      joinTerminalQueue(currentDriverId, null)
      return
    }
    setCheckingLocation(true)
    try {
      const position = await getCurrentGeoPosition()
      // The terminal they said they work out of, if any — otherwise
      // whichever of the TODA's terminals they are closest to.
      const nearest = chosen ?? nearestTerminal(orgTerminals, position)
      const anchor = nearest?.gps ?? homeToda.terminalGps!
      const distance = haversineDistanceMeters(position, anchor)
      if (distance <= TERMINAL_PROXIMITY_METERS) {
        joinTerminalQueue(currentDriverId, position)
      } else {
        setQueueNotice({
          title: "You're not at the terminal yet",
          body: `You are about ${formatKm(distance)} from ${nearest ? nearest.name : `${homeToda.name}'s terminal`}. The Pila is for drivers actually waiting there, so you need to be within ${formatKm(TERMINAL_PROXIMITY_METERS)} of it to take a place in line. Drive over and try again.`,
        })
      }
    } catch {
      setQueueNotice({
        title: 'Could not check where you are',
        body: 'Location access is off or unavailable, so the app cannot tell whether you are at the terminal. Allow location for this app, then try again.',
      })
    } finally {
      setCheckingLocation(false)
    }
  }

  // Fires whether or not there's an active ride — unlike the passenger SOS
  // in TripMonitor.tsx (which requires one), a driver spends most of their
  // time idle/in queue, so gating this on myActiveRide would leave them with
  // no way to call for help outside a trip. Best-effort GPS: if location
  // fails/is denied, the alert still fires with location: null — TODA admin
  // and fellow members can still see it and call the driver directly.
  async function handleTriggerSos() {
    setSosSending(true)
    let position = null
    try {
      position = await getCurrentGeoPosition()
    } catch {
      // No GPS — still send the alert below, just without a pin.
    }
    triggerDriverSos(currentDriverId, position, sosNotes)
    setSosNotes('')
    setSosSending(false)
  }


  // The Pila card and the Earnings card used to sit on this dashboard as
  // well as behind their own footer tabs, which meant scrolling past both to
  // reach anything under them. They live on their pages now; these are what
  // those pages render.
  const pabiliPriorityControl = pabiliEnabled ? (
    <label className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
      <span>
        <span className="block text-xs font-medium text-slate-700">Prioritize Pabili errands</span>
        <span className="block text-xs text-slate-500">
          Get offered Pabili (bili/errand) requests before other drivers in the Pila.
        </span>
      </span>
      <input
        type="checkbox"
        checked={driver.pabiliPriority}
        onChange={(e) => setDriverPabiliPriority(driver.id, e.target.checked)}
        className="h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600"
      />
    </label>
  ) : null

  const earningsSection = (
    <section ref={earningsSectionRef} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Earnings</h2>
        <select
          value={earningsFilter}
          onChange={(e) => setEarningsFilter(e.target.value as EarningsFilter)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600"
        >
          {(Object.keys(EARNINGS_FILTER_LABELS) as EarningsFilter[]).map((key) => (
            <option key={key} value={key}>
              {EARNINGS_FILTER_LABELS[key]}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="text-xs text-slate-400">
          {filteredCompletedRides.length} completed trip(s) · net of platform commission
        </p>
        <span className="shrink-0 text-lg font-semibold text-brand-700">₱{totalEarnings}</span>
      </div>
      {filteredCompletedRides.length > 0 && (
        <button
          type="button"
          onClick={() => setShowEarningsBreakdown((v) => !v)}
          aria-expanded={showEarningsBreakdown}
          className="mt-1 flex w-full items-center justify-between text-[11px] font-medium text-slate-500 hover:text-slate-700"
        >
          <span>Trip-by-trip breakdown</span>
          <span>{showEarningsBreakdown ? '▲ Hide' : '▼ Show'}</span>
        </button>
      )}
      {filteredCompletedRides.length > 0 ? (
        showEarningsBreakdown && (
        <div className="mt-2 space-y-1.5">
          {filteredCompletedRides.map((r) => (
            <div key={r.id} className="flex items-center justify-between text-xs text-slate-500">
              <span className="truncate">
                {r.passengerName} · {formatTripRoute(r.pickup.label, r.dropoff.label)}
              </span>
              <span className="shrink-0 pl-2 text-right font-medium text-slate-700">
                ₱{r.payment?.driverPayout ?? r.fareEstimate}
                {r.payment && r.payment.platformFee > 0 && (
                  <span className="block text-[10px] font-normal text-slate-400">
                    fare ₱{r.payment.amount} − ₱{r.payment.platformFee} fee
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
        )
      ) : (
        <p className="mt-2 text-xs text-slate-400">No completed trips in this period.</p>
      )}
    </section>
  )

  // What the driver's TODA owes TODASafeRide this month. It is billed to the
  // organisation, not deducted from any fare, so it is shown beside earnings
  // rather than inside them — a member who can see the subscription their
  // dues pay for is a member who can ask about it at the next meeting.
  // What comes off a fare, per ride. The monthly platform fee is billed to
  // the TODA, the Operator and the Franchise — not to a driver — so it is
  // shown on their portals, not here. What a driver needs from this screen is
  // the per-ride deduction they can check a payout against.
  const commissionSection = (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700">SaaS platform fee</h2>
      <p className="mt-0.5 text-[11px] text-slate-500">
        Taken off the fare on each completed trip. Tips are never touched — those are yours in full.
      </p>
      <div className="mt-2 space-y-1 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Platform commission</span>
          <span className="font-medium text-slate-700">₱{commissionPerRide} per ride</span>
        </div>
        {todaCommissionPerRide > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-slate-500">{homeToda ? homeToda.name : 'TODA'} share</span>
            <span className="font-medium text-slate-700">₱{todaCommissionPerRide} per ride</span>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-slate-100 pt-1">
          <span className="font-semibold text-slate-700">
            Charged on your {myMonthCompleted.length} trip{myMonthCompleted.length === 1 ? '' : 's'} this month
          </span>
          <span className="text-base font-bold text-slate-800">₱{myMonthCommission.toLocaleString()}</span>
        </div>
        {soaPaid > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Paid</span>
            <span className="font-medium text-emerald-700">− ₱{soaPaid.toLocaleString()}</span>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-slate-100 pt-1">
          <span className="font-semibold text-slate-700">Balance due</span>
          <span className={`text-base font-bold ${soaBalance > 0 ? 'text-slate-800' : 'text-emerald-700'}`}>
            {soaBalance > 0 ? `₱${soaBalance.toLocaleString()}` : '✓ Settled'}
          </span>
        </div>
      </div>
      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          onClick={() => setShowSoa(true)}
          className="flex-1 rounded-lg border border-slate-300 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          📄 View SOA
        </button>
        {soaBalance > 0 && (
          <button
            type="button"
            onClick={() => setShowSoa(true)}
            className="flex-1 rounded-lg bg-[#0f766e] py-2 text-xs font-semibold text-white hover:bg-[#0b5f59]"
          >
            Pay via GCash
          </button>
        )}
      </div>
    </section>
  )

  const soaModal = (
    <PlatformFeeSoa
      open={showSoa}
      onClose={() => setShowSoa(false)}
      periodLabel={periodLabel}
      lines={soa.lines}
      charged={soa.charged}
      paid={soaPaid}
      payments={myPeriodPayments}
      account={platformGcashAccount}
      onPay={(amount, reference) => {
        recordPlatformFeePayment({
          id: `pfp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          payerRole: 'driver',
          payerId: driver.id,
          payerName: driver.name,
          amount,
          method: 'gcash',
          reference,
          proofDataUrl: null,
          paidAt: new Date().toISOString(),
        })
      }}
    />
  )

  const footerBar = (
    <DriverFooterNav
      active={footerSection}
      onNavigate={goToSection}
      requestCount={incoming.length}
      showQueue={!!homeToda}
      tripActive={!!myActiveRide}
    />
  )

  if (driverView === 'requests') {
    return (
      <div className="mx-auto flex min-h-[100%] max-w-lg flex-col px-4 pb-20 pt-2">
        <div ref={pageTopRef} />
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToSection('home')}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              ‹ Back
            </button>
            <h1 className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">
              🚗 Passenger requests nearby
            </h1>
          </div>
          <p className="text-[11px] text-slate-500">
            Sorted by how far you are from the pickup. Take the one that is worth the drive — the fare, the tip and
            what you keep are on every card.
          </p>
          <NearbyRequestsBoard
            requests={nearbyRequests}
            onAccept={(rideId) => {
              driverProposeAccept(rideId, driver.id, originGpsForRide(rides.find((r) => r.id === rideId)))
              goToSection('current')
            }}
            onDecline={(rideId) => declineRide(rideId, driver.id)}
            busyNote={
              myActiveRide
                ? 'You are on a trip right now. Finish it before taking another — this is what is waiting.'
                : null
            }
          />
        </div>
        {footerBar}
      </div>
    )
  }

  if (driverView === 'earnings') {
    return (
      <div className="mx-auto flex min-h-[100%] max-w-lg flex-col px-4 pb-20 pt-2">
        <div ref={pageTopRef} />
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToSection('home')}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              ‹ Back
            </button>
            <h1 className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">💰 Earnings</h1>
          </div>
          {earningsSection}
          <TricycleQrPanel driver={driver} />
          <DriverWalletPanel
            driverName={driver.name}
            gcashAccount={driver.gcashAccount ?? null}
            mayaAccount={driver.mayaAccount ?? null}
            onSave={(wallet, details) => setDriverPaymentAccount(driver.id, wallet, details)}
          />
          {commissionSection}
        </div>
        {soaModal}
        {footerBar}
      </div>
    )
  }

  if (driverView === 'pila' && homeToda) {
    return (
      <div className="mx-auto flex min-h-[100%] max-w-lg flex-col px-4 pb-20 pt-2">
        <div ref={pageTopRef} />
        <div className="flex-1">
          <DriverPilaPage
            org={homeToda}
            terminal={myHomeTerminal}
            pila={todaQueue}
            me={driver}
            onBack={() => goToSection('home')}
            onJoin={() => void handleJoinQueue()}
            onLeave={() => leaveTerminalQueue(driver.id)}
            joining={checkingLocation}
            otherTerminals={otherTerminals}
            onSwitchTerminal={(terminalId) => setDriverHomeTerminal(driver.id, terminalId)}
            pabiliControl={pabiliPriorityControl}
          />
        </div>
        {footerBar}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 pb-20 pt-2">
      <div ref={topSentinelRef} />
      <AnnouncementFeed viewer="drivers" />

      {justPaidRide?.payment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Bayad na ang pasahero"
        >
        <section className="w-full max-w-sm rounded-xl border-2 border-brand-200 bg-brand-50 p-4 shadow-2xl">
          <div className="flex items-start gap-2">
            <span aria-hidden className="text-2xl leading-none">✅</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold text-brand-900">Bayad na si {justPaidName}</p>
              <p className="text-xs text-brand-700">
                ₱{justPaidRide.payment.amount.toLocaleString()} ·{' '}
                {PAYMENT_METHODS.find((m) => m.id === justPaidRide.payment?.method)?.label ??
                  justPaidRide.payment.method}
                {justPaidRide.payment.referenceNo ? ' · ref ' + justPaidRide.payment.referenceNo : ''}
              </p>
              <p className="mt-0.5 text-[11px] font-semibold text-brand-700">
                Sa iyo: ₱{justPaidRide.payment.driverPayout.toLocaleString()}
                {justPaidRide.payment.platformFee === 0 && ' — walang app fee sa biyaheng ito'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDismissedPaidIds((prev) => [...prev, justPaidRide.id])}
              aria-label="Dismiss payment notice"
              className="shrink-0 rounded-lg px-2 py-1 text-lg font-bold text-brand-700 hover:bg-brand-100"
            >
              ✕
            </button>
          </div>
          <button
            type="button"
            onClick={() => setDismissedPaidIds((prev) => [...prev, justPaidRide.id])}
            className="mt-3 w-full rounded-lg bg-brand-600 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
          >
            Thank you
          </button>
        </section>
        </div>
      )}

      <div className="sticky top-[70px] z-10 -mx-4 flex items-center justify-end gap-2 border-b border-slate-200 bg-slate-50/95 px-4 py-2 backdrop-blur">
        <button
          type="button"
          onClick={() =>
            myActiveRide
              ? currentOrRequestsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              : setShowRequests(true)
          }
          disabled={!myActiveRide && incoming.length === 0}
          aria-label={
            myActiveRide
              ? `Current passenger ${myActiveRide.passengerName}`
              : incoming.length > 0
                ? `${incoming.length} incoming passenger request${incoming.length === 1 ? '' : 's'}`
                : 'No incoming requests'
          }
          className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-3 py-2 text-left transition ${
            myActiveRide
              ? 'border-emerald-400 bg-emerald-50 text-emerald-900 shadow-sm hover:bg-emerald-100'
              : incoming.length > 0
                ? 'animate-pulse border-gold-500 bg-gold-400 text-navy-900 shadow-md hover:bg-gold-500'
                : 'cursor-default border-slate-200 bg-white text-slate-400'
          }`}
        >
          <span aria-hidden className="text-lg leading-none">
            {myActiveRide ? '🧑' : incoming.length > 0 ? '🔔' : '🔕'}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-bold uppercase tracking-wide">
              {myActiveRide
                ? myActiveRide.passengerName
                : incoming.length > 0
                  ? 'Incoming request'
                  : 'No requests'}
            </span>
            <span className="block truncate text-[11px] font-medium">
              {myActiveRide
                ? `${myActiveRide.status.replace(/_/g, ' ')} — tap for the trip`
                : incoming.length > 0
                  ? `${incoming.length} passenger${incoming.length === 1 ? '' : 's'} waiting — tap to view`
                  : 'You will be alerted here'}
            </span>
          </span>
          {!myActiveRide && incoming.length > 0 && (
            <span className="flex h-6 min-w-[1.5rem] shrink-0 items-center justify-center rounded-full bg-navy-900 px-1.5 text-xs font-bold text-gold-400">
              {incoming.length}
            </span>
          )}
        </button>
        <EmergencyNumbersButton onClick={() => setShowHotlines(true)} alertOpen={!!myOpenSos} />
      </div>

      {/* Only when there is something this driver can actually take. A panel
          announcing "1 request(s) waiting for their priority TODA driver" is
          a notification about somebody else's work — it looks like a job and
          opens to nothing. The count still shows on the Requests page. */}
      {showRequests && incoming.length > 0 && (
        <div
          ref={requestsPanelRef}
          className="-mt-4 scroll-mt-[124px] overflow-hidden rounded-xl border border-gold-500 bg-white shadow-lg"
        >
          <div>
            <div className="flex items-center gap-2 border-b border-gold-500 bg-gold-400 px-3 py-2">
              <span aria-hidden className="text-lg leading-none">
                🔔
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-navy-900">
                Incoming requests{incoming.length > 0 ? ` (${incoming.length})` : ''}
              </span>
              <button
                type="button"
                onClick={() => setShowRequests(false)}
                aria-label="Close incoming requests"
                title="Close"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-lg font-bold text-navy-900 hover:bg-black/10 active:bg-black/20"
              >
                ✕
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-3">

              <div className="space-y-2">
                {incoming.length === 0 && (
                  <p className="text-sm text-slate-400">
                    {hiddenCount > 0
                      ? `${hiddenCount} request(s) waiting for their priority TODA driver to respond.`
                      : 'No pending requests right now.'}
                  </p>
                )}
                {incoming.map((r) => {
                  const { openToAll, remainingSeconds } = getDispatchWindow(r, todaQueueWindowMs, specialPickupEscalationMs)
                  const priorityOrg = todaOrganizations.find((o) => o.id === r.priorityTodaOrgId)
                  const isMyQueueTurn = !openToAll && r.priorityQueueOfferedDriverId === driver.id
                  return (
                    <div key={r.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-700">
                          {r.serviceType === 'pabili' && '🛍️ '}
                          {r.serviceType === 'buy_medicine' && '💊 '}
                          {r.passengerName}
                        </span>
                        <span className="text-xs text-slate-400">
                          ₱{r.fareEstimate}
                          {r.pabiliTip > 0 && ` + ₱${r.pabiliTip} tip`}
                          {r.tipOffer > 0 && (
                            <span className="font-semibold text-emerald-600"> + ₱{r.tipOffer} tip offer</span>
                          )}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatTripRoute(r.pickup.label, r.dropoff.label, 3)}
                      </p>
                      {r.specialPickupRequested && (
                        <p className="mt-1 rounded-lg bg-amber-50 p-2 text-xs font-medium text-amber-700">
                          📍 Special pickup — go to the passenger's exact GPS pin, not the Terminal (+₱
                          {r.specialPickupFee} detour fee included in the fare)
                        </p>
                      )}
                      {(r.serviceType === 'pabili' || r.serviceType === 'buy_medicine') && r.pabiliItems && (
                        <p className="mt-1 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">🛒 {r.pabiliItems}</p>
                      )}
                      {r.passengerCount > 1 && (
                        <p className="mt-0.5 text-[11px] font-medium text-slate-500">👥 {r.passengerCount} passengers</p>
                      )}
                      {r.bookedByParentId && (
                        <p className="mt-0.5 text-[11px] font-medium text-slate-500">📋 Booked by parent</p>
                      )}
                      <p className="mt-1 text-[11px] font-medium text-brand-600">
                        {openToAll
                          ? 'Open to all TODAs'
                          : isMyQueueTurn
                            ? `Your turn — ${priorityOrg?.name ?? 'terminal'} Pila · respond within ${remainingSeconds}s or it passes to the next driver`
                            : 'Waiting in the Pila'}
                      </p>
                      {r.priorityQueueLog.length > 0 && (
                        <p className="mt-1 text-[11px] text-slate-400">
                          Already passed:{' '}
                          {r.priorityQueueLog
                            .map((entry) => `${entry.driverName} (${entry.outcome === 'declined' ? 'declined' : 'no response'})`)
                            .join(', ')}
                        </p>
                      )}
                      {r.pendingApproval?.driverId === driver.id ? (
                        <div className="mt-3 rounded-lg border border-gold-400 bg-gold-50 px-2.5 py-2 text-[11px] text-slate-700">
                          <p className="font-semibold">⏳ Waiting for {r.passengerName} to approve ₱{r.pendingApproval.fareAfter}</p>
                          <p className="mt-0.5 text-slate-500">
                            {r.pendingApproval.outOfAreaFee > 0
                              ? `Includes ₱${r.pendingApproval.outOfAreaFee} for starting ${r.pendingApproval.outOfAreaKm.toFixed(1)} km outside the area. Nobody else is offered this ride while they decide.`
                              : 'Nobody else is offered this ride while they decide.'}
                          </p>
                        </div>
                      ) : (
                      <>
                      {(() => {
                        const terminalGps = getTerminalGps(priorityOrg)
                        const area = estimateOutOfAreaBreakdown(myOriginGps, terminalGps, todaRadiusKm, outOfAreaPerKm)
                        if (area.fee <= 0) return null
                        return (
                          <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900">
                            You are {area.distanceKm.toFixed(1)} km from the {priorityOrg?.name ?? 'terminal'} —{' '}
                            {area.extraKm.toFixed(1)} km outside its {todaRadiusKm} km area. Accepting adds ₱{area.fee}
                            , making the fare ₱{r.fareEstimate + area.fee}. The passenger has to agree before it is
                            yours.
                          </p>
                        )
                      })()}
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => {
                            driverProposeAccept(r.id, driver.id, originGpsForRide(r))
                            setShowRequests(false)
                          }}
                          className="flex-1 rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => {
                            declineRide(r.id, driver.id)
                            setShowRequests(false)
                          }}
                          className="flex-1 rounded-lg border border-slate-300 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          Decline
                        </button>
                      </div>
                      </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <div ref={currentOrRequestsSectionRef}>
        {myActiveRide ? (
          <ActiveTripCard
            rideId={myActiveRide.id}
            onStart={() => startRide(myActiveRide.id)}
            onComplete={(paidMethod) => completeRide(myActiveRide.id, paidMethod)}
            extraPoints={sharedStopPoints}
            hintLine={sharedHintLine}
          />
        ) : (
          <RealLiveMap points={dashboardMapPoints} height="calc(100vh - 300px)" />
        )}
      </div>

      {/* Everyone else in the tricycle. Each keeps its own card because each
          is still a trip of its own — its own start, its own fare, its own
          drop-off, which may well come before the first passenger's. */}
      {myActiveRides.slice(1).map((extra) => (
        <ActiveTripCard
          key={extra.id}
          rideId={extra.id}
          onStart={() => startRide(extra.id)}
          onComplete={(paidMethod) => completeRide(extra.id, paidMethod)}
          showMap={false}
        />
      ))}

      {myActiveRide && sharingBlocked && (
        <p className="rounded-xl border border-navy-900/20 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
          🛞 Special trip — buong tricycle ang binayaran ni {myActiveRide.passengerName}. Huwag munang sumakay
          ng iba hanggang matapos ito.
        </p>
      )}

      {alongTheWay.length > 0 && myActiveRide && (
        <section className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3 shadow-sm">
          <p className="text-sm font-extrabold text-emerald-900">🧍 May pasahero sa daan</p>
          <p className="mt-0.5 text-[11px] text-emerald-800">
            Nasa dinaanan mo papuntang {formatAddressLine(myActiveRide.dropoff.label)} — {freeSeats} upuan pa ang
            bakante. Wala ka sa pila habang may pasahero ka, kaya libre mong masusundo ang nasa daan mo.
          </p>
          <div className="mt-2 space-y-1.5">
            {alongTheWay.map(({ request, offRouteMeters, detourMeters, beyondCurrentDropoff, beyondMeters }) => (
              <div key={request.ride.id} className="rounded-lg border border-emerald-200 bg-white p-2.5">
                <p className="text-xs font-bold text-slate-800">{request.ride.passengerName}</p>
                <p className="text-[11px] text-slate-600">{formatTripRoute(request.ride.pickup.label, request.ride.dropoff.label)}</p>
                <p className="mt-0.5 text-[11px] font-semibold text-emerald-700">
                  +₱{request.takeHome} sa iyo · {formatKm(offRouteMeters)} mula sa ruta · +{formatKm(detourMeters)} na liko
                  {request.ride.passengerCount > 1 && ` · ${request.ride.passengerCount} sasakay`}
                </p>
                {beyondCurrentDropoff && (
                  <p className="mt-0.5 text-[11px] font-semibold text-navy-900">
                    ➡️ Mas malayo pa — {(beyondMeters / 1000).toFixed(1)} km lampas sa babaan ni{' '}
                    {myActiveRide.passengerName}. Ihatid mo muna siya, tuloy ka lang pagkatapos.
                  </p>
                )}
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => driverProposeAccept(request.ride.id, driver.id, originGpsForRide(request.ride))}
                    className="rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                  >
                    Sakay din
                  </button>
                  <button
                    type="button"
                    onClick={() => declineRide(request.ride.id, driver.id)}
                    className="rounded-lg border border-slate-300 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Hindi muna
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}


      {queueNotice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setQueueNotice(null)}
        >
          <div
            className="w-full max-w-xs rounded-xl border border-amber-300 bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-amber-900">🚏 {queueNotice.title}</p>
            <p className="mt-1 text-xs text-slate-600">{queueNotice.body}</p>
            <button
              type="button"
              onClick={() => setQueueNotice(null)}
              className="mt-3 w-full rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {showHotlines && (
        <EmergencyNumbersPanel
          province={driver.province}
          city={driver.city}
          onClose={() => setShowHotlines(false)}
        >
          <section className="rounded-xl border border-danger-200 bg-danger-50 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-danger-900">🆘 Emergency SOS</h2>
                <p className="mt-0.5 text-xs text-danger-800">
                  {myOpenSos
                    ? 'Sent — your TODA admin and fellow members have been alerted.'
                    : homeToda
                      ? `Alerts ${homeToda.name}'s admin and every online member.`
                      : "You're not in a TODA yet — this still reaches the App Admin."}
                </p>
              </div>
              <button
                type="button"
                onClick={handleTriggerSos}
                disabled={sosSending || !!myOpenSos}
                className="shrink-0 rounded-full bg-danger-700 px-5 py-2.5 text-sm font-bold text-white shadow transition hover:bg-danger-800 disabled:cursor-not-allowed disabled:bg-danger-300"
              >
                {myOpenSos ? 'Sent' : sosSending ? 'Sending…' : 'SOS'}
              </button>
            </div>
            {homeToda?.contactPhone && (
              <a
                href={`tel:${homeToda.contactPhone}`}
                className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-danger-500 bg-white py-2 text-xs font-semibold text-danger-800 hover:bg-danger-100"
              >
                📞 Call {homeToda.name} admin — {homeToda.contactPhone}
              </a>
            )}
            {!myOpenSos && (
              <textarea
                value={sosNotes}
                onChange={(e) => setSosNotes(e.target.value)}
                placeholder="What's the emergency? (optional — accident, hold-up, breakdown, etc.)"
                rows={2}
                className="mt-3 w-full rounded-lg border border-danger-300 bg-white px-3 py-2 text-xs placeholder:text-slate-400"
              />
            )}
            {myOpenSos && (
              <div className="mt-3 rounded-lg border border-danger-300 bg-white p-2.5 text-xs">
                <p className="font-medium text-danger-800">
                  Open since {new Date(myOpenSos.createdAt).toLocaleTimeString()}
                  {myOpenSos.location ? ' · location shared' : ' · location not captured'}
                </p>
                <p className="mt-1 text-slate-600">{myOpenSos.notes}</p>
                <button
                  type="button"
                  onClick={() => resolveAlert(myOpenSos.id)}
                  className="mt-2 w-full rounded-lg border border-danger-300 py-1.5 text-xs font-medium text-danger-800 hover:bg-danger-50"
                >
                  I'm safe now — cancel SOS
                </button>
              </div>
            )}
            {fellowOpenAlerts.length > 0 && (
              <div className="mt-3 space-y-1.5 border-t border-danger-200 pt-3">
                <p className="text-[11px] font-semibold text-danger-800">Fellow member alerts — {homeToda?.name}</p>
                {fellowOpenAlerts.map(({ alert, driver: d }) => (
                  <div key={alert.id} className="rounded-lg border border-danger-300 bg-white p-2 text-xs">
                    <p className="font-medium text-danger-800">
                      {d ? `${d.name} · ${d.plateNumber}` : 'A fellow member'} — {new Date(alert.createdAt).toLocaleTimeString()}
                    </p>
                    <p className="mt-0.5 text-slate-500">
                      {alert.location ? `📍 ${alert.location.lat.toFixed(5)}, ${alert.location.lng.toFixed(5)}` : 'Location not captured — try calling them.'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </EmergencyNumbersPanel>
      )}






      <section ref={tripHistorySectionRef}>
        <button
          type="button"
          onClick={() => setShowTripHistory((v) => !v)}
          className="mb-2 flex w-full items-center justify-between text-sm font-semibold text-slate-700"
        >
          Trip history
          <span className="text-xs text-slate-400">{showTripHistory ? '▲ Hide' : '▼ Show'}</span>
        </button>
        {showTripHistory && (
        <div className="space-y-2">
          {myRides.length === 0 && <p className="text-sm text-slate-400">No trips yet.</p>}
          {myRides.map((r) => (
            <div key={r.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium text-slate-700">
                  {r.serviceType === 'pabili' && '🛍️ '}
                  {r.serviceType === 'buy_medicine' && '💊 '}
                  {r.passengerName}
                </span>
                <StatusBadge status={r.status} />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {formatTripRoute(r.pickup.label, r.actualDropoff ? r.actualDropoff.label : r.dropoff.label)}
              </p>
              {r.actualDropoff && (
                <p className="text-[11px] text-amber-700">
                  🚩 Got out {formatKm(r.actualDropoff.metersShort)} short of {formatAddressLine(r.dropoff.label)}
                </p>
              )}
              <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                <span>{new Date(r.requestedAt).toLocaleString()}</span>
                {r.payment && (
                  <span className="font-medium text-slate-700">
                    You earned ₱{r.payment.driverPayout} · {PAYMENT_METHODS.find((m) => m.id === r.payment!.method)?.label}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        )}
      </section>


      {footerBar}
    </div>
  )
}

function ActiveTripCard({
  rideId,
  onStart,
  onComplete,
  extraPoints,
  hintLine,
  showMap = true,
}: {
  rideId: string
  onStart: () => void
  onComplete: (paidMethod?: PaymentMethod) => void
  // One tricycle, one map. The other passengers' stops are drawn on this
  // driver's map rather than each trip bringing a second map of the same
  // road — the driver is on one journey, however many fares are riding on it.
  extraPoints?: MapPoint[]
  hintLine?: GeoCoords[]
  showMap?: boolean
}) {
  const {
    rides,
    drivers,
    passengers,
    parents,
    parentLinks,
    updateDriverLiveGps,
    simulateMovementEnabled,
    driverCancelRide,
    setPabiliItemBought,
    confirmPassengerArrival,
  } = useRides()
  // Calling off a ride already accepted. Two steps on purpose: the reason is
  // the point of it — a cancellation with no account of itself tells the
  // passenger nothing and leaves the TODA unable to tell a broken-down
  // tricycle from a driver who keeps changing their mind.
  // The driver's own trip map, held on screen for the same reason the
  // passenger's is: a phone sitting in a bracket on the handlebars is no use
  // if the map has scrolled out of the frame.
  const tripMapRef = useRef<HTMLDivElement>(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancelReason, setCancelReason] = useState<RideCancellationReason>('passenger_no_show')
  const [cancelNote, setCancelNote] = useState('')
  const [confirmingPayment, setConfirmingPayment] = useState(false)
  // Open while the driver is saying who is stepping off here.
  const [pickingWhoGetsOff, setPickingWhoGetsOff] = useState(false)
  // Seeded from the booking, changeable at the kerb.
  // null means 'as booked'. Only ever set to 'cash' — see the confirm panel.
  const [paidMethod, setPaidMethod] = useState<'cash' | null>(null)
  // With movement simulation off (a real road test), nothing fakes the
  // tricycle's position any more, so real GPS is the only thing that can
  // move the marker — start sharing straight away instead of making the
  // driver remember to tap it. Still manually togglable either way.
  const [shareLiveGps, setShareLiveGps] = useState(!simulateMovementEnabled)
  // Real-GPS mode is an app-wide admin decision, not a driver preference —
  // the driver can't opt out of it (see the locked control further down).
  const gpsSharingLocked = !simulateMovementEnabled
  const effectiveShareGps = gpsSharingLocked || shareLiveGps
  const { position: liveDriverGps, error: liveGpsError } = useWatchPosition(effectiveShareGps)
  const ride = rides.find((r) => r.id === rideId)
  // Card settles at checkout; everything else is money that physically has to
  // reach the driver, so the driver is the one who confirms it arrived.
  const needsDriverPaymentCheck = ride ? ride.paymentMethod !== 'card' : false
  const amountDue = ride ? ride.fareEstimate + ride.pabiliTip + ride.tipOffer : 0
  const bookedEWallet = ride?.paymentMethod === 'gcash' || ride?.paymentMethod === 'maya'
  const bookedMethodName = PAYMENT_METHODS.find((p) => p.id === ride?.paymentMethod)?.label ?? ride?.paymentMethod ?? ''

  // Real road-network route for the current leg, if the endpoints resolve —
  // must be called unconditionally before the early return below, so this
  // computes origin/destination defensively (null-safe) rather than after
  // confirming `ride` exists.
  // Drawn for the leg the tricycle is on, which on a shared trip is the
  // first passenger's — otherwise the marker rides one road while the line
  // traces another, and the vehicle appears to float beside the route.
  const legRide = ride ? primaryAboardRide(ride, rides) : null
  const isOngoingLeg = legRide?.status === 'ongoing'
  const routeLineOrigin = legRide
    ? isOngoingLeg
      ? legRide.pickup.gps
      : legRide.driverLiveGps ?? legRide.driverOriginGps ?? DRIVER_BASE_GPS
    : null
  const routeLineDestination = legRide ? (isOngoingLeg ? legRide.dropoff.gps : legRide.pickup.gps) : null
  const route = useRoute(routeLineOrigin ?? null, routeLineDestination ?? null)
  // Independent of which leg is current — always the pickup→destination
  // trip itself, so the driver can see how long the actual ride will take
  // even while still en route to pick the passenger up.
  const tripRoute = useRoute(ride?.pickup.gps ?? null, ride?.dropoff.gps ?? null)
  const tripDurationSeconds = tripRoute?.durationSeconds ?? ETA_SECONDS_PER_LEG

  useEffect(() => {
    if (!ride) return
    updateDriverLiveGps(ride.id, effectiveShareGps ? liveDriverGps : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveDriverGps, effectiveShareGps, ride?.id])

  if (!ride) return null

  const leg = getLegInfo(ride)
  const passenger = passengers.find((p) => p.id === ride.passengerId)
  const parentLink = parentLinks.find((l) => l.studentPassengerId === ride.passengerId)
  const parent = parentLink ? parents.find((p) => p.id === parentLink.parentId) : null
  const contacts = [
    ...(passenger?.phone ? [{ label: `Call ${passenger.name}`, phone: passenger.phone }] : []),
    ...(parent?.phone ? [{ label: `Call ${parent.name} (${parentLink?.relationship})`, phone: parent.phone }] : []),
    // "Book for someone else" rides have no Passenger/Parent record to look
    // a phone up from — the number typed at booking is carried on the ride
    // itself instead.
    ...(!passenger && !parent && ride.passengerPhone
      ? [{ label: `Call ${ride.passengerName}`, phone: ride.passengerPhone }]
      : []),
  ]

  const driverGpsInfo = sharedDriverMapGps(ride, rides, route)
  // True whenever the tricycle has anyone aboard — not just when this card's
  // own fare has started. While the driver was on the way to the second
  // passenger, this card's ride was still 'driver_arriving', so the callout
  // switched off mid-journey and the first passenger vanished from the map.
  const onBoard = rides.some((r) => r.driverId === ride.driverId && r.status === 'ongoing')
  const aboardRides = rides.filter((r) => r.driverId === ride.driverId && r.status === 'ongoing')
  const cardPlate = drivers.find((d) => d.id === ride.driverId)?.plateNumber ?? 'Tricycle'
  // "Cut the trip": the passenger said para, so the ride ends where the
  // tricycle is, not where the booking said. Recorded as an early drop-off
  // with the distance it fell short — the same thing the passenger's own
  // "I've gotten off" button does, because it is the same event seen from the
  // other seat. It unlocks that ride's Complete button; it does not complete
  // it, since the money still has to be confirmed.
  function markGotOffHere(rideId: string) {
    const target = rides.find((r) => r.id === rideId)
    const here = driverGpsInfo?.gps ?? null
    const booked = target?.dropoff.gps ?? null
    if (!here || !booked) {
      confirmPassengerArrival(rideId)
      return
    }
    const metersShort = Math.round(haversineDistanceMeters(here, booked))
    if (metersShort <= DROPOFF_PROXIMITY_METERS) {
      confirmPassengerArrival(rideId)
      return
    }
    confirmPassengerArrival(rideId, {
      gps: here,
      label: `${here.lat.toFixed(5)}, ${here.lng.toFixed(5)}`,
      metersShort,
    })
  }
  // One tricycle, one marker — so it names everybody in it, not just the
  // passenger whose card this happens to be.
  const aboardNames = aboardLabel(
    rides.filter((r) => r.driverId === ride.driverId && r.status === 'ongoing').map((r) => r.passengerName),
  )
  // "Start trip" means the passenger is now on board, so it should not be
  // pressable from across town — a driver tapping it early starts the fare
  // clock on someone who is still waiting on the kerb.
  //
  // Real shared GPS is preferred; the simulated position is the fallback so
  // this stays demonstrable with movement simulation on and nothing to
  // actually drive.
  const driverGpsForPickup = liveDriverGps ?? driverGpsInfo?.gps ?? null
  const metersFromPickup =
    driverGpsForPickup && ride.pickup.gps
      ? Math.round(haversineDistanceMeters(driverGpsForPickup, ride.pickup.gps))
      : null
  // Unknown position is not treated as "not there": with no coordinate to
  // judge, blocking the driver would strand a real trip over a GPS permission
  // prompt. Only a known position that is too far actually holds the button.
  const atPickup = metersFromPickup === null || metersFromPickup <= PICKUP_PROXIMITY_METERS
  const metersFromDropoff =
    driverGpsForPickup && ride?.dropoff.gps
      ? Math.round(haversineDistanceMeters(driverGpsForPickup, ride.dropoff.gps))
      : null
  // Unknown position never blocks — same rule as the pickup end.
  const atDropoff = metersFromDropoff === null || metersFromDropoff <= DROPOFF_PROXIMITY_METERS
  const passengerGpsInfo = getPassengerMapGps(ride)
  const framing = tripMapFraming(ride.status, ride.legProgress)
  const now = useNow(5000, ride.status === 'driver_arriving')
  const forgotStart = forgotToStartTrip(ride, driverGpsForPickup, now)

  // The shopping list, as a list. It is stored as one line of text (that is
  // what the passenger typed and what every other screen shows), so it is
  // split back apart here — the driver in the store needs to tick items off,
  // not read a paragraph.
  const isErrandRide = ride.serviceType === 'pabili' || ride.serviceType === 'buy_medicine'
  const shoppingList =
    isErrandRide && ride.pabiliItems
      ? ride.pabiliItems.split(',').map((part) => part.trim()).filter(Boolean)
      : []
  const boughtCount = shoppingList.filter((_, i) => ride.pabiliBoughtIndexes.includes(i)).length
  const allBought = shoppingList.length > 0 && boughtCount === shoppingList.length
  // Buying comes before delivering: on an errand the trip to the customer
  // cannot start until the goods are actually in the sidecar. On a plain ride
  // there is nothing to buy, so nothing to wait for.
  const shoppingDone = !isErrandRide || shoppingList.length === 0 || allBought

  // The trip starts itself when the tricycle reaches the passenger.
  //
  // Arriving and picking someone up is one act, not two, and the second half
  // of it was a button — so the fare began whenever the driver next looked at
  // their phone, which is not when the passenger got on. Both ends paid for
  // that: the passenger's trip appeared to start late, and the driver got
  // nagged about a step they were in the middle of performing.
  //
  // Measured against the passenger's own position where they are sharing it,
  // the pickup pin otherwise (see getPassengerMapGps) — "the driver and the
  // passenger are in the same place" is the real condition, and the pin is
  // only ever a stand-in for the person.
  //
  // The button stays exactly where it was. A driver who is holding the phone
  // can still start the trip themselves, and must be able to: GPS can be off,
  // refused, or simply wrong, and this must never be the only way in.
  const metersFromPassenger =
    driverGpsForPickup && passengerGpsInfo?.gps
      ? Math.round(haversineDistanceMeters(driverGpsForPickup, passengerGpsInfo.gps))
      : null
  const autoStartRef = useRef<string | null>(null)
  useEffect(() => {
    if (!ride || ride.status !== 'driver_arriving') return
    // An errand's shopping list still has to be finished first — starting the
    // ride mid-list would strand the items the passenger is paying for.
    if (!shoppingDone) return
    if (metersFromPassenger === null || metersFromPassenger > AUTO_START_METERS) return
    // Once per ride. Without this the effect re-fires on every position tick
    // between arriving and the status actually changing.
    if (autoStartRef.current === ride.id) return
    autoStartRef.current = ride.id
    onStart()
  }, [ride, metersFromPassenger, shoppingDone, onStart])
  // Defensive: a MockLocation from before `gps` existed (stale localStorage)
  // has no real coordinate to plot — skip that point rather than crash.
  const mapPoints: MapPoint[] = [
    ...(ride.pickup.gps ? [{ id: 'pickup', gps: ride.pickup.gps, color: '#0d9488', label: formatAddressLine(ride.pickup.label) }] : []),
    ...(ride.dropoff.gps ? [{ id: 'dropoff', gps: ride.dropoff.gps, color: '#e11d48', label: formatAddressLine(ride.dropoff.label) }] : []),
    ...(driverGpsInfo
      ? [
          {
            id: 'driver',
            gps: driverGpsInfo.gps,
            color: '#2563eb',
            // Once the passenger is aboard the marker says who is in the
            // sidecar, pinned open the way it is on their phone — the driver
            // carrying two trips needs to see at a glance which one this
            // moving dot is, not just that it is them.
            label: onBoard
              ? `${cardPlate} · 🧍 ${aboardNames}`
              : driverGpsInfo.isLive
                ? 'You — live GPS'
                : 'You — estimated',
            callout: onBoard,
            pulse: true,
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
            label: `${ride.passengerName} — ${passengerGpsInfo.isLive ? 'live GPS' : 'shared pin'}`,
            pulse: passengerGpsInfo.isLive,
          },
        ]
      : []),
  ]
  const routeLine =
    route && route.points.length > 1
      ? route.points
      : routeLineOrigin && routeLineDestination
        ? [routeLineOrigin, routeLineDestination]
        : undefined

  return (
    <section className="space-y-3 rounded-xl border border-brand-200 bg-brand-50 p-4 shadow-sm">
      {ride.bookedByParentId && <p className="text-xs text-slate-500">📋 Booked by parent</p>}
      {(ride.serviceType === 'pabili' || ride.serviceType === 'buy_medicine') && (
        <p className="text-sm font-medium text-slate-700">
          {ride.serviceType === 'pabili' ? '🛍️ Pabili' : '💊 Buy Medicine'}
        </p>
      )}
      {(ride.serviceType === 'pabili' || ride.serviceType === 'buy_medicine') && ride.pabiliItems && (
        <p className="rounded-lg bg-white p-2 text-xs text-slate-600">🛒 {ride.pabiliItems}</p>
      )}
      {ride.serviceType === 'buy_medicine' &&
        (ride.prescriptionDataUrls.length > 0 || ride.seniorIdDataUrl || ride.otherDocDataUrl) && (
          <div className="space-y-1 rounded-lg bg-white p-2">
            <p className="text-[11px] font-medium text-slate-500">Passenger's documents for the pharmacy</p>
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
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-xs text-slate-500">
          <span className="text-base font-bold text-slate-800">Fare: ₱{ride.fareEstimate}</span>
          {ride.pabiliTip > 0 && <span className="ml-2">· +₱{ride.pabiliTip} tip</span>}
          {ride.tipOffer > 0 && <span className="ml-2 font-medium text-emerald-600">· +₱{ride.tipOffer} tip offer</span>}
          {ride.passengerCount > 1 && <span className="ml-2">· 👥 {ride.passengerCount} passengers</span>}
        </p>
        <div className="shrink-0 text-right">
          <p className="text-xs font-medium text-brand-700">
            🛺 {ride.status === 'driver_arriving' ? 'To pickup: ' : 'To destination: '}
            {formatEta(leg.etaSeconds)}
          </p>
          <p className="text-[11px] font-medium text-slate-500">
            🏁 Trip: ~{Math.max(1, Math.round(tripDurationSeconds / 60))} min
          </p>
        </div>
      </div>

      {ride.pickupGps && ride.status === 'driver_arriving' && (
        <a
          href={`https://www.google.com/maps?q=${ride.pickupGps.lat},${ride.pickupGps.lng}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
        >
          📍 Passenger shared their exact GPS location — open in Maps
        </a>
      )}

      {contacts.length > 0 && (
        // -mt-2 cancels most of the section's own space-y-3 so this sits with
        // the fare rather than floating between it and the map.
        <div className="-mt-2 flex flex-wrap gap-2">
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

      {showMap && (
        <div ref={tripMapRef} className="scroll-mt-24">
          <RealLiveMap
            points={extraPoints && extraPoints.length > 0 ? [...mapPoints, ...extraPoints] : mapPoints}
            routeLine={routeLine}
            routeIsReal={!!route}
            hintLine={hintLine && hintLine.length > 1 ? hintLine : undefined}
            routeVariant={legRide?.status === 'driver_arriving' ? 'pickup' : 'trip'}
            refitSignal={framing.phase}
            followAll={framing.followAll}
            fitPointIds={
              extraPoints && extraPoints.length > 0 && framing.fitPointIds
                ? [...framing.fitPointIds, ...extraPoints.map((p) => p.id)]
                : framing.fitPointIds
            }
            frozen={framing.frozen}
          />
        </div>
      )}
      {route && (
        <p className="text-center text-[11px] text-slate-400">
          🛣️ Real road route: {(route.distanceMeters / 1000).toFixed(1)} km · ~
          {Math.max(1, Math.round(route.durationSeconds / 60))} min drive
        </p>
      )}
      {/* In real-GPS mode the driver's location is the only thing that can
          move the marker, so opting out would leave the passenger, parent and
          TODA watching a frozen map for a trip that's actually underway —
          the switch is locked on and shown as required, not offered. */}
      {gpsSharingLocked ? (
        <div className="w-full rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-center">
          <p className="text-xs font-medium text-blue-700">📡 Sharing your live GPS location</p>
          <p className="mt-0.5 text-[11px] text-blue-600">Required for this trip — set by the app administrator.</p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShareLiveGps((v) => !v)}
          className={`w-full rounded-lg border py-1.5 text-xs font-medium transition ${
            shareLiveGps
              ? 'border-blue-300 bg-blue-50 text-blue-700'
              : 'border-slate-300 text-slate-600 hover:bg-slate-50'
          }`}
        >
          {shareLiveGps ? '📡 Sharing your live GPS location — tap to stop' : '📡 Share my live GPS location'}
        </button>
      )}
      {effectiveShareGps && liveGpsError && <p className="text-[11px] text-amber-700">{liveGpsError}</p>}

      {ride.status === 'driver_arriving' && shoppingList.length > 0 && atPickup && (
        <div className="space-y-2 rounded-lg border border-gold-400/70 bg-gold-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-700">🛒 Buy these {shoppingList.length} item(s)</p>
            <span className={`text-[11px] font-semibold ${allBought ? 'text-emerald-700' : 'text-slate-500'}`}>
              {boughtCount} of {shoppingList.length} bought
            </span>
          </div>
          <div className="space-y-1">
            {shoppingList.map((item, i) => {
              const bought = ride.pabiliBoughtIndexes.includes(i)
              return (
                <button
                  key={`${i}-${item}`}
                  type="button"
                  onClick={() => setPabiliItemBought(ride.id, i, !bought)}
                  className={`flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition ${
                    bought
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span aria-hidden className="mt-px shrink-0 text-sm leading-none">{bought ? '☑️' : '⬜'}</span>
                  <span className={`min-w-0 break-words ${bought ? 'line-through opacity-70' : ''}`}>{item}</span>
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-slate-500">
            {allBought
              ? 'All bought — you can start the trip to the drop-off.'
              : `Tick each item as you buy it. The trip to ${formatAddressLine(ride.dropoff.label)} unlocks once the list is complete.`}
          </p>
        </div>
      )}

      {/* The "did you forget to start the trip?" prompt used to live here.
          It was the right answer to a trip that only started when someone
          pressed a button; now that arriving starts it, the question no
          longer has a case to describe. forgotToStartTrip stays in use below,
          where it still does its other job: keeping the button pressable for
          a driver who has already moved on past the pickup. */}
      {ride.status === 'driver_arriving' && (
        <>
          <button
            onClick={onStart}
            disabled={(!atPickup && !forgotStart.movedAway) || !shoppingDone}
            className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
          >
            {!shoppingDone
              ? `Buy all ${shoppingList.length} item(s) first — ${boughtCount} done`
              : atPickup || forgotStart.movedAway
                ? 'Start trip'
                : `Drive to the pickup to start — ${formatKm(metersFromPickup)} away`}
          </button>
          {!atPickup && !forgotStart.movedAway && (
            <p className="text-center text-[11px] text-slate-500">
              Starts the fare, so it unlocks within {formatKm(PICKUP_PROXIMITY_METERS)} of {formatAddressLine(ride.pickup.label)}.
            </p>
          )}
        </>
      )}
      {/* Locked while the trip is still running, the same way Start is locked
          until the driver reaches the pickup. A fare ended mid-journey charges
          the full amount for half a ride and opens a payment form on a moving
          tricycle. Two things unlock it, and they are the only two ways a trip
          really ends: arriving, or the passenger saying they are getting off
          here. */}
      {ride.status === 'ongoing' && !(needsDriverPaymentCheck && confirmingPayment) && (
        <>
          <button
            disabled={!atDropoff && !ride.passengerArrivedAt}
            onClick={() => {
              if (needsDriverPaymentCheck) setConfirmingPayment(true)
              else onComplete()
            }}
            className={`w-full rounded-lg py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 ${
              ride.passengerArrivedAt
                ? 'animate-pulse bg-amber-600 hover:bg-amber-700'
                : 'bg-brand-600 hover:bg-brand-700'
            }`}
          >
            {ride.passengerArrivedAt ? `Passenger got off — confirm ₱${amountDue} received` : 'Complete trip'}
          </button>
          {!atDropoff && !ride.passengerArrivedAt && !pickingWhoGetsOff && (
            <button
              type="button"
              onClick={() => {
                // One passenger, no question to ask.
                if (aboardRides.length <= 1) {
                  markGotOffHere(ride.id)
                  return
                }
                setPickingWhoGetsOff(true)
              }}
              className="w-full rounded-lg border border-amber-400 bg-white py-2 text-xs font-semibold text-amber-800 hover:bg-amber-50"
            >
              🚶 Someone is getting off here — end their trip
            </button>
          )}
          {pickingWhoGetsOff && (
            <div className="space-y-1.5 rounded-lg border-2 border-amber-400 bg-amber-50 p-3">
              {/* With more than one fare aboard, "someone is getting off" is
                  not enough to act on — the wrong trip would be closed and the
                  wrong passenger charged. */}
              <p className="text-sm font-bold text-amber-900">Who is getting off here?</p>
              {aboardRides.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    markGotOffHere(r.id)
                    setPickingWhoGetsOff(false)
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-800 hover:bg-amber-100"
                >
                  <span className="min-w-0 truncate">🧍 {shortName(r.passengerName)}</span>
                  <span className="shrink-0 text-[11px] font-bold text-amber-700">₱{r.fareEstimate}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPickingWhoGetsOff(false)}
                className="w-full rounded-lg py-1.5 text-[11px] font-semibold text-slate-500 hover:bg-amber-100"
              >
                Nobody — keep going
              </button>
            </div>
          )}
          {!atDropoff && !ride.passengerArrivedAt && !pickingWhoGetsOff && (
            <p className="text-center text-[11px] text-slate-400">
              {metersFromDropoff !== null
                ? `Nasa ${formatKm(metersFromDropoff)} ka pa mula sa ${formatAddressLine(ride.dropoff.label)} — bubukas ito`
                : 'Bubukas ito'}{' '}
              paglapit sa babaan, o kapag sinabi ng pasahero na dito na siya bababa.
            </p>
          )}
        </>
      )}

      {/* The money is the driver's to confirm, whatever the method. GCash and
          Maya used to complete straight through on the assumption the transfer
          had landed — but nothing in this app watches an e-wallet, so that was
          the driver vouching for a payment they had not been asked about. Cash,
          GCash and Maya now all stop here; Card is the one method the checkout
          itself settles. */}
      {ride.status === 'ongoing' && needsDriverPaymentCheck && confirmingPayment && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
          {ride.actualDropoff && (
            <p className="rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-[11px] text-amber-900">
              🚩 Got out early at <span className="font-semibold">{ride.actualDropoff.label}</span> —{' '}
              {formatKm(ride.actualDropoff.metersShort)} short of {formatAddressLine(ride.dropoff.label)}. This is what the trip record will
              show.
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => onComplete(paidMethod ?? ride.paymentMethod)}
              className="flex-1 rounded-lg bg-amber-600 py-2 text-xs font-semibold text-white hover:bg-amber-700"
            >
              Confirm &amp; complete trip
            </button>
            <button
              onClick={() => setConfirmingPayment(false)}
              className="flex-1 rounded-lg border border-slate-300 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Not paid yet
            </button>
          </div>
          <p className="text-xs font-medium text-amber-800">
            Confirm you've received ₱{amountDue} from the passenger
            {ride.pabiliTip + ride.tipOffer > 0 &&
              ` (₱${ride.fareEstimate} fare + ₱${ride.pabiliTip + ride.tipOffer} tip)`}
            .
          </p>
          {bookedEWallet ? (
            <>
              <p className="rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-[11px] text-amber-800">
                🔒 {bookedMethodName} — recorded by the system from the passenger's payment. You cannot change this.
              </p>
              {/* The one override a driver may make: the e-wallet transfer did
                  not happen and they were handed cash at the kerb. */}
              <button
                type="button"
                onClick={() => setPaidMethod((m) => (m === 'cash' ? null : 'cash'))}
                className={`w-full rounded-lg border py-1.5 text-[11px] font-semibold transition ${
                  paidMethod === 'cash'
                    ? 'border-amber-600 bg-amber-600 text-white'
                    : 'border-amber-300 bg-white text-amber-800 hover:bg-amber-100'
                }`}
              >
                {paidMethod === 'cash'
                  ? `✓ Paid in cash instead — not ${bookedMethodName}`
                  : `They paid cash instead of ${bookedMethodName}`}
              </button>
            </>
          ) : (
            <p className="rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-[11px] text-amber-800">
              💵 Cash — confirm the passenger handed you the fare.
            </p>
          )}
        </div>
      )}
      {ride.status !== 'completed' && ride.status !== 'cancelled' && (
        <div className="border-t border-slate-200 pt-2">
          {!cancelling ? (
            <button
              type="button"
              onClick={() => setCancelling(true)}
              className="w-full rounded-lg border border-amber-300 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50"
            >
              ⚠️ Cancel this trip
            </button>
          ) : (
            <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="text-xs font-semibold text-amber-900">Why is this trip being cancelled?</p>
              <p className="text-[11px] text-amber-800">
                {ride.passengerName} is told the reason, and your TODA sees it on the trip record.
              </p>
              <select
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value as RideCancellationReason)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs"
              >
                {Object.entries(RIDE_CANCELLATION_REASON_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                value={cancelNote}
                onChange={(e) => setCancelNote(e.target.value)}
                placeholder={cancelReason === 'other' ? 'Say what happened (required)' : 'Add a detail (optional)'}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs"
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCancelling(false)
                    setCancelNote('')
                  }}
                  className="rounded-lg border border-slate-300 bg-white py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Keep the trip
                </button>
                <button
                  type="button"
                  // "Other" without a word of explanation is the same as no
                  // reason at all, so it is the one case that must be typed.
                  disabled={cancelReason === 'other' && !cancelNote.trim()}
                  onClick={() => {
                    driverCancelRide(ride.id, cancelReason, cancelNote.trim() || null)
                    setCancelling(false)
                    setCancelNote('')
                  }}
                  className="rounded-lg bg-amber-600 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                >
                  Cancel trip
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
