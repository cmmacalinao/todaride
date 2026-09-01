import { formatAddressLine } from '../lib/addressFormat'
import { formatTripRoute } from '../lib/addressFormat'
import { showInMiddle, showInMiddleWhenSettled } from '../lib/showInMiddle'
import { NearbyDriversPicker, buildNearbyDrivers } from '../components/NearbyDriversPicker'
import { RidePaymentForm } from '../components/RidePaymentForm'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ETA_SECONDS_PER_LEG, errandBaseFare, useRides } from '../context/RideContext'
import { AnnouncementFeed } from '../components/AnnouncementFeed'
import { useRoute } from '../lib/routing'
import { useSession } from '../context/SessionContext'
import {
  CLSU_MAIN_GATE_LOCATION,
  DEFAULT_DROPOFF_LOCATION,
  DEFAULT_BOOKING_ADDRESS_DETAIL,
  DEFAULT_BOOKING_BARANGAY,
  DEFAULT_BOOKING_CITY,
  DEFAULT_BOOKING_PROVINCE,
  DRIVER_REPORT_REASONS,
  DRIVER_REPORT_REASON_LABELS,
  MOCK_LOCATIONS,
  PAYMENT_METHODS,
  estimateFare,
  estimateFareBreakdown,
  estimateSpecialPickupBreakdown,
  getCitiesForProvince,
  getPriorityTodaOrgId,
  getTerminalGps,
} from '../mock/data'
import { getCurrentGeoPosition } from '../lib/geo'
import { isInAppBrowser, openInBrowserHint } from '../lib/inAppBrowser'
import { isWithinRetentionDays } from '../lib/tracking'
import {
  createCustomLocation,
  resolvePhAddress,
  resolveNearbyPublicMarket,
  reverseGeocodeToPhAddress,
  type PhAddressTags,
} from '../lib/customLocation'
import { StatusBadge } from '../components/StatusBadge'
import { ReceiptCard } from '../components/ReceiptCard'
import { StarRating } from '../components/StarRating'
import { TripMonitor } from '../components/TripMonitor'
import { PassengerRegisterForm } from '../components/PassengerRegisterForm'
import { BarangayAddressPicker } from '../components/BarangayAddressPicker'
import { FAR_DRIVER_METERS, formatDuration, formatKm, haversineDistanceMeters, minutesToCover } from '../lib/geo'
import { LocationMapPicker } from '../components/LocationMapPicker'
import type { MapPoint } from '../components/RealLiveMap'
import { MedsBooking } from '../components/MedsBooking'
import { EmergencyHotlines } from '../components/EmergencyHotlines'
import { PabiliItemsInput } from '../components/PabiliItemsInput'
import { makeGuestPassengerId, useGuestRider } from '../components/GuestRiderFields'
import { PassengerRewardsCard } from '../components/PassengerRewardsCard'
import { terminalRideIsFree } from '../lib/terminalFee'
import { GroupRideInlinePanel, type GroupRiderEntry } from '../components/GroupRideInlinePanel'
import type {
  DriverReportReason,
  GeoCoords,
  MockLocation,
  PaymentMethod,
  Pharmacy,
  Ride,
  SavedLocationLabel,
  ServiceType,
} from '../types'

const MAX_RIDE_PASSENGERS = 4
const SAVED_LOCATION_LABELS: SavedLocationLabel[] = ['Home', 'School', 'Work', 'Favorite']

const SAVED_LOCATION_ICONS: Record<SavedLocationLabel, string> = {
  Home: '🏠',
  School: '🏫',
  Work: '💼',
  Favorite: '⭐',
}
// Home/School/Work are single-slot (saving one replaces the old one), so
// their button just names the slot. Favorite accumulates instead — the "+"
// makes clear that tapping it adds another rather than replacing anything.
function savedLocationButtonLabel(label: SavedLocationLabel): string {
  return label === 'Favorite' ? `+ ${SAVED_LOCATION_ICONS[label]} ${label}` : `${SAVED_LOCATION_ICONS[label]} ${label}`
}

