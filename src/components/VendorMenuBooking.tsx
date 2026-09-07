import { useEffect, useMemo, useRef, useState } from 'react'
import { useRides } from '../context/RideContext'
import { DEFAULT_MEDS_DELIVERY_FEE, DEFAULT_MEDS_SERVICE_FEE, PAYMENT_METHODS } from '../mock/data'
import { DocumentUploadField } from './DocumentUploadField'
import { createCustomLocation, resolvePhAddress, reverseGeocodeToPhAddress, type PhAddressTags } from '../lib/customLocation'
import { getCurrentGeoPosition } from '../lib/geo'
import { BarangayAddressPicker } from './BarangayAddressPicker'
import { DeliveryMapPicker } from './DeliveryMapPicker'
import { StoreRatingSheet } from './StoreRatingSheet'
import { OrderStatusStrip, orderStageDetail } from './OrderStatusStrip'
import { ServiceTabs } from './ServiceTabs'
import { OrderChat } from './OrderChat'
import { TripMonitor } from './TripMonitor'
import { VendorListRow, VendorStorefront } from './VendorStorefront'
import { VendorNewsfeed } from './VendorFeed'
import type { BusinessType, MedicineProduct, MedsOrder, MockLocation, PaymentMethod, Pharmacy } from '../types'

const VENDOR_BUSINESS_TYPES: BusinessType[] = ['resto_food', 'other_commodity']

const VENDOR_TYPE_ICONS: Record<string, string> = {
  resto_food: '🍽️',
  other_commodity: '📦',
}

// How long a customer waits before an order counts as overdue: a vendor who
// has not answered at all (no quotation) after this many minutes, or one
// who accepted but still has no rider booked after this many.
const UNANSWERED_OVERDUE_MIN = 15
const PREPARING_OVERDUE_MIN = 60

// Whether a customer can pull this order back, and the line that says why.
// Unanswered orders (no quotation yet) can always be cancelled — nothing
// has been cooked. A quoted one is a quotation they may still turn down.
// An accepted order being prepared can be cancelled only once it is long
// overdue with no rider booked. Nothing with a rider on the road.
export function customerCancelState(order: MedsOrder): { canCancel: boolean; note: string | null; overdue: boolean } {
  const minutesSince = (iso: string | null) => (iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)) : 0)
  if (order.status === 'pending_confirmation') {
    const waited = minutesSince(order.requestedAt)
    const overdue = waited >= UNANSWERED_OVERDUE_MIN
    return {
      canCancel: true,
      overdue,
      note: overdue ? `No reply from the vendor for ${waited} min — long overdue` : `No reply from the vendor yet (${waited} min)`,
    }
  }
  if (order.status === 'quoted') return { canCancel: true, overdue: false, note: null }
  if (order.status === 'confirmed') {
    const waited = minutesSince(order.confirmedAt ?? order.quotedAt ?? order.requestedAt)
    const overdue = waited >= PREPARING_OVERDUE_MIN
    return {
      canCancel: overdue,
      overdue,
      note: overdue ? `Accepted ${waited} min ago and still no rider booked — long overdue` : null,
    }
  }
  return { canCancel: false, overdue: false, note: null }
}

// An order still counts as "in flight" at any pre-terminal status — same
// rule MedsBooking's activeOrder uses.
// 'quoted' is the step that needs the customer most — the quotation is
// waiting for their approval (and payment) — so it must surface as the
// active card, not sit in the list below.
const ACTIVE_STATUSES = new Set(['pending_confirmation', 'quoted', 'confirmed', 'ready_for_pickup'])

