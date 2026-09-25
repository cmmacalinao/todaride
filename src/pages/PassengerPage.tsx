import { formatAddressLine } from '../lib/addressFormat'
import { ShareAppPanel, familyInviteUrl } from '../components/ShareAppPanel'
import { familyLimitsFor, withinCurfew } from '../lib/familyLimits'
import { FamilyActivation, FamilyTermsText, familyPlanActive, formatPlanDate } from '../components/FamilyActivation'
import { FamilyDriverRow, familyDriverPick, type FamilyDriverChoice } from '../components/FamilyTrustedDriver'
import { streetLinesFor } from '../lib/streetPaths'
import { formatTripRoute } from '../lib/addressFormat'
import { isVendorDeliveryRide, rideServiceTag } from '../lib/vendorOrders'
import { useHeaderTabs } from '../context/HeaderSlotContext'
import { PaDeliverSubTabs } from '../components/PaDeliverSubTabs'
import { showInMiddle, showInMiddleWhenSettled } from '../lib/showInMiddle'
import { NearbyDriversPicker, buildNearbyDrivers } from '../components/NearbyDriversPicker'
import { RidePaymentForm } from '../components/RidePaymentForm'
import { checkMayaPayment } from '../lib/mayaApi'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ETA_SECONDS_PER_LEG, errandBaseFare, useRides } from '../context/RideContext'
import { AnnouncementFeed } from '../components/AnnouncementFeed'
import { useRouteThrough, useRoute } from '../lib/routing'
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
import { SAVED_LOCATION_ICONS, savedPlaceName } from '../lib/savedLocations'
import { dropOffOrder } from '../lib/groupStops'
import { SwipePanel, type SwipeLevel } from '../components/SwipePanel'
import {
  createCustomLocation,
  resolvePhAddress,
  reverseGeocodeToPhAddress,
  type PhAddressTags,
} from '../lib/customLocation'
import { StatusBadge } from '../components/StatusBadge'
import { ReceiptCard } from '../components/ReceiptCard'
import { PhotoGallery } from '../components/PhotoGallery'
import { StarRating } from '../components/StarRating'
import { TripMonitor } from '../components/TripMonitor'
import { TripDetailsBar } from '../components/TripDetailsBar'
import { ClearHistoryControl, isClearedFromHistory } from '../components/ClearHistoryControl'
import { PassengerRegisterForm } from '../components/PassengerRegisterForm'
import { BarangayAddressPicker } from '../components/BarangayAddressPicker'
import { FAR_DRIVER_METERS, formatDuration, formatKm, haversineDistanceMeters, minutesToCover } from '../lib/geo'
import { LocationMapPicker } from '../components/LocationMapPicker'
import type { SheetSnap } from '../components/BottomSheet'
import type { MapPoint } from '../components/RealLiveMap'
import { MedsBooking } from '../components/MedsBooking'
import { VendorMenuBooking, type VendorMenuBookingHandle } from '../components/VendorMenuBooking'
import { EmergencyHotlines } from '../components/EmergencyHotlines'
import { EmergencySheet } from '../components/EmergencySheet'
import { useWatchPosition } from '../lib/liveTracking'
import { isActiveAlert, passengerEmergencyContacts } from '../lib/safety'
import { makeGuestPassengerId, useGuestRider } from '../components/GuestRiderFields'
import { PassengerRewardsCard } from '../components/PassengerRewardsCard'
import { GroupRideInlinePanel, type GroupRiderEntry } from '../components/GroupRideInlinePanel'
import { ContactSheet } from '../components/ContactSheet'
import { DestinationSearch, type SelectedPlace } from '../components/DestinationSearch'
import { ADULT_MEMBER_LIMITS, MINOR_DEFAULT_LIMITS } from '../types'
import { MINOR_AGE } from '../lib/familyLimits'
import type {
  DriverReportReason,
  FamilyMember,
  FamilyMemberLimits,
  GeoCoords,
  MockLocation,
  PaymentMethod,
  Pharmacy,
  Ride,
  SavedLocationLabel,
  ServiceType,
} from '../types'

