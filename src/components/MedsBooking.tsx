import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRides } from '../context/RideContext'
import { PAYMENT_METHODS } from '../mock/data'
import { createCustomLocation, resolvePhAddress, type PhAddressTags } from '../lib/customLocation'
import { getCurrentGeoPosition } from '../lib/geo'
import { reverseGeocode } from '../lib/geocode'
import { BarangayAddressPicker } from './BarangayAddressPicker'
import { DocumentUploadField } from './DocumentUploadField'
import { MultiImageUploadField } from './MultiImageUploadField'
import { RealLiveMap, type MapPoint } from './RealLiveMap'
import { MedsItemsBrandInput, type MedsItemRow } from './MedsItemsBrandInput'
import { OrderChat } from './OrderChat'
import { TripMonitor } from './TripMonitor'
import type { MedsOrder, MockLocation, PaymentMethod, Pharmacy } from '../types'

function PharmacyOptionRow({
  pharmacy,
  selected,
  onSelect,
}: {
  pharmacy: Pharmacy
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-md px-2 py-1.5 text-left transition ${
        selected ? 'bg-brand-50 ring-1 ring-brand-300' : 'hover:bg-slate-50'
      }`}
    >
      <span className="block break-words text-xs font-medium text-slate-700">
        {pharmacy.isOpen ? '🟢' : '⚪'} {pharmacy.name}
      </span>
      <span className="mt-0.5 block break-words text-[11px] text-slate-400">
        {pharmacy.barangay}, {pharmacy.city}
      </span>
    </button>
  )
}

// An order still counts as "in flight" (blocks starting a new one, shows in
// the active-order slot) at any pre-terminal status.
const ACTIVE_STATUSES = new Set(['pending_confirmation', 'quoted', 'confirmed', 'ready_for_pickup'])

// TODARIDE MEDS — the customer-facing ordering flow: type an items list
// once (Item/Brand/Qty, same table pattern as Pabili), then choose how it
// gets fulfilled — "Order Direct to Pharmacy" auto-sends the list as a
// quote request to a chosen partner pharmacy (who prices each line and
// sends a firm quote back — see PharmacyPortalPage.tsx's QuoteOrderCard),
// or "Driver will buy at Pharmacy" dispatches a driver straight away to buy
// in person at a named pharmacy, same shape as a Pabili errand. Self-
// contained (its own address/items state) rather than sharing
// PassengerPage/QuickBookingForm's Ride/Pabili state, since a medicine
// order has a genuinely different shape (line items, a pharmacy
// quote/checkout step) instead of a single pickup/dropoff pair. Once an
// order is dispatched (either the pharmacy books the ride, or the customer
// books their own, or the driver-buys-direct Ride is created), RideContext
// creates/owns a real Ride and this component hands off to the existing
// TripMonitor for delivery tracking — no new tracking UI here.
export function MedsBooking({
  customerId,
  customerName,
  defaultProvince,
  defaultCity,
  defaultBarangay,
  defaultAddressDetail,
  onOrderReadyChange,
}: {
  customerId: string
  customerName: string
  defaultProvince: string
  defaultCity: string
  defaultBarangay: string
  defaultAddressDetail: string
  // The order lives in here, so the page above cannot see whether anything
  // has been ordered — it is told, so it can decide whether booking a
  // tricycle is a sensible thing to offer yet.
  onOrderReadyChange?: (ready: boolean) => void
}) {
  const {
    rides,
    pharmacies,
    medsOrders,
    createMedsOrder,
    cancelMedsOrder,
    acceptMedsQuote,
    requestRide,
    cancelRide,
  } = useRides()
  // Shared items list — typed once, used by both fulfillment modes below
  // (the quote request sent to a chosen pharmacy, or the plain-text list a
  // "driver buys direct" Ride shows on the driver's own screen).
  const navigate = useNavigate()
  const [items, setItems] = useState('')
  const [itemRows, setItemRows] = useState<MedsItemRow[]>([])
  // Bumping this remounts MedsItemsBrandInput fresh (clearing its internal
  // rows) after a successful request — see PassengerPage.tsx's identical
  // pabiliItemsResetKey pattern for why the child needs this signal.
  const [itemsResetKey, setItemsResetKey] = useState(0)
  const [prescriptionDataUrls, setPrescriptionDataUrls] = useState<string[]>([])
  const [deliveryAddress, setDeliveryAddress] = useState<MockLocation | null>(null)
  // Exact-GPS pin for the delivery address — an alternative to the
  // province/city/barangay dropdowns, for a spot that doesn't map cleanly to
  // a barangay (deep inside CLSU, an unnamed sitio road).
  const [deliveryGpsStatus, setDeliveryGpsStatus] = useState<'idle' | 'locating' | 'done' | 'error'>('idle')
  const [deliveryGpsError, setDeliveryGpsError] = useState('')
  // Which of the two fulfillment tabs is active — "catalog" auto-sends the
  // items list as a quote request to whichever partner pharmacy the
  // customer picks next; "direct" dispatches a driver straight away to buy
  // in person at a named (not necessarily partner) pharmacy.
  const [orderMode, setOrderMode] = useState<'catalog' | 'direct'>('catalog')
  // Exact-GPS pin for the delivery address — an alternative to the
  // province/city/barangay dropdowns above, for when the customer's real
  // spot doesn't map cleanly to a barangay pick (e.g. deep inside CLSU).
  // Catalog mode: picking a pharmacy (search result, list row, or map pin)
  // only marks it as selected now — it used to fire the quote request
  // immediately on click, which felt accidental from a single tap. The
  // customer now confirms with an explicit "Ask for Price" button below.
  const [selectedPharmacyId, setSelectedPharmacyId] = useState<string | null>(null)
  const [pharmacyListOpen, setPharmacyListOpen] = useState(false)
  const [pharmacySearch, setPharmacySearch] = useState('')
  // The delivery address opens on request. Its fields are the tallest block
  // on the screen and the profile address already answers them for most
  // orders, so it starts closed and the strip says what is behind it.
  const [deliverOpen, setDeliverOpen] = useState(false)
  const [dismissedOrderIds, setDismissedOrderIds] = useState<Set<string>>(new Set())
  // Starts collapsed, same as PassengerPage's own "Trip history" — a long,
  // low-priority list that shouldn't push the active order/compose form down.
  const [showMedsHistory, setShowMedsHistory] = useState(false)
  // "Driver buys it directly" — the customer names a pharmacy that isn't
  // (or might not be) a TODARIDE MEDS partner, and asks the driver to buy
  // the items above there in person, same shape as a Pabili errand. This
  // skips the MedsOrder/quote pipeline entirely and dispatches a real Ride
  // straight away via requestRide — the driver's own ride screen (which
  // already shows pabiliItems + pickup name prominently) doubles as what
  // they show the cashier.
  const [directPharmacyName, setDirectPharmacyName] = useState('')
  const [directPharmacyLocation, setDirectPharmacyLocation] = useState<MockLocation | null>(null)
  const [directPaymentMethod, setDirectPaymentMethod] = useState<PaymentMethod>('cash')
  // The "Pharmacy address" picker below is normally free-typed, so it only
  // reads its default* props once on mount — picking a partner pharmacy from
  // the map/list instead needs to force it to re-seed with that pharmacy's
  // actual address. Bumping this key remounts it fresh with directAddressSeed
  // as the new defaults (same remount-to-reseed pattern itemsResetKey uses).
  const [directAddressResetKey, setDirectAddressResetKey] = useState(0)
  const [directAddressSeed, setDirectAddressSeed] = useState({
    province: defaultProvince,
    city: defaultCity,
    barangay: '',
    addressDetail: '',
  })

  const myOrders = medsOrders.filter((o) => o.customerId === customerId)
  const activeOrder = myOrders.find((o) => {
    if (dismissedOrderIds.has(o.id)) return false
    if (ACTIVE_STATUSES.has(o.status)) return true
    if (o.status !== 'dispatched') return false
    // A dispatched order's own status never changes again — its linked
    // Ride is the real source of truth from here. If that Ride ended up
    // declined/cancelled (e.g. no driver ever accepted it), the order isn't
    // "in flight" anymore either, even though its own status still literally
    // reads 'dispatched' — without this it'd block a new order forever.
    const linkedRideStatus = rides.find((r) => r.id === o.linkedRideId)?.status
    return linkedRideStatus !== 'completed' && linkedRideStatus !== 'cancelled' && linkedRideStatus !== 'declined'
  })
  const pastOrders = myOrders.filter((o) => o.id !== activeOrder?.id)
  // A "driver buys it directly" ride has no MedsOrder behind it at all
  // (requestRide is called straight from handleRequestDirect below) — track
  // it separately so it still blocks starting a second order and still gets
  // tracking, same as a catalog-ordered one.
  const activeDirectRide = !activeOrder
    ? rides.find(
        (r) =>
          r.passengerId === customerId &&
          r.serviceType === 'buy_medicine' &&
          !medsOrders.some((o) => o.linkedRideId === r.id) &&
          !dismissedOrderIds.has(r.id) &&
          !['completed', 'cancelled', 'declined'].includes(r.status),
      )
    : undefined

  const partnerPharmacies = pharmacies.filter((p) => p.businessType === 'pharmacy')
  // The city being delivered to — falls back to the customer's own city
  // before an address has been set.
  const deliveryCity = deliveryAddress?.city || defaultCity
  const accreditedInCity = partnerPharmacies.filter(
    (p) => p.verificationStatus === 'approved' && p.city === deliveryCity,
  )
  const otherPharmacies = partnerPharmacies.filter((p) => !accreditedInCity.some((a) => a.id === p.id))
  const pharmacyQuery = pharmacySearch.trim().toLowerCase()
  const matchesQuery = (p: Pharmacy) =>
    !pharmacyQuery ||
    p.name.toLowerCase().includes(pharmacyQuery) ||
    p.barangay.toLowerCase().includes(pharmacyQuery) ||
    p.city.toLowerCase().includes(pharmacyQuery)
  const shownAccredited = accreditedInCity.filter(matchesQuery)
  const shownOthers = otherPharmacies.filter(matchesQuery)
  function resetShared() {
    setItems('')
    setItemRows([])
    setItemsResetKey((k) => k + 1)
    setDeliveryAddress(null)
    setDeliveryGpsStatus('idle')
    setPrescriptionDataUrls([])
    setSelectedPharmacyId(null)
  }

  async function handleAddressResolve(address: PhAddressTags) {
    const location = await resolvePhAddress(address)
    setDeliveryAddress(location)
  }

  // BarangayAddressPicker shows "✓ Location set" the moment it is seeded with
  // a barangay, and deliberately does not re-resolve values it was handed —
  // so with nothing resolving them here, the picker read as answered while
  // deliveryAddress was still null and "Ask for Price" sat disabled with no
  // stated reason. Resolve the profile address once at mount so what the
  // control claims and what this component holds are the same thing.
  useEffect(() => {
    if (!defaultBarangay) return
    let cancelled = false
    resolvePhAddress({
      province: defaultProvince,
      city: defaultCity,
      barangay: defaultBarangay,
      addressDetail: defaultAddressDetail,
    })
      .then((location) => {
        if (!cancelled) setDeliveryAddress((prev) => prev ?? location)
      })
      .catch(() => {
        // Leave it unset: the picker is still there to answer with.
      })
    return () => {
      cancelled = true
    }
    // Seeded once from the profile — later edits come through the picker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const itemsSet = itemRows.length > 0
  const hasPrescription = prescriptionDataUrls.length > 0
  const canBrowsePharmacies = (itemsSet || hasPrescription) && !!deliveryAddress
  const orderReady = itemsSet || hasPrescription
  useEffect(() => {
    onOrderReadyChange?.(orderReady)
    // onOrderReadyChange is a stable callback from the parent, not part of
    // what "ready" means.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderReady])
  const canRequestQuote = canBrowsePharmacies && !!selectedPharmacyId

  async function handlePinDeliveryGps() {
    setDeliveryGpsStatus('locating')
    setDeliveryGpsError('')
    try {
      const gps = await getCurrentGeoPosition()
      const label = (await reverseGeocode(gps)) ?? `Pinned location (${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)})`
      setDeliveryAddress(createCustomLocation(label, gps))
      setDeliveryGpsStatus('done')
    } catch (err) {
      setDeliveryGpsStatus('error')
      setDeliveryGpsError(err instanceof Error ? err.message : 'Could not get your location.')
    }
  }

  async function handleDirectPharmacyResolve(address: PhAddressTags) {
    const location = await resolvePhAddress(address)
    // Keeps the geocoded gps/coords but shows the pharmacy's actual name
    // (not the auto-generated address label) everywhere this pickup shows —
    // the driver's ride card, the passenger's own TripMonitor.
    setDirectPharmacyLocation({ ...location, label: directPharmacyName.trim() || location.label })
  }

  // Picking a partner pharmacy from the list/map instead of typing one —
  // same MockLocation shape buildMedsDeliveryRide already builds from a
  // Pharmacy record, so it just skips the manual name+address entry below.
  function handleSelectDirectPharmacy(pharmacyId: string) {
    const pharmacy = partnerPharmacies.find((p) => p.id === pharmacyId)
    if (!pharmacy) return
    setDirectPharmacyName(pharmacy.name)
    setDirectPharmacyLocation({
      id: pharmacy.id,
      label: pharmacy.name,
      coords: pharmacy.coords,
      gps: pharmacy.locationGps ?? { lat: 15.7940977, lng: 120.9905849 },
      province: pharmacy.province,
      city: pharmacy.city,
      barangay: pharmacy.barangay,
    })
    // Re-seeds and remounts the "Pharmacy address" picker below with this
    // pharmacy's actual province/city/barangay/street, instead of leaving it
    // showing whatever it happened to have before (or the customer's own
    // default address) while directPharmacyLocation silently disagrees.
    setDirectAddressSeed({
      province: pharmacy.province,
      city: pharmacy.city,
      barangay: pharmacy.barangay,
      addressDetail: pharmacy.addressDetail,
    })
    setDirectAddressResetKey((k) => k + 1)
  }

  const canRequestDirect = items.trim() && directPharmacyName.trim() && !!directPharmacyLocation && !!deliveryAddress

  function handleRequestDirect() {
    if (!canRequestDirect || !directPharmacyLocation || !deliveryAddress) return
    requestRide({
      passengerId: customerId,
      passengerName: customerName,
      pickup: directPharmacyLocation,
      dropoff: deliveryAddress,
      paymentMethod: directPaymentMethod,
      isStudentRide: false,
      isPwdSeniorRide: false,
      pickupGps: null,
      passengerCount: 1,
      serviceType: 'buy_medicine',
      pabiliItems: items.trim(),
      prescriptionDataUrls,
    })
    setDirectPharmacyName('')
    setDirectPharmacyLocation(null)
    resetShared()
  }

  // Picking a pharmacy (search result, map pin, or list row) only selects
  // it now — see the "Ask for Price" button below, which is the explicit
  // confirm step. Selecting used to fire the quote request on the same tap,
  // which read as an accidental submit rather than a deliberate choice.
  function handleSelectPharmacyForQuote(pharmacyId: string) {
    setSelectedPharmacyId(pharmacyId)
  }

  const selectedPharmacyForQuote = partnerPharmacies.find((p) => p.id === selectedPharmacyId)

  // Sends the shared items list as a quote request to whichever pharmacy is
  // selected above. Each typed row becomes its own line item so the
  // pharmacy can price it individually when it sends its quote back; price
  // starts at ₱0 since there's no catalog match to default from anymore. An
  // itemized list isn't required if a prescription photo is attached — the
  // pharmacy can read it directly and either call the customer or just
  // write in a total themselves (see QuoteOrderCard's no-items path).
  function handleRequestQuote() {
    if (!canRequestQuote || !selectedPharmacyId || !deliveryAddress) return
    createMedsOrder({
      customerId,
      customerName,
      pharmacyId: selectedPharmacyId,
      items: itemRows.map((r, i) => ({
        productId: `custom-${Date.now()}-${i}`,
        name: [
          r.item.trim(),
          r.brand.trim() ? `(${r.brand.trim()})` : '',
          r.qty.trim() ? `- ${r.qty.trim()}${r.unit.trim() ? ` ${r.unit.trim()}` : ''}` : '',
        ]
          .filter(Boolean)
          .join(' '),
        quantity: 1,
        // Customer's own estimate, if they gave one — just a starting point,
        // the pharmacy sends the real per-item price with its quote.
        unitPrice: parseFloat(r.unitCost) || 0,
        note: null,
      })),
      deliveryAddress,
      prescriptionDataUrls,
      paymentMethod: 'gcash',
      // Booking the delivery tricycle is always the customer's own
      // responsibility, once the order is ready — the pharmacy never
      // dispatches a ride on their behalf.
      deliveryMode: 'self_book',
    })
    resetShared()
  }

  // A pending/quoted/confirmed/ready/dispatched-and-still-active order takes
  // over this whole slot — same "current trip" pattern PassengerPage already
  // uses for a regular ride, so the customer can't accidentally start a
  // second order while one is already in flight.
  if (activeOrder) {
    return (
      <ActiveOrderCard
        order={activeOrder}
        onCancel={() => cancelMedsOrder(activeOrder.id)}
        onDismiss={() => setDismissedOrderIds((prev) => new Set(prev).add(activeOrder.id))}
        onAcceptQuote={(method, proof, mode) => acceptMedsQuote(activeOrder.id, method, proof, mode)}
        onBookOwnRide={() => navigate(`/book/meds/${activeOrder.id}`)}
      />
    )
  }

  // A "driver buys it directly" request — no MedsOrder, no quote step, just
  // a normal Ride the driver fulfills in person at the named pharmacy.
  if (activeDirectRide) {
    return (
      <TripMonitor
        title="Your medicine delivery"
        ride={activeDirectRide}
        sosActorId={customerId}
        sosLabel="SOS — Something's wrong"
        showCancel
        onCancel={() => cancelRide(activeDirectRide.id)}
        onDismiss={() => setDismissedOrderIds((prev) => new Set(prev).add(activeDirectRide.id))}
      />
    )
  }

  // The single "Ask for Price" submit, at the bottom of the page. Earlier
  // versions repeated it under the item box and again inside the pharmacy
  // panel; three copies of one button is how people press the disabled one
  // and conclude the screen is broken.
  // Catalog-mode only; "direct" mode has its own "Request driver pickup" CTA.
  // The two ends of the delivery, on a map under the submit: the pharmacy it
  // is coming from and the address it is going to. Each pin appears as soon as
  // its half is filled in, so the map doubles as a check on what you picked
  // before you commit — and becomes the live tracking view once a driver is
  // carrying the order.
  const trackingPoints: MapPoint[] = []
  if (selectedPharmacyForQuote?.locationGps) {
    trackingPoints.push({
      id: selectedPharmacyForQuote.id,
      gps: selectedPharmacyForQuote.locationGps,
      color: '#0f766e',
      label: selectedPharmacyForQuote.name,
      icon: 'pharmacy',
    })
  }
  if (deliveryAddress) {
    trackingPoints.push({
      id: 'meds-dropoff',
      gps: deliveryAddress.gps,
      color: '#b45309',
      label: `Deliver to: ${deliveryAddress.label}`,
    })
  }
  const trackingRoute = trackingPoints.length === 2 ? trackingPoints.map((p) => p.gps) : undefined
  // Nothing picked yet: the partner pharmacies in view, so the map still
  // answers "where can this come from" instead of not being there at all.
  const fallbackPharmacyPoints: MapPoint[] = pharmacies
    .filter((p) => p.locationGps && p.verificationStatus === 'approved')
    .slice(0, 12)
    .map((p) => ({
      id: p.id,
      gps: p.locationGps!,
      color: '#94a3b8',
      label: p.name,
      icon: 'pharmacy' as const,
    }))
  const mapPoints = trackingPoints.length > 0 ? trackingPoints : fallbackPharmacyPoints

  const askForPriceShortcut = orderMode === 'catalog' && (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={handleRequestQuote}
        disabled={!canRequestQuote}
        className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        Ask for Price
      </button>

      {mapPoints.length > 0 && (
        <div>
          <RealLiveMap points={mapPoints} routeLine={trackingRoute} routeIsReal={false} />
          <p className="mt-1 text-[11px] text-slate-400">
            {trackingPoints.length === 2
              ? 'Pharmacy → your delivery address. Your driver appears here once the order is on its way.'
              : trackingPoints.length === 1
                ? 'Pick a pharmacy and a delivery address to see the full route.'
                : 'Partner pharmacies near you — pick one above and set a delivery address to see the route.'}
          </p>
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-3">
      {/* How the order gets fulfilled comes first: it is the branch that
          decides what the rest of this form even asks for, so choosing it
          before typing anything avoids filling in fields the other mode
          throws away. */}
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setOrderMode('catalog')}
          className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${
            orderMode === 'catalog' ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-500'
          }`}
        >
          🏥 Order Direct to Pharmacy
        </button>
        <button
          type="button"
          onClick={() => setOrderMode('direct')}
          className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${
            orderMode === 'direct' ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-500'
          }`}
        >
          🚗 Driver will buy at Pharmacy
        </button>
      </div>

      <p className="text-xs font-semibold text-slate-600">🧾 Create Meds Order</p>

      {/* Both fulfilment modes need this same list. */}
      <MedsItemsBrandInput key={itemsResetKey} value={items} onChange={setItems} onRowsChange={setItemRows} />

      <MultiImageUploadField
        label="Prescription (optional)"
        addLabel="📄 Upload Prescription"
        dataUrls={prescriptionDataUrls}
        onChange={setPrescriptionDataUrls}
      />

      <div className="space-y-2">
        {/* The bar IS the dropdown: folding a panel open to reveal a second
            select underneath was two taps to do one thing, and two controls
            answering the same question. Direct mode keeps the fold — it needs
            a typed name and an address, which no dropdown can hold. */}
        {orderMode === 'catalog' ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setPharmacyListOpen((v) => !v)}
              className="flex w-full items-start justify-between gap-2 rounded-lg bg-pickup-accent px-3 py-2 text-left text-xs font-semibold text-white shadow-sm filter transition hover:brightness-90"
            >
              <span className="min-w-0 break-words">
                <span className="block text-[9px] font-semibold uppercase tracking-wide text-white/75">
                  Pick up from
                </span>
                <span className={selectedPharmacyForQuote ? 'text-white' : 'text-white/70'}>
                  {selectedPharmacyForQuote ? `💊 ${selectedPharmacyForQuote.name}` : '💊 Choose a Pharmacy'}
                </span>
              </span>
              <span aria-hidden className="mt-0.5 shrink-0 text-[10px]">
                {pharmacyListOpen ? '▲' : '▼'}
              </span>
            </button>

            {pharmacyListOpen && (
              <div className="rounded-lg border border-slate-200 bg-white p-1">
                <input
                  value={pharmacySearch}
                  onChange={(e) => setPharmacySearch(e.target.value)}
                  placeholder="Type a pharmacy name"
                  className="mb-1 w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs"
                />
                <div className="max-h-72 space-y-1 overflow-y-auto">
                {partnerPharmacies.length === 0 && (
                  <p className="p-2 text-xs text-slate-400">No participating pharmacy yet.</p>
                )}
                {partnerPharmacies.length > 0 && shownAccredited.length === 0 && shownOthers.length === 0 && (
                  <p className="p-2 text-xs text-slate-400">No pharmacy matches "{pharmacySearch.trim()}".</p>
                )}
                {shownAccredited.length > 0 && (
                  <p className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Accredited in {deliveryCity || 'your city'}
                  </p>
                )}
                {shownAccredited.map((p) => (
                  <PharmacyOptionRow
                    key={p.id}
                    pharmacy={p}
                    selected={p.id === selectedPharmacyId}
                    onSelect={() => {
                      handleSelectPharmacyForQuote(p.id)
                      setPharmacyListOpen(false)
                      setPharmacySearch('')
                    }}
                  />
                ))}
                {shownOthers.length > 0 && (
                  <p className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Other partner pharmacies
                  </p>
                )}
                {shownOthers.map((p) => (
                  <PharmacyOptionRow
                    key={p.id}
                    pharmacy={p}
                    selected={p.id === selectedPharmacyId}
                    onSelect={() => {
                      handleSelectPharmacyForQuote(p.id)
                      setPharmacyListOpen(false)
                      setPharmacySearch('')
                    }}
                  />
                ))}
                </div>
              </div>
            )}

            {selectedPharmacyForQuote && (
              <div className="rounded-lg border border-brand-200 bg-brand-50 p-2.5 text-xs">
                <span className="font-medium text-brand-800">Selected: 💊 {selectedPharmacyForQuote.name}</span>
                <p className="mt-0.5 text-brand-700">
                  {selectedPharmacyForQuote.addressDetail}, {selectedPharmacyForQuote.barangay},{' '}
                  {selectedPharmacyForQuote.city}
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs font-semibold text-slate-600">💊 Choose a Pharmacy</p>
        )}

        <div className={orderMode === 'direct' ? 'space-y-3' : 'hidden'} data-panel="pharmacy">
          {orderMode === 'direct' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                Not ordering from a partner pharmacy's catalog — tell your driver which pharmacy to go to. They'll show
                your items list above to the cashier and pay in person, same as a Pabili errand.
              </p>
              <PharmacyList pharmacies={partnerPharmacies} city={defaultCity} onSelect={handleSelectDirectPharmacy} />
              <div className="flex items-center gap-2">
                <span className="h-px flex-1 bg-slate-200" />
                <span className="text-[11px] font-medium text-slate-400">Or type any other pharmacy</span>
                <span className="h-px flex-1 bg-slate-200" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Pharmacy name</label>
                <input
                  value={directPharmacyName}
                  onChange={(e) => {
                    setDirectPharmacyName(e.target.value)
                    // The pickup label already resolved off the old name — keep
                    // it in sync so the driver's ride card shows the current text.
                    setDirectPharmacyLocation((prev) => (prev ? { ...prev, label: e.target.value.trim() || prev.label } : prev))
                  }}
                  placeholder="e.g. Alagang Botika, or any pharmacy name"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <BarangayAddressPicker
                  key={directAddressResetKey}
                  label="Pharmacy address"
                  defaultProvince={directAddressSeed.province}
                  defaultCity={directAddressSeed.city}
                  defaultBarangay={directAddressSeed.barangay}
                  defaultAddressDetail={directAddressSeed.addressDetail}
                  onResolve={handleDirectPharmacyResolve}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Payment method</label>
                <div className="grid grid-cols-4 gap-2">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setDirectPaymentMethod(m.id)}
                      className={`rounded-lg border py-2 text-xs font-medium transition ${
                        directPaymentMethod === m.id
                          ? 'border-brand-600 bg-brand-600 text-white'
                          : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-slate-400">
                No catalog price — your driver pays whatever the pharmacy charges, and you settle up with them directly.
              </p>
              <button
                type="button"
                onClick={handleRequestDirect}
                disabled={!canRequestDirect}
                className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Request driver pickup
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setDeliverOpen((v) => !v)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-dest-accent px-3 py-2 text-xs font-semibold text-white shadow-sm filter transition hover:brightness-90"
        >
          📍 Deliver to
          <span aria-hidden className="text-[10px]">
            {deliverOpen ? '▲' : '▼'}
          </span>
        </button>

        <div className={deliverOpen ? '' : 'hidden'}>
          <BarangayAddressPicker
            label="Delivery address"
            defaultProvince={defaultProvince}
            defaultCity={defaultCity}
            defaultBarangay={defaultBarangay}
            defaultAddressDetail={defaultAddressDetail}
            onResolve={handleAddressResolve}
            gpsOption={{
              onSelect: handlePinDeliveryGps,
              status: deliveryGpsStatus,
              idleLabel: '📍 Pin my exact GPS location',
              doneLabel: '✓ Using your exact GPS location',
              error: deliveryGpsError,
            }}
          />
        </div>

      </div>

      {pastOrders.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowMedsHistory((v) => !v)}
            className="mb-2 flex w-full items-center justify-between text-sm font-semibold text-slate-700"
          >
            My Medicine Orders
            <span className="text-xs text-slate-400">{showMedsHistory ? '▲ Hide' : '▼ Show'}</span>
          </button>
          {showMedsHistory && (
          <div className="space-y-2">
            {pastOrders.map((order) => (
              <div key={order.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700">{order.items.map((i) => i.name).join(', ')}</span>
                  <span className="text-[11px] text-slate-400">{order.status}</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  💊 {pharmacies.find((p) => p.id === order.pharmacyId)?.name ?? 'Pharmacy'}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  ₱{order.total} · {new Date(order.requestedAt).toLocaleString()}
                </p>
                {order.status === 'rejected' && order.rejectionReason && (
                  <p className="mt-1 text-xs text-amber-700">Pharmacy declined: {order.rejectionReason}</p>
                )}
              </div>
            ))}
          </div>
          )}
        </section>
      )}

      {askForPriceShortcut}

      <p className="rounded-lg bg-amber-50 p-2.5 text-[11px] text-amber-800">
        MOBILITY MEDS is a medicine delivery service and does not provide medical diagnosis or treatment advice. For
        medical emergencies, contact appropriate emergency medical services or go to the nearest emergency facility.
      </p>
    </div>
  )
}