export function PassengerPage() {
  const {
    rides,
    passengers,
    drivers,
    todaOrganizations,
    tariffSettings,
    pabiliServiceFee,
    pabiliFareMode,
    terminals,
    pabiliFixedFare,
    specialPickupEscalationMs,
    tripHistoryRetentionDays,
    requestRide,
    requestGroupRide,
    cancelRide,
    todaRadiusKm,
    outOfAreaPerKm,
    setFavoriteDriver,
    terminalQrFeeWaived,
    commissionPerRide,
    acknowledgeRidePayment,
    requestedDrivers,
    setRequestedDriver,
    savePassengerLocation,
    removePassengerLocation,
    medsOrders,
    pharmacies,
    pabiliEnabled,
    medsEnabled,
    vendorsEnabled,
  } = useRides()
  // The "no booking app fee" promise, only where it is still true.
  const terminalTripIsFree = terminalRideIsFree(terminalQrFeeWaived, commissionPerRide)
  const { currentPassengerId, setCurrentPassengerId, authedAccount } = useSession()
  // Only the Admin ops view (/passenger) needs to switch between accounts to
  // test as anyone — a real logged-in passenger's identity is fixed to
  // whoever authenticated, same as the Driver app.
  const isAdminOpsView = authedAccount?.role === 'admin'
  const bookingMapRef = useRef<HTMLDivElement>(null)
  const [showDrivers, setShowDrivers] = useState(false)
  // Which end the Save Places chips apply to. Starts on Pickup: it is the
  // one that always has an address, and the one people save first.
  const [savePlaceTarget, setSavePlaceTarget] = useState<'pickup' | 'dropoff'>('pickup')
  const [customLocations, setCustomLocations] = useState<MockLocation[]>([])
  const [pickupId, setPickupId] = useState(CLSU_MAIN_GATE_LOCATION.id)
  // Same city as the default pickup — see DEFAULT_DROPOFF_LOCATION for why.
  const [dropoffId, setDropoffId] = useState(DEFAULT_DROPOFF_LOCATION.id)
  // Where to is the field that decides the fare, the route, and where a
  // person physically ends up — and unlike the pickup, nobody is standing at
  // it to notice a wrong guess. So a ride carries no destination until one is
  // chosen: an id is still held underneath (the map and fare maths need a
  // point to work from) but nothing is shown, priced, or bookable on it.
  //
  // Errands are the other way round. There "Deliver to" is where the customer
  // already is, which is exactly the kind of thing worth guessing, so it
  // keeps its default.
  const [dropoffChosen, setDropoffChosen] = useState(false)
  // Whether the pickup is still the app's opening guess rather than the
  // passenger's answer — a guess should say so.
  const [pickupChosen, setPickupChosen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [passengerCount, setPassengerCount] = useState(1)
  const [showRegister, setShowRegister] = useState(false)
  const [pageTab, setPageTab] = useState<'book' | 'rewards' | 'emergency'>('book')
  const serviceTabsRef = useRef<HTMLDivElement>(null)
  const addressSectionRef = useRef<HTMLElement>(null)
  // On an errand the addresses are a later question than what to buy, so the
  // From/Where-to block waits behind a "Book a tricycle" button rather than
  // standing between the customer and the item list.
  const [showErrandBooking, setShowErrandBooking] = useState(true)
  // The item list is the order itself, so it opens on request too. Between
  // them the errand screen starts as two plain choices — write the order, or
  // book the ride — instead of one long form to scroll through.
  const [showOrderBox, setShowOrderBox] = useState(false)

  // Brings the opened panel into view — used only by the Rewards and
  // Emergency icons, which swap the whole page below for something the reader
  // has not seen yet.
  //
  // The service tabs deliberately do NOT call this: they are already under
  // the reader's eye when tapped, so scrolling only moved the ground beneath
  // them. When a ride still needs acknowledging the booking form is replaced
  // by that ride card, so this points at the blocking card rather than the
  // tabs — it carries the way out.
  function revealFromTabs() {
    const blocker = activeRide ? currentRideSectionRef.current : null
    const target = blocker ?? serviceTabsRef.current
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  // Top-level choice on the home screen: am I riding, or am I asking a driver
  // to buy something and bring it to me. Ride goes straight to the booking
  // form; "Buy for me" first asks what kind of errand via the tile row.
  const [homeMode, setHomeMode] = useState<'ride' | 'buy'>('ride')
  // Food has no catalog of its own yet — resto/vendor partners can register
  // and manage products, but nothing customer-facing orders from them. The
  // working path today is Pabili (the driver buys it for you), so the Food
  // tile opens that and this flag explains the substitution rather than
  // pretending a resto menu exists.
  const [foodHinted, setFoodHinted] = useState(false)
  // Favourite-driver search box. Once a TODA has more than a handful of
  // members a dropdown of every approved driver is unusable on a phone —
  // typing a name or a plate is how a passenger actually knows their driver.
  const [driverQuery, setDriverQuery] = useState('')
  const [driverPickerOpen, setDriverPickerOpen] = useState(false)
  // Which of From / Where to is expanded into its barangay + sub-address
  // fields. Only one at a time: the card stays short, and it mirrors how the
  // map picker already scopes itself to one end.
  const [openEnd, setOpenEnd] = useState<'pickup' | 'dropoff' | null>(null)
  // Which city the barangay list is showing. Scoped to the end being edited,
  // NOT to the booking — a trip from CLSU to San Jose City is two different
  // cities, and the picker has to be able to point at each in turn without
  // the second choice overwriting the first.
  // Blank until someone says, like the two address boxes below it. A city
  // sitting there unasked is the same guess-as-answer the pickup used to
  // make: it decides which barangays the picker offers, so a passenger in
  // San Jose was shown a list from Munoz and had to notice.
  const [cityScope, setCityScope] = useState('')
  const [pickupGps, setPickupGps] = useState<GeoCoords | null>(null)
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'locating' | 'done' | 'error'>('idle')
  // Fixed for the life of the page — the browser cannot change underneath us.
  const inApp = isInAppBrowser()
  const [gpsError, setGpsError] = useState('')
  const [serviceType, setServiceType] = useState<ServiceType>('ride')
  const [pabiliItems, setPabiliItems] = useState('')
  // Bumping this remounts PabiliItemsInput fresh (clearing its internal
  // table rows) after a successful submit — it owns its own row state and
  // has no other way to know pabiliItems was reset out from under it.
  const [pabiliItemsResetKey, setPabiliItemsResetKey] = useState(0)
  // The specific store/establishment to buy from, typed freeform (e.g. "7-Eleven",
  // "SM Grocery", "Aling Nena's Store") — overrides the resolved pickup point's
  // generic label (a public-market proxy or a dropped pin) only at request time
  // (see handleRequest), same pattern MedsBooking's "direct" flow uses for
  // directPharmacyName, so the driver's ride card shows the actual store name.
  const [storeName, setStoreName] = useState('')
  const [tipInput, setTipInput] = useState('')
  const [specialPickupRequested, setSpecialPickupRequested] = useState(false)
  // Buong tricycle. A driver on an ordinary trip may sweep up another
  // passenger standing on the route; this is how a passenger says no to
  // that before it happens, rather than arguing about it mid-ride.
  const [specialTrip, setSpecialTrip] = useState(false)
  // Stable for the component's lifetime (not regenerated per render) — a
  // MEDS order needs a customerId that stays the same across the whole
  // pharmacy→catalog→cart flow, same as a guest ride's id is only minted
  // once at actual submit time.
  const [guestCustomerId] = useState(() => makeGuestPassengerId())
  // Bumping `key` remounts the matching BarangayAddressPicker with these
  // exact values as its new defaults — the only way to push an externally
  // chosen location (a Saved Place quick-pick) into a picker that otherwise
  // owns its own dropdown state, so the dropdowns don't keep showing
  // whatever they last had while pickupId/dropoffId already moved on.
  const [pickupPickerSeed, setPickupPickerSeed] = useState({ key: 0, province: '', city: '', barangay: '', addressDetail: '' })
  const [dropoffPickerSeed, setDropoffPickerSeed] = useState({ key: 0, province: '', city: '', barangay: '', addressDetail: '' })
  // Which of Pickup/Destination the map picker's toggle is on — also
  // controls which address form shows below the map, so only one is on
  // screen at a time instead of both stacked.
  const [mapTarget, setMapTarget] = useState<'pickup' | 'dropoff'>('pickup')
  const [groupRiders, setGroupRiders] = useState<GroupRiderEntry[]>([])
  const [groupPaySplit, setGroupPaySplit] = useState<'separate' | 'booker'>('separate')
  const [groupSubmitting, setGroupSubmitting] = useState(false)
  // Whether this passenger has already been told how far the nearest driver
  // is, and said yes anyway. Reset when the pickup moves, because a different
  // pickup is a different question.
  const [farDriverConfirmed, setFarDriverConfirmed] = useState(false)
  const [farDriverPrompt, setFarDriverPrompt] = useState(false)
  // When set, the SAME pickup/destination map already on this page (see
  // LocationMapPicker below) is picking a destination for this group rider
  // instead of the page's own `dropoff` — there is no second map built just
  // for Group Ride. Cleared once a location resolves.
  const [pickingForGroupRiderKey, setPickingForGroupRiderKey] = useState<string | null>(null)
  // Lets completed rides be dismissed from the "current trip" slot without
  // requiring a payment-method tap first — see TripMonitor's onDismiss. A
  // set, not a single id, since more than one ride can pile up unacknowledged
  // (e.g. several cash trips completed in a row) and each needs its own
  // dismissal, not just the most recent.
  const [dismissedRideIds, setDismissedRideIds] = useState<Set<string>>(new Set())
  // The From/Where-to pair — scrolled to after a trip is closed out, so the
  // next booking starts with the two fields that begin it on screen.
  const endpointsRef = useRef<HTMLDivElement | null>(null)
  // Trip history starts collapsed — it's a long, low-priority list the
  // passenger only wants to check occasionally, not something that should
  // push the actual booking form further down the page by default.
  const [showTripHistory, setShowTripHistory] = useState(false)
  // Saved places folds for the same reason Trip history does: a list you
  // consult now and then should not push the booking form down the screen
  // every time you open the app. The count is in the header so it still
  // reports what is in there while closed.
  const [showSavedPlaces, setShowSavedPlaces] = useState(false)
  // The booking form starts collapsed behind a single "Book a Ride" CTA so
  // Pickup/Destination don't require scrolling past the full form once the
  // passenger actually starts booking.
  // Scroll targets for the hamburger drawer's "My Current Ride" and "Ride
  // History" items (see NavDrawer/NavBar) — the drawer can't reach into
  // this page's own tab/collapse state directly since it's a sibling
  // component, so NavBar navigates here with `location.state.section`
  // instead and this page does the actual tab-switch/expand/scroll below.
  const currentRideSectionRef = useRef<HTMLDivElement>(null)
  const tripHistorySectionRef = useRef<HTMLElement>(null)
  const guestRider = useGuestRider()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()

  // Sakay sa Terminal has its own address again (/book/terminal). It shares
  // this page's state — the same pickup, the same destination, the same one
  // map instance — so it stays this component rather than a second one that
  // would have to rebuild all of it. What the route buys is that it behaves
  // like the screen it is: a back button that works, a history entry, and a
  // link that can be sent to someone.
  //
  // Group Ride is still a panel on this page; it is a variation on booking
  // rather than a different thing to be doing.
  const openTrackMyTrip = () => navigate('/book/terminal')
  // Group Ride, the same way. It needs the page's map as much as the
  // terminal screen does — pinning each rider's own destination is done on
  // it — so it also stays this component and takes the map with it.
  const groupRideOpen = location.pathname === '/book/group'
  const setGroupRideOpen = (open: boolean) => navigate(open ? '/book/group' : '/book')

  // Lets the landing page's "💊 Buy a Medicine" button link straight into
  // the Medicine flow (/book?service=buy_medicine) instead of dropping the
  // passenger on the collapsed "Ready to head out?" prompt.
  useEffect(() => {
    if (medsEnabled && searchParams.get('service') === 'buy_medicine') {
      setPageTab('book')
      setServiceType('buy_medicine')
      return
    }
    // A Ride in progress always shows regardless of bookingStarted (see
    // activeRide below, checked outside the collapsed-CTA gate) — a MEDS
    // order needs the same treatment, since MedsBooking itself is only
    // rendered once bookingStarted && isBuyMedicine are both true. Without
    // this, a passenger who placed an order, closed the tab, and came back
    // would land on the generic "Ready to head out?" prompt with no sign
    // their order (awaiting a quote, or already quoted) still exists.
    const resolvedPassengerId = currentPassengerId ?? passengers[0]?.id
    const hasActiveMedsOrder = medsOrders.some((o) => {
      if (o.customerId !== resolvedPassengerId) return false
      if (o.status === 'pending_confirmation' || o.status === 'quoted' || o.status === 'confirmed' || o.status === 'ready_for_pickup') {
        return true
      }
      if (o.status !== 'dispatched') return false
      const linkedRideStatus = rides.find((r) => r.id === o.linkedRideId)?.status
      return linkedRideStatus !== 'completed' && linkedRideStatus !== 'cancelled' && linkedRideStatus !== 'declined'
    })
    // A "driver buys it directly" request (see MedsBooking's 'direct' step)
    // dispatches straight to a Ride with no MedsOrder behind it at all — the
    // above check alone would miss it.
    const hasActiveDirectMedsRide = rides.some(
      (r) =>
        r.passengerId === resolvedPassengerId &&
        r.serviceType === 'buy_medicine' &&
        !medsOrders.some((o) => o.linkedRideId === r.id) &&
        !['completed', 'cancelled', 'declined'].includes(r.status),
    )
    if (hasActiveMedsOrder || hasActiveDirectMedsRide) {
      setPageTab('book')
      setServiceType('buy_medicine')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Hamburger-drawer navigation (see NavBar.tsx/NavDrawer.tsx) — a menu
  // item calls navigate('/book', { state: { section } }). location.key
  // changes on every such call, even re-clicking the same item while
  // already on /book, so this fires every time rather than only reacting
  // to a value change like the mount-only effect above.
  useEffect(() => {
    const section = (location.state as { section?: string } | null)?.section
    if (!section) return
    // Clear the state right away so back/forward or a later same-route
    // navigation doesn't replay a stale section.
    navigate(location.pathname, { replace: true, state: {} })
    const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })
    switch (section) {
      case 'home':
        setPageTab('book')
        scrollTop()
        break
      case 'ride':
        setPageTab('book')
        setServiceType('ride')
        scrollTop()
        break
      case 'medicine':
        if (!medsEnabled) break
        setPageTab('book')
        setServiceType('buy_medicine')
        scrollTop()
        break
      case 'pabili':
        if (!pabiliEnabled) break
        setPageTab('book')
        setServiceType('pabili')
        scrollTop()
        break
      case 'current':
        setPageTab('book')
        setTimeout(() => currentRideSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
        break
      case 'history':
        setShowTripHistory(true)
        setTimeout(() => tripHistorySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
        break
      case 'rewards':
        setPageTab('rewards')
        scrollTop()
        break
      default:
        break
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  const passenger = passengers.find((p) => p.id === currentPassengerId) ?? passengers[0]
  // Who this passenger picked off the nearby list, for this booking only —
  // cleared once the ride is placed, unlike the favourite which is saved on
  // the account. Kept in shared state rather than local so the other half of
  // the split screen can follow the choice (see SimulatorPage).
  const requestedDriverId = requestedDrivers[passenger.id] ?? null
  // Set by TerminalScanPage when the passenger got here by scanning the QR
  // inside a tricycle. Read once per booking — it describes how this ride
  // started, not a standing preference.
  const boardedAtTerminal = (location.state as { terminalBoarding?: boolean } | null)?.terminalBoarding === true
  // Coming back from Sakay sa Pila with a driver chosen: the map is what the
  // passenger asked for, so it is put in the middle of the screen rather than
  // left below a form they have already filled in.
  const wantsMapCentred = (location.state as { centerMap?: boolean } | null)?.centerMap === true
  useEffect(() => {
    if (!wantsMapCentred) return
    return showInMiddleWhenSettled(bookingMapRef.current)
  }, [wantsMapCentred, location.key])
  const setRequestedDriverId = (driverId: string | null) => setRequestedDriver(passenger.id, driverId)
  const savedLocations = passenger.savedLocations
  const allLocations = [
    ...MOCK_LOCATIONS,
    ...customLocations,
    ...savedLocations.map((s) => s.location),
  ].filter((loc, i, arr) => arr.findIndex((l) => l.id === loc.id) === i)
  const pickup = allLocations.find((l) => l.id === pickupId)!
  const dropoff = allLocations.find((l) => l.id === dropoffId)!
  // The city comes from the account, the address does not.
  //
  // A passenger almost always books from the city they live in, so making
  // them name it every time is a question with a known answer -- and the
  // city is what decides which barangays the picker offers, so getting it
  // right up front saves the wrong list appearing. The barangay and the
  // street stay empty: those change trip to trip, and a guess there is the
  // one that sends a tricycle somewhere nobody asked for.
  //
  // Only ever fills a blank. Once someone picks a city themselves, or pins
  // a location in another town, this stops having an opinion.
  useEffect(() => {
    if (cityScope || !passenger?.city) return
    setCityScope(passenger.city)
    setPickupPickerSeed((prev) => ({
      key: prev.key + 1,
      province: passenger.province || DEFAULT_BOOKING_PROVINCE,
      city: passenger.city,
      barangay: '',
      addressDetail: '',
    }))
  }, [cityScope, passenger?.city, passenger?.province])

  const isPabili = serviceType === 'pabili'
  const isBuyMedicine = serviceType === 'buy_medicine'
  // Buy Medicine has its own self-contained flow (MedsBooking) with a
  // completely different shape (cart, pharmacy confirmation) — none of the
  // shared Ride/Pabili JSX below (address forms, fare breakdown, submit
  // button) ever renders for it, so isErrand only needs to track Pabili.
  const isErrand = isPabili
  const plannedRoute = useRoute(pickup.gps ?? null, dropoff.gps ?? null)

  // The From/Where-to boxes are summaries, not editors: tapping one opens the
  // booking form with that end selected, the same way a ride-hailing app's
  // "Where to?" opens the address screen. Keeps a single source of truth for
  // addresses (the pickers inside the form) instead of a second set here.
  function openAddressPicker(target: 'pickup' | 'dropoff') {
    setPageTab('book')
    setMapTarget(target)
    // Computed outside the updater on purpose: a setState inside another
    // setState's updater is a side effect in what must be a pure function, and
    // StrictMode double-invokes updaters in dev — which flipped this toggle to
    // the wrong end (open FROM, get the Where-to picker).
    const opening = openEnd !== target
    if (opening) {
      // Falls back to the passenger's own city, not to Munoz. Opening the
      // destination used to jump the selector to the seeded default, so
      // somebody in San Jose who tapped Where to was suddenly being offered
      // barangays from a city an hour away.
      const home = passenger?.city || DEFAULT_BOOKING_CITY
      setCityScope(
        target === 'pickup'
          ? pickupPickerSeed.city || (pickupChosen ? pickup.city : '') || home
          // An unchosen destination is still an object, and it carries the
          // seeded default's city — which is how Munoz kept reappearing for a
          // passenger in San Jose the moment they tapped Where to.
          : dropoffPickerSeed.city || (dropoffChosen ? dropoff.city : '') || home,
      )
    }
    setOpenEnd(opening ? target : null)
  }

  // The city above From/Where to drives both ends: changing it reseeds each
  // picker (bumping its key remounts it) so the barangay lists repopulate for
  // the new city. The city centre is deliberately not quick-picked any more:
  // naming a city is not the same as naming an address, and filling one in
  // was answering the question the passenger is here to answer.
  function handleHomeCityChange(nextCity: string) {
    setCityScope(nextCity)
    // Seeding the dropdown is not enough on its own: the picker deliberately
    // skips resolving a value it was just seeded with (so a Saved Place or a
    // map pin is not re-geocoded and blurred). That guard means the From /
    // Where to labels above would keep showing the previous location while
    // the dropdown underneath already said CLSU. Resolving here is what
    // actually moves the pin and the label.

    // Which ends follow the city depends on whether one is being edited.
    //
    //  - Nothing open (the default view, labelled "City · From"): both ends
    //    move, so picking a city sets up a same-city trip in one action —
    //    which is the overwhelmingly common case.
    //  - One end open: only that end moves, which is what makes an inter-city
    //    trip possible. Open Where to, change its city, and the From you
    //    already chose stays put.
    const movesPickup = openEnd !== 'dropoff'
    // The list follows the city at both ends, always.
    //
    // This used to also require the destination to have been chosen already,
    // which was guarding against something that can no longer happen: back
    // when changing the city resolved an address, letting it touch an
    // unchosen destination filled in the field the passenger is supposed to
    // answer. Nothing is resolved any more -- only the dropdown is reseeded --
    // so the guard had stopped protecting anything and was instead leaving
    // somebody who switched to Munoz picking from San Jose's barangays.
    const movesDropoff = openEnd !== 'pickup'

    if (movesDropoff) {
      // Same rule as the pickup below: the barangay list follows the city,
      // the address does not. This used to resolve straight to the city's
      // default barangay, so changing the city answered the destination
      // question too — and left CLSU sitting in the box for someone who had
      // just said they were going somewhere else entirely.
      setDropoffPickerSeed((prev) => ({
        key: prev.key + 1,
        province: DEFAULT_BOOKING_PROVINCE,
        city: nextCity,
        barangay: '',
        addressDetail: '',
      }))
      setDropoffChosen(false)
    }
    if (movesPickup) {
      // The barangay list follows the city; the pickup itself does not.
      //
      // Choosing a city used to resolve straight to that city's default
      // barangay -- CLSU for Munoz, and a centre point for everywhere else
      // -- so naming the city silently answered the question underneath it
      // as well. The passenger then had a real address in the field that
      // sets the fare and dispatches a driver, chosen by nobody, and had to
      // notice it was wrong. Same guess-as-answer as the old CLSU default,
      // one screen along.
      //
      // The dropdowns still repopulate for the new city, so the list they
      // offer is the right one. Nothing is picked from it.
      setPickupPickerSeed((prev) => ({
        key: prev.key + 1,
        province: DEFAULT_BOOKING_PROVINCE,
        city: nextCity,
        barangay: '',
        addressDetail: '',
      }))
      setPickupChosen(false)
    }
  }

  function swapEndpoints() {
    setPickupChosen(true)
    setDropoffChosen(true)
    const prevPickup = pickupId
    const prevDropoff = dropoffId
    const prevPickupSeed = pickupPickerSeed
    const prevDropoffSeed = dropoffPickerSeed
    setPickupId(prevDropoff)
    setDropoffId(prevPickup)
    // The pickers own their dropdown state, so the ids alone would leave them
    // showing the old province/city/barangay — reseed both (see the seed
    // comment on pickupPickerSeed) so the forms follow the swap.
    setPickupPickerSeed({ ...prevDropoffSeed, key: prevPickupSeed.key + 1 })
    setDropoffPickerSeed({ ...prevPickupSeed, key: prevDropoffSeed.key + 1 })
  }

  function chooseErrand(next: ServiceType, opts?: { food?: boolean }) {
    setPageTab('book')
    setHomeMode('buy')
    setServiceType(next)
    setFoodHinted(!!opts?.food)
    // The item list still starts folded; the From/Where-to block does not,
    // because its map is how someone says where the errand goes and a map
    // that has to be unfolded first is a map you have to know about.
    setShowErrandBooking(true)
    setShowOrderBox(false)
  }
  // Switching Ride/Pabili → Medicine must not carry a stale "someone else"
  // into a pharmacy order: the picker is gone in that mode, so the customer
  // would have no way to see or undo it.
  useEffect(() => {
    if (isBuyMedicine) guestRider.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBuyMedicine])
  const tip = Math.max(0, Number(tipInput) || 0)
  const fareBreakdown = estimateFareBreakdown(pickup, dropoff, tariffSettings, {
    isStudent: passenger.isStudent,
    isPwdSenior: passenger.isPwdSenior,
    passengerCount,
  })
  const oneWayFare = fareBreakdown.total
  // Which TODA's terminal has dispatch priority for this pickup — the same
  // org the ride will actually be routed through (see RideContext's
  // REQUEST_RIDE), so the "far from Terminal" fee preview always matches
  // what gets charged.
  const priorityTodaOrg = todaOrganizations.find((o) => o.id === getPriorityTodaOrgId(pickup))
  const terminalGps = getTerminalGps(priorityTodaOrg)
  const specialPickupBreakdown = estimateSpecialPickupBreakdown(terminalGps, pickupGps, tariffSettings)
  const specialPickupFee = specialPickupRequested ? specialPickupBreakdown.fee : 0
  // An errand's distance charge follows whichever basis Admin set — the same
  // errandBaseFare RideContext uses when it creates the ride, so the quoted
  // number and the charged number cannot disagree. The special-pickup detour
  // is separate either way: it is a trip made to reach the passenger.
  const baseFare = isErrand ? errandBaseFare(oneWayFare, pabiliFareMode, pabiliFixedFare) : oneWayFare
  const serviceFee = isErrand ? pabiliServiceFee : 0
  const totalFare = baseFare + serviceFee + specialPickupFee + (isErrand ? tip : 0)
  // Split for the passenger-facing breakdown: standard rate vs. distance
  // overage. The extra-km fee rounds once and the standard-rate portion
  // absorbs whatever is left, so the two lines always add up to exactly
  // baseFare (no stray ₱1 from rounding each piece separately).
  const fareExtraKmFeePortionOneWay = Math.round(fareBreakdown.extraKmFee)
  // A fixed rate has no distance in it at all — it is one number — so the
  // distance lines are replaced entirely below.
  const isFixedErrandFare = isErrand && pabiliFareMode === 'fixed'
  const fareExtraKmFeePortion = fareExtraKmFeePortionOneWay
  const fareStandardRatePortion = oneWayFare - fareExtraKmFeePortionOneWay
  const fareExtraKmDisplay = fareBreakdown.extraKm

  // "Pickup"/"Destination" for a ride; "Buy near to"/"Deliver to" for an
  // errand — same map picker, same underlying pickup/dropoff state, just
  // different words for what each pin means.
  // FROM, not Pickup. The box answers where the trip starts, and on a
  // recorded ride the app fills it in itself with the same word, so the two
  // paths read alike.
  const pickupLabel = isErrand ? 'Buy near to' : 'FROM'
  const dropoffLabel = isErrand ? 'Deliver to' : 'Destination'
  // The single question the rest of the form asks: is there a destination yet?
  const hasDestination = isErrand || dropoffChosen

  function handleSaveLocation(label: SavedLocationLabel, location: MockLocation) {
    savePassengerLocation(passenger.id, label, location)
  }

  async function handlePickupResolve(address: PhAddressTags) {
    setPickupChosen(true)
    const location = await resolvePhAddress(address)
    setCustomLocations((prev) => [...prev, location])
    handlePickupChange(location.id)
  }

  async function handleDropoffResolve(address: PhAddressTags) {
    setDropoffChosen(true)
    const location = await resolvePhAddress(address)
    setCustomLocations((prev) => [...prev, location])
    setDropoffId(location.id)
  }

  const myRides = rides.filter((r) => r.passengerId === passenger.id)
  // A just-completed ride stays in the "current trip" slot (still driven by
  // TripMonitor, not yet in Trip History) until the passenger taps a
  // payment method to confirm/correct how they paid, or dismisses it via
  // "Book a new ride" — see acknowledgeRidePayment and dismissedRideIds.
  // Declined/cancelled rides never show here. A dispatched MEDS delivery is
  // excluded — MedsBooking's own activeOrder/linkedRide lookup already
  // renders it (as "Your medicine delivery", with MEDS-aware cancel rules
  // that refuse to cancel once dispatched); without this exclusion this
  // generic card would claim the same ride first and let the customer
  // cancel an already-dispatched delivery outright via plain cancelRide.
  const claimsTheScreen = (r: Ride) =>
    r.serviceType !== 'buy_medicine' &&
    r.status !== 'declined' &&
    (r.status !== 'cancelled' || r.cancelledBy === 'driver') &&
    (r.status !== 'completed' || !r.paymentAcknowledged) &&
    !dismissedRideIds.has(r.id)

  // A live trip outranks a notice about a dead one, and the newest outranks
  // the rest.
  //
  // This used to be a plain find(), which takes whatever the array happens
  // to offer first — and the array arrives from the shared database in no
  // particular order. A driver-cancelled ride is deliberately kept around
  // so the passenger can read why the driver stopped, so a notice from days
  // ago could sit in the slot while a driver was proposing a fare for a
  // booking made minutes ago. The passenger saw an old apology; the driver
  // saw "waiting for the passenger to approve" and waited for nothing.
  const candidates = myRides.filter(claimsTheScreen)
  const byNewest = (a: Ride, b: Ride) => (b.requestedAt ?? '').localeCompare(a.requestedAt ?? '')
  const running = candidates
    .filter((r) => r.status !== 'completed' && r.status !== 'cancelled')
    .sort(byNewest)
  const activeRide = running[0] ?? [...candidates].sort(byNewest)[0]
  // A ride in one of its ending states: paid off, or called off. It still
  // has a card to show — the receipt, or the reason the driver stopped —
  // but it no longer owns the screen, because the passenger's next question
  // is where they are going now.
  const rideIsOver =
    !!activeRide && (activeRide.status === 'completed' || activeRide.status === 'cancelled')

  // Once a driver has taken the ride there is nothing left to choose, so the
  // nearby-drivers panel closes itself. Until then it stays up, however many
  // drivers pass on it — the passenger is still picking.
  // Turning down a driver's price puts the passenger back where the decision
  // is made: the booking screen, with the request still out. Sitting on a
  // trip card that now shows nothing but a wait is the wrong place to be
  // when the thing you just did was refuse an offer.
  const searchingAgain =
    !!activeRide &&
    activeRide.status === 'requested' &&
    !activeRide.pendingApproval &&
    activeRide.passengerDeclinedFare === true

  // Group Ride — its own screen, still sharing this page's pickup, map and
  // fare maths rather than a second copy of any of them. Riders start as
  // just the booker; opening seeds that first row from the real account.
  function openGroupRide() {
    setGroupRideOpen(!groupRideOpen)
  }
  // Seeding the booker's own row belongs to the screen, not to the button
  // that used to open it. Now that Group Ride has an address it can be
  // arrived at without pressing anything — a refresh, the back button, a
  // link someone was sent — and every one of those landed on a group
  // booking with nobody in it, including the person doing the booking.
  useEffect(() => {
    if (!groupRideOpen || groupRiders.length > 0) return
    setGroupRiders([
      { key: 'booker', passengerId: passenger.id, name: passenger.name, phone: passenger.phone, isGuest: false, destination: null },
    ])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupRideOpen])
  function addGroupRider() {
    if (groupRiders.length >= 4) return
    setGroupRiders((prev) => [
      ...prev,
      { key: makeGuestPassengerId(), passengerId: makeGuestPassengerId(), name: '', phone: '', isGuest: true, destination: null },
    ])
  }
  function removeGroupRider(key: string) {
    setGroupRiders((prev) => prev.filter((r) => r.key !== key))
    if (pickingForGroupRiderKey === key) setPickingForGroupRiderKey(null)
  }
  function updateGroupRider(key: string, patch: Partial<GroupRiderEntry>) {
    setGroupRiders((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }
  // Points the page's own map at this rider instead of the ordinary
  // dropoff, and scrolls it into view — same map, different target.
  function handlePickGroupDestination(key: string) {
    setPickingForGroupRiderKey(key)
    setMapTarget('dropoff')
    requestAnimationFrame(() => showInMiddle(bookingMapRef.current))
  }
  const groupFares = groupRiders.map((r) =>
    r.destination ? estimateFare(pickup, r.destination, tariffSettings, { isStudent: false, isPwdSenior: false, passengerCount: 1 }) : null,
  )
  // Every rider's own destination, on this same map at once — not just
  // whichever one is currently being pinned. Orange, same as the co-
  // passenger dots an active shared ride already shows each rider on their
  // own screen (see TripMonitor) — this is that same idea one step earlier,
  // before the ride even exists yet.
  const groupMapPoints: MapPoint[] = groupRiders
    .filter((r) => r.destination?.gps)
    .map((r) => ({
      id: `group-${r.key}`,
      gps: r.destination!.gps!,
      color: '#f97316',
      label: `${r.name || 'Rider'} — ${formatAddressLine(r.destination!.label)}`,
    }))
  const groupAllDestinationsSet = groupRiders.length > 0 && groupRiders.every((r) => !!r.destination)
  const groupTotalFare = groupAllDestinationsSet ? groupFares.reduce((sum: number, f) => sum + (f ?? 0), 0) : null
  const groupAllNamesSet = groupRiders.every((r) => r.name.trim().length > 0)
  const groupCanSubmit =
    groupRiders.length >= 2 && groupAllDestinationsSet && groupAllNamesSet && !activeRide && !groupSubmitting
  function submitGroupRide() {
    if (!groupCanSubmit) return
    setGroupSubmitting(true)
    requestGroupRide({
      bookedByPassengerId: passenger.id,
      pickup,
      pickupGps,
      paymentMethod,
      paySplit: groupPaySplit,
      riders: groupRiders.map((r) => ({
        passengerId: r.passengerId,
        passengerName: r.name.trim(),
        passengerPhone: r.isGuest ? r.phone.trim() || null : null,
        dropoff: r.destination!,
        isStudentRide: false,
        isPwdSeniorRide: false,
      })),
    })
    setGroupRideOpen(false)
    setGroupRiders([])
    setGroupSubmitting(false)
  }
  // The banner replaces the trip card with the whole booking screen, so the
  // page is still growing when it first appears — the settle pass is what
  // stops the centring being undone underneath it (same reason as the map
  // after booking).
  const searchingBannerRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!searchingAgain) return
    return showInMiddleWhenSettled(searchingBannerRef.current)
  }, [searchingAgain])
  const rideAccepted = !!activeRide && activeRide.status !== 'requested'
  useEffect(() => {
    if (rideAccepted) setShowDrivers(false)
  }, [rideAccepted])

  // The bill. Driven by the ride itself rather than by whichever card
  // happens to be on screen, because finishing a trip sends the passenger
  // back to the booking page — a form mounted inside the trip card would be
  // unmounted before anyone saw it. Dismissable: someone fumbling for their
  // wallet should not be trapped behind a modal.
  //
  // Safety records are excluded. On that path the passenger flagged the
  // tricycle down themselves and pays the driver in cash the way they
  // always have — the app dispatched nobody, agreed no fare, and collects
  // nothing. Presenting a total due would claim it had worked out what they
  // owe, and the figure would be wrong anyway: these trips often end with no
  // destination ever given, so the fare falls back to the base minimum.
  const unpaidRide = myRides.find(
    (r) => r.status === 'completed' && !r.paymentAcknowledged && !r.safetyRecord,
  )
  const [showPayment, setShowPayment] = useState(false)
  const unpaidRideId = unpaidRide?.id ?? null
  useEffect(() => {
    if (unpaidRideId) setShowPayment(true)
  }, [unpaidRideId])
  // Back to the booking form, with the finished trip closed out. Called
  // both by the card's own button and by the trip simply ending — a ride
  // that is over should not leave the passenger on a receipt.
  function returnToBooking() {
    // Every completed-but-unacknowledged ride at once, not just the newest:
    // a passenger with several stacked (cash trips the driver never got to
    // confirm) would otherwise have to clear them one at a time.
    setDismissedRideIds((prev) => {
      const next = new Set(prev)
      myRides.forEach((r) => {
        if (r.status === 'completed' && !r.paymentAcknowledged) next.add(r.id)
        // A trip the driver called off holds the same slot and has to be
        // let go of the same way, or "Book a new ride" leaves the notice
        // sitting exactly where it was.
        if (r.status === 'cancelled' && r.cancelledBy === 'driver') next.add(r.id)
      })
      return next
    })
    // Nothing is carried into the next booking.
    //
    // Reusing the last dropoff as the next pickup reads well -- you are
    // standing where you got out -- but it means opening Book a ride to find
    // an address already in the box. Right often enough to be trusted,
    // wrong often enough to matter: someone who booked home last night is
    // not there this morning, and the fare and the driver are dispatched
    // from whatever that box says.
    setDropoffChosen(false)
    requestAnimationFrame(() => showInMiddle(endpointsRef.current))
  }

  // The trip ending is itself the signal to go back to booking — the receipt
  // stays in Trip history, and the payment the driver recorded is already on
  // it, so there is nothing on that card the passenger must do.
  //
  // A trip the driver called off ends the same way. It used to be left on
  // screen for the passenger to dismiss by hand, which meant the card sat
  // over the booking form until they did — and, because a cancelled ride
  // still counted as the passenger's current one, the Terminal screen went on
  // refusing new trips with "may biyahe ka pa ngayon" for a ride nobody was
  // taking. The reason it was cancelled is on the trip in Trip history.
  const finishedRideId = myRides.find(
    (r) =>
      !dismissedRideIds.has(r.id) &&
      ((r.status === 'completed' && !r.paymentAcknowledged) ||
        (r.status === 'cancelled' && r.cancelledBy === 'driver')),
  )?.id
  useEffect(() => {
    if (!finishedRideId) return
    returnToBooking()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedRideId])

  const isGuestBooking = guestRider.bookingFor === 'other'
  // Two entries can carry different ids and still be the same spot — a city
  // quick-pick and a saved place resolving to one market, say. Comparing ids
  // alone let that through and booked a ride from a place to itself.
  const endsAreSameSpot =
    pickupId === dropoffId ||
    (!!pickup.gps && !!dropoff.gps && haversineDistanceMeters(pickup.gps, dropoff.gps) < 40)

  const canSubmit =
    hasDestination &&
    !endsAreSameSpot &&
    (!isErrand || pabiliItems.trim().length > 0) &&
    (!isGuestBooking || guestRider.otherName.trim().length > 0)

  // How far away the nearest driver who could take this actually is.
  //
  // The same list the "Choose a driver" panel is built from, asked one
  // question: who is closest. Busy drivers are excluded — a tricycle already
  // carrying someone is not a wait this passenger can join.
  const nearestDriverMeters = (() => {
    const from = pickupGps ?? pickup.gps
    if (!from) return null
    const distances = buildNearbyDrivers(
      drivers,
      from,
      terminals,
      todaOrganizations,
      rides,
      oneWayFare + specialPickupFee,
      todaRadiusKm,
      outOfAreaPerKm,
    )
      .filter((d) => !d.busy && d.distanceMeters !== null)
      .map((d) => d.distanceMeters as number)
    return distances.length > 0 ? Math.min(...distances) : null
  })()

  useEffect(() => {
    setFarDriverConfirmed(false)
  }, [pickup.id, pickupGps?.lat, pickupGps?.lng])

  function handleRequest() {
    if (!canSubmit) return
    // Asked once, and only when the answer is far enough to matter. The
    // passenger has already pressed the button, so the only honest reason to
    // interrupt them is that the wait is longer than pressing it implied.
    if (!farDriverConfirmed && nearestDriverMeters !== null && nearestDriverMeters > FAR_DRIVER_METERS) {
      setFarDriverPrompt(true)
      return
    }
    requestRide({
      passengerId: isGuestBooking ? makeGuestPassengerId() : passenger.id,
      passengerName: isGuestBooking ? guestRider.otherName.trim() : passenger.name,
      passengerPhone: isGuestBooking ? guestRider.otherPhone.trim() || null : null,
      pickup: isErrand && storeName.trim() ? { ...pickup, label: storeName.trim() } : pickup,
      dropoff,
      paymentMethod,
      isStudentRide: isGuestBooking ? false : passenger.isStudent,
      isPwdSeniorRide: isGuestBooking ? false : passenger.isPwdSenior,
      pickupGps,
      passengerCount,
      serviceType,
      pabiliItems: isErrand ? pabiliItems.trim() : null,
      tip: isErrand ? tip : 0,
      specialPickupRequested: specialPickupRequested && pickupGps !== null,
      specialTrip,
      requestedDriverId,
      bookedAtTerminal: boardedAtTerminal,
    })
    setRequestedDriverId(null)
    setSpecialTrip(false)
    setPassengerCount(1)
    setPabiliItems('')
    setPabiliItemsResetKey((k) => k + 1)
    setStoreName('')
    setTipInput('')
    setSpecialPickupRequested(false)
    guestRider.reset()
  }

  function handlePickupChange(id: string) {
    setPickupId(id)
    setPickupGps(null)
    setGpsStatus('idle')
    setGpsError('')
    setSpecialPickupRequested(false)
  }

  // From LocationMapPicker — a map tap resolves to a MockLocation plus,
  // when the tapped point falls inside our own address tree, a `guess` at
  // its Province/City/Barangay (see reverseGeocodeToPhAddress). Registers
  // the point either way; only seeds the BarangayAddressPicker dropdowns
  // (same remount-to-reseed mechanism the Saved Places quick-picks use)
  // when a guess actually resolved — an unresolved tap just leaves the
  // dropdowns as they were, same as before this feature existed.
  function handlePinPickup(location: MockLocation, guess: PhAddressTags | null) {
    setPickupChosen(true)
    setCustomLocations((prev) => [...prev, location])
    handlePickupChange(location.id)
    if (guess) {
      setPickupPickerSeed((prev) => ({
        key: prev.key + 1,
        province: guess.province,
        city: guess.city,
        barangay: guess.barangay,
        addressDetail: guess.addressDetail,
      }))
      // The City selector above the address rows is its own state, and it
      // used to sit where it had been left while the pin moved to another
      // town — so the header read "Science City of Munoz" over an address
      // in San Jose, and the barangay list underneath was the wrong
      // city's. A pin is a statement about where the passenger is; the
      // city has to follow it rather than argue with it.
      if (guess.city && guess.city !== cityScope) setCityScope(guess.city)
    }
  }

  function handlePinDropoff(location: MockLocation, guess: PhAddressTags | null) {
    // A Group Ride rider's destination is being set on this same map —
    // route the tap into their row instead of the page's own dropoff, and
    // hand the map back to normal booking once it lands.
    if (pickingForGroupRiderKey) {
      const key = pickingForGroupRiderKey
      setGroupRiders((prev) => prev.map((r) => (r.key === key ? { ...r, destination: location } : r)))
      setPickingForGroupRiderKey(null)
      return
    }
    setDropoffChosen(true)
    setCustomLocations((prev) => [...prev, location])
    setDropoffId(location.id)
    if (guess) {
      setDropoffPickerSeed((prev) => ({
        key: prev.key + 1,
        province: guess.province,
        city: guess.city,
        barangay: guess.barangay,
        addressDetail: guess.addressDetail,
      }))
      // Same as the pickup: the City selector heads whichever row is open,
      // so a destination pinned in another town has to move it too.
      if (guess.city && guess.city !== cityScope && openEnd === 'dropoff') setCityScope(guess.city)
    }
  }

  // Used by the Saved Places quick-pick buttons — unlike handlePickupChange
  // (which the picker itself calls after resolving what it was typed),
  // this also seeds the BarangayAddressPicker's own dropdowns so they show
  // the place that's now actually selected, instead of whatever they held
  // before.
  function handlePickupQuickPick(location: MockLocation) {
    setPickupChosen(true)
    handlePickupChange(location.id)
    setPickupPickerSeed((prev) => ({
      key: prev.key + 1,
      province: location.province,
      city: location.city,
      barangay: location.barangay,
      addressDetail: '',
    }))
  }

  function handleDropoffQuickPick(location: MockLocation) {
    setDropoffChosen(true)
    setDropoffId(location.id)
    setDropoffPickerSeed((prev) => ({
      key: prev.key + 1,
      province: location.province,
      city: location.city,
      barangay: location.barangay,
      addressDetail: '',
    }))
  }

  // Quick "jump to this city" for Ride/Pabili — same convenience as Buy
  // Medicine's own City dropdown (which re-filters its pharmacy list and
  // re-fits its map), but Ride/Pabili have no list to filter, so this jumps
  // the one point that represents "where I'm starting from" (pickup for a
  // Ride, "Buy near to" for a Pabili errand) to a resolved point in the
  // chosen city and lets the map's own refitSignal pan there — same
  // public-market-search proxy already used as "the passenger's rough area"
  // elsewhere in this file (see handleSelectPabili). Destination/"Deliver
  // to" is left alone since that's a free choice, not a "where am I" field.
  // Picking a registered store for Pabili's pickup ("Buy near to") — same
  // "must exist in customLocations before pickupId can point at it" rule as
  // every other custom pickup here (allLocations is built from
  // MOCK_LOCATIONS + customLocations + savedLocations, so pointing pickupId
  // at an id that isn't in any of those makes `pickup` resolve to undefined
  // and crashes the whole page on the next render).
  function handleStorePickupQuickPick(store: Pharmacy) {
    const location: MockLocation = {
      id: store.id,
      label: store.name,
      coords: store.coords,
      gps: store.locationGps ?? { lat: 15.7940977, lng: 120.9905849 },
      province: store.province,
      city: store.city,
      barangay: store.barangay,
    }
    setCustomLocations((prev) => [...prev, location])
    handlePickupQuickPick(location)
    setStoreName(store.name)
  }

  // Pabili defaults to buying from the public market near CLSU (the current
  // default "where I am" for booking — see DEFAULT_BOOKING_* in
  // mock/data.ts) and delivering there too, so both fields start pre-filled
  // instead of blank. The passenger can still change either afterward.
  async function handleSelectPabili() {
    setServiceType('pabili')
    setPassengerCount(1)

    // CLSU is the current default "where I am" for booking (see
    // DEFAULT_BOOKING_* in mock/data.ts) — both the store search and the
    // delivery address start there rather than the passenger's own
    // registered home address.
    const store = await resolveNearbyPublicMarket(DEFAULT_BOOKING_CITY, DEFAULT_BOOKING_PROVINCE)
    setCustomLocations((prev) => [...prev, store])
    handlePickupQuickPick(store)
    handleDropoffQuickPick(CLSU_MAIN_GATE_LOCATION)
  }

  // "My location" used to register the coordinate and nothing else: the map
  // knew where you were, and the address box above it stayed empty, so the
  // next thing you had to do was type out the address of the spot you were
  // standing on. It now goes through exactly what tapping the map does —
  // reverse-geocode the fix, name the place, and fill the field — because
  // that path already existed and already fills the box (see
  // LocationMapPicker's placePin).
  //
  // Which box gets filled follows the chip: this row is rendered against the
  // pickup on a ride and the delivery address on an errand.
  async function handleUseMyGps(target: 'pickup' | 'dropoff' = 'pickup') {
    setGpsStatus('locating')
    setGpsError('')
    try {
      const coords = await getCurrentGeoPosition()
      if (target === 'pickup') setPickupGps(coords)
      const { label, guess } = await reverseGeocodeToPhAddress(coords)
      const location = createCustomLocation(
        // A fix with no street to its name is still a usable pickup — the
        // driver has the pin. Falling back to the coordinates keeps the field
        // filled with something true rather than leaving it blank.
        label ?? `My location (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})`,
        coords,
        guess ?? undefined,
      )
      if (target === 'pickup') handlePinPickup(location, guess)
      else handlePinDropoff(location, guess)
      setGpsStatus('done')
    } catch (err) {
      setGpsStatus('error')
      setGpsError(err instanceof Error ? err.message : 'Could not get your location.')
    }
  }

  // Where you are, without being asked for it.
  //
  // This app books a tricycle from wherever the passenger is standing, so a
  // pickup box that opens empty — or worse, pre-filled with the CLSU main
  // gate for someone three barangays away — made correcting it the first
  // thing every passenger did. This runs the same locate-and-fill the
  // location button runs, once, on open.
  //
  // It stands down as soon as the passenger has chosen a pickup themselves,
  // and never interrupts an errand or a trip already underway. A refused or
  // failed fix is not retried: handleUseMyGps already reports it, and asking
  // the phone again on a loop would only pester someone who has said no.
  const autoLocatedRef = useRef(false)
  useEffect(() => {
    if (autoLocatedRef.current) return
    if (pickupChosen || isErrand || activeRide) return
    autoLocatedRef.current = true
    void handleUseMyGps('pickup')
  }, [pickupChosen, isErrand, activeRide])

  // Admin-configurable — see AdminPage's "Trip history retention" setting.
  // Older rides aren't lost, they just drop out of this list (earnings
  // totals, ratings, and admin reports all still see the full history).
  const visibleTripHistory = myRides.filter((r) => isWithinRetentionDays(r.requestedAt, tripHistoryRetentionDays))

  // The saved-place row. Rendered against whichever end of the trip means
  // "where I am": the pickup on a ride, the delivery address on an errand.
  function quickPlaceChips(target: 'pickup' | 'dropoff') {
    const applyPlace = target === 'pickup' ? handlePickupQuickPick : handleDropoffQuickPick
    const current = target === 'pickup' ? pickup : dropoff
    const fieldName = target === 'pickup' ? pickupLabel : dropoffLabel
    // No "My location" chip here. The row already has two ways to say where
    // you are — the GPS button under the map, and tapping the map itself —
    // and a third one wedged in front of Home/School/Work made the row read
    // as a mix of "use this place" and "remember this place", which are
    // opposite actions sitting in identical pills.
    return (
      <div className="-mx-1 flex flex-nowrap items-center gap-1 overflow-x-auto px-1 pb-0.5">
        <span className="shrink-0 whitespace-nowrap text-[11px] font-semibold text-slate-500">Save as:</span>
        {SAVED_LOCATION_LABELS.filter((label) => label !== 'Favorite').map((label) => {
          const saved = savedLocations.find((sl) => sl.label === label)
          return (
            <button
              key={label}
              type="button"
              title={saved ? `${fieldName}: ${saved.location.label}` : `Save this as ${label}`}
              onClick={() => (saved ? applyPlace(saved.location) : handleSaveLocation(label, current))}
              className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                saved
                  ? 'border-[#0f766e] bg-white text-[#0f766e] hover:bg-[#0f766e]/10'
                  : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              {saved ? savedLocationButtonLabel(label) : `+ ${savedLocationButtonLabel(label)}`}
            </button>
          )
        })}
      </div>
    )
  }

  // The one pickup/destination map this page has, built once here so it can
  // be slotted into wherever it is currently needed — its normal spot inside
  // the booking form, or (see TerminalBoardingPanel's mapSlot prop) right
  // under the Terminal panel's own header instead, without ever mounting a
  // second map instance. The booking button and passenger stepper ride along
  // with it there too, so they are swapped out while Terminal is open: that
  // flow submits through its own "Record my Trip" button and is always a
  // single rider, neither of which apply here.
  // Map-first on the ordinary booking form. Group Ride keeps the stacked
  // layout: it lists every rider's destination under the map, which is a
  // list to read rather than a single answer to give, and a sheet over the
  // map would cover it.
  const mapFirstBooking = !groupRideOpen

  const sharedMap = (
    <div ref={bookingMapRef} className="scroll-mt-24">
      <LocationMapPicker
        pickup={pickup}
        dropoff={dropoff}
        target={mapTarget}
        onTargetChange={setMapTarget}
        onPinPickup={handlePinPickup}
        onPinDropoff={handlePinDropoff}
        pickupLabel={pickupLabel}
        dropoffLabel={dropoffLabel}
        // City, pickup, destination, and (while Group Ride is open) how
        // many riders have a destination set yet — all choices that
        // should re-frame the map on the spot.
        //
        // Except on Track my trip. There the map is being read, not
        // answered: the passenger is looking for which tricycle is beside
        // them, and the view jumping to re-frame a pickup or destination
        // takes the map out from under them mid-glance. That screen keeps
        // whatever framing it was given.
        // Only a point actually moving re-frames the map.
        //
        // The city used to be in here too, and tapping FROM or Destination
        // sets the city scope to whichever end was opened — so merely
        // opening a box swung the map, before the passenger had said
        // anything. Naming a city no longer picks an address either, so
        // there is nothing for the map to move to when it changes.
        refitSignal={`${pickup.id}|${hasDestination ? dropoff.id : 'none'}|${groupMapPoints.length}`}
        hasDropoff={hasDestination}
        hasPickup={pickupChosen}
        // Map-first on the booking screen: the map takes the height and the
        // From/Destination card rides over it in a draggable sheet. Not while
        // the Terminal panel has borrowed this map — that screen has its own
        // layout and its own strip, and a sheet over it would be a second
        // panel arguing with the first.
        mapFirst={mapFirstBooking}
        sheetHeader={mapFirstBooking ? () => addressCard(true) : undefined}
        terminals={terminals}
        extraPoints={groupRideOpen ? groupMapPoints : undefined}
        showGpsFor={isErrand ? 'dropoff' : 'pickup'}
        underMapAction={
          isErrand ? undefined : (
            <span
              className="flex items-center gap-1 rounded-lg bg-slate-100 px-1.5 py-1"
              title={`Passengers riding — up to ${MAX_RIDE_PASSENGERS}${
                tariffSettings.extraPassengerFee > 0
                  ? `, +₱${tariffSettings.extraPassengerFee} per rider beyond the first`
                  : ''
              }`}
            >
              <span aria-hidden className="text-[11px]">
                🧑
              </span>
              <button
                type="button"
                aria-label="One fewer passenger"
                onClick={() => setPassengerCount((n) => Math.max(1, n - 1))}
                disabled={passengerCount <= 1}
                className="h-6 w-6 rounded-md border border-slate-300 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                −
              </button>
              <span className="w-4 text-center text-xs font-semibold text-slate-800">{passengerCount}</span>
              <button
                type="button"
                aria-label="One more passenger"
                onClick={() => setPassengerCount((n) => Math.min(MAX_RIDE_PASSENGERS, n + 1))}
                disabled={passengerCount >= MAX_RIDE_PASSENGERS}
                className="h-6 w-6 rounded-md border border-slate-300 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                +
              </button>
            </span>
          )
        }
        leadingAction={
          (
            <div className="space-y-1">
              <button
                onClick={handleRequest}
                disabled={!canSubmit}
                // Fixed light yellow, not the `gold` token — that token
                // turns a muted blue-grey under this theme and reads as
                // disabled even when the button is live (same fix as the
                // Terminal banner above).
                className="w-full rounded-lg bg-[#ffe066] px-2.5 py-1.5 text-xs font-bold text-navy-900 transition hover:bg-[#ffd633] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                <span className="block truncate">
                  {isPabili
                    ? isGuestBooking
                      ? `Request Pabili for ${guestRider.otherName.trim() || 'them'}`
                      : 'Request Pabili'
                    : isGuestBooking
                      ? `Book a tricycle for ${guestRider.otherName.trim() || 'them'}`
                      : 'Book a tricycle'}
                </span>
              </button>
              {/* Directly under the booking button, because picking a
                  driver is a decision about the booking you are on the
                  point of making — not a separate errand. Once one is
                  picked it says who, so the choice is visible without
                  reopening the list. */}
              <button
                type="button"
                onClick={() => setShowDrivers(true)}
                className={`w-full rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  requestedDriverId
                    ? 'border-brand-500 bg-brand-50 text-brand-800 hover:bg-brand-100'
                    : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {/* The tab keeps its name whether or not one is picked —
                    a control that renames itself is one you have to find
                    twice. The chosen driver is appended, and the blue tint
                    carries the state on a narrow screen where the name
                    truncates. */}
                <span className="block truncate">
                  🧑‍✈️ Drivers near you
                  {requestedDriverId &&
                    ` · ${drivers.find((d) => d.id === requestedDriverId)?.name ?? 'Driver'}`}
                </span>
              </button>
            </div>
          )
        }
      />
    </div>
  )

  // The pickup/destination card, built once and shown on more than one
  // screen.
  //
  // Group Ride needs it because the first rider is a rider: their pickup is
  // where the whole group boards and their destination is their own, and
  // once this card stayed behind on the booking form neither was reachable
  // from the screen that books them.
  //
  // The Sakay/Group strip inside it is booking-form furniture, so the Group
  // screen leaves it out — a way into Group Ride from inside Group Ride is a
  // door to the room you are already standing in.
  // destinationOnly drops the FROM row, its picker and the swap control.
  //
  // On Track my trip the start is not a question: the app takes it from the
  // phone the moment a trip records itself. Offering a box for it there
  // invites somebody to answer something that is about to be answered
  // better, and a Swap button between one real row and one about-to-be
  // filled row swaps nothing worth swapping.
  // The city, above the barangay list it filters.
  //
  // It used to sit at the top of the card, above both address rows, where it
  // was a setting rather than a step — and it filters the barangay dropdown,
  // which is two taps further down inside whichever end you opened. Answering
  // "which city" before being asked "which barangay" is the order the form
  // actually works in, so that is where it now lives.
  const cityRow = (
    <div className="flex items-center gap-2">
      <label
        htmlFor="home-city"
        className={`shrink-0 text-xs font-semibold uppercase tracking-wide ${
          openEnd === 'dropoff' ? 'text-dest-accent' : 'text-pickup-accent'
        }`}
      >
        City
      </label>
      <select
        id="home-city"
        value={cityScope}
        onChange={(e) => handleHomeCityChange(e.target.value)}
        className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
      >
        <option value="">Select city…</option>
        {getCitiesForProvince(DEFAULT_BOOKING_PROVINCE).map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  )

  const addressCard = (showStrip: boolean, destinationOnly = false) => (
        <section
          ref={addressSectionRef}
          className="scroll-mt-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm"
        >
          <div className="relative" ref={endpointsRef}>
            {!destinationOnly && (
            <>
            <button
              type="button"
              onClick={() => openAddressPicker('pickup')}
              className="flex w-full items-center gap-2.5 rounded-lg bg-pickup-accent px-3 py-2 pr-14 text-left shadow-sm filter transition hover:brightness-90"
            >
              <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-white" />
              <span className="min-w-0 flex-1">
                <span className="block text-[9px] font-semibold uppercase tracking-wide text-white/75">{pickupLabel}</span>
                {/* Blank until the passenger says where they are, the same as
                    the destination below.

                    It used to open reading "CLSU Main Gate" — a real address,
                    in the field the fare and the driver are dispatched from,
                    that nobody had chosen. Anyone booking from anywhere else
                    had to notice it was wrong and correct it, and the ones who
                    did not sent a tricycle to a gate they were nowhere near.
                    A guess presented as an answer is worse than an empty box. */}
                <span
                  className={`block truncate text-sm ${
                    pickupChosen ? 'font-semibold text-white' : 'font-normal text-white/70'
                  }`}
                >
                  {pickupChosen ? formatAddressLine(pickup.label) : 'Where to?'}
                </span>
              </span>
            </button>
            {openEnd === 'pickup' && (
              <div className="mt-1.5 space-y-2 rounded-lg bg-slate-50/70 p-2">
              {!isErrand && quickPlaceChips('pickup')}
              {cityRow}
              <BarangayAddressPicker
                key={`from-${pickupPickerSeed.key}`}
                label=""
                hideRegionSelects
                defaultProvince={pickupPickerSeed.province || DEFAULT_BOOKING_PROVINCE}
                defaultCity={pickupPickerSeed.city || DEFAULT_BOOKING_CITY}
                defaultBarangay={pickupPickerSeed.barangay}
                defaultAddressDetail={pickupPickerSeed.addressDetail}
                onResolve={handlePickupResolve}
                onConfirm={() => setOpenEnd(null)}
                // Anything with real coordinates behind it counts, not just
                // the GPS button: a spot tapped on the map, a saved place, or
                // a fix taken earlier in this session. The exact point is
                // known either way, and that is the whole question the
                // landmark was being asked to answer.
                pinned={pickupGps !== null || !!pickup.gps}
              />
              {gpsStatus === 'error' && gpsError && <p className="text-[11px] text-amber-700">{gpsError}</p>}
              {/* Shown only after a failure, and only inside an embedded
                  browser. Messenger and the like refuse geolocation without
                  saying so, which looks exactly like a broken feature:
                  everything works except finding where you are. Two pilot
                  testers hit this and nothing on screen could tell them why. */}
              {gpsStatus === 'error' && inApp && (
                <p className="mt-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug text-amber-800">
                  You opened this inside another app, and it will not share your location.{' '}
                  {openInBrowserHint()}
                </p>
              )}
              </div>
            )}
            </>
            )}
            {/* The connector only makes sense while the two rows are touching —
                with a picker open between them it would be a dotted line to
                nowhere. */}
            {!openEnd && !destinationOnly && (
              <span
                aria-hidden
                className="absolute left-[1.16rem] top-[2.85rem] h-2 border-l-2 border-dotted border-slate-300"
              />
            )}
            <button
              type="button"
              onClick={() => openAddressPicker('dropoff')}
              className="mt-1.5 flex w-full items-center gap-2.5 rounded-lg bg-dest-fill px-3 py-2 pr-14 text-left shadow-sm filter transition hover:brightness-95"
            >
              {/* dest-fill is pale under dark teal text in the default theme,
                  so the filled teal Pickup above is the one block carrying
                  weight; a bold theme can instead make this a solid fill with
                  white text — same four roles (fill/text/subtext/dot), theme
                  decides which way they lean. See theme.css. */}
              <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-dest-dot" />
              <span className="min-w-0 flex-1">
                <span className="block text-[9px] font-semibold uppercase tracking-wide text-dest-subtext/70">{dropoffLabel}</span>
                <span
                  className={`block truncate text-sm ${
                    hasDestination ? 'font-semibold text-dest-text' : 'font-normal text-dest-subtext/70'
                  }`}
                >
                  {hasDestination ? formatAddressLine(dropoff.label) : isErrand ? 'Where should it go?' : 'Where are you going?'}
                </span>
              </span>
            </button>
            {openEnd === 'dropoff' && (
              <div className="mt-1.5 space-y-2 rounded-lg bg-slate-50/70 p-2">
                {/* Saved places on the destination too, not only on an
                    errand. A passenger going home, to school or to work is
                    the ordinary case, and they had to type it every time
                    while the pickup — the end the app can often guess by
                    itself — was the one with the shortcuts. */}
                {quickPlaceChips('dropoff')}
                {cityRow}
                <BarangayAddressPicker
                  key={`to-${dropoffPickerSeed.key}`}
                  label=""
                  hideRegionSelects
                  defaultProvince={dropoffPickerSeed.province || DEFAULT_BOOKING_PROVINCE}
                  defaultCity={dropoffPickerSeed.city || cityScope || DEFAULT_BOOKING_CITY}
                  defaultBarangay={dropoffPickerSeed.barangay}
                  defaultAddressDetail={dropoffPickerSeed.addressDetail}
                  onResolve={handleDropoffResolve}
                  onConfirm={() => setOpenEnd(null)}
                />
                {isErrand && gpsStatus === 'error' && gpsError && (
                  <p className="text-[11px] text-amber-700">{gpsError}</p>
                )}
              </div>
            )}
            {showStrip && (
              <>
              {/* Two ways to start a trip that aren't the address form above,
                  side by side so both fit without pushing the page down: Sakay
                  sa Terminal's title wraps to two lines rather than truncating
                  now that it doesn't have the full width to say it in. Sakay sa
                  Terminal gets most of the row (it's the more common tap, and
                  keeps its own fixed yellow — the app's original CTA colour —
                  rather than following `gold`, which a cooler theme concept can
                  turn into a grey that reads as disabled here); Group Ride is
                  the smaller, secondary option next to it.
    
                  Below the whole address block, picker included. It used to sit
                  between the destination row and the picker that opens from it,
                  so expanding a destination split the two apart and pushed this
                  row into the middle of a form it has nothing to do with. */}
              {!isErrand && (
                <div className="mt-2 flex items-stretch gap-1.5">
                  <button
                    type="button"
                    onClick={openTrackMyTrip}
                    className="flex min-w-0 flex-[4] items-center gap-1.5 rounded-lg bg-[#ffe066] px-2.5 py-1.5 text-left shadow-sm transition hover:bg-[#ffd633]"
                  >
                    <span aria-hidden className="shrink-0 text-sm leading-none">🚏</span>
                    {/* Two lines, because the strip is answering two
                        different questions. The first says what this is for —
                        safety, not booking — and the second says who it is
                        for and what it costs. Run together on one line they
                        read as a single slogan and the "no charge" gets lost
                        at the end of it. */}
                    <span className="min-w-0 flex-1 leading-tight text-navy-900">
                      <span className="block text-[10px] font-extrabold uppercase tracking-wide">
                        Track your trip for your safety
                      </span>
                      <span className="block text-[9px] font-semibold">
                        Kung sumakay sa terminal o pumara lang — record your trip
                        {terminalTripIsFree && ' (no app fee)'}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={openGroupRide}
                    aria-expanded={groupRideOpen}
                    className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg border border-slate-300 bg-white px-1.5 py-1.5 text-center shadow-sm transition hover:bg-slate-50"
                  >
                    <span aria-hidden className="shrink-0 text-xs leading-none">👥</span>
                    <span className="min-w-0 text-[9px] font-extrabold uppercase leading-tight tracking-wide text-slate-700">
                      Group
                    </span>
                  </button>
                </div>
              )}
              </>
            )}
            {!destinationOnly && (
            <button
              type="button"
              onClick={swapEndpoints}
              aria-label="Swap From and Where to"
              title="Swap From and Where to"
              className={`absolute right-1.5 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-xs shadow-sm transition hover:bg-slate-50 ${
                openEnd ? 'top-[1.25rem]' : 'top-1/2'
              }`}
            >
              ⇅
            </button>
            )}
          </div>
  
        </section>
  )

  // Group Ride, as its own screen. The map comes with it: setting each
  // rider's destination is done by pinning on that same map, so a panel
  // without it would be a form with no way to answer half its questions.
  if (groupRideOpen) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-70px)] max-w-lg flex-col space-y-2 px-4 pb-[72px] pt-1">
        <button
          type="button"
          onClick={() => setGroupRideOpen(false)}
          className="flex items-center gap-1.5 self-start rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          <span aria-hidden className="text-sm leading-none">‹</span>
          Bumalik sa booking
        </button>
        {/* Rider one is a rider. Their pickup is where the whole group
            boards and their destination is their own — and with this card
            left behind on the booking form, neither could be changed from
            the screen that books them. Without the Sakay/Group strip: this
            is Group Ride, so a button into Group Ride would be a door to
            the room you are already standing in. */}
        {addressCard(false)}
        <GroupRideInlinePanel
          riders={groupRiders}
          onAddRider={addGroupRider}
          onRemoveRider={removeGroupRider}
          onUpdateRider={updateGroupRider}
          onPickDestination={handlePickGroupDestination}
          pickingForRiderKey={pickingForGroupRiderKey}
          paySplit={groupPaySplit}
          onPaySplitChange={setGroupPaySplit}
          fares={groupFares}
          totalFare={groupTotalFare}
          maxRiders={4}
          hasActiveRide={!!activeRide}
          canSubmit={groupCanSubmit}
          onSubmit={submitGroupRide}
          submitting={groupSubmitting}
        />
        {sharedMap}
      </div>
    )
  }

  return (
    // min-h + flex-col is what lets the ad box claim the leftover screen:
    // mt-auto pushes it to the bottom and flex-1 lets it grow, so on a tall
    // phone it fills the gap instead of leaving dead space under the form.
    <div className="mx-auto flex min-h-[calc(100vh-70px)] max-w-lg flex-col space-y-2 px-4 pb-[72px] pt-1">
      <AnnouncementFeed viewer="passengers" />
      {isAdminOpsView && (
        <section>
          <>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-xs font-medium text-slate-500">Booking as</label>
              <button
                type="button"
                onClick={() => setShowRegister((v) => !v)}
                className="text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                {showRegister ? 'Cancel' : '+ New passenger'}
              </button>
            </div>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              value={passenger.id}
              onChange={(e) => setCurrentPassengerId(e.target.value)}
            >
              {passengers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            {showRegister && (
              <div className="mt-2">
                <PassengerRegisterForm
                  onRegistered={(id) => {
                    setCurrentPassengerId(id)
                    setShowRegister(false)
                  }}
                />
              </div>
            )}
          </>
        </section>
      )}

      {/* Two mode cards — am I riding, or is a driver fetching something for
          me — with Rewards and Emergency as icons on the same row. Those two
          belong at the top because they are reachable in either mode; they
          used to sit in the errand tiles, which hid Emergency behind "Buy for
          me". */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-3 py-1.5 shadow-[0_-2px_10px_rgba(15,23,42,0.08)] backdrop-blur">
      <div
        ref={serviceTabsRef}
        className="mx-auto flex max-w-lg items-stretch gap-1 scroll-mt-2"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <button
          type="button"
          onClick={() => {
            setPageTab('book')
            setHomeMode('ride')
            setServiceType('ride')
            setFoodHinted(false)
          }}
          className={`flex min-w-0 flex-1 flex-col items-center gap-0 rounded-lg border py-1.5 transition ${
            homeMode === 'ride' && pageTab === 'book'
              ? 'border-brand-600 bg-white shadow-md'
              : 'border-transparent bg-slate-100 hover:bg-slate-200'
          }`}
        >
          <span className="text-[15px] leading-none">🛵</span>
          <span className="truncate text-[10px] font-semibold text-slate-700">Ride</span>
        </button>
        {/* Right of Ride, because choosing who drives you is part of booking
            a ride rather than a service of its own. The dot marks a driver
            already picked for this booking. */}
        <button
          type="button"
          onClick={() => setShowDrivers(true)}
          title="See drivers near you and pick one"
          className={`relative flex min-w-0 flex-1 flex-col items-center gap-0 rounded-lg border py-1.5 transition ${
            requestedDriverId
              ? 'border-brand-600 bg-white shadow-md'
              : 'border-transparent bg-slate-100 hover:bg-slate-200'
          }`}
        >
          <span className="text-[15px] leading-none">🧑‍✈️</span>
          <span className="truncate text-[10px] font-semibold text-slate-700">Drivers</span>
          {requestedDriverId && (
            <span aria-hidden className="absolute right-1.5 top-1 h-2 w-2 rounded-full bg-brand-600" />
          )}
        </button>
        {[
          ...(pabiliEnabled
            ? [
                {
                  key: 'pabili',
                  icon: '🛍️',
                  label: 'Pabili',
                  on: homeMode === 'buy' && isPabili && !foodHinted && pageTab === 'book',
                  // chooseErrand first: handleSelectPabili only sets the
                  // service type and resolves the store/delivery defaults, it
                  // never switches homeMode — so on its own this card left the
                  // page in Ride mode and never lit up.
                  onClick: () => {
                    chooseErrand('pabili')
                    void handleSelectPabili()
                  },
                },
              ]
            : []),
          ...(medsEnabled
            ? [
                {
                  key: 'meds',
                  icon: '💊',
                  label: 'Medicine',
                  on: homeMode === 'buy' && isBuyMedicine && pageTab === 'book',
                  onClick: () => chooseErrand('buy_medicine'),
                },
              ]
            : []),
          // Food is its own partner service (resto/store vendors) but is
          // delivered by the Pabili flow, so it appears only when both are on.
          ...(pabiliEnabled && vendorsEnabled
            ? [
                {
                  key: 'food',
                  icon: '🍽️',
                  label: 'Food',
                  on: homeMode === 'buy' && isPabili && foodHinted && pageTab === 'book',
                  onClick: () => chooseErrand('pabili', { food: true }),
                },
              ]
            : []),
        ].map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={m.onClick}
            className={`flex min-w-0 flex-1 flex-col items-center gap-0 rounded-lg border py-1.5 transition ${
              m.on ? 'border-brand-600 bg-white shadow-md' : 'border-transparent bg-slate-100 hover:bg-slate-200'
            }`}
          >
            <span className="text-[15px] leading-none">{m.icon}</span>
            <span className="truncate text-[10px] font-semibold text-slate-700">{m.label}</span>
          </button>
        ))}
        {[
          { icon: '🎁', label: 'Rewards', tab: 'rewards' as const },
          { icon: '🆘', label: 'Emergency', tab: 'emergency' as const },
        ].map((item) => (
          <button
            key={item.tab}
            type="button"
            onClick={() => {
              setPageTab(pageTab === item.tab ? 'book' : item.tab)
              revealFromTabs()
            }}
            aria-label={item.label}
            title={item.label}
            aria-pressed={pageTab === item.tab}
            className={`flex w-9 shrink-0 items-center justify-center rounded-lg border text-base transition ${
              pageTab === item.tab
                ? 'border-brand-600 bg-white shadow-md'
                : 'border-transparent bg-slate-100 hover:bg-slate-200'
            }`}
          >
            {item.icon}
          </button>
        ))}
      </div>
      </div>

      {/* From / Where to. Tapping either row expands it into the barangay
          list and sub-address for that end; the city above drives both. Only
          on the booking tab — Rewards and Emergency have nothing to address. */}
      {/* In map-first booking this card lives at the top of the sheet over
          the map (see sharedMap's sheetHeader), so it is not repeated here. */}
      {pageTab === 'book' && !mapFirstBooking && !isBuyMedicine && (!isPabili || showErrandBooking) && (
        addressCard(true)
      )}

      {foodHinted && pageTab === 'book' && (
        <p className="rounded-lg bg-gold-50 p-2.5 text-[11px] leading-relaxed text-slate-600">
          🍽️ Ordering from a partner resto menu is not live yet. For now this books a{' '}
          <span className="font-semibold">Pabili</span> — name the resto and what you want below, and your driver
          buys it and brings it over.
        </p>
      )}

      {pageTab === 'rewards' && <PassengerRewardsCard passenger={passenger} />}

      {pageTab === 'emergency' && <EmergencyHotlines province={passenger.province} city={passenger.city} />}

      {pageTab === 'book' && (
      <>
      {searchingAgain && activeRide && (
        <section
          ref={searchingBannerRef}
          className="scroll-mt-24 rounded-xl border-2 border-amber-400 bg-amber-50 p-3 shadow-sm"
        >
          <p className="text-sm font-semibold text-amber-900">You turned that price down</p>
          <p className="mt-0.5 text-xs text-amber-800">
            Your request is still out to other drivers. Pick someone yourself, or leave it and the next available
            driver takes it.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setShowDrivers(true)}
              className="flex-1 rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700"
            >
              🧑‍✈️ Choose a driver
            </button>
            <button
              type="button"
              onClick={() => cancelRide(activeRide.id)}
              className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100"
            >
              Cancel request
            </button>
          </div>
        </section>
      )}

      {/* A trip that is over stops standing in front of the next one.

          The card used to replace the booking form outright, which is right
          while a ride is running — you cannot book a second tricycle from
          inside the first. But it stayed in place after the trip finished
          and after a driver called it off, so the receipt (or the apology)
          was the whole screen: no addresses, no map, and no way to book
          again without first dismissing something.

          Finished rides now sit above a working booking form instead. The
          notice is still there to be read; the map and the address boxes
          are there to be used. */}
      {activeRide && !searchingAgain && (
        <div ref={currentRideSectionRef}>
        <ActiveRideCard
          rideId={activeRide.id}
          onCancel={() => cancelRide(activeRide.id)}
          onDismiss={returnToBooking}
        />
        </div>
      )}
      {(!activeRide || searchingAgain || rideIsOver) && (
        <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
            <>
          {/* The Ride/Pabili/Medicine row that used to live here is gone: the
              two mode cards and the errand tiles at the top of the page now
              make that choice, and two competing switches for one piece of
              state is how people end up in a mode they did not pick. */}
          {isPabili && (
            <p className="text-xs text-slate-500">
              Tell your driver what to buy — food, groceries, medicine, anything from a nearby store — and they'll
              pick it up and deliver it to you.
            </p>
          )}
          {isBuyMedicine && (
            <p className="text-xs text-slate-500">
              Order medicine from a nearby participating pharmacy — your driver picks it up and delivers it to you.
            </p>
          )}

          {/* Buy Medicine has no "who is this for?" step — a pharmacy order
              is always the logged-in customer's, and the two fulfilment tabs
              take this slot instead (see MedsBooking). Ride and Pabili keep
              it, since booking those for a relative or neighbour is common. */}

          {isPabili && !showOrderBox && (
            <button
              type="button"
              onClick={() => setShowOrderBox(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-brand-300 bg-brand-50 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-100"
            >
              🧾 Create order
            </button>
          )}

          {isPabili && showOrderBox && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-600">🧾 Your order</span>
              <button
                type="button"
                onClick={() => setShowOrderBox(false)}
                className="rounded-md px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100"
              >
                Hide
              </button>
            </div>
          )}

          {isPabili && showOrderBox && (
            <PabiliItemsInput key={pabiliItemsResetKey} value={pabiliItems} onChange={setPabiliItems} />
          )}

          {isPabili && !showErrandBooking && (
            <button
              type="button"
              disabled={pabiliItems.trim().length === 0}
              title={
                pabiliItems.trim().length === 0
                  ? 'Create your order first — the driver needs to know what to buy.'
                  : undefined
              }
              onClick={() => {
                setShowErrandBooking(true)
                // The block sits above this button, so take the eye there
                // rather than leaving it to be found by scrolling up.
                setTimeout(
                  () => addressSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
                  60,
                )
              }}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              📍 Add Buy Near to and Deliver to Location
            </button>
          )}
          {isPabili && !showErrandBooking && pabiliItems.trim().length === 0 && (
            <p className="text-center text-[11px] text-slate-400">Create your order first.</p>
          )}


          {isPabili && showOrderBox && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Store / establishment (optional)</label>
              <input
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="e.g. 7-Eleven, SM Grocery, Aling Nena's Store"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Tell your driver exactly where to buy from — this shows on their ride card. Leave blank to just let
                them buy near the pickup point below.
              </p>
            </div>
          )}

          {isBuyMedicine ? (
            <MedsBooking
              customerId={isGuestBooking ? guestCustomerId : passenger.id}
              customerName={isGuestBooking ? guestRider.otherName.trim() || 'them' : passenger.name}
              defaultProvince={DEFAULT_BOOKING_PROVINCE}
              defaultCity={DEFAULT_BOOKING_CITY}
              defaultBarangay={DEFAULT_BOOKING_BARANGAY}
              defaultAddressDetail={DEFAULT_BOOKING_ADDRESS_DETAIL}
            />
          ) : (
          <>
          {isErrand && pharmacies.some((p) => p.businessType === 'store') && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Or pick a registered store</label>
              <div className="space-y-1.5">
                {pharmacies
                  .filter((p) => p.businessType === 'store')
                  .map((store) => (
                    <button
                      key={store.id}
                      type="button"
                      onClick={() => handleStorePickupQuickPick(store)}
                      className="w-full rounded-lg border border-slate-200 p-2.5 text-left text-xs transition hover:bg-slate-50"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-700">🏪 {store.name}</span>
                        <span className={store.isOpen ? 'text-emerald-600' : 'text-amber-700'}>
                          {store.isOpen ? '🟢 Open' : '⚪ Closed'}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {store.addressDetail}, {store.barangay}, {store.city}
                      </p>
                    </button>
                  ))}
              </div>
            </div>
          )}
          {/* Not rendered here while Terminal is open — see the sharedMap
              const above, which slots this same map into the Terminal
              panel's own header instead so it never mounts twice. */}
          {sharedMap}

          {/* When it gets here and when you are there — the two numbers most
              passengers decide on, kept small enough to sit on one line. */}
          {(() => {
            // Driver → pickup uses the standard per-leg estimate; there is no
            // assigned driver yet, so no real distance to measure from.
            const toPickupSeconds = ETA_SECONDS_PER_LEG
            // Pickup → dropoff prefers the real road route, falling back to
            // the same per-leg figure when routing is unavailable.
            const travelSeconds = plannedRoute?.durationSeconds || ETA_SECONDS_PER_LEG
            const mins = (sec: number) => Math.max(1, Math.round(sec / 60))
            const at = (sec: number) =>
              new Date(Date.now() + sec * 1000)
                .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                .replace(/s?[AP]M$/i, '')
            return (
              // One line each instead of three stacked: the minutes stay the
              // biggest thing on the row, but the card no longer costs the
              // height of a whole section to say two numbers.
              <div className="flex items-stretch gap-1.5">
                <div className="flex min-w-0 flex-1 items-baseline justify-between gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1">
                  <span className="shrink-0 text-[10px] font-medium text-pickup-accent">Arrives</span>
                  <span className="min-w-0 truncate text-right">
                    <span className="text-xs font-bold text-slate-800">~{mins(toPickupSeconds)} min</span>{' '}
                    <span className="text-[10px] text-slate-400">{at(toPickupSeconds)}</span>
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 items-baseline justify-between gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1">
                  <span className="shrink-0 text-[10px] font-medium text-dest-accent">Travel</span>
                  <span className="min-w-0 truncate text-right">
                    <span className="text-xs font-bold text-slate-800">~{mins(travelSeconds)} min</span>{' '}
                    <span className="text-[10px] text-slate-400">{at(toPickupSeconds + travelSeconds)}</span>
                  </span>
                </div>
              </div>
            )
          })()}

          {/* What is left below the map is no longer an address form, so it
              no longer hides behind a Pickup/Destination tab: the GPS status,
              the special-pickup offer and the two "save this place" rows are
              all short and all relevant at once. */}
          <div>
            <div>
              {/* A Ride's "special pickup" (terminal detour) belongs here,
                  at wherever the passenger boards. An errand's exact-GPS
                  capture instead belongs on Deliver to below — the store
                  isn't where the passenger is standing. */}
              {!isErrand && (
                <>
                  {/* The button that used to sit here is now the first entry
                      in the From barangay list on the card above, so this only
                      has to report a failure — silently swallowing one would
                      leave the special-pickup checkbox below unexplainably
                      absent, since that appears only once GPS succeeds. */}
                  {gpsStatus === 'locating' && <p className="mt-1 text-[11px] text-slate-400">📍 Locating…</p>}
                  {gpsStatus === 'error' && <p className="mt-1 text-[11px] text-amber-700">{gpsError}</p>}
                  {gpsStatus === 'done' && terminalGps && (
                    <label className="mt-1.5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={specialPickupRequested}
                        onChange={(e) => setSpecialPickupRequested(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="font-medium text-amber-800">
                          Special request — Terminal is far, pick me up right here
                        </span>
                        <br />
                        <span className="text-amber-700">
                          ~{specialPickupBreakdown.distanceKm.toFixed(1)} km from the TODA Terminal
                          {specialPickupBreakdown.fee > 0
                            ? ` — adds ₱${specialPickupBreakdown.fee} (${specialPickupBreakdown.extraKm.toFixed(1)} km beyond the ${tariffSettings.standardKmCovered} km standard fare already covers)`
                            : ' — within the standard fare’s covered distance, no extra fee'}
                          <br />
                          If no one from your TODA accepts within {Math.round(specialPickupEscalationMs / 60000)}{' '}
                          minutes, it opens to any TODA member and freelance drivers nearby.
                        </span>
                      </span>
                    </label>
                  )}
                </>
              )}
              {!isErrand && (
                <label className="mt-1.5 flex items-start gap-2 rounded-lg border border-navy-900/20 bg-slate-50 px-2.5 py-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={specialTrip}
                    onChange={(e) => setSpecialTrip(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span className="font-medium text-slate-800">Special trip — buong tricycle</span>
                </label>
              )}
              <div className="mt-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2">
                <div className="flex items-center gap-1.5">
                  <span className="shrink-0 text-[11px] font-semibold text-slate-600">Save Places</span>
                  {/* Same colours as the map's own Pickup/Destination tabs
                      and the two pins — green is always the pickup, red
                      always the destination, everywhere in this app. */}
                  <div className="flex gap-1 rounded-lg bg-slate-200/70 p-0.5">
                    <button
                      type="button"
                      onClick={() => setSavePlaceTarget('pickup')}
                      className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                        savePlaceTarget === 'pickup' ? 'bg-pickup-accent text-white shadow-sm' : 'text-pickup-accent hover:bg-white'
                      }`}
                    >
                      Pickup
                    </button>
                    <button
                      type="button"
                      onClick={() => setSavePlaceTarget('dropoff')}
                      className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                        savePlaceTarget === 'dropoff' ? 'bg-dest-accent text-white shadow-sm' : 'text-dest-accent hover:bg-white'
                      }`}
                    >
                      Destination
                    </button>
                  </div>
                </div>
                {/* Which address the chips will actually save, said plainly —
                    the tab names the end, this names the place. */}
                <p className="mt-1 truncate text-[10px] text-slate-500">
                  {savePlaceTarget === 'pickup'
                    ? formatAddressLine(pickup.label)
                    : hasDestination
                      ? formatAddressLine(dropoff.label)
                      : 'No destination set yet'}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {SAVED_LOCATION_LABELS.map((label) => (
                    <button
                      key={label}
                      type="button"
                      disabled={savePlaceTarget === 'dropoff' && !hasDestination}
                      onClick={() => handleSaveLocation(label, savePlaceTarget === 'pickup' ? pickup : dropoff)}
                      className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                    >
                      {savedLocationButtonLabel(label)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              {isErrand && (
                <>
                  {/* Moved into the Where to barangay list on the card above.
                      Only the failure and in-progress states stay here. */}
                  {gpsStatus === 'locating' && <p className="mt-1 text-[11px] text-slate-400">📍 Locating…</p>}
                  {gpsStatus === 'error' && <p className="mt-1 text-[11px] text-amber-700">{gpsError}</p>}
                </>
              )}
            </div>
          </div>

          {savedLocations.length > 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
              <button
                type="button"
                onClick={() => setShowSavedPlaces((v) => !v)}
                aria-expanded={showSavedPlaces}
                className="flex w-full items-center justify-between text-xs font-medium text-slate-500"
              >
                Saved places ({savedLocations.length})
                <span className="text-slate-400">{showSavedPlaces ? '▲ Hide' : '▼ Show'}</span>
              </button>
              {showSavedPlaces && (
              <div className="mt-1.5 space-y-1.5">
              {savedLocations.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-slate-600">
                    {SAVED_LOCATION_ICONS[s.label]} {s.label} — {s.location.label}
                  </span>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => handlePickupQuickPick(s.location)}
                      className="rounded-lg border border-slate-300 px-2 py-1 font-medium text-slate-600 hover:bg-white"
                    >
                      Pickup
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDropoffQuickPick(s.location)}
                      className="rounded-lg border border-slate-300 px-2 py-1 font-medium text-slate-600 hover:bg-white"
                    >
                      Destination
                    </button>
                    <button
                      type="button"
                      onClick={() => removePassengerLocation(passenger.id, s.id)}
                      className="rounded-lg border border-amber-200 px-2 py-1 font-medium text-amber-700 hover:bg-amber-50"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
              </div>
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Favorite driver (optional)</label>
            {(() => {
              const bookable = drivers.filter(
                (d) => d.verificationStatus === 'approved' && d.accessStatus === 'active',
              )
              const chosen = bookable.find((d) => d.id === passenger.favoriteDriverId) ?? null
              // Plates are typed inconsistently ("TRC-1023", "trc 1023",
              // "1023"), so both sides are stripped to alphanumerics before
              // comparing — otherwise the punctuation decides whether a
              // passenger finds their own driver.
              const needle = driverQuery.trim().toLowerCase()
              const bare = needle.replace(/[^a-z0-9]/g, '')
              const matches = needle
                ? bookable
                    .filter(
                      (d) =>
                        d.name.toLowerCase().includes(needle) ||
                        (!!bare && d.plateNumber.toLowerCase().replace(/[^a-z0-9]/g, '').includes(bare)),
                    )
                    .slice(0, 6)
                : []

              if (chosen) {
                return (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-gold-400/60 bg-gold-50 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate font-medium text-slate-700">
                      ⭐ {chosen.name} · {chosen.plateNumber}
                    </span>
                    <span className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => setShowDrivers(true)}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Change
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFavoriteDriver(passenger.id, null)
                          setDriverQuery('')
                        }}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                      >
                        Clear
                      </button>
                    </span>
                  </div>
                )
              }

              return (
                <div className="relative">
                  <input
                    value={driverQuery}
                    onChange={(e) => {
                      setDriverQuery(e.target.value)
                      setDriverPickerOpen(true)
                    }}
                    onFocus={() => setDriverPickerOpen(true)}
                    placeholder="Type a driver name or TRC No."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  {driverPickerOpen && needle !== '' && (
                    <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                      {matches.length === 0 ? (
                        <p className="px-3 py-2 text-[11px] text-slate-400">
                          No approved driver matches "{driverQuery.trim()}".
                        </p>
                      ) : (
                        matches.map((d) => (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => {
                              setFavoriteDriver(passenger.id, d.id)
                              setDriverQuery('')
                              setDriverPickerOpen(false)
                            }}
                            className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                          >
                            <span className="font-medium text-slate-700">{d.name}</span>{' '}
                            <span className="text-xs text-slate-400">· {d.plateNumber}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )
            })()}
            <p className="mt-1 text-[11px] text-slate-400">
              Leave blank for normal terminal Pila order. If set, your favorite driver is offered your next ride
              first, ahead of the Pila.
            </p>
          </div>

          {/* A second way to book, above the payment row rather than only
              at the top of the form.

              Everything between the addresses and here — saved places, the
              favourite driver, the special-trip box — is optional, so a
              passenger who has answered the two questions that matter
              scrolls past a screen of things they do not need in order to
              reach the button. This puts it where they finish reading.

              Same handler and the same disabled rule as the button above,
              so the two can never disagree about whether a booking is
              ready to send. */}
          <button
            type="button"
            onClick={handleRequest}
            disabled={!canSubmit}
            className="w-full rounded-lg bg-[#ffe066] px-3 py-2 text-sm font-bold text-navy-900 shadow-sm transition hover:bg-[#ffd633] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            <span className="block truncate">
              {isPabili
                ? isGuestBooking
                  ? `Request Pabili for ${guestRider.otherName.trim() || 'them'}`
                  : 'Request Pabili'
                : isGuestBooking
                  ? `Book a tricycle for ${guestRider.otherName.trim() || 'them'}`
                  : 'Book a tricycle'}
            </span>
          </button>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Payment method</label>
            <div className="grid grid-cols-4 gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentMethod(m.id)}
                  className={`rounded-lg border py-2 text-xs font-medium transition ${
                    paymentMethod === m.id
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {!hasDestination && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-center text-xs text-slate-400">
              Choose where you're going to see the fare.
            </p>
          )}

          {hasDestination && (
          <div className="space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <p className="pb-0.5 text-[11px] font-medium text-slate-400">Estimated cost breakdown</p>
            {isFixedErrandFare ? (
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Fixed errand rate</span>
                <span>₱{pabiliFixedFare}</span>
              </div>
            ) : (
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Standard rate{isErrand ? '' : ` (covers ${tariffSettings.standardKmCovered} km)`}</span>
              <span>₱{fareStandardRatePortion}</span>
            </div>
            )}
            {!isFixedErrandFare && fareExtraKmFeePortion > 0 && (
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>
                  Extra distance ({fareExtraKmDisplay.toFixed(1)} km beyond the {tariffSettings.standardKmCovered} km
                  covered)
                </span>
                <span>₱{fareExtraKmFeePortion}</span>
              </div>
            )}
            {isErrand && (
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Pabili service fee</span>
                <span>₱{serviceFee}</span>
              </div>
            )}
            {specialPickupFee > 0 && (
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Special pickup — Terminal detour ({specialPickupBreakdown.extraKm.toFixed(1)} km)</span>
                <span>₱{specialPickupFee}</span>
              </div>
            )}
            {isErrand && tip > 0 && (
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Tip</span>
                <span>₱{tip}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-slate-200 pt-1">
              <span className="font-medium text-slate-600">{isErrand ? 'Total' : 'Estimated fare'}</span>
              <span className="font-semibold text-slate-800">₱{totalFare}</span>
            </div>
          </div>
          )}
          </>
          )}
            </>
        </section>
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
          {visibleTripHistory.length === 0 && <p className="text-sm text-slate-400">No trips yet.</p>}
          {visibleTripHistory.map((r) => {
            const driver = r.driverId ? drivers.find((d) => d.id === r.driverId) : null
            const toda = driver?.todaOrgId ? todaOrganizations.find((o) => o.id === driver.todaOrgId) : null
            return (
              <div key={r.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700">
                    {r.serviceType === 'pabili' && '🛍️ Pabili · '}
                    {r.serviceType === 'buy_medicine' && '💊 Buy Medicine · '}
                    {formatTripRoute(r.pickup.label, r.dropoff.label)}
                  </span>
                  <StatusBadge status={r.status} />
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  ₱{r.fareEstimate}
                  {r.pabiliTip > 0 && ` + ₱${r.pabiliTip} tip`}
                  {r.tipOffer > 0 && ` + ₱${r.tipOffer} tip offer`} · {new Date(r.requestedAt).toLocaleString()}
                </div>
                {(r.serviceType === 'pabili' || r.serviceType === 'buy_medicine') && r.pabiliItems && (
                  <p className="mt-1 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">🛒 {r.pabiliItems}</p>
                )}
                {r.payment && <ReceiptCard payment={r.payment} />}
                <div className="mt-2 flex flex-wrap items-start gap-1.5">
                  {r.status === 'completed' && driver && (
                    <RateRideSection ride={r} driverName={driver.name} todaName={toda?.name ?? null} />
                  )}
                  {driver && <ReportDriverSection ride={r} driver={driver} passengerId={passenger.id} passengerName={passenger.name} />}
                </div>
              </div>
            )
          })}
        </div>
        )}
      </section>

      </>
      )}

      {/* The big "Sakay sa Terminal" banner is on the Record-your-trip
          chooser, where somebody is deciding between the two ways in. Here
          they have already chosen to book, and it was a screen of marketing
          under the form they came to fill in. */}

      {unpaidRide && (
        <RidePaymentForm
          open={showPayment}
          onClose={() => setShowPayment(false)}
          driverName={unpaidRide.driverName ?? 'your driver'}
          driverPhone={drivers.find((d) => d.id === unpaidRide.driverId)?.phone ?? null}
          gcashAccount={drivers.find((d) => d.id === unpaidRide.driverId)?.gcashAccount ?? null}
          mayaAccount={drivers.find((d) => d.id === unpaidRide.driverId)?.mayaAccount ?? null}
          fare={unpaidRide.fareEstimate}
          tip={unpaidRide.pabiliTip + (unpaidRide.tipOffer || 0)}
          total={unpaidRide.fareEstimate + unpaidRide.pabiliTip + (unpaidRide.tipOffer || 0)}
          initialMethod={unpaidRide.paymentMethod}
          onConfirm={(method, referenceNo) => {
            acknowledgeRidePayment(unpaidRide.id, method, referenceNo)
            setShowPayment(false)
          }}
        />
      )}

      {/* Told before the wait starts, not discovered during it.
          //
          A kilometre on a tricycle is not "just around the corner" — it is
          several minutes of standing on a road wondering whether the app
          heard you. This says the distance and the minutes, then lets the
          passenger decide: waiting is fine when it is a thing you agreed to.
          //
          Not a block. The booking goes through if they say so — there may be
          no nearer tricycle in the town, and refusing to book would leave
          them with nothing but a walk. */}
      {farDriverPrompt && nearestDriverMeters !== null && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Malayo pa ang driver"
        >
          <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-4 shadow-xl">
            <p className="text-sm font-bold text-navy-900">🛺 Malayo pa ang pinakamalapit na driver</p>
            <p className="text-xs leading-relaxed text-slate-600">
              <span className="font-semibold text-navy-900">{formatKm(nearestDriverMeters)}</span> ang layo — mga{' '}
              <span className="font-semibold text-navy-900">{formatDuration(minutesToCover(nearestDriverMeters))}</span>{' '}
              bago makarating sa {formatAddressLine(pickup.label)}.
            </p>
            <p className="text-[11px] leading-relaxed text-slate-500">
              Ituloy mo kung okay lang maghintay. Puwede ka rin munang maglipat ng pickup na mas malapit sa
              kanila.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFarDriverPrompt(false)}
                className="rounded-lg border border-slate-300 bg-white py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Hindi muna
              </button>
              <button
                type="button"
                onClick={() => {
                  // Remembered, so the same question is not asked twice for
                  // the same pickup.
                  setFarDriverConfirmed(true)
                  setFarDriverPrompt(false)
                  requestAnimationFrame(() => handleRequest())
                }}
                className="rounded-lg bg-brand-600 py-2.5 text-xs font-bold text-white transition hover:bg-brand-700"
              >
                Ituloy ang booking
              </button>
            </div>
          </div>
        </div>
      )}

      <NearbyDriversPicker
        open={showDrivers}
        onClose={() => setShowDrivers(false)}
        nearby={buildNearbyDrivers(
          drivers,
          pickupGps ?? pickup.gps,
          terminals,
          todaOrganizations,
          rides,
          oneWayFare + specialPickupFee,
          todaRadiusKm,
          outOfAreaPerKm,
        )}
        requestedDriverId={requestedDriverId}
        onRequestDriver={setRequestedDriverId}
        favoriteDriverId={passenger.favoriteDriverId ?? null}
        onSetFavorite={(driverId) => setFavoriteDriver(passenger.id, driverId)}
        estimatedFare={oneWayFare + specialPickupFee}
        hasDestination={hasDestination}
      />
    </div>
  )
}

function ActiveRideCard({
  rideId,
  onCancel,
  onDismiss,
}: {
  rideId: string
  onCancel: () => void
  onDismiss: () => void
}) {
  const { rides, completeRide } = useRides()
  const ride = rides.find((r) => r.id === rideId)
  if (!ride) return null

  return (
    <TripMonitor
      title="Your ride"
      ride={ride}
      sosActorId={ride.passengerId}
      sosLabel="SOS — Something's wrong"
      showCancel
      onCancel={onCancel}
      onFinishTrip={() => completeRide(ride.id, ride.paymentMethod)}
      onDismiss={onDismiss}
      allowLiveGpsToggle
      allowGotOffCheck
    />
  )
}

function RateRideSection({ ride, driverName, todaName }: { ride: Ride; driverName: string; todaName: string | null }) {
  const { rateRide } = useRides()
  const [open, setOpen] = useState(false)
  const [driverStars, setDriverStars] = useState(0)
  const [driverReview, setDriverReview] = useState('')
  const [todaStars, setTodaStars] = useState(0)
  const [todaReview, setTodaReview] = useState('')

  if (ride.ratedAt) {
    return (
      <div className="w-full basis-full space-y-1 rounded-lg bg-slate-50 p-2.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Your rating — {driverName}</span>
          <StarRating value={ride.driverRating ?? 0} size="sm" />
        </div>
        {ride.driverReviewText && <p className="text-slate-600">"{ride.driverReviewText}"</p>}
        {todaName && ride.todaRating !== null && (
          <>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-slate-500">Your rating — {todaName}</span>
              <StarRating value={ride.todaRating} size="sm" />
            </div>
            {ride.todaReviewText && <p className="text-slate-600">"{ride.todaReviewText}"</p>}
          </>
        )}
      </div>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-w-0 flex-1 basis-[calc(50%-0.375rem)] rounded-lg border border-slate-300 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
      >
        ⭐ Rate this ride
      </button>
    )
  }

  return (
    <div className="w-full basis-full space-y-2.5 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
      <div>
        <p className="mb-1 text-xs font-medium text-slate-500">Driver — {driverName}</p>
        <StarRating value={driverStars} onChange={setDriverStars} />
        <textarea
          value={driverReview}
          onChange={(e) => setDriverReview(e.target.value)}
          placeholder="Optional review of your driver…"
          rows={2}
          className="mt-1.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
        />
      </div>
      {todaName && (
        <div>
          <p className="mb-1 text-xs font-medium text-slate-500">TODA — {todaName}</p>
          <StarRating value={todaStars} onChange={setTodaStars} />
          <textarea
            value={todaReview}
            onChange={(e) => setTodaReview(e.target.value)}
            placeholder="Optional review of the TODA…"
            rows={2}
            className="mt-1.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
          />
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={driverStars < 1}
          onClick={() =>
            rateRide({
              rideId: ride.id,
              driverRating: driverStars,
              driverReviewText: driverReview,
              todaRating: todaName ? (todaStars || null) : null,
              todaReviewText: todaReview,
            })
          }
          className="flex-1 rounded-lg bg-brand-600 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Submit rating
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function ReportDriverSection({
  ride,
  driver,
  passengerId,
  passengerName,
}: {
  ride: Ride
  driver: { id: string; name: string }
  passengerId: string
  passengerName: string
}) {
  const { reportDriver } = useRides()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<DriverReportReason>('other')
  const [details, setDetails] = useState('')
  const [submitted, setSubmitted] = useState(false)

  if (submitted) {
    return <p className="w-full basis-full text-xs text-emerald-700">✓ Reported — our team will review this.</p>
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-w-0 flex-1 basis-[calc(50%-0.375rem)] rounded-lg border border-amber-200 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50"
      >
        🚩 Report driver
      </button>
    )
  }

  return (
    <div className="w-full basis-full space-y-2 rounded-lg border border-dashed border-amber-200 bg-amber-50 p-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-500">Reason</span>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value as DriverReportReason)}
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
        >
          {DRIVER_REPORT_REASONS.map((r) => (
            <option key={r} value={r}>
              {DRIVER_REPORT_REASON_LABELS[r]}
            </option>
          ))}
        </select>
      </label>
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        placeholder="What happened?"
        rows={2}
        className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            reportDriver({
              rideId: ride.id,
              passengerId,
              passengerName,
              driverId: driver.id,
              driverName: driver.name,
              reason,
              details,
            })
            setSubmitted(true)
          }}
          className="flex-1 rounded-lg bg-amber-700 py-1.5 text-xs font-semibold text-white hover:bg-amber-800"
        >
          Submit report
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
