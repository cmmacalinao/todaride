import { useEffect, useRef, useState, type RefObject } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useRides } from '../context/RideContext'
import { AnnouncementFeed } from '../components/AnnouncementFeed'
import { useSession } from '../context/SessionContext'
import { OrderChat } from '../components/OrderChat'
import { ContactSheet } from '../components/ContactSheet'
import { VendorMenuManager } from '../components/VendorMenuManager'
import { VendorThemePicker } from '../components/VendorBrandingEditor'
import { VendorDeliveryBooking } from '../components/VendorDeliveryBooking'
import { ACTIVE_RIDE_STATUSES, VendorDeliveryTracker, deliveryPhaseLabel } from '../components/VendorDeliveryTracker'
import { VendorEarnings } from '../components/VendorEarnings'
import { storeRatingSummary } from '../components/StoreRatingSheet'
import { VendorFooterNav, type VendorTab } from '../components/VendorFooterNav'
import { TrustedRiderSelect, VendorTrustedRiders } from '../components/VendorTrustedRiders'
import { RealLiveMap, type MapPoint } from '../components/RealLiveMap'
import { OrderStatusStrip } from '../components/OrderStatusStrip'
import { distanceKm, suggestedRiderFee } from '../lib/vendorOrders'
import { formatAddressLine } from '../lib/addressFormat'
import { PaymentAccountForm, ORDER_STATUS_LABELS } from './PharmacyPortalPage'
import type { MedsOrder, Pharmacy, Ride } from '../types'