function PharmacyList({
  pharmacies,
  city,
  selectedId,
  onSelect,
}: {
  pharmacies: Pharmacy[]
  city: string
  selectedId?: string | null
  onSelect: (pharmacyId: string) => void
}) {
  // Starts on the passenger's default booking city (see DEFAULT_BOOKING_*),
  // but the dropdown lets them switch to any other city that has a
  // participating pharmacy — both the list below and the map's fitted
  // viewport (RealLiveMap/FitBounds refit whenever the point set changes)
  // follow the selection.
  const [selectedCity, setSelectedCity] = useState(city)
  const cities = Array.from(new Set(pharmacies.map((p) => p.city))).sort()
  const list = pharmacies.filter((p) => p.city === selectedCity)
  const points: MapPoint[] = list
    .filter((p) => p.locationGps)
    .map((p) => ({
      id: p.id,
      gps: p.locationGps!,
      color: p.isOpen ? '#10b981' : '#94a3b8',
      label: `💊 ${p.name}${p.isOpen ? '' : ' (closed)'}`,
      icon: 'pharmacy' as const,
    }))

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">Find a participating pharmacy near you and request medicine delivery.</p>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">City</label>
        <select
          value={selectedCity}
          onChange={(e) => setSelectedCity(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      {points.length > 0 && (
        <div>
          <RealLiveMap points={points} onPointClick={onSelect} />
          <p className="mt-1 text-[11px] text-slate-400">Tap a pin on the map, or a pharmacy below, to select it.</p>
        </div>
      )}
      {list.length === 0 && (
        <p className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-400">No participating pharmacies in {selectedCity} yet.</p>
      )}
      {list.map((pharmacy) => (
        <button
          key={pharmacy.id}
          type="button"
          onClick={() => onSelect(pharmacy.id)}
          className={`w-full rounded-lg border p-3 text-left transition hover:bg-slate-50 ${
            pharmacy.id === selectedId ? 'border-brand-600 bg-brand-50' : 'border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">{pharmacy.name}</span>
            <span className={`text-[11px] font-medium ${pharmacy.isOpen ? 'text-emerald-600' : 'text-amber-700'}`}>
              {pharmacy.isOpen ? '🟢 Open' : '⚪ Closed'}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            {pharmacy.addressDetail}, {pharmacy.barangay}, {pharmacy.city}
          </p>
        </button>
      ))}
    </div>
  )
}

function ActiveOrderCard({
  order,
  onCancel,
  onDismiss,
  onAcceptQuote,
  onBookOwnRide,
}: {
  order: MedsOrder
  onCancel: () => void
  onDismiss: () => void
  onAcceptQuote: (method: PaymentMethod, paymentProofDataUrl: string | null, deliveryMode: 'pharmacy_books' | 'self_book') => void
  onBookOwnRide: () => void
}) {
  const { rides, pharmacies, sendMedsOrderMessage } = useRides()
  // Defaults to an online method — the medicine is meant to be paid up front
  // — but the customer can always fall back to "driver pays" (see the cash
  // button below) if online payment isn't working for them.
  const [checkoutMethod, setCheckoutMethod] = useState<PaymentMethod>(order.paymentMethod === 'cash' ? 'gcash' : order.paymentMethod)
  const [paymentProofDataUrl, setPaymentProofDataUrl] = useState<string | null>(null)
  const linkedRide = order.linkedRideId ? rides.find((r) => r.id === order.linkedRideId) : null
  const pharmacy = pharmacies.find((p) => p.id === order.pharmacyId)
  const payoutAccount = checkoutMethod === 'gcash' ? pharmacy?.gcashAccount : checkoutMethod === 'maya' ? pharmacy?.mayaAccount : null
  // Card has no account/QR concept here, so it's always allowed — gcash/maya
  // need the pharmacy to have actually set one up (see PharmacyPortalPage's
  // "Payment accounts" section), otherwise there's nowhere to send the money.
  // Cash (driver pays, reimbursed on delivery) never needs an account either.
  const canAcceptQuote = checkoutMethod === 'card' || checkoutMethod === 'cash' || !!payoutAccount

  if (linkedRide) {
    return (
      <TripMonitor
        title="Your medicine delivery"
        ride={linkedRide}
        sosActorId={order.customerId}
        sosLabel="SOS — Something's wrong"
        showCancel
        onCancel={onCancel}
        onDismiss={onDismiss}
      />
    )
  }

  if (order.status === 'ready_for_pickup') {
    return (
      <div className="space-y-2 rounded-xl border border-brand-200 bg-brand-50 p-4">
        <p className="text-sm font-semibold text-brand-800">Ready — book your own ride to pick it up</p>
        <p className="text-xs text-slate-500">💊 {pharmacy?.name ?? 'Pharmacy'}</p>
        <p className="text-xs text-slate-600">{order.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}</p>
        <p className="text-xs text-slate-500">
          {order.paymentMethod === 'cash'
            ? `Your driver will pay the pharmacy for the medicine and collect the full ₱${order.total} from you in cash once you book.`
            : `Medicine already paid — your driver will collect the ₱${order.deliveryFee + order.serviceFee} delivery + service fee once you book.`}
        </p>
        <button
          type="button"
          onClick={onBookOwnRide}
          className="w-full rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          🛺 Book a tricycle
        </button>
        <OrderChat
          messages={order.messages}
          viewerRole="customer"
          otherPartyLabel={pharmacy?.name ?? 'the pharmacy'}
          onSend={(text) => sendMedsOrderMessage(order.id, 'customer', text)}
        />
      </div>
    )
  }

  if (order.status === 'quoted') {
    return (
      <div className="space-y-2.5 rounded-xl border border-brand-200 bg-brand-50 p-4">
        <p className="text-sm font-semibold text-brand-800">The pharmacy sent a quote — review and check out</p>
        <p className="text-xs text-slate-500">💊 {pharmacy?.name ?? 'Pharmacy'}</p>
        {order.receiptDataUrl && (
          <a href={order.receiptDataUrl} target="_blank" rel="noreferrer" className="block">
            <img src={order.receiptDataUrl} alt="Pharmacy receipt" className="h-28 w-28 rounded-lg border border-slate-200 object-cover" />
          </a>
        )}
        <div className="space-y-1 rounded-lg bg-white p-2.5 text-xs">
          {order.items.map((item) => (
            <div key={item.productId}>
              <div className="flex items-center justify-between">
                <span>
                  {item.quantity}x {item.name}
                </span>
                <span className="font-medium text-slate-700">₱{item.unitPrice * item.quantity}</span>
              </div>
              {item.note && <p className="mt-0.5 text-[11px] text-amber-700">📝 {item.note}</p>}
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-slate-200 pt-1 font-semibold text-slate-800">
            <span>Total — pay now</span>
            <span>₱{order.subtotal}</span>
          </div>
        </div>
        <p className="text-[11px] text-slate-500">
          This pays the pharmacy for the medicine only. Once it's ready, you book your own tricycle to pick it up —
          your driver collects the ₱{order.deliveryFee + order.serviceFee} delivery + service fee separately then.
        </p>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Pay with</label>
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_METHODS.filter((m) => m.id !== 'cash').map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setCheckoutMethod(m.id)}
                className={`rounded-lg border py-2 text-xs font-medium transition ${
                  checkoutMethod === m.id
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          {checkoutMethod !== 'cash' && (
            <p className="mt-1 text-[11px] text-slate-500">
              {checkoutMethod === 'card'
                ? `You'll pay ₱${order.subtotal} online now by Card — simulated for this prototype.`
                : payoutAccount
                  ? `Send ₱${order.subtotal} to ${pharmacy?.name}'s ${checkoutMethod === 'gcash' ? 'GCash' : 'Maya'} account below, then tap Accept.`
                  : `${pharmacy?.name ?? 'This pharmacy'} hasn't set up ${checkoutMethod === 'gcash' ? 'GCash' : 'Maya'} yet — try ${checkoutMethod === 'gcash' ? 'Maya' : 'GCash'}, let your driver pay below, or ask them to add an account from their portal.`}
            </p>
          )}
          {(checkoutMethod === 'gcash' || checkoutMethod === 'maya') && payoutAccount && (
            <div className="mt-2 space-y-2 rounded-lg bg-white p-2.5">
              <div className="flex items-center gap-3">
                {payoutAccount.qrDataUrl ? (
                  <img src={payoutAccount.qrDataUrl} alt="Payment QR code" className="h-20 w-20 shrink-0 rounded-md object-cover" />
                ) : (
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md bg-slate-100 text-2xl text-slate-300">
                    📱
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-700">{payoutAccount.accountName}</p>
                  <p className="text-xs text-slate-500">{payoutAccount.accountNumber}</p>
                </div>
              </div>
              <div>
                <p className="mb-1 text-[11px] font-medium text-slate-500">Payment confirmation screenshot (optional)</p>
                <DocumentUploadField label="Payment proof" dataUrl={paymentProofDataUrl} onUpload={setPaymentProofDataUrl} />
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setCheckoutMethod('cash')}
          className={`w-full rounded-lg border p-2.5 text-left text-xs transition ${
            checkoutMethod === 'cash' ? 'border-brand-600 bg-white' : 'border-dashed border-slate-300 bg-white/60 hover:bg-white'
          }`}
        >
          <span className="font-medium text-slate-700">🛵 Online payment not working? Let your driver pay instead</span>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Your driver pays the pharmacy ₱{order.subtotal} for you at pickup, then collects the full ₱{order.total}{' '}
            from you in cash on delivery.
          </p>
        </button>
        <button
          type="button"
          onClick={() => onAcceptQuote(checkoutMethod, paymentProofDataUrl, 'self_book')}
          disabled={!canAcceptQuote}
          className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {checkoutMethod === 'cash' ? 'Accept quote & Pay driver on delivery' : `Accept quote & Pay ₱${order.subtotal} online`}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="w-full rounded-lg border border-amber-200 bg-white py-2 text-sm font-medium text-amber-700 hover:bg-amber-50"
        >
          Decline quote
        </button>
        <OrderChat
          messages={order.messages}
          viewerRole="customer"
          otherPartyLabel={pharmacy?.name ?? 'the pharmacy'}
          onSend={(text) => sendMedsOrderMessage(order.id, 'customer', text)}
        />
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-xl border border-brand-200 bg-brand-50 p-4">
      <p className="text-sm font-semibold text-brand-800">
        {order.status === 'pending_confirmation'
          ? 'Waiting for the pharmacy to send a quote'
          : order.status === 'confirmed'
            ? order.paidOnline
              ? '✓ Paid — the pharmacy is processing your order'
              : 'Checked out — the pharmacy is processing your order'
            : 'Order confirmed'}
      </p>
      <p className="text-xs text-slate-500">💊 {pharmacy?.name ?? 'Pharmacy'}</p>
      <p className="text-xs text-slate-600">{order.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}</p>
      {order.prescriptionStatus === 'rejected' && order.rejectionReason && (
        <p className="text-xs text-amber-700">Prescription needs clarification: {order.rejectionReason}</p>
      )}
      <button
        type="button"
        onClick={onCancel}
        className="w-full rounded-lg border border-amber-200 bg-white py-2 text-sm font-medium text-amber-700 hover:bg-amber-50"
      >
        Cancel request
      </button>
      <OrderChat
        messages={order.messages}
        viewerRole="customer"
        otherPartyLabel={pharmacy?.name ?? 'the pharmacy'}
        onSend={(text) => sendMedsOrderMessage(order.id, 'customer', text)}
      />
    </div>
  )
}
