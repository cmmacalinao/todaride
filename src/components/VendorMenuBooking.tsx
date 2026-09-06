import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRides } from '../context/RideContext'
import { DEFAULT_MEDS_DELIVERY_FEE, DEFAULT_MEDS_SERVICE_FEE, PAYMENT_METHODS } from '../mock/data'
import { resolvePhAddress, type PhAddressTags } from '../lib/customLocation'
import { BarangayAddressPicker } from './BarangayAddressPicker'
import { DeliveryMapPicker } from './DeliveryMapPicker'
import { OrderChat } from './OrderChat'
import { TripMonitor } from './TripMonitor'
import { VendorFeatureCard, VendorStorefront } from './VendorStorefront'
import type { BusinessType, MedicineProduct, MedsOrder, MockLocation, Pharmacy } from '../types'

const VENDOR_BUSINESS_TYPES: BusinessType[] = ['resto_food', 'other_commodity']

const VENDOR_TYPE_ICONS: Record<string, string> = {
  resto_food: '🍽️',
  other_commodity: '📦',
}

// An order still counts as "in flight" at any pre-terminal status — same
// rule MedsBooking's activeOrder uses.
const ACTIVE_STATUSES = new Set(['pending_confirmation', 'confirmed'])

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
}: {
  customerId: string
  customerName: string
  defaultProvince: string
  defaultCity: string
  defaultBarangay: string
  defaultAddressDetail: string
  defaultContactPhone?: string | null
}) {
  const { rides, pharmacies, medicineProducts, medsOrders, createMedsOrder, cancelMedsOrder } = useRides()
  const navigate = useNavigate()

  const vendors = useMemo(
    () => pharmacies.filter((p) => VENDOR_BUSINESS_TYPES.includes(p.businessType) && p.verificationStatus === 'approved'),
    [pharmacies],
  )

  const [step, setStep] = useState<'browse' | 'menu' | 'checkout'>('browse')
  const [vendorSearch, setVendorSearch] = useState('')
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null)
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
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'gcash'>('cash')
  const [dismissedOrderIds, setDismissedOrderIds] = useState<Set<string>>(new Set())
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

  // Seeded once from the profile — later edits come through the picker
  // below, same pattern MedsBooking uses for its own delivery address.
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

  const selectedVendor = vendors.find((v) => v.id === selectedVendorId)
  const menu = selectedVendor ? medicineProducts.filter((p) => p.pharmacyId === selectedVendor.id) : []

  const cartLines = Object.entries(cart)
    .filter(([, qty]) => qty > 0)
    .map(([productId, qty]) => ({ product: menu.find((m) => m.id === productId), qty }))
    .filter((l): l is { product: MedicineProduct; qty: number } => !!l.product)
  const subtotal = cartLines.reduce((sum, l) => sum + l.product.price * l.qty, 0)
  const total = subtotal + DEFAULT_MEDS_DELIVERY_FEE + DEFAULT_MEDS_SERVICE_FEE

  function setQty(productId: string, qty: number) {
    setCart((prev) => ({ ...prev, [productId]: Math.max(0, qty) }))
  }

  function openVendor(vendorId: string) {
    setSelectedVendorId(vendorId)
    setCart({})
    setStep('menu')
  }

  function backToBrowse() {
    setSelectedVendorId(null)
    setCart({})
    setStep('browse')
  }

  async function handleAddressResolve(address: PhAddressTags) {
    const location = await resolvePhAddress(address)
    setDeliveryAddress(location)
    setDeliveryPinned(false)
  }

  // From the map — a tap, a drag, or the GPS button. The location is the
  // exact point; the guess (when the pin landed somewhere in our address
  // tree) re-seeds the dropdowns beneath so both say the same thing.
  function handleMapPin(location: MockLocation, guess: PhAddressTags | null) {
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
      paymentMethod,
      // The vendor dispatches once they accept — see VENDOR_ACCEPT_MENU_ORDER
      // and PHARMACY_PROCESS_MEDS_ORDER — not a "book your own ride" order.
      deliveryMode: 'pharmacy_books',
      contactPhone: contactPhone.trim(),
      pricedFromMenu: true,
    })
    setCart({})
    setSelectedVendorId(null)
    setStep('browse')
  }

  if (activeOrder) {
    return (
      <ActiveVendorOrderCard
        order={activeOrder}
        onCancel={() => cancelMedsOrder(activeOrder.id)}
        onDismiss={() => setDismissedOrderIds((prev) => new Set(prev).add(activeOrder.id))}
      />
    )
  }

  const query = vendorSearch.trim().toLowerCase()
  const shownVendors = vendors.filter(
    (v) => !query || v.name.toLowerCase().includes(query) || v.barangay.toLowerCase().includes(query) || v.city.toLowerCase().includes(query),
  )

  return (
    <div className="space-y-3">
      {step === 'browse' && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => navigate('/book/start')}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            ‹ Back
          </button>

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
            placeholder="Search vendors by name or barangay"
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

          {shownVendors.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1 text-sm font-bold text-slate-700">🌟 Featured Vendors</p>
              <div className="grid grid-cols-2 gap-2.5">
                {shownVendors.map((v) => (
                  <VendorFeatureCard
                    key={v.id}
                    pharmacy={v}
                    itemCount={medicineProducts.filter((p) => p.pharmacyId === v.id).length}
                    onSelect={() => openVendor(v.id)}
                  />
                ))}
              </div>
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
            onCheckout={() => setStep('checkout')}
          />
        </div>
      )}

      {step === 'checkout' && selectedVendor && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStep('menu')}
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
              <span>Delivery fee</span>
              <span>₱{DEFAULT_MEDS_DELIVERY_FEE}</span>
            </div>
            <div className="flex items-center justify-between text-slate-500">
              <span>Service fee</span>
              <span>₱{DEFAULT_MEDS_SERVICE_FEE}</span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 pt-1 font-semibold text-slate-800">
              <span>Total</span>
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

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Payment method</label>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentMethod(m.id as 'cash' | 'gcash')}
                  className={`rounded-lg border py-2 text-xs font-medium transition ${
                    paymentMethod === m.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              {paymentMethod === 'cash'
                ? 'Pay the driver in cash on delivery.'
                : 'Charged now — simulated for this prototype, no real gateway.'}
            </p>
          </div>

          <button
            type="button"
            onClick={handlePlaceOrder}
            disabled={!canPlaceOrder}
            className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Place order — ₱{total}
          </button>
        </div>
      )}

      {pastOrders.length > 0 && step === 'browse' && (
        <section>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="mb-2 flex w-full items-center justify-between text-sm font-semibold text-slate-700"
          >
            My Vendor Orders
            <span className="text-xs text-slate-400">{showHistory ? '▲ Hide' : '▼ Show'}</span>
          </button>
          {showHistory && (
            <div className="space-y-2">
              {pastOrders.map((order) => (
                <div key={order.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-700">{order.items.map((i) => i.name).join(', ')}</span>
                    <span className="text-[11px] text-slate-400">{order.status}</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {pharmacies.find((p) => p.id === order.pharmacyId)?.name ?? 'Vendor'}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    ₱{order.total} · {new Date(order.requestedAt).toLocaleString()}
                  </p>
                  {order.status === 'rejected' && order.rejectionReason && (
                    <p className="mt-1 text-xs text-amber-700">Vendor declined: {order.rejectionReason}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
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
  const { rides, pharmacies, sendMedsOrderMessage } = useRides()
  const linkedRide = order.linkedRideId ? rides.find((r) => r.id === order.linkedRideId) : null
  const vendor: Pharmacy | undefined = pharmacies.find((p) => p.id === order.pharmacyId)

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

  return (
    <div className="space-y-2 rounded-xl border border-brand-200 bg-brand-50 p-4">
      <p className="text-sm font-semibold text-brand-800">
        {order.status === 'pending_confirmation'
          ? `Waiting for ${vendor?.name ?? 'the vendor'} to accept your order`
          : order.paidOnline
            ? '✓ Paid — the vendor is preparing your order'
            : 'Accepted — the vendor is preparing your order'}
      </p>
      <p className="text-xs text-slate-500">{VENDOR_TYPE_ICONS[vendor?.businessType ?? ''] ?? '🏪'} {vendor?.name ?? 'Vendor'}</p>
      <p className="text-xs text-slate-600">{order.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}</p>
      <p className="text-xs font-semibold text-slate-700">Total ₱{order.total}</p>
      <button
        type="button"
        onClick={onCancel}
        className="w-full rounded-lg border border-amber-200 bg-white py-2 text-sm font-medium text-amber-700 hover:bg-amber-50"
      >
        Cancel order
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
