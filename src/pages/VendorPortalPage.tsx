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
import { VendorFooterNav, type VendorTab } from '../components/VendorFooterNav'
import { VendorTrustedRiders } from '../components/VendorTrustedRiders'
import { PaymentAccountForm, ORDER_STATUS_LABELS } from './PharmacyPortalPage'
import type { MedsOrder, Ride } from '../types'

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
    vendorAcceptMenuOrder,
    rejectMedsOrder,
    processMedsOrder,
    updatePharmacyPaymentAccount,
    sendMedsOrderMessage,
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
  function goToTab(tab: VendorTab) {
    setActiveTab(tab)
    if (tab === 'book') setShowBooking(true)
    const refs: Record<VendorTab, RefObject<HTMLElement | null>> = {
      orders: ordersSectionRef,
      book: bookingSectionRef,
      earnings: earningsSectionRef,
      trusted: trustedSectionRef,
    }
    const scroll = () => refs[tab].current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setTimeout(scroll, 50)
    // Book Rider swaps a one-line button for a form with a map in it; the
    // page grows under the first scroll, so it is repeated once the form has
    // had a moment to lay out.
    if (tab === 'book') setTimeout(scroll, 400)
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
    (o) => o.status !== 'pending_confirmation' && o.status !== 'confirmed' && !activeIds.has(o.id),
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
            onClick={() => goToTab('book')}
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
        {outForDelivery.length === 0 && newOrders.length === 0 && readyToProcessOrders.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700">🧾 Orders</h2>
            <p className="mt-1 text-sm text-slate-400">No orders right now — new ones show up here the moment they're placed.</p>
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
                onAccept={() => vendorAcceptMenuOrder(order.id)}
                onReject={(reason) => rejectMedsOrder(order.id, reason)}
                onSendMessage={(text) => sendMedsOrderMessage(order.id, 'pharmacy', text)}
              />
            ))}
          </div>
        </section>
      )}

      {readyToProcessOrders.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Ready to process</h2>
          <div className="space-y-3">
            {readyToProcessOrders.map((order) => (
              <div key={order.id} className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700">{order.customerName}</span>
                  <span className="text-xs font-semibold text-slate-800">₱{order.total}</span>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {order.items.map((item) => `${item.quantity}x ${item.name}`).join(', ')}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Checked out {order.paidOnline ? `— ✓ paid online via ${order.paymentMethod}` : `— pays cash on delivery`}
                  {order.deliveryMode === 'self_book' ? ' · customer will book their own ride' : ' · you will dispatch a driver'}
                </p>
                {order.paymentProofDataUrl && (
                  <a href={order.paymentProofDataUrl} target="_blank" rel="noreferrer" className="mt-1.5 inline-block">
                    <img
                      src={order.paymentProofDataUrl}
                      alt="Payment confirmation"
                      className="h-14 w-14 rounded-md border border-emerald-300 object-cover"
                    />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => processMedsOrder(order.id)}
                  className="mt-2 w-full rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700"
                >
                  {order.deliveryMode === 'self_book' ? 'Mark ready for pickup' : 'Process & dispatch driver'}
                </button>
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
        <VendorEarnings orders={ownOrders} rides={rides} />
      </section>

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
      />
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
  onAccept,
  onReject,
  onSendMessage,
}: {
  order: MedsOrder
  onAccept: () => void
  onReject: (reason: string) => void
  onSendMessage: (text: string) => void
}) {
  const [rejectReason, setRejectReason] = useState('')
  const [contactOpen, setContactOpen] = useState(false)

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
        Deliver to: {order.deliveryAddress.label} · {order.paidOnline ? 'paid online' : 'pays cash on delivery'}
      </p>
      <div className="mt-3 space-y-1.5">
        <button
          type="button"
          onClick={onAccept}
          className="w-full rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700"
        >
          Accept order
        </button>
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