// A Registered Vendor's own portal (Resto/Food, Other Commodity) — split out
// from PharmacyPortalPage.tsx so "Vendor" naming stays exclusive to this
// flow instead of bleeding into the actual Pharmacy/Store portal. A vendor
// order is already priced off the vendor's own menu at checkout (see
// VendorMenuBooking.tsx), so there's no quote step here: a new order is
// either accepted as placed or declined (see NewVendorOrderCard) — no
// per-item pricing table like the Pharmacy/Store portal's QuoteOrderCard.
// Reached at the dedicated /vendor route (see App.tsx), with the same
// businessType delegation PharmacyPortalPage.tsx uses so either route always
// lands on the portal that actually matches the account.
export function VendorPortalPage() {
  const { loggedInPharmacyId } = useSession()
  const {
    pharmacies,
    medicineProducts,
    medsOrders,
    rides,
    vendorSendQuote,
    rejectMedsOrder,
    processMedsOrder,
    updatePharmacyPaymentAccount,
    sendMedsOrderMessage,
    addVendorSampleOrder,
  } = useRides()
  const location = useLocation()
  const navigate = useNavigate()
  // Scroll targets for the hamburger drawer's menu items (see
  // NavBar.tsx/NavDrawer.tsx) — hooks must run before the early returns
  // below (Rules of Hooks), so this is safe even on the "not logged in"/
  // "vendor not found" fallback renders that follow.
  const ordersSectionRef = useRef<HTMLElement>(null)
  const menuSectionRef = useRef<HTMLElement>(null)
  const paymentsSectionRef = useRef<HTMLElement>(null)
  const historySectionRef = useRef<HTMLElement>(null)
  const deliveriesSectionRef = useRef<HTMLElement>(null)
  const bookingSectionRef = useRef<HTMLDivElement>(null)
  const readyToProcessRef = useRef<HTMLElement>(null)
  const earningsSectionRef = useRef<HTMLElement>(null)
  const trustedSectionRef = useRef<HTMLElement>(null)
  const [showBooking, setShowBooking] = useState(false)
  // Which footer tab is lit — set by tapping one, so the bar reflects where
  // the vendor last asked to go rather than trying to track scrolling.
  const [activeTab, setActiveTab] = useState<VendorTab | null>('orders')
  const vendor = pharmacies.find((p) => p.id === loggedInPharmacyId)

  // The footer tabs scroll to their section; Book Rider also opens the
  // booking form, since a tab that lands on a closed card is a tab that
  // needs a second tap.
  // Book Rider means "book a rider for an accepted order": it lands on the
  // Ready-to-process card, which opens on its own Book Rider tab (see
  // ReadyOrderCard). The footer disables it while there is nothing accepted.
  // Phone and walk-in orders still have their own "Book a TODA SafeRide
  // delivery" card, reached from the page rather than the footer.
  function goToTab(tab: VendorTab) {
    setActiveTab(tab)
    const refs: Record<VendorTab, RefObject<HTMLElement | null>> = {
      orders: readyToProcessRef,
      book: readyToProcessRef,
      earnings: earningsSectionRef,
      trusted: trustedSectionRef,
    }
    if (tab === 'orders') refs.orders = ordersSectionRef
    setTimeout(() => refs[tab].current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  // The walk-in booking card, opened from the page itself.
  function openWalkInBooking() {
    setShowBooking(true)
    const scroll = () => bookingSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setTimeout(scroll, 50)
    // The card swaps a one-line button for a form with a map in it; the page
    // grows under the first scroll, so it is repeated once the form has laid
    // out.
    setTimeout(scroll, 400)
  }

  // A Pharmacy/Store account belongs on the Pharmacy/Store portal — actually
  // navigate there instead of just rendering PharmacyPortalPage inline, so
  // the address bar reads /pharmacy too (see PharmacyPortalPage.tsx's
  // matching effect for the reverse case).
  useEffect(() => {
    if (vendor && (vendor.businessType === 'pharmacy' || vendor.businessType === 'store')) {
      navigate('/pharmacy', { replace: true })
    }
  }, [vendor, navigate])

  useEffect(() => {
    const section = (location.state as { section?: string } | null)?.section
    if (!section) return
    navigate(location.pathname, { replace: true, state: {} })
    const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })
    // 'products' is the drawer's existing key for this slot (see
    // NavDrawer.tsx's PHARMACY_ITEMS, shared with the Pharmacy/Store
    // portal) — aliased to the Menu section here rather than adding a new
    // DrawerSection just for the label.
    const refs: Record<string, RefObject<HTMLElement | null>> = {
      orders: ordersSectionRef,
      products: menuSectionRef,
      payments: paymentsSectionRef,
      history: historySectionRef,
    }
    if (section === 'home') {
      scrollTop()
    } else if (refs[section]) {
      setTimeout(() => refs[section].current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  if (!loggedInPharmacyId) {
    // App.tsx only ever routes here once authedAccount.role === 'pharmacy'
    // (which always sets loggedInPharmacyId together — see AuthGate.tsx's
    // PharmacyAuth) — this is just a defensive fallback, not a real login
    // form, since there's no path that reaches /vendor without one.
    return (
      <div className="mx-auto max-w-lg space-y-6 px-4 py-6">
        <p className="text-sm text-slate-400">Not logged in.</p>
      </div>
    )
  }

  if (!vendor) {
    return (
      <div className="mx-auto max-w-lg space-y-6 px-4 py-6">
        <p className="text-sm text-slate-400">Vendor not found.</p>
      </div>
    )
  }

  // Redirecting above (see the effect) — render nothing while that happens
  // rather than the Pharmacy/Store portal at the /vendor URL.
  if (vendor.businessType === 'pharmacy' || vendor.businessType === 'store') {
    return null
  }

  const ownOrders = medsOrders.filter((o) => o.pharmacyId === vendor.id)
  // A Registered Vendor order is already priced at checkout — it has no
  // quote to send, only an Accept/Decline (see NewVendorOrderCard) — so
  // there's no "awaiting quote"/"quoted" split here like the Pharmacy/Store
  // portal has; it goes straight from new to ready-to-process.
  const newOrders = ownOrders.filter((o) => o.status === 'pending_confirmation')
  // Quotation sent, waiting for the customer to approve (and pay, unless
  // cash on delivery). Nothing to cook yet.
  const quotedOrders = ownOrders.filter((o) => o.status === 'quoted')
  const readyToProcessOrders = ownOrders.filter((o) => o.status === 'confirmed')
  // A dispatched order is only "done" once its ride is — the order status
  // itself stops at 'dispatched' (see PHARMACY_PROCESS_MEDS_ORDER), so the
  // linked ride is what says whether the food is still on the road.
  const linkedRide = (o: MedsOrder): Ride | undefined => (o.linkedRideId ? rides.find((r) => r.id === o.linkedRideId) : undefined)
  const outForDelivery = ownOrders.filter((o) => {
    if (o.status !== 'dispatched') return false
    const ride = linkedRide(o)
    return !!ride && ACTIVE_RIDE_STATUSES.has(ride.status)
  })
  const activeIds = new Set(outForDelivery.map((o) => o.id))
  const pastOrders = ownOrders.filter(
    (o) => o.status !== 'pending_confirmation' && o.status !== 'quoted' && o.status !== 'confirmed' && !activeIds.has(o.id),
  )
  const historyLabel = (o: MedsOrder) => {
    const ride = o.status === 'dispatched' ? linkedRide(o) : undefined
    return ride ? deliveryPhaseLabel(ride) : ORDER_STATUS_LABELS[o.status]
  }
  const menu = medicineProducts.filter((p) => p.pharmacyId === vendor.id)

  return (
    // Tighter than the other portals on purpose (the vendor asked for ~60%
    // less air): 10px between cards and 6px to the screen edge, instead of
    // the 24px/16px the shared layout uses.
    // pb-20 reserves the bottom strip for VendorFooterNav.
    <div className="mx-auto max-w-lg space-y-2.5 px-1.5 py-2.5 pb-20">
      <AnnouncementFeed viewer="partners" />
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-medium text-slate-500">Logged in as</p>
        <h1 className="text-sm font-semibold text-slate-700">
          {vendor.businessType === 'resto_food' ? '🍽️' : '📦'} {vendor.name}
        </h1>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <VendorThemePicker pharmacy={vendor} />
      </section>

      <button
        type="button"
        onClick={() => navigate(`/vendor-page/${vendor.id}`)}
        className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:bg-slate-50"
      >
        <span>
          <span className="block text-sm font-semibold text-slate-700">🏪 View My Page</span>
        </span>
        <span aria-hidden className="shrink-0 text-slate-400">
          ›
        </span>
      </button>

      {/* The vendor's own way to put an order on the road — for the ones
          that came by phone or at the counter and never touched the app.
          Wrapped so the footer's Book Rider tab has something to scroll to
          whether the form is open or not. */}
      <div ref={bookingSectionRef} className="scroll-mt-24">
        {showBooking ? (
          <VendorDeliveryBooking vendor={vendor} onClose={() => setShowBooking(false)} />
        ) : (
          <button
            type="button"
            onClick={openWalkInBooking}
            className="flex w-full items-center justify-between rounded-xl border border-brand-200 bg-brand-50 p-4 text-left shadow-sm transition hover:bg-brand-100"
          >
            <span>
              <span className="block text-sm font-semibold text-brand-800">🛺 Book a TODA SafeRide delivery</span>
              <span className="block text-[11px] text-brand-700/80">Send a driver for a phone or walk-in order</span>
            </span>
            <span aria-hidden className="shrink-0 text-brand-400">
              ›
            </span>
          </button>
        )}
      </div>

      {/* Always rendered, even with nothing in it, so the Orders tab has a
          place to land — a tab that scrolls nowhere reads as broken. */}
      <section ref={ordersSectionRef} className="scroll-mt-24 space-y-2.5">
        {outForDelivery.length === 0 && newOrders.length === 0 && quotedOrders.length === 0 && readyToProcessOrders.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700">🧾 Orders</h2>
            <p className="mt-1 text-sm text-slate-400">No orders right now — new ones show up here the moment they're placed.</p>
            <button
              type="button"
              onClick={() => addVendorSampleOrder(vendor.id)}
              className="mt-2 rounded-lg border border-dashed border-brand-300 bg-brand-50 px-3 py-1.5 text-[11px] font-semibold text-brand-700 hover:bg-brand-100"
            >
              ＋ Add a sample order to try Book Rider
            </button>
            <p className="mt-1 text-[10px] text-slate-400">
              Prototype only — an accepted order from a demo customer, built from your menu, delivered a few streets away.
            </p>
          </div>
        )}

      {outForDelivery.length > 0 && (
        <section ref={deliveriesSectionRef} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">🛺 Out for delivery</h2>
          <div className="space-y-3">
            {outForDelivery.map((order) => (
              <VendorDeliveryTracker key={order.id} order={order} ride={linkedRide(order)!} vendor={vendor} />
            ))}
          </div>
        </section>
      )}

      {newOrders.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">New orders</h2>
          <div className="space-y-3">
            {newOrders.map((order) => (
              <NewVendorOrderCard
                key={order.id}
                order={order}
                vendor={vendor}
                onAccept={(deliveryFee) => vendorSendQuote(order.id, deliveryFee)}
                onReject={(reason) => rejectMedsOrder(order.id, reason)}
                onSendMessage={(text) => sendMedsOrderMessage(order.id, 'pharmacy', text)}
              />
            ))}
          </div>
        </section>
      )}

      {quotedOrders.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">📄 Quotation sent — waiting for the customer</h2>
          <div className="space-y-2">
            {quotedOrders.map((order) => (
              <div key={order.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700">{order.customerName}</span>
                  <span className="text-xs font-semibold text-slate-800">₱{order.total}</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-600">{order.items.map((item) => `${item.quantity}x ${item.name}`).join(', ')}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Goods ₱{order.subtotal} + rider ₱{order.deliveryFee} + service ₱{order.serviceFee} · sent{' '}
                  {order.quotedAt ? new Date(order.quotedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </p>
                <p className="mt-1 text-[11px] text-amber-700">Don't start preparing yet — they approve (and pay, unless cash on delivery) first.</p>
                <div className="mt-2">
                  <OrderChat
                    messages={order.messages}
                    viewerRole="pharmacy"
                    otherPartyLabel={order.customerName}
                    onSend={(text) => sendMedsOrderMessage(order.id, 'pharmacy', text)}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {readyToProcessOrders.length > 0 && (
        <section ref={readyToProcessRef} className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">✅ Approved — prepare & book the rider</h2>
          <div className="space-y-3">
            {readyToProcessOrders.map((order) => (
              <ReadyOrderCard
                key={order.id}
                order={order}
                vendor={vendor}
                onProcess={(preferredDriverId) => processMedsOrder(order.id, preferredDriverId)}
                onSendMessage={(text) => sendMedsOrderMessage(order.id, 'pharmacy', text)}
              />
            ))}
          </div>
        </section>
      )}
      {(outForDelivery.length > 0 || newOrders.length > 0 || readyToProcessOrders.length > 0) && (
        <button
          type="button"
          onClick={() => addVendorSampleOrder(vendor.id)}
          className="text-[11px] font-medium text-slate-400 hover:text-brand-700"
        >
          ＋ Add another sample order (demo)
        </button>
      )}

      {/* Every order sent to this store, newest first, with where each one
          is — the same strip the customer and the driver see, so all three
          are reading one story. The cards above are the ones needing
          action; this is the ledger. */}
      {ownOrders.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">📦 Order status</h2>
          <div className="space-y-2">
            {[...ownOrders]
              .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())
              .slice(0, 10)
              .map((order) => (
                <div key={order.id} className="rounded-lg border border-slate-200 p-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-700">
                      {order.customerName}
                      {order.vendorBooked && <span className="ml-1 text-[10px] text-sky-700">· booked by you</span>}
                    </span>
                    <span className="font-semibold text-slate-700">₱{order.total}</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {order.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')} ·{' '}
                    {new Date(order.requestedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <div className="mt-1.5">
                    <OrderStatusStrip order={order} ride={linkedRide(order)} compact />
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
      </section>

      {/* VendorMenuManager renders its own full card — the same banner/info
          header VendorStorefront shows a customer, plus an editable menu
          list — so no extra section wrapper/heading here (that would just
          duplicate the header this already shows). */}
      <section ref={menuSectionRef}>
        <VendorMenuManager pharmacy={vendor} products={menu} />
      </section>

      <section ref={earningsSectionRef} className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">💰 Earnings</h2>
        <VendorEarnings vendor={vendor} orders={ownOrders} rides={rides} />
      </section>

      {(() => {
        const { average, count } = storeRatingSummary(vendor)
        const reviews = (vendor.storeReviews ?? []).slice(0, 10)
        return (
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700">⭐ Store rating</h2>
            {count === 0 ? (
              <p className="mt-1 text-sm text-slate-400">No customer ratings yet — customers can rate your store from your page.</p>
            ) : (
              <>
                <p className="mt-1 text-sm text-slate-700">
                  <span className="text-lg font-extrabold text-amber-500">★ {average.toFixed(1)}</span>{' '}
                  <span className="text-xs text-slate-500">
                    from {count} {count === 1 ? 'rating' : 'ratings'}
                  </span>
                </p>
                <div className="mt-2 space-y-1.5">
                  {reviews.map((r) => (
                    <div key={r.customerId} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs">
                      <p className="text-slate-700">
                        <span className="text-amber-500">{'★'.repeat(r.rating)}</span>
                        <span className="text-slate-300">{'★'.repeat(5 - r.rating)}</span>{' '}
                        <span className="font-medium">{r.customerName}</span>
                        <span className="text-slate-400"> · {new Date(r.at).toLocaleDateString()}</span>
                      </p>
                      {r.text && <p className="text-[11px] text-slate-500">{r.text}</p>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        )
      })()}

      <section ref={trustedSectionRef} className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-700">⭐ Trusted Riders</h2>
        <VendorTrustedRiders vendor={vendor} />
      </section>

      <section ref={paymentsSectionRef} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Payment accounts</h2>
        <p className="mt-1 text-xs text-slate-500">
          Customers who pay by GCash or Maya see this account's QR code and number so they can send payment directly
          to you — cash is still collected by the driver on delivery instead.
        </p>
        <div className="mt-3 space-y-3">
          <PaymentAccountForm
            label="GCash"
            details={vendor.gcashAccount}
            onSave={(details) => updatePharmacyPaymentAccount(vendor.id, 'gcash', details)}
          />
          <PaymentAccountForm
            label="Maya"
            details={vendor.mayaAccount}
            onSave={(details) => updatePharmacyPaymentAccount(vendor.id, 'maya', details)}
          />
        </div>
      </section>

      <section ref={historySectionRef} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Order history</h2>
        {pastOrders.length === 0 && <p className="text-sm text-slate-400">No past orders yet.</p>}
        <div className="space-y-2">
          {pastOrders.map((order) => (
            <div key={order.id} className="rounded-lg border border-slate-200 p-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-700">{order.customerName}</span>
                <span className="text-[11px] text-slate-400">{historyLabel(order)}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {order.items.map((item) => `${item.quantity}x ${item.name}`).join(', ')} · ₱{order.total}
              </p>
            </div>
          ))}
        </div>
      </section>

      <VendorFooterNav
        active={activeTab}
        onNavigate={goToTab}
        orderCount={newOrders.length + readyToProcessOrders.length}
        bookEnabled={readyToProcessOrders.length > 0}
      />
    </div>
  )
}

// An accepted order waiting for the vendor to hand it to a driver. The one
// choice here is who: any available rider, or one of the vendor's trusted
// riders picked for this delivery (see TrustedRiderSelect).
function ReadyOrderCard({
  order,
  vendor,
  onProcess,
  onSendMessage,
}: {
  order: MedsOrder
  vendor: Pharmacy
  onProcess: (preferredDriverId: string | null) => void
  onSendMessage: (text: string) => void
}) {
  const [preferredDriverId, setPreferredDriverId] = useState<string | null>(null)
  const dispatches = order.deliveryMode !== 'self_book'
  // Two tabs on an accepted order: what was ordered, and booking the rider.
  // Opens on Book Rider — accepting was the last decision, booking is the
  // next one, and it should be one tap away rather than under the details.
  const [tab, setTab] = useState<'order' | 'book'>(dispatches ? 'book' : 'order')
  const storeGps = vendor.locationGps ?? { lat: 15.7940977, lng: 120.9905849 }
  const storeIcon = vendor.businessType === 'pharmacy' || vendor.businessType === 'store' ? 'pharmacy' : 'resto'
  const mapPoints: MapPoint[] = [
    { id: 'store', gps: storeGps, color: '#ea580c', label: vendor.name, icon: storeIcon },
    ...(order.deliveryAddress.gps
      ? [{ id: 'customer', gps: order.deliveryAddress.gps, color: '#e11d48', label: `Deliver to — ${formatAddressLine(order.deliveryAddress.label)}` }]
      : []),
  ]
  const driverCollects = order.paidOnline ? order.deliveryFee + order.serviceFee : order.total
  const tabClass = (active: boolean) =>
    `flex-1 rounded-md px-2 py-1 text-[11px] font-semibold transition ${
      active ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
    }`

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium text-slate-700">{order.customerName}</span>
        <span className="text-xs font-semibold text-slate-800">₱{order.total}</span>
      </div>
      <p className="mt-0.5 text-[11px] font-semibold text-emerald-700">
        ✓ Approved{order.paidOnline ? ` · paid online via ${order.paymentMethod}` : ' · cash on delivery'} —{' '}
        {dispatches ? 'prepare it, then book a rider' : 'customer will book their own ride'}
      </p>
      {order.paymentProofDataUrl && (
        <a href={order.paymentProofDataUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block">
          <img src={order.paymentProofDataUrl} alt="Payment proof" className="h-12 w-12 rounded-md border border-emerald-300 object-cover" />
        </a>
      )}

      {dispatches && (
        <div className="mt-2 flex gap-1 rounded-lg bg-emerald-100/70 p-1">
          <button type="button" onClick={() => setTab('order')} className={tabClass(tab === 'order')}>
            🧾 Order
          </button>
          <button type="button" onClick={() => setTab('book')} className={tabClass(tab === 'book')}>
            🛺 Book Rider
          </button>
        </div>
      )}

      {tab === 'order' && (
        <>
          <div className="mt-2 space-y-1 rounded-lg bg-white p-2.5 text-xs">
            {order.items.map((item, i) => (
              <div key={`${item.productId}-${i}`} className="flex items-center justify-between">
                <span className="text-slate-600">
                  {item.quantity}x {item.name}
                </span>
                <span className="font-medium text-slate-700">₱{item.unitPrice * item.quantity}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-slate-100 pt-1 text-slate-500">
              <span>Delivery + service fee</span>
              <span>₱{order.deliveryFee + order.serviceFee}</span>
            </div>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {order.paidOnline ? `✓ Paid online via ${order.paymentMethod}` : 'Pays cash on delivery'} · 🏁 {order.deliveryAddress.label}
            {order.contactPhone ? ` · ☎ ${order.contactPhone}` : ''}
          </p>
          {order.paymentProofDataUrl && (
            <a href={order.paymentProofDataUrl} target="_blank" rel="noreferrer" className="mt-1.5 inline-block">
              <img src={order.paymentProofDataUrl} alt="Payment confirmation" className="h-14 w-14 rounded-md border border-emerald-300 object-cover" />
            </a>
          )}
          {!dispatches && (
            <button
              type="button"
              onClick={() => onProcess(null)}
              className="mt-2 w-full rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700"
            >
              Mark ready for pickup
            </button>
          )}
          <div className="mt-2">
            <OrderChat messages={order.messages} viewerRole="pharmacy" otherPartyLabel={order.customerName} onSend={onSendMessage} />
          </div>
        </>
      )}

      {tab === 'book' && dispatches && (
        <div className="mt-2 space-y-2">
          {/* The order itself, highlighted, above the map: what is going,
              where, to whom, and what the rider handles — the facts a
              vendor checks before handing it over. Booking sits below. */}
          <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-2.5 text-xs">
            <p className="text-[10px] font-bold uppercase tracking-wide text-amber-800">Order to deliver</p>
            <div className="mt-1 space-y-0.5">
              {order.items.map((item, i) => (
                <div key={`${item.productId}-${i}`} className="flex items-center justify-between text-slate-700">
                  <span className="font-medium">
                    {item.quantity}x {item.name}
                  </span>
                  <span>₱{item.unitPrice * item.quantity}</span>
                </div>
              ))}
            </div>
            <div className="mt-1 flex items-center justify-between border-t border-amber-200 pt-1 font-semibold text-slate-800">
              <span>Customer pays</span>
              <span>₱{order.total}</span>
            </div>
            <p className="mt-1.5 text-slate-700">
              🏁 {order.deliveryAddress.label}
            </p>
            <p className="text-slate-700">
              👤 {order.customerName}
              {order.contactPhone ? ` · ☎ ${order.contactPhone}` : ''}
            </p>
            <p className="mt-1 text-[11px] text-amber-800">
              {order.paidOnline
                ? `Paid online — the rider collects only the ₱${driverCollects} delivery & service fee.`
                : `Cash on delivery — the rider pays you ₱${order.subtotal} at pickup and collects ₱${driverCollects} from the customer.`}
            </p>
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <RealLiveMap points={mapPoints} height="180px" hideLegend />
          </div>
          <TrustedRiderSelect vendor={vendor} value={preferredDriverId} onChange={setPreferredDriverId} />
          <button
            type="button"
            onClick={() => onProcess(preferredDriverId)}
            className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            🛺 Book TODA SafeRide rider now
          </button>
        </div>
      )}
    </div>
  )
}

// A Registered Vendor order, already priced off the vendor's own menu at
// checkout (see VendorMenuBooking) — there's nothing to price here, only a
// single decision: accept it as placed (see VENDOR_ACCEPT_MENU_ORDER) or
// decline it. Once accepted it drops into "Ready to process" above like any
// other confirmed MedsOrder.
function NewVendorOrderCard({
  order,
  vendor,
  onAccept,
  onReject,
  onSendMessage,
}: {
  order: MedsOrder
  vendor: Pharmacy
  // Accepting sends the quotation: the goods as ordered plus this rider fee.
  onAccept: (deliveryFee: number) => void
  onReject: (reason: string) => void
  onSendMessage: (text: string) => void
}) {
  const [rejectReason, setRejectReason] = useState('')
  const [contactOpen, setContactOpen] = useState(false)
  // Suggested from the distance between the store's pin and the customer's;
  // the vendor can change it before sending.
  const km = distanceKm(vendor.locationGps, order.deliveryAddress.gps)
  const suggested = suggestedRiderFee(vendor.locationGps, order.deliveryAddress.gps)
  const [feeInput, setFeeInput] = useState(String(suggested))
  const riderFee = Math.max(0, Math.round(Number(feeInput) || 0))
  const quoteTotal = order.subtotal + riderFee + order.serviceFee

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">{order.customerName}</span>
        <span className="text-xs font-semibold text-slate-800">₱{order.total}</span>
      </div>
      {order.contactPhone && (
        <button
          type="button"
          onClick={() => setContactOpen(true)}
          className="mt-0.5 text-[11px] font-medium text-brand-700 hover:underline"
        >
          ☎ {order.contactPhone} — Call or text
        </button>
      )}
      {contactOpen && order.contactPhone && (
        <ContactSheet name={order.customerName} phone={order.contactPhone} onClose={() => setContactOpen(false)} />
      )}
      <div className="mt-2 space-y-1 rounded-lg bg-slate-50 p-2.5 text-xs">
        {order.items.map((item, i) => (
          <div key={`${item.productId}-${i}`} className="flex items-center justify-between">
            <span className="text-slate-600">
              {item.quantity}x {item.name}
            </span>
            <span className="font-medium text-slate-700">₱{item.unitPrice * item.quantity}</span>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-slate-400">
        🏁 {order.deliveryAddress.label}
        {km != null && ` · ${km} km from your store`}
      </p>

      {/* The quotation this order will get. Goods are fixed (the menu priced
          them); the rider fee is the vendor's call, suggested by distance. */}
      <div className="mt-2 rounded-lg border border-brand-200 bg-brand-50 p-2.5 text-xs">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-brand-800">Quotation to send</p>
        <div className="flex items-center justify-between text-slate-600">
          <span>Goods</span>
          <span>₱{order.subtotal}</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-slate-600">
          <span>
            Rider fee <span className="text-slate-400">(suggested ₱{suggested})</span>
          </span>
          <span className="flex items-center gap-1">
            ₱
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={feeInput}
              onChange={(e) => setFeeInput(e.target.value)}
              className="w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-right text-xs"
            />
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between text-slate-600">
          <span>Service fee (platform)</span>
          <span>₱{order.serviceFee}</span>
        </div>
        <div className="mt-1 flex items-center justify-between border-t border-brand-200 pt-1 font-semibold text-slate-800">
          <span>Customer pays</span>
          <span>₱{quoteTotal}</span>
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        <button
          type="button"
          onClick={() => onAccept(riderFee)}
          className="w-full rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700"
        >
          Accept & send quotation — ₱{quoteTotal}
        </button>
        <p className="text-center text-[10px] text-slate-400">
          The customer approves it and picks cash on delivery or pays you online first — then you prepare and book the rider.
        </p>
        <div className="flex gap-2">
          <input
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for declining (optional)"
            className="flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
          />
          <button
            type="button"
            onClick={() => onReject(rejectReason.trim() || 'Unable to fulfill this order')}
            className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50"
          >
            Decline
          </button>
        </div>
        <OrderChat messages={order.messages} viewerRole="pharmacy" otherPartyLabel={order.customerName} onSend={onSendMessage} />
      </div>
    </div>
  )
}
