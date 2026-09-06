import { useEffect, useRef, useState, type RefObject } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useRides } from '../context/RideContext'
import { AnnouncementFeed } from '../components/AnnouncementFeed'
import { useSession } from '../context/SessionContext'
import { OrderChat } from '../components/OrderChat'
import { VendorMenuManager } from '../components/VendorMenuManager'
import { PharmacyPortalPage, PaymentAccountForm, ORDER_STATUS_LABELS } from './PharmacyPortalPage'
import type { MedsOrder } from '../types'

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

  const vendor = pharmacies.find((p) => p.id === loggedInPharmacyId)
  if (!vendor) {
    return (
      <div className="mx-auto max-w-lg space-y-6 px-4 py-6">
        <p className="text-sm text-slate-400">Vendor not found.</p>
      </div>
    )
  }

  // A Pharmacy/Store account belongs on the Pharmacy/Store portal instead,
  // even if it happened to log in via /vendor — see PharmacyPortalPage.tsx's
  // file comment.
  if (vendor.businessType === 'pharmacy' || vendor.businessType === 'store') {
    return <PharmacyPortalPage />
  }

  const ownOrders = medsOrders.filter((o) => o.pharmacyId === vendor.id)
  // A Registered Vendor order is already priced at checkout — it has no
  // quote to send, only an Accept/Decline (see NewVendorOrderCard) — so
  // there's no "awaiting quote"/"quoted" split here like the Pharmacy/Store
  // portal has; it goes straight from new to ready-to-process.
  const newOrders = ownOrders.filter((o) => o.status === 'pending_confirmation')
  const readyToProcessOrders = ownOrders.filter((o) => o.status === 'confirmed')
  const pastOrders = ownOrders.filter((o) => o.status !== 'pending_confirmation' && o.status !== 'confirmed')
  const menu = medicineProducts.filter((p) => p.pharmacyId === vendor.id)

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-6">
      <AnnouncementFeed viewer="partners" />
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-medium text-slate-500">Logged in as</p>
        <h1 className="text-sm font-semibold text-slate-700">
          {vendor.businessType === 'resto_food' ? '🍽️' : '📦'} {vendor.name}
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          Exclusive access to {vendor.name} only — you can't view or manage any other vendor's orders or menu from
          here.
        </p>
        <p className="mt-2 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800">
          Registered Vendor — customers order straight off your priced menu (see Menu below). Accept a new order to
          start preparing it; no quote to send since it's already priced.
        </p>
      </section>

      {newOrders.length > 0 && (
        <section ref={ordersSectionRef} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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

      {/* VendorMenuManager renders its own full card — the same banner/info
          header VendorStorefront shows a customer, plus an editable menu
          list — so no extra section wrapper/heading here (that would just
          duplicate the header this already shows). */}
      <section ref={menuSectionRef}>
        <VendorMenuManager pharmacy={vendor} products={menu} />
      </section>

      <button
        type="button"
        onClick={() => navigate(`/vendor-page/${vendor.id}`)}
        className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:bg-slate-50"
      >
        <span>
          <span className="block text-sm font-semibold text-slate-700">🏪 My Vendor Page</span>
          <span className="mt-0.5 block text-xs text-slate-500">
            See exactly what a customer sees, and customize your cover photo, logo and theme color.
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-slate-400">
          ›
        </span>
      </button>

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
                <span className="text-[11px] text-slate-400">{ORDER_STATUS_LABELS[order.status]}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {order.items.map((item) => `${item.quantity}x ${item.name}`).join(', ')} · ₱{order.total}
              </p>
            </div>
          ))}
        </div>
      </section>
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

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">{order.customerName}</span>
        <span className="text-xs font-semibold text-slate-800">₱{order.total}</span>
      </div>
      {order.contactPhone && <p className="mt-0.5 text-[11px] text-slate-400">☎ {order.contactPhone}</p>}
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