const MAX_RIDE_PASSENGERS = 4

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
    clearPassengerTripHistory,
    requestRide,
    requestGroupRide,
    cancelRide,
    todaRadiusKm,
    outOfAreaPerKm,
    setFavoriteDriver,
    saveFamilyMember,
    acknowledgeRidePayment,
    requestedDrivers,
    setRequestedDriver,
    removePassengerLocation,
    savePassengerLocation,
    medsOrders,
    pharmacies,
    rewardsEnabled,
    medsEnabled,
    vendorsEnabled,
    alerts,
    triggerSos,
    triggerPassengerSos,
    cancelAlert,
    logAlertEvent,
    safetySettings,
    removeSafetyPhoto,
    landmarks,
  } = useRides()
  // The "no booking app fee" promise, only where it is still true.
  const { currentPassengerId, setCurrentPassengerId, authedAccount } = useSession()
  // Only the Admin ops view (/passenger) needs to switch between accounts to
  // test as anyone — a real logged-in passenger's identity is fixed to
  // whoever authenticated, same as the Driver app.
  const isAdminOpsView = authedAccount?.role === 'admin'
  const bookingMapRef = useRef<HTMLDivElement>(null)
  const [showDrivers, setShowDrivers] = useState(false)
  const [footerContactOpen, setFooterContactOpen] = useState(false)
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
  // Cash only on this screen now — see the removed Payment method picker.
  // The type still carries E-Wallet for the ride records that pay that way
  // already (recorded terminal rides, MedsBooking), so this stays a
  // PaymentMethod rather than narrowing to the literal 'cash'.
  const [paymentMethod] = useState<PaymentMethod>('cash')
  const [passengerCount, setPassengerCount] = useState(1)
  const [showRegister, setShowRegister] = useState(false)
  const [pageTab, setPageTab] = useState<'book' | 'rewards' | 'emergency'>('book')
  // Where this phone is, for the emergency screen — without a trip there is no
  // shared position to show, and "Location not available" is the last thing
  // someone reading coordinates to 911 needs to see.
  const { position: emergencyGps } = useWatchPosition(pageTab === 'emergency')
  const serviceTabsRef = useRef<HTMLDivElement>(null)
  const addressSectionRef = useRef<HTMLElement>(null)

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
  // Food has no catalog of its own yet — resto/vendor partners can register
  // and manage products, but nothing customer-facing orders from them. The
  // working path today is Pabili (the driver buys it for you), so the Food
  // tile opens that and this flag explains the substitution rather than
  // pretending a resto menu exists.
  const [foodHinted, setFoodHinted] = useState(false)
  // Which vendor catalog the Food/PaDeliver tile opened — Food Order browses
  // resto_food vendors, PaDeliver's Store browses other_commodity ones (see
  // VendorMenuBooking's catalogTypes). Only meaningful while foodHinted.
  const [catalogKind, setCatalogKind] = useState<'food' | 'goods'>('food')
  // Favourite-driver search box. Once a TODA has more than a handful of
  // members a dropdown of every approved driver is unusable on a phone —
  // typing a name or a plate is how a passenger actually knows their driver.
  const [driverQuery, setDriverQuery] = useState('')
  const [driverPickerOpen, setDriverPickerOpen] = useState(false)
  // Which of From / Where to is expanded into its barangay + sub-address
  // fields. Only one at a time: the card stays short, and it mirrors how the
  // map picker already scopes itself to one end.
  const [openEnd, setOpenEnd] = useState<'pickup' | 'dropoff' | null>(null)
  // The barangay dropdown + detailed-address field (BarangayAddressPicker)
  // within whichever end is open — typing an address is the slow path next
  // to the landmark search, quick chips, and map tap that sit above it, so
  // it stays out of the way until this is tapped instead of opening with
  // everything else.
  const [addressFormOpen, setAddressFormOpen] = useState<'pickup' | 'dropoff' | null>(null)
  // "Fill Address Form" under a search with no match: opens that end's form
  // and brings it on screen. The form is drawn only while its end is the open
  // one (openEnd) — setting addressFormOpen alone left nothing to see once
  // Where to moved onto the map and stopped opening its end — and it sits in
  // the card above the map, usually scrolled away from the search box.
  const addressFormRef = useRef<HTMLDivElement>(null)
  function openAddressForm(end: 'pickup' | 'dropoff') {
    setOpenEnd(end)
    setAddressFormOpen(end)
    setTimeout(() => addressFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
  }
  // How open the booking sheet is.
  //
  // Driven by the address form rather than left to the reader: opening
  // "Where to?" puts three dropdowns inside the sheet, and a sheet still at
  // half height simply hides them below its own fold — the tap appears to do
  // nothing. It opens to show them and drops back once the address is
  // confirmed, so the map is the thing on screen whenever nothing is being
  // typed. Dragging the handle still overrides it at any point.
  // Down by default, on every arrival at this screen.
  //
  // The map is the answer to the first question anybody has here — where am I,
  // and where is that — and a sheet opened halfway covers the half of it they
  // are standing in. Somebody who wants the form pulls it up, which is one
  // gesture; somebody who wants the map had to push it down before they could
  // read anything, which is the same gesture spent on undoing a default.
  //
  // It still comes up by itself when an address form is opened, because that
  // is the app being asked to type rather than to look, and it drops straight
  // back down when the address is confirmed.
  const [bookingSheetSnap, setBookingSheetSnap] = useState<SheetSnap>('peek')
  useEffect(() => {
    setBookingSheetSnap(openEnd ? 'full' : 'peek')
  }, [openEnd])

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
  // Padala only — what's in the package and/or who it's for. Plain text,
  // no item/cost table: nobody is buying anything, so there is nothing to
  // itemize (see isPadala).
  const [packageNote, setPackageNote] = useState('')
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
  // Whether the booking map has taken the whole screen — the Where to strip
  // moves onto it then (see destinationStrip).
  const [mapIsFullscreen, setMapIsFullscreen] = useState(false)
  // How far the Group Ride sheet on the map is pulled up — see SwipePanel.
  const [groupSheetLevel, setGroupSheetLevel] = useState<SwipeLevel>(1)
  // True while the riders' stops are being set on the map one after another:
  // the sheet is hidden entirely then, so the map and its pin are all there is.
  const [groupSettingStops, setGroupSettingStops] = useState(false)
  const [groupRiders, setGroupRiders] = useState<GroupRiderEntry[]>([])
  const [groupPaySplit, setGroupPaySplit] = useState<'separate' | 'booker'>('separate')
  const [groupSubmitting, setGroupSubmitting] = useState(false)
  // Whether this passenger has already been told how far the nearest driver
  // is, and said yes anyway. Reset when the pickup moves, because a different
  // pickup is a different question.
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
  // Someone and Family both book for another person — the same page. Family
  // (2026-09-22) also saves that person to the booker's family list and links
  // the ride back to the booker, who follows it from here (Family trips).
  const forOther = guestRider.bookingFor === 'other' || guestRider.bookingFor === 'family'
  const forFamily = guestRider.bookingFor === 'family'
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()

  // Sakay sa Terminal has its own address again (/book/terminal). Reached
  // from the Record-mo-ang-Biyahe card on the chooser (RiderStartPage), not
  // from a strip under the booking form. It shares
  // this page's state — the same pickup, the same destination, the same one
  // map instance — so it stays this component rather than a second one that
  // would have to rebuild all of it. What the route buys is that it behaves
  // like the screen it is: a back button that works, a history entry, and a
  // link that can be sent to someone.
  //
  // Group Ride is still a panel on this page; it is a variation on booking
  // rather than a different thing to be doing.
  // Group Ride, the same way. It needs the page's map as much as the
  // terminal screen does — pinning each rider's own destination is done on
  // it — so it also stays this component and takes the map with it.
  const groupRideOpen = location.pathname === '/book/group'
  const setGroupRideOpen = (open: boolean) => navigate(open ? '/book/group' : '/book')
  // Family → Several stops (2026-09-22): the Group Ride screen with family
  // members as its riders — one tricycle, a stop per school. The owner books
  // it and is not riding.
  const familyGroup = groupRideOpen && new URLSearchParams(location.search).get('family') === '1'
  // Several stops runs both ways (2026-09-23): 'drop' — one pickup (home),
  // a drop-off for each member (their schools); 'pick' — a pickup for each
  // member (their schools), one destination for everyone (home). Each
  // member's own point is kept in their row's destination field either way.
  const [familyDir, setFamilyDir] = useState<'drop' | 'pick'>('drop')
  const pickRun = familyGroup && familyDir === 'pick'
  // The shared end — the pickup of a drop-off run, the destination of a
  // pick-up run — is being set on the map.
  const [settingCommon, setSettingCommon] = useState(false)
  // Family home (2026-09-22): members, trusted driver and trips, with a tab
  // into booking. The booking itself is its own page (/book in Family mode)
  // so the map and the box have the whole phone screen.
  const familyHome = location.pathname === '/book/family'
  const [showFamilyTerms, setShowFamilyTerms] = useState(false)
  function openFamilyBooking(several = false) {
    navigate(several ? '/book/group?family=1' : '/book')
    if (!several) guestRider.setBookingFor('family')
    window.scrollTo({ top: 0 })
  }
  // Arriving on Family home (tile, link or back button) puts the page in
  // Family mode, so its Book tab opens a Family booking.
  useEffect(() => {
    if (!familyHome) return
    guestRider.setBookingFor('family')
    // Family books rides — leave any Food Order / PaDeliver screen behind.
    setServiceType('ride')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyHome])
  // Family bookings: the family's trusted driver first, or anyone nearby.
  const [familyDriverChoice, setFamilyDriverChoice] = useState<FamilyDriverChoice>('')
  // Saved places (2026-09-22): Home, School, Work or a named favourite
  // being set on the map. While set, the centre pin and its Set button save
  // that place instead of choosing the trip's destination.
  const [savingPlace, setSavingPlace] = useState<{ label: SavedLocationLabel; name?: string } | null>(null)
  const [placesManage, setPlacesManage] = useState(false)
  const [newPlaceName, setNewPlaceName] = useState<string | null>(null)

  // A Food Order/PaDeliver cart, mirrored up from VendorMenuBooking (see
  // VendorMenuBookingHandle) purely so the app-wide footer below can show a
  // View Cart tile without that screen's own cart ever living here.
  const vendorMenuRef = useRef<VendorMenuBookingHandle>(null)
  const [vendorCart, setVendorCart] = useState<{ count: number; total: number; atCheckout: boolean } | null>(null)

  // Lets the landing page's "💊 Buy a Medicine" button link straight into
  // the Medicine flow (/book?service=buy_medicine) instead of dropping the
  // passenger on the collapsed "Ready to head out?" prompt.
  useEffect(() => {
    // A shared vendor link (/book?vendor=<id>, see App.tsx and
    // VendorGuestPage) opens Food Express on that store's menu.
    if (vendorsEnabled && searchParams.get('vendor')) {
      setPageTab('book')
      // A goods store opens in PaDeliver's Store, a resto in Food Order —
      // each catalog lists only its own kind, so the wrong one would not find
      // the store at all (the home page's store tiles link here).
      const linked = pharmacies.find((p) => p.id === searchParams.get('vendor'))
      chooseErrand('pabili', { food: true, catalog: linked?.businessType === 'other_commodity' ? 'goods' : 'food' })
      return
    }
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
    // Only a pharmacy order counts. A Food Order / PaDeliver checkout is a
    // MedsOrder too (same table, pharmacyId = the store), and counting it
    // here shoved a passenger who had just ordered lunch from a carinderia
    // onto the hidden "Order medicine" screen the next time the app opened.
    const isPharmacyOrder = (o: (typeof medsOrders)[number]) =>
      !o.pricedFromMenu && pharmacies.find((p) => p.id === o.pharmacyId)?.businessType === 'pharmacy'
    const hasActiveMedsOrder = medsOrders.some((o) => {
      if (o.customerId !== resolvedPassengerId || !isPharmacyOrder(o)) return false
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
    // And only while the Medicine service is switched on at all — a hidden
    // service must never be the screen the app opens on.
    if (medsEnabled && (hasActiveMedsOrder || hasActiveDirectMedsRide)) {
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
        // Book a Ride leaves the Family page for an ordinary booking.
        if (guestRider.bookingFor === 'family') guestRider.setBookingFor('self')
        scrollTop()
        break
      case 'medicine':
        if (!medsEnabled) break
        setPageTab('book')
        setServiceType('buy_medicine')
        scrollTop()
        break
      case 'food':
        // Same entry point as tapping the Food Order tile inside this page
        // (see chooseErrand) — used by RiderStartPage's SafeRide Food Order
        // tab so a passenger can jump straight into the Registered Vendor
        // menu flow (VendorMenuBooking, resto_food catalog) without landing
        // on Ride/Pabili first. Gated on the vendor-partners switch, not
        // Pabili: Food Order is its own tile on RiderStartPage and must not
        // vanish because Super Admin turned errands off (it only borrows the
        // Pabili flow underneath).
        if (!vendorsEnabled) break
        chooseErrand('pabili', { food: true, catalog: 'food' })
        scrollTop()
        break
      case 'family':
        // Family has its own home page now (see familyHome).
        setPageTab('book')
        setServiceType('ride')
        navigate('/book/family')
        scrollTop()
        break
      case 'goods_store':
        // PaDeliver's "Store" — same VendorMenuBooking flow as Food Order,
        // scoped to other_commodity vendors instead of resto_food.
        if (!vendorsEnabled) break
        chooseErrand('pabili', { food: true, catalog: 'goods' })
        scrollTop()
        break
      case 'goods_delivery':
        // PaDeliver's "Book a Delivery" — a courier request for a package
        // the sender (a store or a buyer) already has: no buying involved,
        // just pickup -> dropoff. Its own serviceType ('padala'), not Pabili
        // with different copy — see isPadala.
        chooseErrand('padala')
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
        if (!rewardsEnabled) break
        setPageTab('rewards')
        scrollTop()
        break
      default:
        break
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  const passenger = passengers.find((p) => p.id === currentPassengerId) ?? passengers[0]
  // Family Plan activated (terms accepted), by this account or — for a member
  // who joined by invite — its owner. Family booking is locked until then.
  const familyActive = familyPlanActive(passenger, passengers)
  // This account's own limits, when it is a family member's account (a
  // child's, usually) — see lib/familyLimits. Null for everyone else.
  const myLimits = familyLimitsFor(passenger, passengers)
  const inCurfew = withinCurfew(myLimits)
  // Their family's trusted drivers, when their rides may only go to those.
  const myFamilyTrustedId = (() => {
    if (!myLimits?.trustedOnly) return null
    const owner = passengers.find((o) => o.id === passenger.familyOwnerId)
    return (owner?.familyTrustedDriverIds ?? [])[0] ?? null
  })()
  // Family booking without an active plan goes back to Family home, which
  // shows the activation screen.
  useEffect(() => {
    if ((forFamily || familyGroup) && !familyActive && !familyHome) navigate('/book/family', { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forFamily, familyGroup, familyActive, familyHome])
  const familyTrustedPick =
    forFamily || familyGroup ? familyDriverPick(passenger, familyDriverChoice) : null
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
  // Padala: PaDeliver's "Book a Delivery" — a courier request for a package
  // the sender already has, not an errand where the driver buys anything.
  // Genuinely its own serviceType (not Pabili with different copy) because
  // Pabili's pabiliItems/bought-checklist machinery (PabiliItemsInput, the
  // 🛒 receipt line, DriverPage's per-item "mark as bought" list) all assume
  // a shopping list, which a package being carried is not — see
  // Ride.packageNote.
  const isPadala = serviceType === 'padala'
  // The Food tile (see chooseErrand) sets foodHinted and otherwise falls
  // back to plain freeform Pabili — but with a partner vendor's own priced
  // menu available (see VendorMenuBooking), that fallback only applies
  // while vendorsEnabled is off. Same self-contained-flow shape as Buy
  // Medicine below: none of the shared Ride/Pabili JSX renders for it either.
  const showVendorMenu = isPabili && foodHinted && vendorsEnabled
  // The Book a Ride / Food Order / PaDeliver strip is drawn in the blue
  // header (see NavBar), where it is always on screen — this page just says
  // which one is open. Not for Buy Medicine (self-contained, nothing here
  // to switch away from) and not on the Rewards/Emergency tabs.
  useHeaderTabs(
    pageTab === 'book' && !isBuyMedicine
      ? {
          active:
            familyHome || familyGroup || (forFamily && !showVendorMenu && !isPadala)
              ? 'family'
              : showVendorMenu
                ? catalogKind === 'goods'
                  ? 'padeliver'
                  : 'food'
                : isPadala
                  ? 'padeliver'
                  : 'toda',
        }
      : null,
  )
  // Buy Medicine has its own self-contained flow (MedsBooking) with a
  // completely different shape (cart, pharmacy confirmation) — none of the
  // shared Ride/Pabili JSX below (address forms, fare breakdown, submit
  // button) ever renders for it, so isErrand only needs to track Pabili and
  // Padala — the two services that reuse this shared form.
  const isErrand = isPabili || isPadala
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
    // Starts collapsed again every time an end opens (or closes) rather than
    // remembering it was left open — the fast paths above it (search, chips,
    // map tap) are the ones worth landing on first. The Address form chip
    // sets this back to `target` itself right after, when that is how the
    // end got opened in the first place (see quickPlaceChips).
    setAddressFormOpen(null)
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

  function chooseErrand(next: ServiceType, opts?: { food?: boolean; catalog?: 'food' | 'goods' }) {
    setPageTab('book')
    setServiceType(next)
    setFoodHinted(!!opts?.food)
    setCatalogKind(opts?.catalog ?? 'food')
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

  // "Pickup"/"Destination" for a ride; "Buy near to"/"Deliver to" for
  // Pabili (the driver buys at that point); "Pick up to"/"Deliver to" for
  // Padala (nothing bought, just carried) — same map picker, same
  // underlying pickup/dropoff state, just different words for what each pin
  // means.
  // FROM, not Pickup. The box answers where the trip starts, and on a
  // recorded ride the app fills it in itself with the same word, so the two
  // paths read alike.
  const pickupLabel = isPadala ? 'Pick up to' : isPabili ? 'Buy near to' : 'PICKUP'
  const dropoffLabel = isErrand ? 'Deliver to' : 'Destination'
  // The single question the rest of the form asks: is there a destination yet?
  const hasDestination = isErrand || dropoffChosen
  // The travel/fare row means something only once there is a real trip to
  // price: a pickup the passenger chose and a destination (an errand's
  // destination is the pickup itself).
  const etaFareReady = pickupChosen && hasDestination

  // The same Fare/Arrives/Distance/Time/Trip row the trip screens use, shown
  // even before anything is chosen (as dashes) so the row never appears and
  // disappears as the passenger works through the form. Figures only once
  // both pins are set — before that the fare would be priced on the hidden
  // default pins. Arrives and Time stay dashes: there is no driver yet, so any
  // arrival figure here would be invented.
  const bookingDetailsBar = (() => {
    // Pickup → dropoff prefers the real road route, falling back to the
    // standard per-leg figure when routing is unavailable.
    const travelSeconds = plannedRoute?.durationSeconds || ETA_SECONDS_PER_LEG
    const km = etaFareReady && plannedRoute ? formatKm(plannedRoute.distanceMeters) : '—'
    return (
      <TripDetailsBar
        fare={etaFareReady ? `₱${totalFare}` : '—'}
        arrives="—"
        distance={km}
        time="—"
        trip={etaFareReady ? `${km} · ~${Math.max(1, Math.round(travelSeconds / 60))} min` : '—'}
      />
    )
  })()

  // Set through the address form: that end counts as set in the two-ended box.
  async function handlePickupResolve(address: PhAddressTags) {
    setPickupChosen(true)
    setBoxSet((s) => ({ ...s, pickup: true }))
    const location = await resolvePhAddress(address)
    setCustomLocations((prev) => [...prev, location])
    handlePickupChange(location.id)
  }

  async function handleDropoffResolve(address: PhAddressTags) {
    setDropoffChosen(true)
    setBoxSet((s) => ({ ...s, dropoff: true }))
    const location = await resolvePhAddress(address)
    setCustomLocations((prev) => [...prev, location])
    setDropoffId(location.id)
  }

  // A landmark already carries a real coordinate (see mock/data.ts), so
  // there is no geocoding round trip here — straight into the same pin
  // handler a map tap uses, just without a reverse-geocoded guess to reseed
  // the address form with. Works the same for a seeded Landmark or a live
  // OpenStreetMap fallback result — see DestinationSearch's SelectedPlace.
  // The shape of a street picked from the search, per end — see
  // LocationMapPicker's pickedStreetLines.
  const [pickedStreetLines, setPickedStreetLines] = useState<{
    pickup?: { gps: GeoCoords; line: GeoCoords[][] } | null
    dropoff?: { gps: GeoCoords; line: GeoCoords[][] } | null
  }>({})
  // Moves the map to an end just set from the search (see focusSignal).
  const [mapFocus, setMapFocus] = useState<{ end: 'pickup' | 'dropoff'; key: number } | null>(null)
  function handlePickupLandmark(place: SelectedPlace) {
    setPickedStreetLines((s) => ({ ...s, pickup: place.line ? { gps: place.gps, line: place.line } : null }))
    setMapFocus({ end: 'pickup', key: Date.now() })
    handlePinPickup(createCustomLocation(place.name, place.gps), null)
    setOpenEnd(null)
    setAddressFormOpen(null)
  }

  function handleDropoffLandmark(place: SelectedPlace) {
    setPickedStreetLines((s) => ({ ...s, dropoff: place.line ? { gps: place.gps, line: place.line } : null }))
    setMapFocus({ end: 'dropoff', key: Date.now() })
    handlePinDropoff(createCustomLocation(place.name, place.gps), null)
    setOpenEnd(null)
    setAddressFormOpen(null)
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
  // The direct driver on the current job, once one is assigned — from the
  // moment a request is accepted (driver_arriving), not only once the trip
  // is under way, so "running a little late" or "which gate" can be said
  // before boarding too. Nobody to reach before that: a bare request has no
  // driver yet.
  const footerContact = (() => {
    if (activeRide?.status !== 'driver_arriving' && activeRide?.status !== 'ongoing') return null
    const driver = activeRide.driverId ? drivers.find((d) => d.id === activeRide.driverId) : null
    return driver?.phone ? { name: driver.name, phone: driver.phone } : null
  })()
  // A trip that has already started. The booking block — the two address
  // strips, the fare and Book a tricycle — is asking a question that has been
  // answered: the passenger is in the tricycle. Leaving it on the sheet puts
  // a live "Book a tricycle" button over a live trip, and buries the map they
  // are actually watching under a form.
  const tripUnderway = activeRide?.status === 'ongoing'
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
  // Group Ride is always booked by you, from where you stand (its pickup is
  // your GPS), so a Someone left selected before opening it would leave that
  // page showing Their name / mobile and a red Set PICKUP strip it has no use
  // for (2026-09-22). Opening Group Ride, by tab or by address, clears it.
  useEffect(() => {
    if (groupRideOpen && forOther) guestRider.setBookingFor('self')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupRideOpen, guestRider.bookingFor])
  // Seeding the booker's own row belongs to the screen, not to the button
  // that used to open it. Now that Group Ride has an address it can be
  // arrived at without pressing anything — a refresh, the back button, a
  // link someone was sent — and every one of those landed on a group
  // booking with nobody in it, including the person doing the booking.
  // Family → Several stops has no booker row (the owner is not riding) and
  // keeps only family rows; plain Group Ride keeps only its own.
  useEffect(() => {
    if (!groupRideOpen) return
    if (familyGroup) {
      setGroupRiders((prev) => prev.filter((r) => !!r.familyMemberId))
      return
    }
    setGroupRiders((prev) =>
      prev.some((r) => !r.isGuest) && !prev.some((r) => r.familyMemberId)
        ? prev
        : [{ key: 'booker', passengerId: passenger.id, name: passenger.name, phone: passenger.phone, isGuest: false, destination: null }],
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupRideOpen, familyGroup])
  // Each family rider's saved schools, for the panel's one-tap chips.
  const familyPlacesByRider: Record<string, { id: string; name: string }[]> = Object.fromEntries(
    groupRiders
      .filter((r) => r.familyMemberId)
      .map((r) => [
        r.key,
        ((passenger.familyMembers ?? []).find((m) => m.id === r.familyMemberId)?.schools ?? []).map((pl) => ({
          id: pl.id,
          name: pl.name,
        })),
      ]),
  )
  function pickRiderPlace(riderKey: string, placeId: string) {
    const rider = groupRiders.find((r) => r.key === riderKey)
    const place = (passenger.familyMembers ?? [])
      .find((m) => m.id === rider?.familyMemberId)
      ?.schools?.find((pl) => pl.id === placeId)
    if (!place) return
    setGroupRiders((prev) => prev.map((r) => (r.key === riderKey ? { ...r, destination: place.location } : r)))
    setPickingForGroupRiderKey(null)
  }
  // A stop set for a member is remembered as one of their places, so the next
  // school run is a tap. Saved under its own short name; the same place twice
  // is not saved twice.
  function rememberRiderPlace(riderKey: string, location: MockLocation) {
    const rider = groupRiders.find((r) => r.key === riderKey)
    const member = (passenger.familyMembers ?? []).find((m) => m.id === rider?.familyMemberId)
    if (!member) return
    const name = formatAddressLine(location.label).split(',')[0].trim()
    if ((member.schools ?? []).some((pl) => pl.name === name)) return
    saveFamilyMember(passenger.id, {
      ...member,
      schools: [...(member.schools ?? []), { id: `place-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, name, location }],
    })
  }
  const familyChoices = familyGroup
    ? (passenger.familyMembers ?? [])
        .filter((m) => !groupRiders.some((r) => r.familyMemberId === m.id))
        .map((m) => ({ id: m.id, name: m.name }))
    : undefined
  function addFamilyRider(memberId: string) {
    const m = (passenger.familyMembers ?? []).find((x) => x.id === memberId)
    if (!m || groupRiders.length >= 4) return
    setGroupRiders((prev) => [
      ...prev,
      {
        key: `fam-${m.id}`,
        passengerId: m.passengerId ?? makeGuestPassengerId(),
        name: m.name,
        phone: m.phone,
        isGuest: true,
        destination: null,
        familyMemberId: m.id,
      },
    ])
  }
  function addGroupRider() {
    if (familyGroup) {
      if (familyChoices?.[0]) addFamilyRider(familyChoices[0].id)
      return
    }
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
    r.destination
      ? estimateFare(pickRun ? r.destination : pickup, pickRun ? dropoff : r.destination, tariffSettings, {
          isStudent: false,
          isPwdSenior: false,
          passengerCount: 1,
        })
      : null,
  )
  // Every rider's own destination, on this same map at once — not just
  // whichever one is currently being pinned. Orange, same as the co-
  // passenger dots an active shared ride already shows each rider on their
  // own screen (see TripMonitor) — this is that same idea one step earlier,
  // before the ride even exists yet.
  // The drop-off order: from the pickup, the nearest destination first, then
  // the nearest to that — see dropOffOrder. The numbers on the map flags and
  // on the rider cards are this order, and the riders are booked in it, so
  // 1, 2, 3 is the route the tricycle actually takes.
  const groupStopOrder = dropOffOrder(
    pickupGps ?? pickup.gps ?? null,
    groupRiders.filter((r) => r.destination?.gps).map((r) => ({ key: r.key, gps: r.destination!.gps! })),
  )
  const groupStopNumbers: Record<string, number> = Object.fromEntries(groupStopOrder.map((key, i) => [key, i + 1]))
  // The whole Group Ride on real roads: the pickup, then every stop in
  // drop-off order — drawn on the map as the blue route line.
  const groupRoute = useRouteThrough(
    groupRideOpen
      ? [
          ...(!pickRun && (pickupGps ?? pickup.gps) ? [(pickupGps ?? pickup.gps)!] : []),
          ...groupStopOrder.map((key) => groupRiders.find((r) => r.key === key)!.destination!.gps!),
          // A pick-up run ends where everyone is going.
          ...(pickRun && hasDestination && dropoff.gps ? [dropoff.gps] : []),
        ]
      : [],
  )
  // What to call a rider on the pin and on their flag: their first name, or
  // "Rider N" (their place in the list) when no name was typed — never cut
  // down to a bare "Rider".
  function groupRiderShortName(key: string): string {
    const i = groupRiders.findIndex((x) => x.key === key)
    const name = groupRiders[i]?.name.trim()
    return name ? name.split(' ')[0] : `Rider ${i + 1}`
  }
  const groupMapPoints: MapPoint[] = groupRiders
    .filter((r) => r.destination?.gps)
    .map((r) => ({
      id: `group-${r.key}`,
      gps: r.destination!.gps!,
      color: '#f97316',
      icon: (pickRun ? 'pickup' : 'dropoff') as 'pickup' | 'dropoff',
      // The stop number, whose it is, and where — the flag is the one place
      // the rider's address is shown now.
      // Just who it is (2026-09-23) — the address is in the panel, and a flag
      // carrying all three ran off the edge of the map.
      label: `${groupStopNumbers[r.key]} · 🏫 ${groupRiderShortName(r.key)}`,
      callout: true,
      alwaysLabel: true,
    }))
  const groupAllDestinationsSet = groupRiders.length > 0 && groupRiders.every((r) => !!r.destination)
  // Once the last rider's stop is set, the sheet comes back up so the fares
  // and the payment choice are in view before requesting.
  const hadAllStopsRef = useRef(groupAllDestinationsSet)
  useEffect(() => {
    if (groupAllDestinationsSet && !hadAllStopsRef.current) {
      setGroupSettingStops(false)
      setGroupSheetLevel(1)
    }
    hadAllStopsRef.current = groupAllDestinationsSet
  }, [groupAllDestinationsSet])
  // The rider the centre pin is setting a stop for, and what to call them:
  // their name, 'You' is their own name, and an unnamed rider is their number.
  const groupPinRider = (() => {
    const i = pickingForGroupRiderKey
      ? groupRiders.findIndex((r) => r.key === pickingForGroupRiderKey)
      : groupRiders.findIndex((r) => !r.destination)
    if (i < 0) return null
    const r = groupRiders[i]
    return { key: r.key, label: i === 0 && !r.isGuest && !r.name.trim() ? 'You' : groupRiderShortName(r.key) }
  })()
  const groupTotalFare = groupAllDestinationsSet ? groupFares.reduce((sum: number, f) => sum + (f ?? 0), 0) : null
  const groupCanSubmit =
    // Names are not required: a rider left unnamed goes on the booking as
    // their number ("Rider 3"), the same way the map pin called them.
    groupRiders.length >= 2 && groupAllDestinationsSet && (!pickRun || hasDestination) && !activeRide && !groupSubmitting
  function submitGroupRide() {
    if (!groupCanSubmit) return
    setGroupSubmitting(true)
    requestGroupRide({
      bookedByPassengerId: passenger.id,
      pickup,
      pickupGps,
      paymentMethod,
      paySplit: familyGroup ? 'separate' : groupPaySplit,
      familyBookerId: familyGroup ? passenger.id : null,
      requestedDriverId: familyGroup ? familyTrustedPick : null,
      riders: [...groupRiders].sort((a, b) => (groupStopNumbers[a.key] ?? 99) - (groupStopNumbers[b.key] ?? 99)).map((r) => ({
        passengerId: r.passengerId,
        passengerName: r.name.trim() || `Rider ${groupRiders.findIndex((x) => x.key === r.key) + 1}`,
        passengerPhone: r.isGuest ? r.phone.trim() || null : null,
        // Pick-up run: the member's own point is where they are collected,
        // and everyone is taken to the one destination.
        dropoff: pickRun ? dropoff : r.destination!,
        pickup: pickRun ? r.destination! : null,
        isStudentRide: false,
        isPwdSeniorRide: false,
      })),
    })
    // Back to Family home, where Family trips follows every stop.
    if (familyGroup) navigate('/book/family')
    else setGroupRideOpen(false)
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
    // A ride the family owner pays (familyPayerId) is theirs to settle, not
    // the rider's — see FamilyTrips.
    (r) => r.status === 'completed' && !r.paymentAcknowledged && !r.safetyRecord && (!r.familyPayerId || r.familyPayerId === passenger.id),
  )
  const [showPayment, setShowPayment] = useState(false)
  // Coming back from Maya.
  //
  // The redirect only says which ride was being paid for; whether it was
  // actually paid is asked of the server, which asks Maya with the secret key.
  // Trusting the URL would let anybody close a fare by typing ?paid=<ride-id>
  // into the address bar.
  //
  // The query string is cleared either way, so a reload or a back-button does
  // not re-run this — and so a failed payment does not leave the passenger
  // staring at a URL that says "paid".
  const [payReturn, setPayReturn] = useState<string | null>(null)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const paidRideId = params.get('paid')
    const failed = params.get('payfailed') ?? params.get('paycancelled')
    if (!paidRideId && !failed) return
    window.history.replaceState({}, '', window.location.pathname)
    if (!paidRideId) {
      setPayReturn('That payment did not go through. You can try again, or pay your driver in cash.')
      return
    }
    setPayReturn('Checking your payment…')
    void checkMayaPayment(paidRideId).then((result) => {
      if (result.ok && result.data?.paid) {
        acknowledgeRidePayment(paidRideId, 'maya', result.data.reference)
        setShowPayment(false)
        setPayReturn(`Paid. Reference ${result.data.reference ?? '—'}.`)
        return
      }
      setPayReturn(
        'We could not confirm that payment yet. If it left your wallet it will settle shortly — otherwise pay your driver in cash.',
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
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

  // Only a ride offers Myself / Someone. An errand (Book a Delivery) shows no
  // such choice, so a Someone left selected on Book a Ride must not turn it
  // into a delivery 'for them' (2026-09-22).
  const isGuestBooking = forOther && !isErrand
  // Said when Book is pressed with nothing behind the pickup — a phone that
  // refused location, or one still waiting on the auto-locate fix to land.
  // canSubmit does not gate on this: booking for yourself with no pickup
  // coordinate at all would send a driver nowhere, and a disabled button
  // with no explanation reads as the app being broken rather than as
  // location being off. This says which it is and what fixes it, instead.
  const [pickupMissingNotice, setPickupMissingNotice] = useState(false)
  useEffect(() => {
    if (pickup.gps || isGuestBooking) setPickupMissingNotice(false)
  }, [pickup.gps, isGuestBooking])
  // Two entries can carry different ids and still be the same spot — a city
  // quick-pick and a saved place resolving to one market, say. Comparing ids
  // alone let that through and booked a ride from a place to itself.
  const endsAreSameSpot =
    pickupId === dropoffId ||
    (!!pickup.gps && !!dropoff.gps && haversineDistanceMeters(pickup.gps, dropoff.gps) < 40)

  // Where the one two-ended box is used: Book a Delivery, and Book a Ride for
  // Someone (2026-09-22) — the two bookings where both ends are picked by hand.
  const dualEndBox = isPadala || (!isErrand && !groupRideOpen && forOther)
  // Which ends were set in this box. A pickup that is merely filled in —
  // this phone's own GPS from Myself, or a default — is not an answer for
  // someone else's ride or a delivery, so the box asks for it anyway.
  // Cleared whenever the box starts over (a different booking mode).
  const [boxSet, setBoxSet] = useState<{ pickup: boolean; dropoff: boolean }>({ pickup: false, dropoff: false })
  const dualModeKey = `${isPadala ? 'padala' : 'ride'}:${guestRider.bookingFor}:${groupRideOpen}`
  useEffect(() => {
    setBoxSet({ pickup: false, dropoff: false })
    if (dualEndBox) setMapTarget('pickup')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dualModeKey])
  // With the two-ended box, both ends must be set in it before booking —
  // Book a Delivery used to let "Request Delivery" go with no pickup and the
  // default delivery point (2026-09-22). Which one is still missing is also
  // what the button says.
  // Booking for Someone needs their name and a PH mobile (09XXXXXXXXX, spaced,
  // dashed or +63 are fine) — the driver has to be able to reach them
  // (2026-09-22).
  const guestPhoneDigits = guestRider.otherPhone.replace(/\D/g, '')
  const guestPhoneOk = /^09\d{9}$/.test(guestPhoneDigits.startsWith('63') ? `0${guestPhoneDigits.slice(2)}` : guestPhoneDigits)
  // Family (2026-09-23): a child often has no phone of their own — the
  // driver calls the parent who booked (see DriverPage), so the member's
  // mobile is optional there; one typed in still has to be a real number.
  // Someone (2026-09-24): an age is asked for, and a minor's own mobile is
  // not required — the driver is given the number of the adult booking the
  // ride instead, the same rule Family already follows.
  const guestAgeNum = Number(guestRider.otherAge)
  const guestAgeGiven = Number.isFinite(guestAgeNum) && guestAgeNum > 0
  const guestIsMinor = guestAgeGiven && guestAgeNum < MINOR_AGE
  const guestPhoneFine = guestPhoneOk || ((forFamily || guestIsMinor) && guestPhoneDigits.length === 0)
  const dualMissing: 'pickup' | 'dropoff' | null = dualEndBox ? (!boxSet.pickup ? 'pickup' : !boxSet.dropoff ? 'dropoff' : null) : null
  const canSubmit =
    hasDestination &&
    !endsAreSameSpot &&
    !dualMissing &&
    (!isGuestBooking || (guestRider.otherName.trim().length > 0 && (forFamily || guestAgeGiven) && guestPhoneFine)) &&
    // A child cannot book during their family's curfew hours.
    !inCurfew

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

  // Book a tricycle books a tricycle.
  //
  // There used to be a stop here: when the nearest free driver was far away
  // this opened a dialog saying how far and how long, and the booking waited
  // on "Ituloy ang booking". The intent was sound — a kilometre on a tricycle
  // is several minutes of standing on a road wondering whether the app heard
  // you — but the cost was a second tap on the one button that is the whole
  // point of the screen, in the one case where the passenger is already
  // waiting longer than they would like. The distance is still shown beneath
  // the button; it is information now rather than a gate.
  function handleRequest() {
    if (!canSubmit) return
    // Nothing to send a driver to. This is booking-for-yourself only — a
    // guest booking's pickup was never meant to auto-fill from this phone
    // (see the auto-locate effect), so an empty pickup there just means the
    // pin has not been set yet, which the pickup row itself already says.
    if (!isGuestBooking && !pickup.gps) {
      setPickupMissingNotice(true)
      return
    }
    requestRide({
      passengerId: isGuestBooking ? makeGuestPassengerId() : passenger.id,
      passengerName: isGuestBooking ? guestRider.otherName.trim() : passenger.name,
      // A minor with no number of their own rides on the booker's: that is
      // the number the driver is shown (see DriverPage's contacts).
      passengerPhone: isGuestBooking
        ? guestRider.otherPhone.trim() || (guestIsMinor ? passenger.phone : null)
        : null,
      bookedByPassengerId: isGuestBooking ? passenger.id : null,
      riderAge: isGuestBooking && guestAgeGiven ? guestAgeNum : null,
      bookerIsContact: isGuestBooking && guestIsMinor && !guestRider.otherPhone.trim(),
      familyBookerId: forFamily && !isErrand ? passenger.id : null,
      pickup: isErrand && storeName.trim() ? { ...pickup, label: storeName.trim() } : pickup,
      dropoff,
      paymentMethod,
      isStudentRide: isGuestBooking ? false : passenger.isStudent,
      isPwdSeniorRide: isGuestBooking ? false : passenger.isPwdSenior,
      pickupGps,
      passengerCount,
      serviceType,
      pabiliItems: null,
      packageNote: isPadala ? packageNote.trim() || null : null,
      tip: isErrand ? tip : 0,
      specialPickupRequested: specialPickupRequested && pickupGps !== null,
      specialTrip,
      // A child whose family allows only trusted drivers: theirs goes first,
      // and the ride waits for the parent when "Ask me first" is on.
      requestedDriverId: familyTrustedPick ?? myFamilyTrustedId ?? requestedDriverId,
      awaitingFamilyApproval: !!myLimits?.askFirst,
      bookedAtTerminal: boardedAtTerminal,
    })
    // A family member booked for is kept on the booker's list for next time.
    // Only a new one: saving over a member already listed would wipe their
    // invite code and who pays their rides.
    if (forFamily && !isErrand && guestRider.otherName.trim()) {
      const phoneDigits = guestRider.otherPhone.replace(/\D/g, '')
      const known = (passenger.familyMembers ?? []).some(
        (m) => (phoneDigits.length > 0 && m.phone.replace(/\D/g, '') === phoneDigits) || m.name === guestRider.otherName.trim(),
      )
      if (!known) {
        saveFamilyMember(passenger.id, {
          id: `fam-${Date.now()}`,
          name: guestRider.otherName.trim(),
          phone: guestRider.otherPhone.trim(),
        })
      }
    }
    // Back to Family home, where Family trips follows the ride.
    if (forFamily && !isErrand) navigate('/book/family')
    setRequestedDriverId(null)
    setSpecialTrip(false)
    setPassengerCount(1)
    setPackageNote('')
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
    // Saving Home / School / Work / a favourite: the pin is that place,
    // not this trip's destination.
    if (savingPlace) {
      savePassengerLocation(passenger.id, savingPlace.label, location, savingPlace.name)
      setSavingPlace(null)
      return
    }
    // A Group Ride rider's destination is being set on this same map —
    // route the tap into their row instead of the page's own dropoff, and
    // hand the map back to normal booking once it lands.
    // In Group mode with no rider picked, the map's Set destination fills
    // the next rider still without one — so the stops can be set one after
    // another straight from the map, in the order the riders were added.
    // Family Several stops: the shared end being set — the pickup of a
    // drop-off run goes to the page's pickup, the destination of a pick-up
    // run to its destination (below).
    if (familyGroup && settingCommon) {
      setSettingCommon(false)
      if (!pickRun) {
        handlePinPickup(location, guess)
        return
      }
    }
    const groupTarget =
      familyGroup && settingCommon
        ? null
        : pickingForGroupRiderKey ?? (groupRideOpen ? groupRiders.find((r) => !r.destination)?.key ?? null : null)
    if (groupTarget) {
      const key = groupTarget
      setGroupRiders((prev) => prev.map((r) => (r.key === key ? { ...r, destination: location } : r)))
      setPickingForGroupRiderKey(null)
      if (familyGroup) rememberRiderPlace(key, location)
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

  // A saved place tapped in the chips row: it fills the end being set — the
  // destination, or in a two-ended box whichever end is armed — and the box
  // moves on to the other end the same way the map's Set button does.
  function useSavedPlaceChip(location: MockLocation) {
    const end = dualEndBox ? mapTarget : 'dropoff'
    if (end === 'pickup') handlePickupQuickPick(location)
    else handleDropoffQuickPick(location)
    if (dualEndBox) {
      const next = { ...boxSet, [end]: true }
      setBoxSet(next)
      if (end === 'pickup') setMapTarget('dropoff')
      else if (!next.pickup) setMapTarget('pickup')
    }
  }
  // Starts setting a place on the map: the centre pin carries its name and
  // the Set button saves it (see handlePinDropoff).
  function startSavingPlace(label: SavedLocationLabel, name?: string) {
    setSavingPlace({ label, name })
    setMapTarget('dropoff')
    setPlacesManage(false)
    setNewPlaceName(null)
    requestAnimationFrame(() => showInMiddle(bookingMapRef.current))
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
  //
  // Also stands down while booking for someone else — this phone's position
  // is not their pickup, and filling it in with the wrong person's location
  // would be a worse start than leaving the field empty for them to set by
  // hand. Not marked as done in that case, so switching back to booking for
  // yourself still gets the one automatic try.
  const autoLocatedRef = useRef(false)
  useEffect(() => {
    if (autoLocatedRef.current) return
    if (pickupChosen || isErrand || activeRide || forOther) return
    autoLocatedRef.current = true
    void handleUseMyGps('pickup')
  }, [pickupChosen, isErrand, activeRide, guestRider.bookingFor])

  // Admin-configurable — see AdminPage's "Trip history retention" setting.
  // Older rides aren't lost, they just drop out of this list (earnings
  // totals, ratings, and admin reports all still see the full history).
  // "Clear history" hides finished trips booked before it was pressed, the
  // same way: gone from this list only. A trip still under way always shows.
  const visibleTripHistory = myRides.filter(
    (r) =>
      isWithinRetentionDays(r.requestedAt, tripHistoryRetentionDays) &&
      !(
        (r.status === 'completed' || r.status === 'cancelled' || r.status === 'declined') &&
        isClearedFromHistory(r.requestedAt, passenger.tripHistoryClearedAt)
      ),
  )

  // The one pickup/destination map this page has, built once here so it can
  // be slotted into wherever it is currently needed — its normal spot inside
  // the booking form, or (see TerminalBoardingPanel's mapSlot prop) right
  // under the Terminal panel's own header instead, without ever mounting a
  // second map instance. The booking button and passenger stepper ride along
  // with it there too, so they are swapped out while Terminal is open: that
  // flow submits through its own "Record my Trip" button and is always a
  // single rider, neither of which apply here.
  // The booking form used to float as a draggable sheet over a full-bleed
  // map — moved back to a normal in-flow section above the map instead
  // (same stacked layout Group Ride already used): the sheet covered the
  // page header's own icons/controls, and re-fit the map to a fresh zoom
  // every time the sheet's height changed underneath it.
  const mapFirstBooking = false

  // With the FROM/Destination tabs gone from the booking screen, a tap on the
  // map has to mean the destination — it is the only pin the screen asks for.
  // Left at its default the tap would move the pickup, which is not shown
  // there and has no control to switch back from.
  useEffect(() => {
    if (mapFirstBooking) setMapTarget('dropoff')
  }, [mapFirstBooking])

  // The optional half of a booking, folded away.
  //
  // A special trip and a favourite driver are real choices and almost nobody
  // makes either: they were two full-width blocks of the form standing between
  // the two questions that matter and the button that sends them. One line
  // that says what is behind it costs nothing to scroll past and is still
  // there for the passenger who wants it.
  const moreOptions = (
    <details className="group rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold text-slate-600 marker:hidden">
        <span aria-hidden className="text-[10px] text-slate-400 transition group-open:rotate-90">
          ▶
        </span>
        ⚙️ More options
        <span className="font-normal text-slate-400">— special trip, special pickup, favourite driver</span>
      </summary>
      <div className="mt-1.5 space-y-1.5">
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
          {!isErrand && (
            <>
              {/* The button that used to sit here is now the first entry
                  in the From barangay list on the card above, so this only
                  has to report a failure — silently swallowing one would
                  leave the special-pickup checkbox below unexplainably
                  absent, since that appears only once GPS succeeds. */}
              {gpsStatus === 'locating' && <p className="mt-1 text-[11px] text-slate-400">📍 Locating…</p>}
              {/* The Live-location row above already reports a refused
                  permission, with a How-to-fix beside it. */}
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
      </div>
    </details>
  )

  // How many are riding. On the Where to row, beside the destination it
  // goes with — it used to sit under Book a tricycle, a row away from the
  // question it answers.
  const passengerCounter = (
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

  // The city, above the barangay list it filters.
  //
  // It used to sit at the top of the card, above both address rows, where it
  // was a setting rather than a step — and it filters the barangay dropdown,
  // which is two taps further down inside whichever end you opened. Answering
  // "which city" before being asked "which barangay" is the order the form
  // actually works in, so that is where it now lives.
  // One per end rather than one shared element: the destination's copy now
  // sits above the Where to bar permanently (not only while that panel is
  // open), so it can be on screen at the same time as the pickup panel's
  // own copy — each needs its own id and its own end's colour.
  const cityRowFor = (end: 'pickup' | 'dropoff') => (
    <div className="flex items-center gap-2">
      <label
        htmlFor={`home-city-${end}`}
        className={`shrink-0 text-xs font-semibold uppercase tracking-wide ${
          end === 'dropoff' ? 'text-dest-accent' : 'text-pickup-accent'
        }`}
      >
        City
      </label>
      <select
        id={`home-city-${end}`}
        value={cityScope}
        onChange={(e) => handleHomeCityChange(e.target.value)}
        className="compact-input min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
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

  // A ride being booked asks Where to in the map's own top row rather than in
  // the card above it — Group Ride too, where a place picked there fills the
  // next rider still without a stop (see handlePinDropoff). Not on an errand
  // (its form is different), not once a ride is booked.
  // Book a Delivery (PaDeliver) is booked exactly like Book a Ride for
  // someone else (2026-09-22): Where to on the map too, and the pickup strip.
  const whereToOnMap = (!isErrand || isPadala) && !activeRide

  // The Where to strip — tap it and it becomes the search, the way Grab and
  // Google Maps do. A function so the same strip can be drawn in the address
  // card or, while the map is full screen, at the top of the map.
  // Book a Delivery's one search box on the map, for both ends (2026-09-22):
  // "Where to pickup?" in faded red while the pickup is the end being set,
  // "Where to go?" in faded green for the destination. Setting one end turns
  // it to the other; the ⇄ switches by hand. It follows mapTarget, the same
  // armed end the centre pin and its Set buttons use.
  const padalaEnd: 'pickup' | 'dropoff' = mapTarget
  // A place picked in the box is not set straight away: the map goes to it
  // and that end's Set button lights up; tapping the button sets it (see
  // LocationMapPicker's flyTo / onEndSet).
  const [padalaPreview, setPadalaPreview] = useState<{
    gps: GeoCoords
    name: string
    line?: GeoCoords[][] | null
    end: 'pickup' | 'dropoff'
    key: number
  } | null>(null)
  const padalaStrip = () => {
    const isPickupEnd = padalaEnd === 'pickup'
    return (
      <div
        className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 py-1.5 shadow-sm ${
          isPickupEnd ? 'border-red-500/40 bg-red-500/15' : 'border-green-500/40 bg-green-500/15'
        }`}
      >
        <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${isPickupEnd ? 'bg-red-600' : 'bg-dest-dot'}`} />
        <DestinationSearch
          key={padalaEnd}
          city={cityScope}
          near={pickupGps ?? pickup.gps ?? null}
          onSelect={(place) =>
            setPadalaPreview({
              gps: place.gps,
              name: place.name,
              // A saved street (Romano, Rizal…) has its shape in streetPaths
              // rather than on the search result.
              line: place.line ?? streetLinesFor(createCustomLocation(place.name, place.gps), landmarks),
              end: padalaEnd,
              key: Date.now(),
            })
          }
          onOpenAddressForm={() => openAddressForm(padalaEnd)}
          onPinOnMap={() => undefined}
          // Only ever the question, never the chosen address (2026-09-22) —
          // the address is on the map's pin. Nothing set yet: 'Where to?';
          // then 'Pickup?' or 'Where to Deliver?' for whichever end is next.
          placeholder={
            !boxSet.pickup && !boxSet.dropoff
              ? 'Where to?'
              : isPickupEnd
                ? 'Pickup? - type landmark, street, brgy.'
                : isPadala
                  ? 'Delivery? - type landmark, street, brgy.'
                  : 'Destination? - type landmark, street, brgy.'
          }
          className="min-w-0 flex-1"
          resultsClassName="absolute inset-x-0 top-full z-[80] mt-1 max-h-72 overflow-y-auto"
          inputClassName={`map-toolbar-input w-full min-w-0 bg-transparent text-sm font-semibold focus:outline-none ${
            isPickupEnd ? 'text-red-900' : 'text-green-900'
          } ${
            isPickupEnd ? 'placeholder:font-normal placeholder:text-red-800/70' : 'placeholder:font-normal placeholder:text-green-800/70'
          }`}
        />
        <button
          type="button"
          onClick={() => {
            setPadalaPreview(null)
            setMapTarget(isPickupEnd ? 'dropoff' : 'pickup')
          }}
          aria-label={isPickupEnd ? 'Switch to the destination' : 'Switch to the pickup'}
          title={isPickupEnd ? 'Switch to Where to go' : 'Switch to Where to pickup'}
          className="shrink-0 rounded-md px-1 text-sm font-bold text-slate-500 hover:bg-white/60"
        >
          ⇄
        </button>
      </div>
    )
  }
  const destinationStrip = (destinationOnly: boolean) =>
          dualEndBox ? padalaStrip() :
            openEnd === 'dropoff' ? (
              // Tapping Where to used to only expand a panel below with its
              // own separate search box a scroll away — typing directly into
              // the bar itself, the way Grab/Google Maps do, saves that step
              // and is where a passenger already expects to type.
              <div
                className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-green-500/40 bg-green-500/15 px-3 py-1.5 shadow-sm ${
                  destinationOnly ? '' : 'pr-14'
                }`}
              >
                <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-dest-dot" />
                <DestinationSearch
                  city={cityScope}
                  near={pickupGps ?? pickup.gps ?? null}
                  onSelect={handleDropoffLandmark}
                  onOpenAddressForm={() => openAddressForm('dropoff')}
                  onPinOnMap={() => {
                    setMapTarget('dropoff')
                    setOpenEnd(null)
                    setAddressFormOpen(null)
                  }}
                  autoFocus
                  placeholder={isErrand ? 'Where should it go?' : 'Where to?'}
                  className="min-w-0 flex-1"
                  // The matches float under the whole row rather than growing
                  // the bar: inline, six streets stretched the red and yellow
                  // boxes tall and narrow and every name was cut to "S…".
                  // Anchored to the row (relative above), so the list spans
                  // the bar and Set on Map together and names read in full.
                  resultsClassName="absolute inset-x-0 top-full z-[80] mt-1 max-h-72 overflow-y-auto"
                  inputClassName="w-full min-w-0 bg-transparent text-sm font-semibold text-green-900 placeholder:font-normal placeholder:text-green-800/70 focus:outline-none"
                />
              </div>
            ) : (
            <button
              type="button"
              onClick={() => openAddressPicker('dropoff')}
              className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-green-500/40 bg-green-500/15 px-3 py-1.5 text-left shadow-sm filter transition hover:brightness-95 ${
                // pr-14 clears the swap control, which only exists when both
                // ends are shown.
                destinationOnly ? '' : 'pr-14'
              }`}
            >
              {/* dest-fill is pale under dark teal text in the default theme,
                  so the filled teal Pickup above is the one block carrying
                  weight; a bold theme can instead make this a solid fill with
                  white text — same four roles (fill/text/subtext/dot), theme
                  decides which way they lean. See theme.css. */}
              <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-600" />
              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate text-sm ${
                    hasDestination ? 'font-semibold text-green-900' : 'font-normal text-green-800/70'
                  }`}
                >
                  {/* The question the empty row asks stays on it once it is
                      answered, as the answer's label. Without it the two
                      filled rows are two addresses in two colours, and which
                      one the tricycle is being sent to is left to the colour
                      alone. */}
                  {hasDestination ? (
                    <>
                      <span className="font-normal text-green-800/80">
                        {isPabili ? 'Deliver to: ' : 'Where to: '}
                      </span>
                      {formatAddressLine(dropoff.label)}
                    </>
                  ) : isErrand ? (
                    'Where should it go?'
                  ) : (
                    'Where to?'
                  )}
                </span>
              </span>
            </button>
            )

  // The destination's address form (Fill Address Form under a Where to search
  // with no match). One copy at a time, since it holds what has been typed:
  // under the Where to strip at the top of the map in full screen, in the
  // card above the map otherwise.
  const dropoffFormOpen = openEnd === 'dropoff' && addressFormOpen === 'dropoff'
  const dropoffAddressForm = (
          <BarangayAddressPicker
            key={`to-${dropoffPickerSeed.key}`}
            label=""
            hideRegionSelects
            defaultProvince={dropoffPickerSeed.province || DEFAULT_BOOKING_PROVINCE}
            defaultCity={dropoffPickerSeed.city || cityScope || DEFAULT_BOOKING_CITY}
            defaultBarangay={dropoffPickerSeed.barangay}
            defaultAddressDetail={dropoffPickerSeed.addressDetail}
            onResolve={handleDropoffResolve}
            onConfirm={() => {
              setOpenEnd(null)
              setAddressFormOpen(null)
            }}
          />
  )
  // Saved places for one-tap booking (2026-09-22): Home, School and Work
  // always show — set ones fill the trip, unset ones are set on the map —
  // then any named favourites, and + Place for another. ✎ lets a place be
  // moved (set again on the map) or removed.
  const slotPlace = (label: SavedLocationLabel) => savedLocations.find((s) => s.label === label)
  const favouritePlaces = savedLocations.filter((s) => s.label === 'Favorite')
  const placeChip = 'flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition'
  const savedPlacesRow = (
    <div className="mt-1.5 space-y-1">
      {savingPlace ? (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/40 bg-green-500/10 px-2.5 py-1.5 text-[11px] text-green-900">
          <span className="flex-1 leading-snug">
            📍 Move the map to your{' '}
            <span className="font-bold">{savedPlaceName(savingPlace.label, savingPlace.name)}</span>, then tap{' '}
            <span className="font-bold">Save as {savedPlaceName(savingPlace.label, savingPlace.name)}</span>.
          </span>
          <button type="button" onClick={() => setSavingPlace(null)} className="shrink-0 font-bold text-slate-600 hover:underline">
            Cancel
          </button>
        </div>
      ) : (
        <div className="-mx-1 flex flex-nowrap gap-1 overflow-x-auto px-1 pb-0.5">
          {(['Home', 'School', 'Work'] as SavedLocationLabel[]).map((label) => {
            const s = slotPlace(label)
            const name = savedPlaceName(label)
            return (
              <span key={label} className="flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => (s && !placesManage ? useSavedPlaceChip(s.location) : startSavingPlace(label))}
                  title={s ? s.location.label : `Set your ${name} on the map`}
                  className={`${placeChip} ${
                    s
                      ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                      : 'border-dashed border-slate-300 bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {SAVED_LOCATION_ICONS[label]} {s ? name : `+ ${name}`}
                  {s && placesManage && <span className="text-[10px] font-medium text-slate-500">· move</span>}
                </button>
                {s && placesManage && (
                  <button
                    type="button"
                    aria-label={`Remove ${name}`}
                    onClick={() => removePassengerLocation(passenger.id, s.id)}
                    className="ml-0.5 text-xs font-bold text-red-600"
                  >
                    ✕
                  </button>
                )}
              </span>
            )
          })}
          {favouritePlaces.map((s) => (
            <span key={s.id} className="flex shrink-0 items-center">
              <button
                type="button"
                onClick={() => (placesManage ? startSavingPlace('Favorite', s.name) : useSavedPlaceChip(s.location))}
                title={s.location.label}
                className={`${placeChip} border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100`}
              >
                ⭐ {savedPlaceName('Favorite', s.name ?? s.location.label.split(',')[0])}
              </button>
              {placesManage && (
                <button
                  type="button"
                  aria-label="Remove this place"
                  onClick={() => removePassengerLocation(passenger.id, s.id)}
                  className="ml-0.5 text-xs font-bold text-red-600"
                >
                  ✕
                </button>
              )}
            </span>
          ))}
          <button
            type="button"
            onClick={() => setNewPlaceName((v) => (v === null ? '' : null))}
            className={`${placeChip} border-dashed border-slate-300 bg-white text-slate-500 hover:bg-slate-50`}
          >
            + Place
          </button>
          {savedLocations.length > 0 && (
            <button
              type="button"
              onClick={() => setPlacesManage((v) => !v)}
              aria-pressed={placesManage}
              aria-label="Edit saved places"
              className={`${placeChip} ${placesManage ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 bg-white text-slate-500'}`}
            >
              {placesManage ? 'Done' : '✎'}
            </button>
          )}
        </div>
      )}
      {newPlaceName !== null && !savingPlace && (
        <div className="flex gap-1.5">
          <input
            value={newPlaceName}
            onChange={(e) => setNewPlaceName(e.target.value)}
            placeholder="Name it — Lola's house, Church, Gym…"
            className="compact-input min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
          />
          <button
            type="button"
            disabled={!newPlaceName.trim()}
            onClick={() => startSavingPlace('Favorite', newPlaceName.trim())}
            className="shrink-0 rounded-lg bg-brand-600 px-2.5 py-1.5 text-[11px] font-bold text-white disabled:bg-slate-200 disabled:text-slate-400"
          >
            📍 Set on map
          </button>
        </div>
      )}
    </div>
  )
  // Family → Several stops (2026-09-23): the pickup and destination bar at
  // the top of the map, and which way the run goes. A drop-off run has one
  // pickup (tap to set) and a stop per member; a pick-up run has a pickup
  // per member and one destination (tap to set). The shared end is set with
  // the search box, a saved place, or the centre pin.
  const shortPlace = (l: string) => formatAddressLine(l).split(',')[0].trim()
  const familyStopsSet = groupRiders.filter((r) => r.destination).length
  const familyEndsBar = (
    <div className="min-w-0 flex-1 space-y-1">
      <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
        {(
          [
            ['drop', '🏠→🏫 Drop-offs'],
            ['pick', '🏫→🏠 Pick-ups'],
          ] as const
        ).map(([dir, label]) => (
          <button
            key={dir}
            type="button"
            onClick={() => {
              if (dir === familyDir) return
              setFamilyDir(dir)
              setSettingCommon(false)
              // Each member's point meant the other end before — start over.
              setGroupRiders((prev) => prev.map((r) => ({ ...r, destination: null })))
            }}
            className={`flex-1 rounded-md py-1 text-[11px] font-semibold transition ${
              familyDir === dir ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={() => {
            if (pickRun) {
              setSettingCommon(false)
              setGroupSettingStops(true)
            } else setSettingCommon((v) => !v)
          }}
          className={`min-w-0 rounded-lg border px-2 py-1.5 text-left text-[11px] transition ${
            !pickRun && settingCommon
              ? 'border-red-500 bg-red-50 ring-2 ring-red-300'
              : 'border-red-300/60 bg-red-50/70 hover:bg-red-50'
          }`}
        >
          <span className="block font-bold text-red-800">📍 Pickup</span>
          <span className="block truncate text-slate-700">
            {pickRun ? `Each member · ${familyStopsSet}/${groupRiders.length} set` : pickupChosen || pickupGps ? shortPlace(pickup.label) : 'Tap to set'}
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            if (pickRun) setSettingCommon((v) => !v)
            else {
              setSettingCommon(false)
              setGroupSettingStops(true)
            }
          }}
          className={`min-w-0 rounded-lg border px-2 py-1.5 text-left text-[11px] transition ${
            pickRun && settingCommon
              ? 'border-green-600 bg-green-50 ring-2 ring-green-300'
              : 'border-green-500/40 bg-green-500/10 hover:bg-green-500/20'
          }`}
        >
          <span className="block font-bold text-green-900">🏁 Destination</span>
          <span className="block truncate text-slate-700">
            {pickRun ? (hasDestination ? shortPlace(dropoff.label) : 'Tap to set') : `Each member · ${familyStopsSet}/${groupRiders.length} set`}
          </span>
        </button>
      </div>
      {settingCommon && savedLocations.length > 0 && (
        <div className="-mx-1 flex flex-nowrap gap-1 overflow-x-auto px-1">
          {savedLocations.map((sp) => (
            <button
              key={sp.id}
              type="button"
              onClick={() => {
                if (pickRun) handleDropoffQuickPick(sp.location)
                else handlePickupQuickPick(sp.location)
                setSettingCommon(false)
              }}
              className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
            >
              {SAVED_LOCATION_ICONS[sp.label]} {savedPlaceName(sp.label, sp.name ?? (sp.label === 'Favorite' ? shortPlace(sp.location.label) : undefined))}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-stretch">{destinationStrip(true)}</div>
    </div>
  )
  const sharedMap = (
    <div ref={bookingMapRef} className="scroll-mt-24">
      <LocationMapPicker
        pickup={pickup}
        dropoff={dropoff}
        target={mapTarget}
        onTargetChange={setMapTarget}
        flyTo={dualEndBox ? padalaPreview : null}
        focusSignal={mapFocus}
        onEndSet={(end, gps) => {
          // A saved place being set is not an end of this trip.
          if (savingPlace) return
          // The previewed street stays drawn on the end it was set on.
          const line = padalaPreview?.end === end ? padalaPreview.line : null
          setPickedStreetLines((s) => ({ ...s, [end]: line ? { gps, line } : null }))
          setPadalaPreview(null)
          // Book a Delivery then asks for the other end: pickup set -> Delivery?,
          // delivery set with no pickup yet -> Pickup?. Its destination starts
          // pre-filled, so the map's own advance does not fire here.
          if (!dualEndBox) return
          const next = { ...boxSet, [end]: true }
          setBoxSet(next)
          // Then the end still to be set: pickup set -> the destination;
          // destination set with no pickup set here yet -> the pickup.
          if (end === 'pickup') setMapTarget('dropoff')
          else if (!next.pickup) setMapTarget('pickup')
        }}
        onPinPickup={handlePinPickup}
        onPinDropoff={handlePinDropoff}
        pickupLabel={pickupLabel}
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
        pickupIsMyLocation={!isErrand && guestRider.bookingFor === 'self'}
        // Booking a ride for yourself, the pickup is wherever your phone is —
        // it is filled from GPS (see the pickup effect above) and the map only
        // asks where you are going. Booking for someone else, a Group Ride and
        // PaDeliver all start somewhere other than here, so those keep both
        // ends. (Food Order never reaches this map: it asks for its single
        // "Deliver to" inside its own checkout — see VendorMenuBooking.)
        // Group Ride as well: the whole group boards where the booker is, so
        // the pickup is this phone's own position and only the stops are set.
        pickupAutomatic={!isErrand && (guestRider.bookingFor === 'self' || groupRideOpen)}
        // Map-first on the booking screen: the map takes the height and the
        // From/Destination card rides over it in a draggable sheet. Not while
        // the Terminal panel has borrowed this map — that screen has its own
        // layout and its own strip, and a sheet over it would be a second
        // panel arguing with the first.
        // The green street guide is for placing the pin; once Book a
        // tricycle is tapped there is a ride, and the line comes off.
        streetGuide={!activeRide}
        pickedStreetLines={pickedStreetLines}
        // No centre pin or Set buttons once a ride is booked — see pinPicking.
        pinPicking={!activeRide}
        onFullscreenChange={setMapIsFullscreen}
        mapHeight={groupRideOpen && !activeRide ? '460px' : undefined}
        routeLine={groupRideOpen && groupRoute ? groupRoute.points : undefined}
        // Whose stop the pin is setting: the rider picked, or else the next
        // one still without a stop — their name, or their number if none.
        centerPinLabel={
          savingPlace
            ? `${SAVED_LOCATION_ICONS[savingPlace.label]} ${savedPlaceName(savingPlace.label, savingPlace.name)}`
            : familyGroup && settingCommon
              ? pickRun
                ? 'Everyone to here'
                : 'Pickup for everyone'
            : groupRideOpen && groupPinRider
              ? groupPinRider.label
              : undefined
        }
        dropoffButtonText={
          savingPlace ? `💾 Save as ${savedPlaceName(savingPlace.label, savingPlace.name)}` : undefined
        }
        dropoffLabel={
          savingPlace
            ? savedPlaceName(savingPlace.label, savingPlace.name)
            : familyGroup && settingCommon
              ? pickRun
                ? "everyone's destination"
                : "everyone's pickup"
            : groupRideOpen && groupPinRider
              ? `${groupPinRider.label}'s ${pickRun ? 'pickup' : 'stop'}`
              : dropoffLabel
        }
        bottomPanel={
          groupRideOpen && !activeRide && !groupSettingStops
            ? (fullscreen) => (
                <SwipePanel
                  level={groupSheetLevel}
                  onLevelChange={setGroupSheetLevel}
                  // Short enough in the page that the centre pin, halfway up
                  // the map, is never under it.
                  halfHeightClass={fullscreen ? 'max-h-[40vh]' : 'max-h-[170px]'}
                  // All the way up: nearly the whole map, pin and all.
                  fullHeightClass={fullscreen ? 'max-h-[72vh]' : 'max-h-[380px]'}
                  title={`${familyGroup ? '👨‍👩‍👧 Family' : '👥 Group Ride'} · ${groupRiders.filter((r) => r.destination).length}/${groupRiders.length} stops`}
                  // How many are riding, right on the header: + adds a rider,
                  // − takes the last added one off (never the booker).
                  headerAction={
                    <span className="flex items-center gap-1 rounded-lg bg-slate-100 px-1.5 py-1">
                      <span aria-hidden className="text-[11px]">🧑</span>
                      <button
                        type="button"
                        aria-label="One fewer rider"
                        onClick={() => {
                          const last = [...groupRiders].reverse().find((r) => r.isGuest)
                          if (last) removeGroupRider(last.key)
                        }}
                        disabled={!groupRiders.some((r) => r.isGuest)}
                        className="h-6 w-6 rounded-md border border-slate-300 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        −
                      </button>
                      <span className="w-4 text-center text-xs font-semibold text-slate-800">{groupRiders.length}</span>
                      <button
                        type="button"
                        aria-label="One more rider"
                        onClick={addGroupRider}
                        disabled={groupRiders.length >= 4 || (familyGroup && !familyChoices?.length)}
                        className="h-6 w-6 rounded-md border border-slate-300 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        +
                      </button>
                    </span>
                  }
                >
                  <GroupRideInlinePanel
                    riders={groupRiders}
                    onAddRider={addGroupRider}
                    onRemoveRider={removeGroupRider}
                    onUpdateRider={updateGroupRider}
                    onPickDestination={(key) => {
                      // Out of the way of the pin while this stop is chosen.
                      setGroupSheetLevel(0)
                      handlePickGroupDestination(key)
                    }}
                    pickingForRiderKey={pickingForGroupRiderKey}
                    stopNumbers={groupStopNumbers}
                    onSetStopsOnMap={() => {
                      // From the first rider still without a stop.
                      setPickingForGroupRiderKey(null)
                      setMapTarget('dropoff')
                      setGroupSettingStops(true)
                    }}
                    paySplit={groupPaySplit}
                    onPaySplitChange={setGroupPaySplit}
                    fares={groupFares}
                    totalFare={groupTotalFare}
                    maxRiders={4}
                    familyChoices={familyChoices}
                    onAddFamily={addFamilyRider}
                    familyPlaces={familyGroup ? familyPlacesByRider : undefined}
                    onPickPlace={pickRiderPlace}
                    hasActiveRide={!!activeRide}
                  />
                </SwipePanel>
              )
            : undefined
        }
        // Where to, in the map's top row beside Full screen, in place of the
        // pickup/destination lines (see whereToOnMap).
        toolbarStrip={
          familyGroup && !activeRide ? familyEndsBar : whereToOnMap ? <div className="flex min-w-0 flex-1 items-stretch">{destinationStrip(true)}</div> : undefined
        }
        // A delivery starts somewhere other than here, so its pickup is named
        // on the map too.
        // Booking for someone else too: their pickup is somewhere other than
        // this phone, so it is named on the map like the destination.
        labelPickupOnMap={isErrand || forOther}
        // Full screen: choose the city up here, where the address lines were.
        fullscreenToolbar={cityRowFor('dropoff')}
        // Where to, at the top of the full-screen map, so a destination can
        // be searched without leaving it. Not once a ride is booked.
        fullscreenTop={
          familyGroup && !activeRide ? (
            familyEndsBar
          ) : whereToOnMap ? (
            <div>
              <div className="relative flex items-stretch gap-1">{destinationStrip(true)}</div>
              {dropoffFormOpen && (
                <div className="mt-1 rounded-lg bg-white/95 p-2 shadow-sm">{dropoffAddressForm}</div>
              )}
            </div>
          ) : undefined
        }
        // No Find Barangay box in the map's toolbar any more — that spot shows
        // the pickup and destination instead (see LocationMapPicker's
        // overlayTop). Searching still lives in the Where to bar.
        mapFirst={mapFirstBooking}
        sheetHeader={mapFirstBooking && !tripUnderway ? () => addressCard(true, true) : undefined}
        sheetSnap={mapFirstBooking ? bookingSheetSnap : undefined}
        onSheetSnapChange={mapFirstBooking ? setBookingSheetSnap : undefined}
        // Booking for someone else adds the destination row above the
        // toggle's own header, so the same peek fraction that used to clear
        // one row now stops short of it. Bumped just enough to bring that
        // row into view — the guest name/phone inputs and the rest of the
        // form stay below the fold until the sheet is pulled up.
        sheetPeekFraction={mapFirstBooking && forOther ? 0.34 : undefined}
        // Taking a pin off the map is the same as never having set it: the
        // row goes back to "not set yet" and the marker disappears.
        onClearPickup={() => setPickupChosen(false)}
        onClearDropoff={() => setDropoffChosen(false)}
        terminals={terminals}
        extraPoints={groupRideOpen ? groupMapPoints : undefined}
        showGpsFor={isErrand ? 'dropoff' : 'pickup'}
        sheetNote={mapFirstBooking && !tripUnderway ? bookingDetailsBar : undefined}
        // Full screen shows the row above the map. Not while a ride is
        // active: the trip card below carries that ride's own row.
        detailsBar={activeRide ? undefined : bookingDetailsBar}
        sheetExtras={mapFirstBooking && !tripUnderway ? moreOptions : undefined}
        leadingAction={
          tripUnderway ? null : groupRideOpen ? (
            // Group Ride's Request button, under Set Destination here — where a
            // single ride's Book a Ride is, in the page and in full screen alike.
            (
              <button
                type="button"
                disabled={!groupCanSubmit}
                onClick={submitGroupRide}
                className="w-full rounded-lg bg-brand-600 py-2 text-sm font-bold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                {familyGroup ? (groupRiders.length < 2 ? 'Add at least 2 family members' : 'Request Family Ride') : 'Request Group Ride'}{groupRiders.length > 1 ? ` · ${groupRiders.length} riders` : ''}
              </button>
            )
          ) : (
            <div className="space-y-1">
              {pickupMissingNotice && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug text-amber-800">
                  📍 We couldn't get your location. Reload the page and choose{' '}
                  <span className="font-semibold">Allow</span> when it asks, or tap{' '}
                  <span className="font-semibold">Set on Map</span> above to pin your pickup yourself.
                </div>
              )}
              {/* How many are riding sits right of the button (2026-09-22),
                  no "Passengers" label — the − n + and the face say it. */}
              <div className="flex items-center gap-1.5">
              <button
                onClick={() => handleRequest()}
                disabled={!canSubmit}
                // Fixed light yellow, not the `gold` token — that token
                // turns a muted blue-grey under this theme and reads as
                // disabled even when the button is live (same fix as the
                // Terminal banner above).
                className="min-w-0 flex-1 rounded-lg bg-[#ffe066] px-2.5 py-1.5 text-xs font-bold text-navy-900 transition hover:bg-[#ffd633] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                <span className="block truncate">
                  {/* What is still missing, said on the button (2026-09-22). */}
                  {inCurfew
                    ? `No booking ${myLimits?.curfewFrom}–${myLimits?.curfewTo} — ask your parent`
                    : dualMissing
                    ? dualMissing === 'pickup'
                      ? `Set the pickup to ${isPadala ? 'request' : 'book'}`
                      : isPadala
                        ? 'Set the delivery to request'
                        : 'Set the destination to book'
                    : isPabili
                    ? isGuestBooking
                      ? `Request Pabili for ${guestRider.otherName.trim() || 'them'}`
                      : 'Request Pabili'
                    : isPadala
                      ? isGuestBooking
                        ? `Request Delivery for ${guestRider.otherName.trim() || 'them'}`
                        : 'Request Delivery'
                      : isGuestBooking
                        ? !guestRider.otherName.trim() && !guestPhoneFine
                          ? // What Someone still needs — said on the button it
                            // is holding back (2026-09-22).
                            forFamily
                            ? 'Pick a family member above to book'
                            : 'Type their name and mobile above to book'
                          : !guestRider.otherName.trim()
                            ? forFamily
                              ? 'Pick a family member above to book'
                              : 'Type their name above to book'
                            : !guestPhoneFine
                              ? 'Type their mobile (09XXXXXXXXX) to book'
                              : `Book a Ride for ${guestRider.otherName.trim()}`
                        : myLimits?.askFirst
                          ? 'Ask my parent to approve this ride'
                          : 'Book a Ride'}
                </span>
              </button>
              {!isErrand && <div className="flex shrink-0 items-center">{passengerCounter}</div>}
              </div>
              {/* Said, not asked.
                  A kilometre on a tricycle is several minutes of standing on a
                  road wondering whether the app heard you, and that is worth
                  knowing before the wait rather than during it. It used to be a
                  dialog the booking waited on, which put a second tap on the
                  one button this screen exists for — in the very case where the
                  passenger is already waiting longer than they would like. */}
              {nearestDriverMeters !== null && nearestDriverMeters > FAR_DRIVER_METERS && (
                <p className="text-[10px] leading-snug text-amber-700">
                  Pinakamalapit na driver: {formatKm(nearestDriverMeters)} — mga{' '}
                  {formatDuration(minutesToCover(nearestDriverMeters))} bago makarating.
                </p>
              )}
              {/* No "Drivers near you" button here. The Drivers tab in the
                  bottom bar opens the same list, and the map already shows
                  every tricycle that is actually out there — so this was a
                  third way to the same place, taking a line of the sheet
                  under the button people came here to press. */}
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
  const addressCard = (showStrip: boolean, destinationOnly = false) => (
        <section
          ref={addressSectionRef}
          className="scroll-mt-2 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm"
        >
          <div className="relative" ref={endpointsRef}>
            {/* Who this ride is for, asked before either address. It decides
                whether the pickup row below has anything to do: booking for
                yourself already has a pickup — wherever you are standing,
                found automatically (see the auto-locate effect) — so asking
                you to also set it on a strip is asking a question already
                answered. Booking for someone else has no such answer; their
                phone isn't this one, so the pickup has to be set by hand,
                and their name has to go on the ride somewhere. */}
            {!isErrand && (
              <div className="mb-1.5">
                {/* Group Ride joins this row as a third segment instead of
                    sitting on its own line further down — it's a peer
                    choice, not an afterthought: "who is this booking for"
                    plus "is it one destination or several" is one decision
                    about the trip, made in one place. */}
                {/* The three choices and the city share one row: short words
                    (Myself / Someone / Group) leave room for the city beside
                    them, where it used to take a line of its own under them. */}
                {/* Family is its own page (2026-09-22), opened from the home
                    page's Family tile: its header and the City, no Myself /
                    Someone / Group row. */}
                {forFamily || familyGroup ? (
                  <div className="space-y-1.5">
                    <p className="flex items-center gap-1.5 whitespace-nowrap text-sm font-bold text-slate-800">
                      {/* Back to Family home, where members, drivers and trips are. */}
                      <button
                        type="button"
                        onClick={() => navigate('/book/family')}
                        className="rounded-lg border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        ‹ Family
                      </button>
                      👨‍👩‍👧 Book a Ride
                      <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">1-year free promo</span>
                    </p>
                    <div className="flex items-center gap-1.5">
                      <div className="w-[42%] shrink-0">{cityRowFor('dropoff')}</div>
                      {/* One member to one place, or several members dropped
                          at different places (school runs) in one tricycle. */}
                      <div className="flex min-w-0 flex-1 gap-1 rounded-lg bg-slate-100 p-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (familyGroup) navigate('/book')
                            guestRider.setBookingFor('family')
                          }}
                          className={`flex-1 rounded-md py-1.5 text-[11px] font-semibold transition ${
                            !familyGroup ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          One stop
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate('/book/group?family=1')}
                          className={`flex-1 rounded-md py-1.5 text-[11px] font-semibold transition ${
                            familyGroup ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          🏫 Several stops
                        </button>
                      </div>
                    </div>
                    {/* The driver choice is made on Family home; here it is
                        only said, so the booking keeps the screen. */}
                    {familyTrustedPick && (
                      <p className="text-[10px] text-slate-500">
                        🛺 Goes first to your trusted driver{' '}
                        <span className="font-semibold text-slate-700">
                          {drivers.find((d) => d.id === familyTrustedPick)?.name}
                        </span>
                      </p>
                    )}
                  </div>
                ) : (
                <div className="flex items-center gap-1.5">
                {/* City first: which city the trip is in comes before who it is
                    for, and it scopes the search in the Where to bar below. */}
                <div className="w-[42%] shrink-0">{cityRowFor('dropoff')}</div>
                <div className="flex min-w-0 flex-1 gap-1 rounded-lg bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (groupRideOpen) setGroupRideOpen(false)
                      guestRider.setBookingFor('self')
                    }}
                    className={`flex-1 rounded-md py-1.5 text-[11px] font-semibold transition ${
                      !groupRideOpen && guestRider.bookingFor === 'self'
                        ? 'bg-brand-600 text-white shadow-sm'
                        : 'text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    Myself
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (groupRideOpen) setGroupRideOpen(false)
                      guestRider.setBookingFor('other')
                    }}
                    className={`flex-1 rounded-md py-1.5 text-[11px] font-semibold transition ${
                      !groupRideOpen && guestRider.bookingFor === 'other'
                        ? 'bg-brand-600 text-white shadow-sm'
                        : 'text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    Someone
                  </button>
                  <button
                    type="button"
                    onClick={openGroupRide}
                    aria-expanded={groupRideOpen}
                    className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-semibold transition ${
                      groupRideOpen ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    <span aria-hidden className="text-[11px] leading-none">👥</span>
                    Group
                  </button>
                </div>
                </div>
                )}
                {forFamily && (
                  <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50/80 p-1.5">
                    <FamilyMembersBar
                      passengerId={passenger.id}
                      members={passenger.familyMembers ?? []}
                      selectedName={guestRider.otherName}
                      selectedPhone={guestRider.otherPhone}
                      manage={false}
                      allowAddRemove
                      onPick={(m) => {
                        guestRider.setOtherName(m.name)
                        guestRider.setOtherPhone(m.phone)
                      }}
                    />
                  </div>
                )}
                {/* Family never types a name here (2026-09-23): the rider is
                    picked from the chips above, and somebody new is added with
                    "+ Add family member", which has its own boxes. The pair
                    stays for a plain Someone booking. */}
                {forOther && !forFamily && (
                  <div className="mt-1.5 grid grid-cols-[1fr_4.5rem_1fr] gap-1.5">
                    <input
                      value={guestRider.otherName}
                      onChange={(e) => guestRider.setOtherName(e.target.value)}
                      placeholder="Their name"
                      // Amber once both ends are set and only the name is missing.
                      className={`compact-input min-w-0 rounded-lg border px-2.5 py-1.5 text-xs ${
                        !guestRider.otherName.trim() && hasDestination && !endsAreSameSpot
                          ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-300'
                          : 'border-slate-300'
                      }`}
                    />
                    <input
                      value={guestRider.otherAge}
                      onChange={(e) => guestRider.setOtherAge(e.target.value.replace(/\D/g, '').slice(0, 3))}
                      placeholder="Age"
                      inputMode="numeric"
                      className={`compact-input min-w-0 rounded-lg border px-2 py-1.5 text-center text-xs ${
                        !guestAgeGiven && hasDestination && !endsAreSameSpot
                          ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-300'
                          : 'border-slate-300'
                      }`}
                    />
                    {/* A child's number is not asked for at all (2026-09-24):
                        the driver rings the adult booking the ride, and the
                        phone icon here is what says so. */}
                    {guestIsMinor ? (
                      <span
                        title={`The driver is given your number, ${passenger.phone}`}
                        className="flex min-w-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] leading-snug text-slate-700"
                      >
                        <span aria-hidden className="text-sm leading-none">
                          📞
                        </span>
                        <span className="min-w-0 truncate font-semibold">{passenger.phone}</span>
                      </span>
                    ) : (
                      <input
                        value={guestRider.otherPhone}
                        onChange={(e) => guestRider.setOtherPhone(e.target.value)}
                        placeholder="Their mobile number"
                        inputMode="tel"
                        // Amber once both ends are set and the number is missing
                        // or not a PH mobile yet.
                        className={`compact-input min-w-0 rounded-lg border px-2.5 py-1.5 text-xs ${
                          !guestPhoneFine && hasDestination && !endsAreSameSpot
                            ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-300'
                            : 'border-slate-300'
                        }`}
                      />
                    )}
                  </div>
                )}
                {myLimits && !activeRide && (
                  <p className="mt-1.5 rounded-lg bg-amber-50 px-2 py-1 text-[10px] leading-snug text-amber-900">
                    👨‍👩‍👧 Family account
                    {myLimits.askFirst && ' · your parent approves each ride'}
                    {myLimits.trustedOnly && ' · your family drivers only'}
                    {myLimits.curfew && ` · no booking ${myLimits.curfewFrom}–${myLimits.curfewTo}`}
                  </p>
                )}
                {!activeRide && !groupRideOpen && savedPlacesRow}
              </div>
            )}
            {/* The dotted connector between the two rows is gone. It drew a
                line from the pickup down to the destination, and the
                destination is now the row on top — so it was pointing at the
                wrong one, from a fixed offset that no longer matches either. */}
            {/* The pickup row, only when it is actually a question, and
                first when it shows at all. Booking for yourself already has
                an answer — the auto-locate effect above filled it with
                wherever you are standing — so the row stays hidden rather
                than asking you to confirm a decision already made. Booking
                for someone else has no such answer, so it comes back, and
                comes back ahead of the destination: "where are they" is the
                first question for somebody who isn't you, before "where are
                they going". */}
            {/* Book a Delivery: City first, as on Book a Ride. */}
            {isPadala && <div className="mb-1.5">{cityRowFor('dropoff')}</div>}
            {forOther && !dualEndBox && (
            <>
            {/* Paired with Group Ride on the booking screen, the way the
                destination row is paired with Set on Map — the row takes the
                width and the secondary control sits beside it, rather than
                each taking a line of its own. */}
            <div className="relative mt-1.5 flex items-stretch gap-1.5">
            {openEnd === 'pickup' ? (
              // Typed straight into the bar, the same way Where to works below:
              // tap the strip, it becomes the search, the matches drop under
              // it. It used to open a separate panel with its own city row,
              // search box and chips — a second, different way of doing the
              // same thing the destination does in place.
              <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-1.5 shadow-sm">
                <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-600" />
                <DestinationSearch
                  city={cityScope}
                  near={pickupGps ?? pickup.gps ?? null}
                  onSelect={handlePickupLandmark}
                  onOpenAddressForm={() => openAddressForm('pickup')}
                  onPinOnMap={() => {
                    setMapTarget('pickup')
                    setOpenEnd(null)
                    setAddressFormOpen(null)
                  }}
                  autoFocus
                  placeholder="Set PICKUP address"
                  className="min-w-0 flex-1"
                  resultsClassName="absolute inset-x-0 top-full z-[80] mt-1 max-h-72 overflow-y-auto"
                  inputClassName="w-full min-w-0 bg-transparent text-sm font-semibold text-red-900 placeholder:font-normal placeholder:text-red-800/70 focus:outline-none"
                />
              </div>
            ) : (
            <button
              type="button"
              onClick={() => openAddressPicker('pickup')}
              className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-1.5 text-left shadow-sm filter transition hover:bg-red-500/25 ${
                destinationOnly ? '' : 'pr-14'
              }`}
            >
              <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-600" />
              <span className="min-w-0 flex-1">
                {/* No eyebrow on the booking screen, same as the destination
                    row: the colour and the placeholder already say which end
                    this is, and the label cost a line of a thin strip. */}
                {!destinationOnly && (
                  <span className="block text-[9px] font-semibold uppercase tracking-wide text-red-800/75">{pickupLabel}</span>
                )}
                {/* Blank until the passenger says where they are, the same as
                    the destination below.

                    It used to open reading "CLSU Main Gate" — a real address,
                    in the field the fare and the driver are dispatched from,
                    that nobody had chosen. Anyone booking from anywhere else
                    had to notice it was wrong and correct it, and the ones who
                    did not sent a tricycle to a gate they were nowhere near.
                    A guess presented as an answer is worse than an empty box. */}
                {/* The placeholder is a sentence rather than a prompt, and at
                    the address size it ran off the end of the row as "Set
                    Pick up addre…". A chosen address keeps the larger size —
                    that one has to be readable at a glance, because it is
                    where a driver is being sent. */}
                <span
                  className={`block truncate ${
                    pickupChosen ? 'text-sm font-semibold text-red-900' : 'text-[11px] font-normal text-red-800/70'
                  }`}
                >
                  {pickupChosen ? (
                    <>
                      <span className="font-normal text-red-800/80">Pickup: </span>
                      {formatAddressLine(pickup.label)}
                    </>
                  ) : (
                    // "Booking for others" used to carry that context on its
                    // own, before the row even had a reason to be hidden most
                    // of the time. The toggle above it says that now — this
                    // row only shows once "Book for someone" is picked — so
                    // the placeholder just has to say what to do here.
                    'Set PICKUP address'
                  )}
                </span>
              </span>
            </button>
            )}
            {/* The pickup gets the same map route as the destination. Booking
                for somebody else is exactly the case where an address is hard
                to type and easy to point at — a sitio, a corner, a house with
                no street number. */}
            {destinationOnly && (
              <button
                type="button"
                onClick={() => {
                  setMapTarget('pickup')
                  setOpenEnd(null)
                  setAddressFormOpen(null)
                }}
                aria-label="Set the pickup by tapping the map"
                aria-pressed={mapTarget === 'pickup'}
                className={`flex w-28 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border px-1 text-[10px] font-bold leading-tight text-pickup-accent transition ${
                  mapTarget === 'pickup'
                    ? 'border-gold-400 bg-gold-400'
                    : 'border-gold-400/60 bg-gold-400/20 hover:bg-gold-400/40'
                }`}
              >
                <span aria-hidden className="text-sm leading-none">📍</span>
                Set on Map
              </button>
            )}
            </div>
            {openEnd === 'pickup' && (isErrand || addressFormOpen === 'pickup') && (
              <div ref={addressFormRef} className="mt-1.5 space-y-2 rounded-lg bg-slate-50/70 p-2">
              {/* Gated on the Address form chip above — except on an errand,
                  where that chip (and the rest of the quick-places row) is
                  not shown at all, so the form is this pickup's only way in. */}
              {(isErrand || addressFormOpen === 'pickup') && (
              <BarangayAddressPicker
                key={`from-${pickupPickerSeed.key}`}
                label=""
                hideRegionSelects
                defaultProvince={pickupPickerSeed.province || DEFAULT_BOOKING_PROVINCE}
                defaultCity={pickupPickerSeed.city || DEFAULT_BOOKING_CITY}
                defaultBarangay={pickupPickerSeed.barangay}
                defaultAddressDetail={pickupPickerSeed.addressDetail}
                onResolve={handlePickupResolve}
                onConfirm={() => {
                  setOpenEnd(null)
                  setAddressFormOpen(null)
                }}
                // Anything with real coordinates behind it counts, not just
                // the GPS button: a spot tapped on the map, a saved place, or
                // a fix taken earlier in this session. The exact point is
                // known either way, and that is the whole question the
                // landmark was being asked to answer.
                pinned={pickupGps !== null || !!pickup.gps}
              />
              )}
              {/* Only when the reader has nowhere else to learn it. The Live
                  location row already reports "blocked" with a How-to-fix
                  beside it, so on the booking sheet this was the same news a
                  second time, in a second colour. */}
              {!destinationOnly && gpsStatus === 'error' && gpsError && <p className="text-[11px] text-amber-700">{gpsError}</p>}
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
            {/* Which city the search bar below and its landmarks are scoped
                to — moved above the bar itself so the scope is set before
                typing into it, instead of being buried in the panel that
                only shows once the bar is already expanded. */}
            {isErrand && !isPadala && <div className="mt-1.5">{cityRowFor('dropoff')}</div>}
            {/* The destination row. Second when the pickup row is showing
                beside it — booking for someone else answers "where are
                they" first — first on its own the rest of the time, which
                is most of the time: booking for yourself never shows the
                row above this one. */}
            {/* Group Ride has no single destination — each rider has their own
                stop in the panel below — so no Where to row at all there. */}
            {/* Where to lives in the map's top row (see toolbarStrip), and how
                many are riding sits beside Book a Ride — nothing left for here. */}
            {groupRideOpen || whereToOnMap ? null : (
            <div className={forOther ? 'relative mt-1.5 flex items-stretch gap-1.5' : 'relative mt-1 flex items-stretch gap-1.5'}>
            {/* In full screen the strip rides at the top of the map instead
                (see fullscreenTop) — one copy at a time, so its search box
                is never mounted twice. */}
            {!mapIsFullscreen && destinationStrip(destinationOnly)}
            {/* The yellow "Set on Map" button beside Where to is gone
                (2026-09-21): the map has a centre pin and its own Set
                Destination button now, so arming the map from up here was a
                second switch for something already switched on. */}
            </div>
            )}
            {/* The Home / School / Work / Address form chips that sat here are
                gone (2026-09-21). The destination is chosen on the map now —
                slide it under the centre pin, or search it from the Where to
                bar or the map's Find Barangay box — and a row of four more
                ways to say the same thing, directly under the bar, was the
                busiest strip on the screen. */}
            {/* Only while there is something to put in it — the search lives
                in the bar and the City row above it now, so with the address
                form collapsed this panel used to render as an empty grey
                strip under the chips. */}
            {openEnd === 'dropoff' && (addressFormOpen === 'dropoff' || (isErrand && gpsStatus === 'error' && !!gpsError)) && (
              <div ref={addressFormRef} className="mt-1 space-y-2 rounded-lg bg-slate-50/70 p-2">
                {/* The landmark search itself now lives in the Where to bar
                    above (see the embedded DestinationSearch branch), and
                    the City row now sits above that same bar — this is just
                    the address-form fallback for whatever the search and
                    the map pin don't cover. */}
                {addressFormOpen === 'dropoff' && !(mapIsFullscreen && whereToOnMap) && dropoffAddressForm}
                {isErrand && gpsStatus === 'error' && gpsError && (
                  <p className="text-[11px] text-amber-700">{gpsError}</p>
                )}
              </div>
            )}
            {/* Not while an address form is open. The strip offers a
                different way to start a trip entirely, and putting that
                beside the city and barangay boxes somebody is halfway
                through filling in is an interruption, not an option. It
                comes back the moment the form closes. */}
            {showStrip && !openEnd && (!mapFirstBooking || bookingSheetSnap !== 'peek') && (
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
              {/* The yellow "Track your trip" strip is gone from here. It was
                  a second way to start a trip, sitting under the form for the
                  first one — and the chooser this screen is reached through
                  already offers it, as the whole other half of that screen.
                  Group Ride moved up into the Book for myself/someone row
                  instead of keeping its own line here — see addressCard. */}
              </>
            )}
          </div>
  
        </section>
  )

  // Group Ride, as its own screen. The map comes with it: setting each
  // rider's destination is done by pinning on that same map, so a panel
  // without it would be a form with no way to answer half its questions.
  if (groupRideOpen) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-70px)] max-w-lg flex-col space-y-1.5 px-4 pb-[72px] pt-1">
        {/* Rider one is a rider. Their pickup is where the whole group
            boards and their destination is their own — and with this card
            left behind on the booking form, neither could be changed from
            the screen that books them. Without the Sakay/Group strip: this
            is Group Ride, so a button into Group Ride would be a door to
            the room you are already standing in. */}
        {addressCard(false)}
        {/* The Group Ride panel rides on the bottom of the map now, as a
            swipe-up sheet - see bottomPanel on sharedMap. */}
        {sharedMap}
      </div>
    )
  }

  // Family home (2026-09-22): everything about the family on one page — who
  // is in it, their trusted drivers, their trips — and a tab into booking,
  // which opens on its own page so the map fills the phone screen.
  if (familyHome && !familyActive) {
    return (
      <div className="mx-auto max-w-lg space-y-2 px-4 pb-6 pt-1">
        <FamilyActivation passenger={passenger} />
      </div>
    )
  }
  if (familyHome) {
    return (
      <div className="mx-auto max-w-lg space-y-2 px-4 pb-6 pt-1">
        <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
          <p className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
            👨‍👩‍👧 Family
            <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">1-year free promo</span>
          </p>
          {/* The plan's standing and the terms it was activated under. */}
          {(() => {
            const plan = passenger.familyPlan ?? passengers.find((o) => o.id === passenger.familyOwnerId)?.familyPlan
            return plan ? (
              <p className="text-[11px] text-slate-600">
                ✅ Family Plan active · free until <span className="font-semibold">{formatPlanDate(plan.freeUntil)}</span> ·{' '}
                <button type="button" onClick={() => setShowFamilyTerms((v) => !v)} className="font-semibold text-brand-700 hover:underline">
                  {showFamilyTerms ? 'Hide terms' : 'Terms'}
                </button>
              </p>
            ) : null
          })()}
          {showFamilyTerms && (
            <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
              <FamilyTermsText />
            </div>
          )}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => openFamilyBooking(false)}
              className="rounded-xl border border-gold-400 bg-amber-50 px-2 py-3 text-left shadow-sm transition hover:bg-amber-100"
            >
              <span className="block text-sm font-bold text-slate-900">🛺 Book a Ride</span>
              <span className="block text-[11px] leading-snug text-slate-600">for a family member</span>
            </button>
            <button
              type="button"
              onClick={() => openFamilyBooking(true)}
              className="rounded-xl border border-gold-400 bg-amber-50 px-2 py-3 text-left shadow-sm transition hover:bg-amber-100"
            >
              <span className="block text-sm font-bold text-slate-900">🏫 Several stops</span>
              <span className="block text-[11px] leading-snug text-slate-600">one tricycle, a stop for each</span>
            </button>
          </div>
        </section>
        <section className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50/80 p-2">
          <p className="text-[11px] font-semibold text-amber-900">Your family — tap a name, then Book — or add, invite and set who pays</p>
          <FamilyMembersBar
            passengerId={passenger.id}
            members={passenger.familyMembers ?? []}
            selectedName={guestRider.otherName}
            selectedPhone={guestRider.otherPhone}
            onPick={(m) => {
              guestRider.setOtherName(m.name)
              guestRider.setOtherPhone(m.phone)
            }}
            onBook={() => openFamilyBooking(false)}
          />
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
          <FamilyDriverRow owner={passenger} choice={familyDriverChoice} onChoice={setFamilyDriverChoice} />
        </section>
        <FamilyTrips bookerId={passenger.id} />
      </div>
    )
  }

  return (
    // min-h + flex-col is what lets the ad box claim the leftover screen:
    // mt-auto pushes it to the bottom and flex-1 lets it grow, so on a tall
    // phone it fills the gap instead of leaving dead space under the form.
    <div className="mx-auto flex min-h-[calc(100vh-70px)] max-w-lg flex-col space-y-2 px-4 pb-[72px] pt-1">
      {/* One consistent place to switch services, above every self-contained
          booking screen (Ride/Padala, Food Order, PaDeliver's Store) instead
          of nested inside each one's own bordered card (that's what
          VendorMenuBooking used to do) or scattered across the bottom
          footer's old TODA Ride/Food Express tiles (removed — see the
          footer below). Not shown for Buy Medicine — self-contained with
          nothing here to switch away from. */}
      {/* The service strip itself is in the header now — see useHeaderTabs
          above. */}
      {/* PaDeliver's own two doors, one line under the main strip — only
          while PaDeliver itself is the selected tab there, so it reads as
          PaDeliver opening up rather than a fourth, unrelated tab. */}
      {pageTab === 'book' && ((showVendorMenu && catalogKind === 'goods') || isPadala) && (
        <PaDeliverSubTabs active={isPadala ? 'delivery' : 'store'} />
      )}
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
        {/* TODA Ride and Food Express used to open here — removed now that
            the ServiceTabs strip at the top of the booking page (see above)
            does the same switching, visibly, on every service screen
            instead of only from this footer. */}
        {/* A Food Order/PaDeliver cart follows the passenger into this
            footer the same way Drivers Near You does — present on every
            screen so an add doesn't strand its own View Cart back on a menu
            already scrolled past. See VendorMenuBookingHandle. */}
        {vendorCart && (
          <button
            type="button"
            onClick={() => vendorMenuRef.current?.openCart()}
            title={`View cart — ${vendorCart.count} item${vendorCart.count === 1 ? '' : 's'}, ₱${vendorCart.total}`}
            // Gold to match Drivers Near You's own selected state — lit only
            // while Checkout, what this tile jumps to, is the screen actually
            // showing.
            className={`relative flex min-w-0 flex-1 flex-col items-center gap-0 rounded-lg border py-1.5 transition ${
              vendorCart.atCheckout
                ? 'border-gold-500 bg-gold-400 shadow-md'
                : 'border-transparent bg-slate-100 hover:bg-slate-200'
            }`}
          >
            <span className="text-[15px] leading-none">🛒</span>
            <span className="truncate text-[10px] font-semibold text-slate-700">
              View Cart · ₱{vendorCart.total}
            </span>
            <span
              aria-hidden
              className="absolute right-1.5 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[9px] font-bold text-white"
            >
              {vendorCart.count}
            </span>
          </button>
        )}
        {/* The Drivers Near You tile is gone from the footer (2026-09-22). */}
        {/* An action, not a mode to switch into — kept beside Drivers, since
            it belongs with "who is driving me". Absent whenever there is no
            assigned driver: nobody to reach. */}
        {footerContact && (
          <button
            type="button"
            onClick={() => setFooterContactOpen(true)}
            title={`Contact ${footerContact.name}`}
            className="flex min-w-0 flex-1 flex-col items-center gap-0 rounded-lg border border-transparent bg-slate-100 py-1.5 transition hover:bg-slate-200"
          >
            <span className="text-[15px] leading-none">☎️</span>
            <span className="truncate text-[10px] font-semibold text-slate-700">Contact</span>
          </button>
        )}
        {/* Trip history lives in the footer now (2026-09-22) rather than as a
            folded row at the foot of the page: tap to open the list and go to
            it, tap again to close it. */}
        <button
          type="button"
          onClick={() => {
            const opening = !showTripHistory
            setShowTripHistory(opening)
            if (opening) setTimeout(() => tripHistorySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
          }}
          aria-pressed={showTripHistory}
          title="Trip history"
          className={`flex min-w-0 flex-1 flex-col items-center gap-0 rounded-lg border px-2 py-1.5 transition ${
            showTripHistory ? 'border-gold-500 bg-gold-400 shadow-md' : 'border-transparent bg-slate-100 hover:bg-slate-200'
          }`}
        >
          <span className="text-[15px] leading-none">🧾</span>
          <span className="whitespace-nowrap text-[10px] font-semibold text-slate-700">History</span>
        </button>
        {/* The safety feature, one tap from every screen: the same Track
            your trip that the yellow card on the booking form opens. Seated
            right before SOS, since both are about the ride going wrong. */}
        <button
          type="button"
          onClick={() => navigate('/book/terminal')}
          title="Track your trip — I-track ang biyahe mo"
          className="flex min-w-0 flex-1 flex-col items-center gap-0 rounded-lg border border-transparent bg-slate-100 px-2 py-1.5 transition hover:bg-slate-200"
        >
          <span className="text-[15px] leading-none">📍</span>
          <span className="whitespace-nowrap text-[10px] font-semibold text-slate-700">Track your trip</span>
        </button>
        {[
          ...(rewardsEnabled ? [{ icon: '🎁', label: 'Rewards', tab: 'rewards' as const }] : []),
          // Safety, not SOS. The red SOS square read as an alarm button — the
          // thing you press when it has already gone wrong — and an alarm is
          // not what is behind it: the screen it opens is every way to reach
          // help (911, family, the TODA, hotlines), which is worth opening on
          // a calm day too. The emergency tab and everything in it is
          // unchanged; only its door is renamed.
          { icon: '🛡️', label: 'Safety', tab: 'emergency' as const },
        ].map((item) => (
          <button
            key={item.tab}
            type="button"
            onClick={() => {
              setPageTab(pageTab === item.tab ? 'book' : item.tab)
              revealFromTabs()
            }}
            aria-label={item.tab === 'emergency' ? 'Safety — emergency contacts' : item.label}
            title={item.tab === 'emergency' ? 'Safety — emergency contacts' : item.label}
            aria-pressed={pageTab === item.tab}
            // Safety is still the one tile that must be found first time
            // under stress, so it keeps the size up and carries its name,
            // the same icon-over-word shape as Track your trip beside it.
            className={`flex shrink-0 flex-col items-center justify-center rounded-lg border transition ${
              item.tab === 'emergency' ? 'min-w-0 flex-1 gap-0.5 py-1' : 'w-9 text-base'
            } ${
              pageTab === item.tab
                ? 'border-gold-500 bg-gold-400 shadow-md'
                : 'border-transparent bg-slate-100 hover:bg-slate-200'
            }`}
          >
            {item.tab === 'emergency' ? (
              <>
                <span aria-hidden className="text-[17px] leading-none">
                  {item.icon}
                </span>
                <span className="text-[10px] font-bold leading-none text-slate-700">{item.label}</span>
              </>
            ) : (
              item.icon
            )}
          </button>
        ))}
      </div>
      </div>
      {footerContact && footerContactOpen && (
        <ContactSheet
          name={footerContact.name}
          phone={footerContact.phone}
          onClose={() => setFooterContactOpen(false)}
        />
      )}

      {/* From / Where to. Tapping either row expands it into the barangay
          list and sub-address for that end; the city above drives both. Only
          on the booking tab — Rewards and Emergency have nothing to address. */}
      {/* In map-first booking this card lives at the top of the sheet over
          the map (see sharedMap's sheetHeader), so it is not repeated here.
          isPabili is always showVendorMenu too now that freeform Pabili has
          no live entry point (chooseErrand('pabili', ...) only ever fires
          with food:true, already gated on vendorsEnabled) — so this used to
          also check "!isPabili || showErrandBooking" for the freeform form's
          own reveal step, which no longer applies. */}
      {pageTab === 'book' && !mapFirstBooking && !isBuyMedicine && !showVendorMenu && (
        addressCard(true)
      )}

      {pageTab === 'rewards' && rewardsEnabled && <PassengerRewardsCard passenger={passenger} />}

      {pageTab === 'emergency' && (
        <>
          {/* The emergency screen itself, in the page: SOS with its countdown
              while a trip is on, and the call buttons either way. The
              hotlines list follows for everything else. */}
          {(() => {
            const emergencyRide = activeRide ?? null
            // On a trip, the incident is tied to that ride; off one, an SOS
            // is raised with no ride at all (see TRIGGER_PASSENGER_SOS) and is
            // found by whose it is instead.
            const emergencyAlert = emergencyRide
              ? alerts.find((a) => a.rideId === emergencyRide.id && a.type === 'sos' && isActiveAlert(a)) ?? null
              : alerts.find((a) => !a.rideId && a.triggeredBy === passenger.id && a.type === 'sos' && isActiveAlert(a)) ?? null
            const emergencyDriver = emergencyRide?.driverId ? drivers.find((d) => d.id === emergencyRide.driverId) ?? null : null
            const emergencyToda = emergencyDriver?.todaOrgId ? todaOrganizations.find((o) => o.id === emergencyDriver.todaOrgId) ?? null : null
            return (
              <EmergencySheet
                inline
                role="passenger"
                ride={emergencyRide}
                actorName={passenger.name}
                location={emergencyRide?.passengerLiveGps ?? emergencyGps ?? emergencyRide?.driverLiveGps ?? null}
                contacts={passengerEmergencyContacts(passenger)}
                counterpart={emergencyDriver?.phone ? { label: emergencyDriver.name, phone: emergencyDriver.phone } : null}
                toda={emergencyToda?.contactPhone ? { name: emergencyToda.name, phone: emergencyToda.contactPhone } : null}
                activeAlert={emergencyAlert}
                countdownSeconds={safetySettings.sosCountdownSeconds}
                sosEnabled={safetySettings.sosAlertsEnabled}
                onSendSos={() => (emergencyRide ? triggerSos(emergencyRide.id, passenger.id) : triggerPassengerSos(passenger.id, null))}
                onCancelSos={(id) => cancelAlert(id, passenger.name, 'passenger')}
                onLogEvent={(id, kind, summary) => logAlertEvent(id, kind, summary, passenger.name, 'passenger')}
                onClose={() => setPageTab('book')}
              />
            )
          })()}
          <EmergencyHotlines province={passenger.province} city={passenger.city} />
        </>
      )}

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
      {/* Family trips (2026-09-22): rides this passenger booked for family
          members from the Family tab, followed live from here. */}
      <FamilyTrips bookerId={passenger.id} />
      {(!activeRide || searchingAgain || rideIsOver) && (
        <section className="space-y-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm">
            <>
          {/* The Ride/Pabili/Medicine row that used to live here is gone: the
              two mode cards and the errand tiles at the top of the page now
              make that choice, and two competing switches for one piece of
              state is how people end up in a mode they did not pick. */}
          {isBuyMedicine && (
            <p className="text-xs text-slate-500">
              Order medicine from a nearby participating pharmacy — your driver picks it up and delivers it to you.
            </p>
          )}

          {/* Padala has no "Create order" gate the way Pabili does — there is
              nothing to price or itemize, so the address form below is
              already open (see chooseErrand). This note is the only thing
              particular to Padala: what's in the package, for the driver's
              own sake. */}

          {/* Buy Medicine has no "who is this for?" step — a pharmacy order
              is always the logged-in customer's, and the two fulfilment tabs
              take this slot instead (see MedsBooking). Registered Vendor has
              none either, same reason (see VendorMenuBooking).
              The freeform Pabili errand's own "Create order"/item-list/
              store-name steps used to live here — removed along with the
              rest of that feature's UI, since it has no live entry point any
              more (Food Order and PaDeliver both moved to their own types;
              see buildMedsDeliveryRide in RideContext.tsx). Ride still gets
              the "who is this for?" step above, unaffected. */}

          {isBuyMedicine ? (
            <MedsBooking
              customerId={isGuestBooking ? guestCustomerId : passenger.id}
              customerName={isGuestBooking ? guestRider.otherName.trim() || 'them' : passenger.name}
              defaultProvince={DEFAULT_BOOKING_PROVINCE}
              defaultCity={DEFAULT_BOOKING_CITY}
              defaultBarangay={DEFAULT_BOOKING_BARANGAY}
              defaultAddressDetail={DEFAULT_BOOKING_ADDRESS_DETAIL}
            />
          ) : showVendorMenu ? (
            <VendorMenuBooking
              ref={vendorMenuRef}
              onCartChange={setVendorCart}
              customerId={isGuestBooking ? guestCustomerId : passenger.id}
              customerName={isGuestBooking ? guestRider.otherName.trim() || 'them' : passenger.name}
              // The customer's own registered address is the starting
              // delivery address (their GPS pin replaces it at checkout when
              // the phone can give one) — the app-wide default only stands
              // in for a guest booking or a profile with no address.
              defaultProvince={(!isGuestBooking && passenger.province) || DEFAULT_BOOKING_PROVINCE}
              defaultCity={(!isGuestBooking && passenger.city) || DEFAULT_BOOKING_CITY}
              defaultBarangay={(!isGuestBooking && passenger.barangay) || DEFAULT_BOOKING_BARANGAY}
              defaultAddressDetail={(!isGuestBooking && passenger.addressDetail) || DEFAULT_BOOKING_ADDRESS_DETAIL}
              defaultContactPhone={isGuestBooking ? null : passenger.phone}
              initialVendorId={searchParams.get('vendor')}
              initialPostId={searchParams.get('post')}
              catalogTypes={catalogKind === 'goods' ? ['other_commodity'] : ['resto_food']}
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
          {/* Book a Delivery's one addition to the Book a Ride layout: what is
              being sent, right on top of the map, in a faded-yellow box. The
              intro line, its hint and the Pickup location name box are gone
              (2026-09-22). */}
          {isPadala && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-2">
              <label className="mb-1 block text-xs font-semibold text-amber-900">What are you sending? (optional)</label>
              <textarea
                value={packageNote}
                onChange={(e) => setPackageNote(e.target.value)}
                placeholder="e.g. 1 box of pasalubong, for Ate Rosa"
                rows={2}
                className="compact-input w-full rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-xs"
              />
            </div>
          )}
          {/* Not rendered here while Terminal is open — see the sharedMap
              const above, which slots this same map into the Terminal
              panel's own header instead so it never mounts twice. */}
          {sharedMap}

          {/* In map-first booking the sheet carries this instead — see
              sharedMap's sheetNote — so it is not repeated here. */}
          {/* Always there under the map. While a ride is active the trip card
              carries that ride's own row, so this one steps aside rather
              than showing a second row of dashes. */}
          {!mapFirstBooking && !activeRide && (
            <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">{bookingDetailsBar}</div>
          )}

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
              {/* The Save Places strip is gone. Saving a place now happens
                  where the address is being set — the "Save as:" chips inside
                  the pickup and destination forms — rather than in a separate
                  panel repeating the same four names further down the page. */}
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

          {/* The second Book button that used to sit here is gone. It made
              sense when the map-first sheet buried its own Book button under
              a scroll of optional rows — special trip, favourite driver,
              special pickup — but those all folded into "More options" and
              the real Book button now sits directly under the two address
              strips, one line below where a passenger's eyes already are.
              A second gold button further down the same short sheet was
              answering a problem that no longer exists. */}

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
                <span>{isPadala ? 'Delivery service fee' : 'Pabili service fee'}</span>
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
          {/* The Track Your Trip card that sat under the booking form is gone
              (2026-09-21). The same screen stays one tap away from the
              footer's Track your trip button, which every booking screen
              already shows. */}
            </>
        </section>
      )}

      <section ref={tripHistorySectionRef}>
        {/* Opened from the footer's History tile — no folded row here. */}
        {showTripHistory && (
          <div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700">
            Trip history
            <button
              type="button"
              onClick={() => setShowTripHistory(false)}
              className="text-xs font-medium text-slate-400 hover:text-slate-600"
            >
              ✕ Close
            </button>
          </div>
        )}
        {showTripHistory && (
        <div className="space-y-2">
          {visibleTripHistory.length > 0 && (
            <ClearHistoryControl
              message="Clear your trip history? Past trips disappear from this list. Your drivers, your TODA and support can still see them, and a trip under way stays."
              onClear={() => clearPassengerTripHistory(passenger.id)}
            />
          )}
          {visibleTripHistory.length === 0 && <p className="text-sm text-slate-400">No trips yet.</p>}
          {visibleTripHistory.map((r) => {
            const driver = r.driverId ? drivers.find((d) => d.id === r.driverId) : null
            const toda = driver?.todaOrgId ? todaOrganizations.find((o) => o.id === driver.todaOrgId) : null
            return (
              <div key={r.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700">
                    {rideServiceTag(r) ? `${rideServiceTag(r)!.icon} ${rideServiceTag(r)!.label} · ` : ''}
                    {formatTripRoute(r.pickup.label, r.dropoff.label)}
                  </span>
                  <StatusBadge status={r.status} />
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  ₱{r.fareEstimate}
                  {r.pabiliTip > 0 && ` + ₱${r.pabiliTip} tip`}
                  {r.tipOffer > 0 && ` + ₱${r.tipOffer} tip offer`} · {new Date(r.requestedAt).toLocaleString()}
                </div>
                {(r.serviceType === 'pabili' || r.serviceType === 'buy_medicine' || r.serviceType === 'vendor_order') && r.pabiliItems && (
                  <p className="mt-1 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">🛒 {r.pabiliItems}</p>
                )}
                {r.serviceType === 'padala' && r.packageNote && (
                  <p className="mt-1 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">📦 {r.packageNote}</p>
                )}
                {r.payment && <ReceiptCard payment={r.payment} />}
                {/* Kept after the trip, where the receipt is — the photo of a
                    plate is most wanted after the ride, not during it. */}
                {(r.safetyPhotos ?? []).length > 0 && (
                  <div className="mt-2">
                    <PhotoGallery
                      photos={r.safetyPhotos}
                      canDelete={(p) => p.takenBy === r.passengerId}
                      onDelete={(p) => removeSafetyPhoto(r.id, p.id, r.passengerId)}
                    />
                  </div>
                )}
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

      {/* What came back from Maya, said on the screen the passenger lands on.
          Dismissible rather than timed: somebody who has just paid a fare on a
          phone at a kerb should be able to keep the reference in front of them
          for as long as they want it. */}
      {payReturn && (
        <div className="flex items-start gap-2 rounded-lg border border-brand-300 bg-brand-50 px-3 py-2">
          <p className="min-w-0 flex-1 text-[11px] leading-snug text-brand-800">{payReturn}</p>
          <button
            type="button"
            onClick={() => setPayReturn(null)}
            aria-label="Dismiss"
            className="shrink-0 rounded px-1 text-brand-700 transition hover:bg-brand-100"
          >
            ✕
          </button>
        </div>
      )}

      {unpaidRide && (
        <RidePaymentForm
          open={showPayment}
          rideId={unpaidRide.id}
          onClose={() => setShowPayment(false)}
          driverName={unpaidRide.driverName ?? 'your driver'}
          fare={unpaidRide.fareEstimate}
          tip={unpaidRide.pabiliTip + (unpaidRide.tipOffer || 0)}
          total={unpaidRide.fareEstimate + unpaidRide.pabiliTip + (unpaidRide.tipOffer || 0)}
          initialMethod={unpaidRide.paymentMethod}
          kind={isVendorDeliveryRide(unpaidRide) ? 'delivery' : 'ride'}
          onConfirm={(method, referenceNo) => {
            acknowledgeRidePayment(unpaidRide.id, method, referenceNo)
            setShowPayment(false)
          }}
        />
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
      showGuardianContact
      askAboutFarDriver
    />
  )
}

// The Family page's saved members (2026-09-22): tap a name to book for them,
// ✕ to remove one, and "+ Add family member" to save a new one (name and a
// PH mobile) without booking yet.
// Six letters/digits, none that read alike (0/O, 1/I/L).
function newInviteCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

function FamilyMembersBar({
  passengerId,
  members,
  selectedName,
  selectedPhone,
  onPick,
  onBook,
  manage = true,
  allowAddRemove = manage,
}: {
  passengerId: string
  members: FamilyMember[]
  selectedName: string
  selectedPhone: string
  onPick: (m: FamilyMember) => void
  // Family home: a Book button on the picked member's panel.
  onBook?: (m: FamilyMember) => void
  // false on the booking page: no invite, QR or payer panel there.
  manage?: boolean
  // Adding and removing members, which the booking page keeps (2026-09-23).
  allowAddRemove?: boolean
}) {
  const { saveFamilyMember, removeFamilyMember } = useRides()
  const [adding, setAdding] = useState(false)
  // The app's install QR, for a family member to scan and get it on their own
  // phone (the same sheet as the menu's Share the app).
  const [showQr, setShowQr] = useState(false)
  // Which member's personal invite the QR sheet is showing (null = the plain
  // install link).
  const [inviteFor, setInviteFor] = useState<FamilyMember | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const digits = (s: string) => s.replace(/\D/g, '')
  const localPhone = digits(phone).startsWith('63') ? `0${digits(phone).slice(2)}` : digits(phone)
  // A child may have no phone — the driver calls the parent instead.
  const canSave = name.trim().length > 0 && (localPhone.length === 0 || /^09\d{9}$/.test(localPhone))
  function save() {
    if (!canSave) return
    const member = { id: `fam-${Date.now()}`, name: name.trim(), phone: localPhone, inviteCode: newInviteCode(), ownerPays: false }
    saveFamilyMember(passengerId, member)
    onPick(member)
    setName('')
    setPhone('')
    setAdding(false)
  }
  // Members saved before invites existed get their code the first time it is needed.
  function withCode(m: FamilyMember): FamilyMember {
    if (m.inviteCode) return m
    const next = { ...m, inviteCode: newInviteCode() }
    saveFamilyMember(passengerId, next)
    return next
  }
  const selected = members.find((m) => selectedName.trim() === m.name && digits(selectedPhone) === digits(m.phone))
  return (
    <div className="space-y-1.5">
      <div className="-mx-0.5 flex flex-wrap gap-1 px-0.5">
        {members.map((m) => {
          const on = selected?.id === m.id
          return (
            <span
              key={m.id}
              className={`flex shrink-0 items-center rounded-full border text-[11px] font-semibold transition ${
                on ? 'border-brand-600 bg-brand-600 text-white' : 'border-amber-300 bg-white text-amber-900'
              }`}
            >
              <button type="button" onClick={() => onPick(m)} className="py-1 pl-2.5 pr-1.5">
                {m.passengerId ? '✓ ' : ''}
                {m.name}
              </button>
              {allowAddRemove && (
                <button
                  type="button"
                  onClick={() => removeFamilyMember(passengerId, m.id)}
                  aria-label={`Remove ${m.name}`}
                  title={`Remove ${m.name}`}
                  className={`py-1 pl-0.5 pr-2 text-[10px] ${on ? 'text-white/80' : 'text-amber-700/70'} hover:opacity-100`}
                >
                  ✕
                </button>
              )}
            </span>
          )
        })}
        {allowAddRemove && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="shrink-0 rounded-full border border-dashed border-amber-400 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
          >
            + Add family member
          </button>
        )}
        {manage && (
          <button
            type="button"
            onClick={() => {
              setInviteFor(null)
              setShowQr(true)
            }}
            title="Show the QR code so a family member can install the app"
            className="shrink-0 rounded-full border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
          >
            📲 QR
          </button>
        )}
      </div>
      {/* The picked member: their personal invite, who pays their rides, and
          whether they have joined with their own phone yet. */}
      {selected && manage && (
        <div className="space-y-1.5 rounded-lg border border-amber-200 bg-white p-1.5 text-[11px]">
          {onBook && (
            <button
              type="button"
              onClick={() => onBook(selected)}
              className="w-full rounded-lg bg-brand-600 py-2 text-xs font-bold text-white hover:bg-brand-700"
            >
              🛺 Book a ride for {selected.name.split(' ')[0]}
            </button>
          )}
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">
              {selected.name} · {selected.passengerId ? '✓ has the app, linked' : 'not on the app yet'}
            </span>
            <button
              type="button"
              onClick={() => {
                setInviteFor(withCode(selected))
                setShowQr(true)
              }}
              className="shrink-0 rounded-full bg-brand-600 px-2.5 py-1 font-semibold text-white hover:bg-brand-700"
            >
              📲 Invite {selected.name.split(' ')[0]}
            </button>
          </div>
          {/* What this member's own account may do (2026-09-23) — the safe
              set for a child, opened up one switch at a time. */}
          <MemberLimitsPanel passengerId={passengerId} member={selected} />
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Rides paid by</span>
            {([false, true] as const).map((mine) => (
              <button
                key={String(mine)}
                type="button"
                onClick={() => saveFamilyMember(passengerId, { ...selected, ownerPays: mine })}
                className={`rounded-full border px-2.5 py-0.5 font-semibold ${
                  !!selected.ownerPays === mine ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-slate-600'
                }`}
              >
                {mine ? 'Me' : selected.name.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>
      )}
      {showQr &&
        (inviteFor?.inviteCode ? (
          <ShareAppPanel
            onClose={() => setShowQr(false)}
            url={familyInviteUrl(inviteFor.inviteCode)}
            title={`Invite ${inviteFor.name} to the Family`}
            subtitle={`${inviteFor.name} scans this (or opens the link) to install the app and sign up — their account is linked to your family. Code ${inviteFor.inviteCode}.`}
          />
        ) : (
          <ShareAppPanel onClose={() => setShowQr(false)} />
        ))}
      {adding && (
        <div className="space-y-1.5 rounded-lg border border-amber-200 bg-white p-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              className="compact-input min-w-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Mobile (optional)"
              inputMode="tel"
              className="compact-input min-w-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
            />
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={!canSave}
              onClick={save}
              className="flex-1 rounded-lg bg-brand-600 py-1.5 text-xs font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false)
                setName('')
                setPhone('')
              }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// The rides a passenger booked for family members (Book a Ride → Family),
// while they are under way — one row each, and the live trip map on tap,
// the same watching view a parent gets for a child (TripMonitor watching).
// The switches a parent sets for one family member's own account. Shown
// under the picked member on the Family page; saved on the member.
function MemberLimitsPanel({ passengerId, member }: { passengerId: string; member: FamilyMember }) {
  const { saveFamilyMember, passengers } = useRides()
  const [open, setOpen] = useState(false)
  const account = member.passengerId ? passengers.find((p) => p.id === member.passengerId) : undefined
  const limits = member.limits ?? (account && account.age >= MINOR_AGE ? ADULT_MEMBER_LIMITS : MINOR_DEFAULT_LIMITS)
  const set = (patch: Partial<FamilyMemberLimits>) =>
    saveFamilyMember(passengerId, { ...member, limits: { ...limits, ...patch } })
  const row = (label: string, note: string, on: boolean, toggle: () => void) => (
    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white p-1.5">
      <input type="checkbox" checked={on} onChange={toggle} className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-slate-800">{label}</span>
        <span className="block text-[10px] leading-snug text-slate-500">{note}</span>
      </span>
    </label>
  )
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700"
      >
        <span>🔒 What {member.name.split(' ')[0]} can do on their own phone</span>
        <span className="text-slate-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="space-y-1">
          <p className="rounded-lg bg-emerald-50 px-2 py-1 text-[10px] leading-snug text-emerald-900">
            Always on: you see every trip live, Safety and SOS, and the driver calls and chats with you — never the child.
          </p>
          {row('Ask me first', 'Their ride waits for your approval before any driver is offered it.', limits.askFirst, () =>
            set({ askFirst: !limits.askFirst }),
          )}
          {row('Our trusted drivers only', 'Their rides go to your family drivers first.', limits.trustedOnly, () =>
            set({ trustedOnly: !limits.trustedOnly }),
          )}
          {row(
            `No booking ${limits.curfewFrom}–${limits.curfewTo}`,
            'Night curfew — they cannot book during these hours.',
            limits.curfew,
            () => set({ curfew: !limits.curfew }),
          )}
          {limits.curfew && (
            <div className="flex items-center gap-1.5 pl-6 text-[10px] text-slate-600">
              From
              <input
                type="time"
                value={limits.curfewFrom}
                onChange={(e) => set({ curfewFrom: e.target.value })}
                className="rounded border border-slate-300 px-1 py-0.5"
              />
              to
              <input
                type="time"
                value={limits.curfewTo}
                onChange={(e) => set({ curfewTo: e.target.value })}
                className="rounded border border-slate-300 px-1 py-0.5"
              />
            </div>
          )}
          {row('Quick replies only in chat', 'They can tap ready-made messages to the driver, not type.', limits.quickChatOnly, () =>
            set({ quickChatOnly: !limits.quickChatOnly }),
          )}
          {row('Allow Food Order', 'Ordering meals from partner stores.', limits.food, () => set({ food: !limits.food }))}
          {row('Allow PaDeliver', 'Sending and buying goods.', limits.padeliver, () => set({ padeliver: !limits.padeliver }))}
        </div>
      )}
    </div>
  )
}

function FamilyTrips({ bookerId }: { bookerId: string }) {
  const { rides, passengers, acknowledgeRidePayment, approveFamilyRide, cancelRide } = useRides()
  const [openId, setOpenId] = useState<string | null>(null)
  const [payingId, setPayingId] = useState<string | null>(null)
  // Family members who joined with their own phone (their invite linked them).
  const linkedIds = new Set(
    (passengers.find((p) => p.id === bookerId)?.familyMembers ?? []).map((m) => m.passengerId).filter(Boolean) as string[],
  )
  // Trips this account booked for somebody else: a family member, or a guest
  // booked through Someone (2026-09-25). A Someone ride belongs to a guest
  // id, so without this the person who booked it — the one the driver rings,
  // when the rider is a child — had no way to follow it at all.
  const isFamilyRide = (r: Ride) =>
    r.familyBookerId === bookerId || r.bookedByPassengerId === bookerId || linkedIds.has(r.passengerId)
  const live = rides.filter(
    (r) => isFamilyRide(r) && (r.status === 'requested' || r.status === 'driver_arriving' || r.status === 'ongoing'),
  )
  // Rides this owner pays for ("Rides paid by: Me"), finished and not yet settled.
  const toPay = rides.filter((r) => r.familyPayerId === bookerId && r.status === 'completed' && !r.paymentAcknowledged)
  const paying = toPay.find((r) => r.id === payingId)
  // A child's ride waiting on this parent ("Ask me first"): no driver has
  // been offered it yet, so approving is what sends it out.
  const toApprove = live.filter((r) => r.awaitingFamilyApproval)
  if (live.length === 0 && toPay.length === 0) return null
  const statusLabel = (r: Ride) =>
    r.awaitingFamilyApproval
      ? 'Waiting for you to approve'
      : r.status === 'requested' ? 'Finding a driver' : r.status === 'driver_arriving' ? `${r.driverName ?? 'Driver'} is on the way` : 'On the way to the destination'
  return (
    <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/80 p-2.5 shadow-sm">
      {/* Family, or anyone else this account booked for. */}
      <p className="flex items-center gap-1.5 text-sm font-bold text-amber-900">
        {live.some((r) => r.familyBookerId === bookerId) || toPay.length > 0 ? (
          <>
            👨‍👩‍👧 Family trips
            <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">1-year free promo</span>
          </>
        ) : (
          <>🛺 Trips you booked</>
        )}
      </p>
      {toApprove.map((r) => (
        <div key={r.id} className="rounded-lg border-2 border-amber-400 bg-white px-2.5 py-2">
          <p className="text-sm font-semibold text-slate-800">{r.passengerName} wants to book a ride</p>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-600">
            {formatAddressLine(r.pickup.label)} → {formatAddressLine(r.dropoff.label)} · ₱{r.fareEstimate}
          </p>
          <div className="mt-1.5 flex gap-1.5">
            <button
              type="button"
              onClick={() => approveFamilyRide(r.id)}
              className="flex-1 rounded-lg bg-brand-600 py-2 text-xs font-bold text-white hover:bg-brand-700"
            >
              ✅ Approve — find a driver
            </button>
            <button
              type="button"
              onClick={() => cancelRide(r.id)}
              className="rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50"
            >
              Decline
            </button>
          </div>
        </div>
      ))}
      {toPay.map((r) => {
        const total = r.fareEstimate + r.pabiliTip + (r.tipOffer || 0)
        return (
          <div key={r.id} className="flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-2.5 py-2">
            <span className="min-w-0 flex-1 text-[11px] text-slate-600">
              <span className="block truncate text-sm font-semibold text-slate-800">{r.passengerName}'s trip is done</span>
              to {formatAddressLine(r.dropoff.label)} · you pay
            </span>
            <button
              type="button"
              onClick={() => setPayingId(r.id)}
              className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700"
            >
              Pay ₱{total}
            </button>
          </div>
        )
      })}
      {paying && (
        <RidePaymentForm
          open
          rideId={paying.id}
          onClose={() => setPayingId(null)}
          driverName={paying.driverName ?? 'the driver'}
          fare={paying.fareEstimate}
          tip={paying.pabiliTip + (paying.tipOffer || 0)}
          total={paying.fareEstimate + paying.pabiliTip + (paying.tipOffer || 0)}
          initialMethod={paying.paymentMethod}
          kind="ride"
          onConfirm={(method, referenceNo) => {
            acknowledgeRidePayment(paying.id, method, referenceNo)
            setPayingId(null)
          }}
        />
      )}
      {live.map((r) => (
        <div key={r.id} className="rounded-lg border border-amber-200 bg-white">
          <button
            type="button"
            onClick={() => setOpenId(openId === r.id ? null : r.id)}
            aria-expanded={openId === r.id}
            className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-800">{r.passengerName}</span>
              <span className="block truncate text-[11px] text-slate-500">
                {statusLabel(r)} · to {formatAddressLine(r.dropoff.label)}
              </span>
            </span>
            <span className="shrink-0 text-[11px] font-semibold text-brand-600">{openId === r.id ? 'Hide ▲' : 'Track live ▼'}</span>
          </button>
          {openId === r.id && (
            <div className="border-t border-amber-100 p-1.5">
              <TripMonitor
                title={`${r.passengerName}'s trip`}
                ride={r}
                sosActorId={bookerId}
                sosLabel="SOS — Emergency"
                watching
              />
            </div>
          )}
        </div>
      ))}
    </section>
  )
}

// "Mark as my favorite" on a finished ride's rating: the favourite driver is
// offered a booking first (see nextQueueOffer) and can be asked for from the
// waiting strip. Saved to whoever booked — the parent, or the passenger.
function FavoriteDriverToggle({ ride, driverName }: { ride: Ride; driverName: string }) {
  const { passengers, parents, setFavoriteDriver, setParentFavoriteDriver } = useRides()
  if (!ride.driverId) return null
  const current = ride.bookedByParentId
    ? parents.find((p) => p.id === ride.bookedByParentId)?.favoriteDriverId ?? null
    : passengers.find((p) => p.id === ride.passengerId)?.favoriteDriverId ?? null
  const isFavorite = current === ride.driverId
  const set = (driverId: string | null) =>
    ride.bookedByParentId ? setParentFavoriteDriver(ride.bookedByParentId, driverId) : setFavoriteDriver(ride.passengerId, driverId)
  return (
    <button
      type="button"
      aria-pressed={isFavorite}
      onClick={() => set(isFavorite ? null : ride.driverId)}
      className={`w-full rounded-lg border py-1.5 text-xs font-semibold transition ${
        isFavorite ? 'border-gold-500 bg-[#ffe066] text-navy-900' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
      }`}
    >
      {isFavorite ? `★ ${driverName} is your favorite driver` : `☆ Mark ${driverName} as my favorite`}
    </button>
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
        <FavoriteDriverToggle ride={ride} driverName={driverName} />
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
        <div className="mt-1.5">
          <FavoriteDriverToggle ride={ride} driverName={driverName} />
        </div>
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