// Registered Vendor — browse a partner vendor's own priced menu (food,
// dry goods, whatever they registered to sell), build a cart, and check
// out. Unlike TODARIDE MEDS's catalog mode, there is no quote round-trip:
// every item is already priced, so checkout both places the order AND pays
// for it (see CREATE_MEDS_ORDER's pricedFromMenu) — the vendor's own action
// is a single Accept/Decline (see PharmacyPortalPage's NewMenuOrderCard),
// not a price-and-send-back step. Once accepted, dispatch/tracking is the
// same MedsOrder -> Ride pipeline TODARIDE MEDS already uses (see
// PHARMACY_PROCESS_MEDS_ORDER, TripMonitor below) — self-contained here the
// same way MedsBooking is, for the same reason: this order has a genuinely
// different shape (a cart, a vendor, a menu) than a Ride/Pabili booking.
export function VendorMenuBooking({
  customerId,
  customerName,
  defaultProvince,
  defaultCity,
  defaultBarangay,
  defaultAddressDetail,
  defaultContactPhone,
  initialVendorId,
}: {
  customerId: string
  customerName: string
  defaultProvince: string
  defaultCity: string
  defaultBarangay: string
  defaultAddressDetail: string
  defaultContactPhone?: string | null
  // A shared vendor link (/book?vendor=<id>) opens straight on that store's
  // menu with the cart ready, instead of on the vendor list.
  initialVendorId?: string | null
}) {
  const { rides, pharmacies, medicineProducts, medsOrders, createMedsOrder, cancelMedsOrder, ratePharmacy, quoteVendorDeliveryFare } =
    useRides()
  // Which store the "Rate this store" sheet is open for — from the
  // storefront header, or from a past order in the history below.
  const [ratingVendorId, setRatingVendorId] = useState<string | null>(null)
  const ratingVendor = ratingVendorId ? pharmacies.find((p) => p.id === ratingVendorId) : undefined

  const vendors = useMemo(
    () => pharmacies.filter((p) => VENDOR_BUSINESS_TYPES.includes(p.businessType) && p.verificationStatus === 'approved'),
    [pharmacies],
  )

  const initialVendor = initialVendorId ? vendors.find((v) => v.id === initialVendorId) : undefined
  const [step, setStep] = useState<'browse' | 'menu' | 'checkout'>(initialVendor ? 'menu' : 'browse')
  const [vendorSearch, setVendorSearch] = useState('')
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(initialVendor?.id ?? null)
  const [cart, setCart] = useState<Record<string, number>>({})
  const [contactPhone, setContactPhone] = useState(defaultContactPhone ?? '')
  const [deliveryAddress, setDeliveryAddress] = useState<MockLocation | null>(null)
  // What the Province/City/Barangay dropdowns under the map are seeded with.
  // A map pin (or GPS fix) reverse-geocodes to a guess at those three, and
  // the picker is remounted (via `key`) to show it — otherwise the form would
  // sit there disagreeing with the pin the customer just placed. Same
  // pattern PassengerPage uses for its destination.
  const [addressSeed, setAddressSeed] = useState<PhAddressTags>({
    province: defaultProvince,
    city: defaultCity,
    barangay: defaultBarangay,
    addressDetail: defaultAddressDetail,
  })
  const [addressSeedKey, setAddressSeedKey] = useState(0)
  // True once the delivery point came from the map or the phone — an exact
  // spot the picker should treat as settled rather than ask a landmark for.
  const [deliveryPinned, setDeliveryPinned] = useState(false)
  const [dismissedOrderIds, setDismissedOrderIds] = useState<Set<string>>(new Set())
  // The order a customer stepped back from with "Go back" — the card gives
  // way to the vendors page, and a strip at its top brings them back to it.
  // The order itself is untouched; this is only which screen is showing.
  const [steppedBackOrderId, setSteppedBackOrderId] = useState<string | null>(null)
  // Cancelled & completed orders start folded; the ones in process are
  // always in view above them.
  const [showHistory, setShowHistory] = useState(false)

  const myOrders = medsOrders.filter((o) => o.customerId === customerId && o.pricedFromMenu)
  const activeOrder = myOrders.find((o) => {
    if (dismissedOrderIds.has(o.id)) return false
    if (ACTIVE_STATUSES.has(o.status)) return true
    if (o.status !== 'dispatched') return false
    const linkedRideStatus = rides.find((r) => r.id === o.linkedRideId)?.status
    return linkedRideStatus !== 'completed' && linkedRideStatus !== 'cancelled' && linkedRideStatus !== 'declined'
  })
  const pastOrders = myOrders.filter((o) => o.id !== activeOrder?.id)

  // The delivery address starts as the customer's own: their registered
  // address (passed in as the defaults) straight away, and — once the
  // checkout opens — the phone's GPS pin on top of it when the phone can
  // give one, since where they are standing is usually where the food goes.
  // Anything they then change by hand wins over both.
  const addressTouchedRef = useRef(false)
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
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (step !== 'checkout' || addressTouchedRef.current || deliveryPinned) return
    let cancelled = false
    ;(async () => {
      try {
        const gps = await getCurrentGeoPosition()
        if (cancelled || addressTouchedRef.current) return
        const { label, guess } = await reverseGeocodeToPhAddress(gps)
        if (cancelled || addressTouchedRef.current) return
        const location = createCustomLocation(
          label ?? `My location (${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)})`,
          gps,
          guess ?? undefined,
        )
        setDeliveryAddress(location)
        setDeliveryPinned(true)
        if (guess) {
          setAddressSeed(guess)
          setAddressSeedKey((k) => k + 1)
        }
      } catch {
        // No fix (permission off, indoors) — the registered address stands.
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const selectedVendor = vendors.find((v) => v.id === selectedVendorId)
  const menu = selectedVendor ? medicineProducts.filter((p) => p.pharmacyId === selectedVendor.id) : []

  const cartLines = Object.entries(cart)
    .filter(([, qty]) => qty > 0)
    .map(([productId, qty]) => ({ product: menu.find((m) => m.id === productId), qty }))
    .filter((l): l is { product: MedicineProduct; qty: number } => !!l.product)
  const subtotal = cartLines.reduce((sum, l) => sum + l.product.price * l.qty, 0)
  // What the delivery will cost to ride: the TODA fare from the store to
  // the address chosen below, plus the platform's booking fee — the same
  // numbers the vendor's quotation starts from.
  const fare =
    selectedVendor && deliveryAddress ? quoteVendorDeliveryFare(selectedVendor.id, deliveryAddress) : null
  const todaFare = fare?.todaFare ?? DEFAULT_MEDS_DELIVERY_FEE
  const bookingFee = fare?.bookingFee ?? DEFAULT_MEDS_SERVICE_FEE
  const total = subtotal + todaFare + bookingFee

  function setQty(productId: string, qty: number) {
    setCart((prev) => ({ ...prev, [productId]: Math.max(0, qty) }))
  }

  // Each step is a new "page" to the person using it, and a page opens at
  // its top — these steps change no route, so the app-wide scroll-to-top
  // on navigation does not cover them.
  function goTo(next: 'browse' | 'menu' | 'checkout') {
    setStep(next)
    window.scrollTo({ top: 0 })
    document.getElementById('root')?.scrollTo({ top: 0 })
  }

  function openVendor(vendorId: string) {
    setSelectedVendorId(vendorId)
    setCart({})
    goTo('menu')
  }

  function backToBrowse() {
    setSelectedVendorId(null)
    setCart({})
    goTo('browse')
  }

  async function handleAddressResolve(address: PhAddressTags) {
    addressTouchedRef.current = true
    const location = await resolvePhAddress(address)
    setDeliveryAddress(location)
    setDeliveryPinned(false)
  }

  // From the map — a tap, a drag, or the GPS button. The location is the
  // exact point; the guess (when the pin landed somewhere in our address
  // tree) re-seeds the dropdowns beneath so both say the same thing.
  function handleMapPin(location: MockLocation, guess: PhAddressTags | null) {
    addressTouchedRef.current = true
    setDeliveryAddress(location)
    setDeliveryPinned(true)
    if (guess) {
      setAddressSeed(guess)
      setAddressSeedKey((k) => k + 1)
    }
  }

  const canPlaceOrder = cartLines.length > 0 && !!deliveryAddress && !!contactPhone.trim() && !!selectedVendor

  function handlePlaceOrder() {
    if (!canPlaceOrder || !deliveryAddress || !selectedVendor) return
    createMedsOrder({
      customerId,
      customerName,
      pharmacyId: selectedVendor.id,
      items: cartLines.map((l) => ({
        productId: l.product.id,
        name: l.product.name,
        quantity: l.qty,
        unitPrice: l.product.price,
        note: null,
      })),
      deliveryAddress,
      prescriptionDataUrls: [],
      // Decided when the customer approves the vendor's quotation (cash on
      // delivery, or paid online first) — see ActiveVendorOrderCard and
      // CUSTOMER_ACCEPT_QUOTE. 'cash' here only means "not paid yet".
      paymentMethod: 'cash',
      // The vendor books the rider once the order is approved — see
      // PHARMACY_PROCESS_MEDS_ORDER — not a "book your own ride" order.
      deliveryMode: 'pharmacy_books',
      contactPhone: contactPhone.trim(),
      pricedFromMenu: true,
    })
    setCart({})
    setSelectedVendorId(null)
    goTo('browse')
  }

  if (activeOrder && steppedBackOrderId !== activeOrder.id) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => {
            setSteppedBackOrderId(activeOrder.id)
            goTo('browse')
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          ‹ Go back
        </button>
        <ActiveVendorOrderCard
          order={activeOrder}
          onCancel={() => cancelMedsOrder(activeOrder.id)}
          onDismiss={() => setDismissedOrderIds((prev) => new Set(prev).add(activeOrder.id))}
        />
      </div>
    )
  }
  const steppedBackOrder = activeOrder && steppedBackOrderId === activeOrder.id ? activeOrder : null
  const steppedBackVendor = steppedBackOrder ? vendors.find((v) => v.id === steppedBackOrder.pharmacyId) : null
  const steppedBackRide = steppedBackOrder?.linkedRideId ? rides.find((r) => r.id === steppedBackOrder.linkedRideId) : undefined

  const query = vendorSearch.trim().toLowerCase()
  // A search matches a store by name or place, OR by what it sells: typing
  // "inasal" lists every store with a dish called that, with the matching
  // dishes named under each strip.
  const matchingDishes = (vendorId: string): MedicineProduct[] =>
    query
      ? medicineProducts.filter(
          (p) =>
            p.pharmacyId === vendorId &&
            p.visible !== false &&
            (p.name.toLowerCase().includes(query) || (p.description ?? '').toLowerCase().includes(query)),
        )
      : []
  const shownVendors = vendors.filter(
    (v) =>
      !query ||
      v.name.toLowerCase().includes(query) ||
      v.barangay.toLowerCase().includes(query) ||
      v.city.toLowerCase().includes(query) ||
      matchingDishes(v.id).length > 0,
  )

  return (
    <div className="space-y-3">
      {step === 'browse' && (
        <div className="space-y-3">
          {/* The same two-service strip as the ride start screen, with
              Food Express lit here — tapping TODA is the way back. */}
          <ServiceTabs active="food" tone="light" />

          {/* The order they stepped back from is still running — one line
              on where it is, and the way back to its card. */}
          {steppedBackOrder && (
            <button
              type="button"
              onClick={() => setSteppedBackOrderId(null)}
              className="flex w-full items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-left hover:bg-brand-100"
            >
              <span className="text-lg leading-none">🧾</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-brand-800">
                  Your order at {steppedBackVendor?.name ?? 'the vendor'} · ₱{steppedBackOrder.total}
                </span>
                <span className="block truncate text-[11px] text-brand-700">
                  {orderStageDetail(steppedBackOrder, steppedBackRide, 'customer')}
                </span>
              </span>
              <span className="text-xs font-semibold text-brand-700">View order ›</span>
            </button>
          )}

          {/* The Food Express "storefront" — same idea as a vendor's own
              cover banner (see VendorHeaderCard), just introducing the whole
              service instead of one vendor. Gradient + stripe texture is
              deliberately the same visual language, not a different look
              bolted onto the same flow. */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-600 p-4 text-white shadow-sm">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-10"
              style={{
                backgroundImage: 'repeating-linear-gradient(-45deg, white 0, white 2px, transparent 2px, transparent 14px)',
              }}
            />
            <p className="relative text-lg font-extrabold leading-tight">🍽️ SafeRide Food Express</p>
            <p className="relative mt-0.5 text-xs text-white/90">
              Order straight from a partner vendor's own priced menu — cooked fresh, delivered by your driver.
            </p>
          </div>

          <input
            value={vendorSearch}
            onChange={(e) => setVendorSearch(e.target.value)}
            placeholder="Search a store or a food (e.g. inasal, lugaw)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />

          {vendors.length === 0 && (
            <p className="rounded-lg bg-slate-50 p-3 text-center text-xs text-slate-400">
              No registered vendors yet — check back soon.
            </p>
          )}
          {vendors.length > 0 && shownVendors.length === 0 && (
            <p className="rounded-lg bg-slate-50 p-3 text-center text-xs text-slate-400">
              No vendor matches "{vendorSearch.trim()}".
            </p>
          )}

          {/* The store list only while a search is typed — the page itself
              is the feed below; the search box is how a customer picks a
              particular store. */}
          {query && shownVendors.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1 text-sm font-bold text-slate-700">🌟 Vendors</p>
              {/* One line per store — see VendorListRow. Open stores first,
                  then by name, so the ones a customer can actually order
                  from are at the top. */}
              <div className="space-y-1.5">
                {[...shownVendors]
                  .sort((a, b) => Number(b.isOpen) - Number(a.isOpen) || a.name.localeCompare(b.name))
                  .map((v) => {
                    const dishes = matchingDishes(v.id)
                    return (
                      <div key={v.id}>
                        <VendorListRow
                          pharmacy={v}
                          itemCount={medicineProducts.filter((p) => p.pharmacyId === v.id && p.visible !== false).length}
                          onSelect={() => openVendor(v.id)}
                        />
                        {dishes.length > 0 && (
                          <div className="mx-2 -mt-1 flex flex-wrap gap-1 rounded-b-lg border border-t-0 border-slate-200 bg-white px-2 pb-1.5 pt-2">
                            {dishes.slice(0, 4).map((d) => (
                              <button
                                key={d.id}
                                type="button"
                                onClick={() => {
                                  openVendor(v.id)
                                  setCart({ [d.id]: 1 })
                                }}
                                className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
                              >
                                🍽️ {d.name} · ₱{d.price}
                              </button>
                            ))}
                            {dishes.length > 4 && <span className="px-1 text-[11px] text-slate-400">+{dishes.length - 4} more</span>}
                          </div>
                        )}
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* The page is the newsfeed: every store's posts, newest first,
              each under its own banner, with Like · Heart · Comment · Share
              — see VendorNewsfeed. Tapping a post's photo or featured dish
              opens that store's page to order. The list of all stores is
              hidden; the search box above brings up matching stores. */}
          {vendors.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1 text-sm font-bold text-slate-700">📣 Latest from vendors</p>
              {shownVendors.some((v) => (v.posts?.length ?? 0) > 0) ? (
                <VendorNewsfeed
                  vendors={shownVendors}
                  items={medicineProducts}
                  viewer={{ id: customerId, name: customerName }}
                  onOpenVendor={openVendor}
                  onOrderItem={(vendorId, productId) => {
                    openVendor(vendorId)
                    setCart({ [productId]: 1 })
                  }}
                />
              ) : (
                <p className="rounded-lg bg-slate-50 p-3 text-center text-xs text-slate-400">
                  No posts yet — search a store above to see its menu.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {step === 'menu' && selectedVendor && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={backToBrowse}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            ‹ Vendors
          </button>

          <VendorStorefront
            pharmacy={selectedVendor}
            items={menu}
            cart={cart}
            onQtyChange={setQty}
            onCheckout={() => goTo('checkout')}
            onRate={() => setRatingVendorId(selectedVendor.id)}
            viewer={{ id: customerId, name: customerName }}
          />
        </div>
      )}

      {step === 'checkout' && selectedVendor && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goTo('menu')}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              ‹ Menu
            </button>
            <p className="text-sm font-semibold text-slate-800">Checkout</p>
          </div>

          <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-2.5 text-xs">
            {cartLines.map((l) => (
              <div key={l.product.id} className="flex items-center justify-between">
                <span className="text-slate-600">
                  {l.qty}x {l.product.name}
                </span>
                <span className="font-medium text-slate-700">₱{l.product.price * l.qty}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-slate-100 pt-1 text-slate-500">
              <span>TODA fare (rider{deliveryAddress ? '' : ' — pick the address'} · confirmed in the quotation)</span>
              <span>₱{todaFare}</span>
            </div>
            <div className="flex items-center justify-between text-slate-500">
              <span>Booking fee</span>
              <span>₱{bookingFee}</span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 pt-1 font-semibold text-slate-800">
              <span>Estimated total</span>
              <span>₱{total}</span>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Contact number</label>
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="09XX-XXX-XXXX"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Deliver to</label>
            {/* Map first — the same live map the ride booking pins on, with
                the vendor's store shown so the customer sees where the food
                is coming from. The address form below is the other way in:
                picking a barangay there moves the pin, pinning here fills
                the form. */}
            <DeliveryMapPicker vendor={selectedVendor} deliveryAddress={deliveryAddress} onChange={handleMapPin} />
            <p className="my-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">or pick an address</p>
            <BarangayAddressPicker
              key={addressSeedKey}
              label="Delivery address"
              defaultProvince={addressSeed.province}
              defaultCity={addressSeed.city}
              defaultBarangay={addressSeed.barangay}
              defaultAddressDetail={addressSeed.addressDetail}
              pinned={deliveryPinned}
              onResolve={handleAddressResolve}
            />
          </div>

          <p className="rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-500">
            Nothing is charged yet. {selectedVendor.name} will confirm the rider fee and send you the final quotation —
            you approve it and choose <span className="font-semibold">cash on delivery</span> or{' '}
            <span className="font-semibold">pay online</span> before they start preparing.
          </p>

          <button
            type="button"
            onClick={handlePlaceOrder}
            disabled={!canPlaceOrder}
            className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Send order — about ₱{total}
          </button>
        </div>
      )}

      {pastOrders.length > 0 && step === 'browse' && (() => {
        // An order is "in process" from the moment it is sent until the
        // rider has delivered it; only then — or when it was cancelled or
        // declined — does it move to the past list, which stays folded.
        const isInProcess = (order: MedsOrder) => {
          if (order.status === 'cancelled' || order.status === 'rejected') return false
          if (order.status !== 'dispatched') return true
          const rideStatus = rides.find((r) => r.id === order.linkedRideId)?.status
          return rideStatus !== 'completed' && rideStatus !== 'cancelled' && rideStatus !== 'declined'
        }
        const byNewest = (a: MedsOrder, b: MedsOrder) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()
        const currentOrders = pastOrders.filter(isInProcess).sort(byNewest)
        const finishedOrders = pastOrders.filter((o) => !isInProcess(o)).sort(byNewest)

        const renderOrder = (order: MedsOrder, inProcess: boolean) => {
          const ride = rides.find((r) => r.id === order.linkedRideId)
          const cancel = customerCancelState(order)
          const finishedLabel =
            order.status === 'cancelled' ? 'Cancelled' : order.status === 'rejected' ? 'Declined by the vendor' : 'Completed'
          return (
            <div
              key={order.id}
              className={`rounded-lg border p-3 text-sm ${
                inProcess ? 'border-brand-300 bg-brand-50 shadow-sm ring-1 ring-brand-200' : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`font-medium ${inProcess ? 'text-brand-900' : 'text-slate-700'}`}>
                  {order.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {inProcess ? (
                    <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      In process
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">{finishedLabel}</span>
                  )}
                  <span className="text-xs font-semibold text-slate-700">₱{order.total}</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {pharmacies.find((p) => p.id === order.pharmacyId)?.name ?? 'Vendor'} ·{' '}
                {new Date(order.requestedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
              {/* The stage strip is the point of a current order; a finished
                  one only needs the one-word outcome above. */}
              {inProcess && (
                <div className="mt-2">
                  <OrderStatusStrip order={order} ride={ride} viewer="customer" />
                </div>
              )}
              {inProcess && (cancel.canCancel || cancel.note) && (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className={`text-[11px] ${cancel.overdue ? 'font-semibold text-amber-700' : 'text-slate-500'}`}>
                    {cancel.note ?? 'Quotation waiting for your approval'}
                  </span>
                  {cancel.canCancel && (
                    <button
                      type="button"
                      onClick={() => cancelMedsOrder(order.id)}
                      className="shrink-0 rounded-lg border border-amber-200 bg-white px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                    >
                      Cancel order
                    </button>
                  )}
                </div>
              )}
              {order.status === 'dispatched' && !inProcess && (
                <button
                  type="button"
                  onClick={() => setRatingVendorId(order.pharmacyId)}
                  className="mt-1 text-xs font-semibold text-brand-700 hover:underline"
                >
                  ⭐ Rate this store
                </button>
              )}
            </div>
          )
        }

        return (
          <section className="space-y-2">
            {currentOrders.length > 0 && (
              <>
                <p className="flex items-center justify-between text-sm font-semibold text-slate-700">
                  <span>📦 My orders in process ({currentOrders.length})</span>
                </p>
                <div className="space-y-2">{currentOrders.map((o) => renderOrder(o, true))}</div>
              </>
            )}
            {finishedOrders.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => setShowHistory((v) => !v)}
                  aria-expanded={showHistory}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-semibold text-slate-600"
                >
                  <span>🗂 Cancelled & completed ({finishedOrders.length})</span>
                  <span className="text-xs text-slate-400">{showHistory ? '▲ Hide' : '▼ Show'}</span>
                </button>
                {showHistory && (
                  <div className="space-y-2 border-t border-slate-100 p-2">{finishedOrders.map((o) => renderOrder(o, false))}</div>
                )}
              </div>
            )}
          </section>
        )
      })()}

      {ratingVendor && (
        <StoreRatingSheet
          pharmacy={ratingVendor}
          existing={(ratingVendor.storeReviews ?? []).find((r) => r.customerId === customerId) ?? null}
          onSubmit={(rating, text) => ratePharmacy({ pharmacyId: ratingVendor.id, customerId, customerName, rating, text })}
          onClose={() => setRatingVendorId(null)}
        />
      )}
    </div>
  )
}

function ActiveVendorOrderCard({
  order,
  onCancel,
  onDismiss,
}: {
  order: MedsOrder
  onCancel: () => void
  onDismiss: () => void
}) {
  const { rides, pharmacies, sendMedsOrderMessage, acceptMedsQuote } = useRides()
  const linkedRide = order.linkedRideId ? rides.find((r) => r.id === order.linkedRideId) : null
  const vendor: Pharmacy | undefined = pharmacies.find((p) => p.id === order.pharmacyId)
  // How the customer settles the quotation: cash on delivery is the default
  // in a carinderia's world; online means paying the vendor's own GCash/Maya
  // first (their account and QR are shown), with an optional screenshot.
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash')
  const [paymentProofDataUrl, setPaymentProofDataUrl] = useState<string | null>(null)
  const payoutAccount = payMethod === 'gcash' ? vendor?.gcashAccount : payMethod === 'maya' ? vendor?.mayaAccount : null
  const canApprove = payMethod === 'cash' || payMethod === 'card' || !!payoutAccount
  // Re-render once a minute so the "waiting N min" line counts up and the
  // overdue cancel appears on its own.
  const [, setClockTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setClockTick((n) => n + 1), 60_000)
    return () => clearInterval(id)
  }, [])
  const cancelState = customerCancelState(order)

  if (linkedRide) {
    return (
      <TripMonitor
        title="Your order"
        ride={linkedRide}
        sosActorId={order.customerId}
        sosLabel="SOS — Something's wrong"
        showCancel
        onCancel={onCancel}
        onDismiss={onDismiss}
      />
    )
  }

  // The vendor's quotation: the goods as ordered plus the rider fee they
  // confirmed. Approving it is what starts the cooking — and, unless it is
  // cash on delivery, the payment happens here first.
  if (order.status === 'quoted') {
    return (
      <div className="space-y-2.5 rounded-xl border border-brand-200 bg-brand-50 p-4">
        <OrderStatusStrip order={order} ride={undefined} viewer="customer" />
        <p className="text-sm font-semibold text-brand-800">📄 {vendor?.name ?? 'The vendor'} sent your quotation — approve to start</p>
        <div className="space-y-1 rounded-lg bg-white p-2.5 text-xs">
          {order.items.map((item, i) => (
            <div key={`${item.productId}-${i}`} className="flex items-center justify-between">
              <span>
                {item.quantity}x {item.name}
              </span>
              <span className="font-medium text-slate-700">₱{item.unitPrice * item.quantity}</span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-slate-100 pt-1 text-slate-500">
            <span>Goods</span>
            <span>₱{order.subtotal}</span>
          </div>
          <div className="flex items-center justify-between text-slate-500">
            <span>TODA fare (rider)</span>
            <span>₱{order.deliveryFee}</span>
          </div>
          <div className="flex items-center justify-between text-slate-500">
            <span>Booking fee</span>
            <span>₱{order.serviceFee}</span>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 pt-1 font-semibold text-slate-800">
            <span>Total</span>
            <span>₱{order.total}</span>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">How will you pay?</label>
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_METHODS.filter((m) => m.id !== 'card').map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setPayMethod(m.id)}
                className={`rounded-lg border py-2 text-xs font-medium transition ${
                  payMethod === m.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {m.id === 'cash' ? 'Cash on delivery' : m.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {payMethod === 'cash'
              ? `Pay the rider ₱${order.total} in cash when the food arrives. The rider pays ${vendor?.name ?? 'the vendor'} for the goods at pickup.`
              : payoutAccount
                ? `Send ₱${order.total} to ${vendor?.name}'s ${payMethod === 'gcash' ? 'GCash' : 'Maya'} below, then tap Approve. The rider only collects nothing more on delivery.`
                : `${vendor?.name ?? 'This vendor'} hasn't set up ${payMethod === 'gcash' ? 'GCash' : 'Maya'} yet — try the other one, or choose cash on delivery.`}
          </p>
          {(payMethod === 'gcash' || payMethod === 'maya') && payoutAccount && (
            <div className="mt-2 space-y-2 rounded-lg bg-white p-2.5">
              <div className="flex items-center gap-3">
                {payoutAccount.qrDataUrl ? (
                  <img src={payoutAccount.qrDataUrl} alt="Payment QR code" className="h-20 w-20 shrink-0 rounded-md object-cover" />
                ) : (
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md bg-slate-100 text-2xl text-slate-300">📱</div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-700">{payoutAccount.accountName}</p>
                  <p className="text-xs text-slate-500">{payoutAccount.accountNumber}</p>
                  <p className="text-[11px] font-semibold text-slate-700">Send ₱{order.total}</p>
                </div>
              </div>
              <div>
                <p className="mb-1 text-[11px] font-medium text-slate-500">Payment screenshot (optional)</p>
                <DocumentUploadField label="Payment proof" dataUrl={paymentProofDataUrl} onUpload={setPaymentProofDataUrl} />
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          disabled={!canApprove}
          onClick={() => acceptMedsQuote(order.id, payMethod, paymentProofDataUrl, 'pharmacy_books')}
          className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {payMethod === 'cash' ? `Approve — pay ₱${order.total} on delivery` : `Approve — I've paid ₱${order.total} online`}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="w-full rounded-lg border border-amber-200 bg-white py-2 text-sm font-medium text-amber-700 hover:bg-amber-50"
        >
          Decline quotation
        </button>
        <OrderChat
          messages={order.messages}
          viewerRole="customer"
          otherPartyLabel={vendor?.name ?? 'the vendor'}
          onSend={(text) => sendMedsOrderMessage(order.id, 'customer', text)}
        />
      </div>
    )
  }

  // Where the order is before a driver exists. Once a ride is linked,
  // TripMonitor above takes over with the live map.
  return (
    <div className="space-y-2 rounded-xl border border-brand-200 bg-brand-50 p-4">
      <OrderStatusStrip order={order} ride={undefined} viewer="customer" />
      <p className="text-sm font-semibold text-brand-800">
        {order.status === 'pending_confirmation'
          ? `Order sent — waiting for ${vendor?.name ?? 'the vendor'} to confirm the rider fee and send your quotation`
          : order.paidOnline
            ? `✓ Paid online — ${vendor?.name ?? 'the vendor'} is preparing your order`
            : `✓ Approved (cash on delivery) — ${vendor?.name ?? 'the vendor'} is preparing your order`}
      </p>
      <p className="text-xs text-slate-500">{VENDOR_TYPE_ICONS[vendor?.businessType ?? ''] ?? '🏪'} {vendor?.name ?? 'Vendor'}</p>
      <p className="text-xs text-slate-600">{order.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}</p>
      <p className="text-xs font-semibold text-slate-700">
        {order.status === 'pending_confirmation' ? `About ₱${order.total}` : `Total ₱${order.total}`}
        {order.status === 'confirmed' && ` · goods ₱${order.subtotal} + TODA fare ₱${order.deliveryFee} + booking fee ₱${order.serviceFee}`}
      </p>
      {cancelState.note && (
        <p className={`text-[11px] ${cancelState.overdue ? 'font-semibold text-amber-700' : 'text-slate-500'}`}>
          ⏱ {cancelState.note}
        </p>
      )}
      {cancelState.canCancel ? (
        <button
          type="button"
          onClick={onCancel}
          className="w-full rounded-lg border border-amber-200 bg-white py-2 text-sm font-medium text-amber-700 hover:bg-amber-50"
        >
          {cancelState.overdue ? 'Cancel order — long overdue' : 'Cancel order'}
        </button>
      ) : (
        <p className="text-[11px] text-slate-400">
          Being prepared — you can cancel if no rider is booked within {PREPARING_OVERDUE_MIN} min of acceptance.
        </p>
      )}
      <OrderChat
        messages={order.messages}
        viewerRole="customer"
        otherPartyLabel={vendor?.name ?? 'the vendor'}
        onSend={(text) => sendMedsOrderMessage(order.id, 'customer', text)}
      />
    </div>
  )
}
