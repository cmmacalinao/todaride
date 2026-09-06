import { useState } from 'react'
import { useRides } from '../context/RideContext'
import { DEFAULT_VENDOR_MONTHLY_FEE, DEFAULT_VENDOR_PER_ORDER_FEE } from '../mock/data'
import { SaasFeeCard } from './SaasFeeCard'
import type { MedsOrder, Pharmacy, Ride } from '../types'

// What a delivered order earns the vendor: the goods. The delivery and
// service fees belong to the driver and the platform and never pass through
// the vendor's hands — a cash order has the driver pay the goods to the
// vendor at pickup and collect everything from the customer; a paid order
// was settled with the vendor directly. Either way the vendor's take is the
// subtotal, less the platform's per-order fee (see Pharmacy.perOrderFee).

type Period = 'today' | 'week' | 'month' | 'year' | 'all'

const PERIODS: { id: Period; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
  { id: 'year', label: 'Yearly' },
  { id: 'all', label: 'All time' },
]

function periodStart(period: Period): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  switch (period) {
    case 'today':
      return d.getTime()
    case 'week': {
      // Monday-start weeks, the way a sari-sari ledger is ruled.
      const day = (d.getDay() + 6) % 7
      d.setDate(d.getDate() - day)
      return d.getTime()
    }
    case 'month':
      d.setDate(1)
      return d.getTime()
    case 'year':
      d.setMonth(0, 1)
      return d.getTime()
    case 'all':
      return 0
  }
}

const peso = (n: number) => `₱${n.toLocaleString()}`

export function VendorEarnings({ vendor, orders, rides }: { vendor: Pharmacy; orders: MedsOrder[]; rides: Ride[] }) {
  const { drivers } = useRides()
  const [period, setPeriod] = useState<Period>('today')
  const [openId, setOpenId] = useState<string | null>(null)

  const perOrderFee = vendor.perOrderFee ?? DEFAULT_VENDOR_PER_ORDER_FEE
  const monthlyFee = vendor.monthlyPlatformFee ?? DEFAULT_VENDOR_MONTHLY_FEE

  // Delivered = dispatched and the ride actually completed. Anything still
  // on the road, or cancelled, is not money yet.
  const delivered = orders
    .filter((o) => o.status === 'dispatched')
    .map((o) => ({ order: o, ride: rides.find((r) => r.id === o.linkedRideId) }))
    .filter((x): x is { order: MedsOrder; ride: Ride } => !!x.ride && x.ride.status === 'completed')
    .map((x) => ({ ...x, at: new Date(x.ride.completedAt ?? x.order.requestedAt).getTime() }))
    .sort((a, b) => b.at - a.at)

  const since = periodStart(period)
  const inPeriod = delivered.filter((d) => d.at >= since)
  const sales = inPeriod.reduce((s, d) => s + d.order.subtotal, 0)
  const fees = inPeriod.length * perOrderFee
  const net = sales - fees
  const deliveredThisMonth = delivered.filter((d) => d.at >= periodStart('month')).length

  const stat = (label: string, value: string, tone = 'text-slate-800') => (
    <div className="rounded-lg bg-slate-50 p-2.5 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-base font-extrabold ${tone}`}>{value}</p>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex gap-1 overflow-x-auto rounded-full bg-slate-100 p-1">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPeriod(p.id)}
            className={`shrink-0 flex-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
              period === p.id ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {stat('Sales', peso(sales))}
        {stat('Delivered orders', String(inPeriod.length))}
        {stat('Platform dues', `− ${peso(fees)}`, 'text-amber-700')}
        {stat('Net', peso(net), 'text-emerald-700')}
      </div>
      <p className="text-[11px] text-slate-400">
        Sales is the food/goods amount of every delivered order; the ₱{perOrderFee} per-order platform fee is what you owe
        TODASafeRide (billed monthly below). Delivery and service fees go to the driver and platform through the
        customer, not through you.
      </p>

      <div>
        <p className="mb-1 text-xs font-semibold text-slate-600">Order details</p>
        {inPeriod.length === 0 ? (
          <p className="text-sm text-slate-400">
            No delivered orders {period === 'all' ? 'yet' : `for this ${period === 'today' ? 'day' : PERIODS.find((p) => p.id === period)?.label.toLowerCase().replace('ly', '')}`}.
          </p>
        ) : (
          <div className="space-y-1.5">
            {inPeriod.slice(0, 50).map(({ order, ride, at }) => {
              const open = openId === order.id
              const driver = ride.driverId ? drivers.find((d) => d.id === ride.driverId) : null
              return (
                <div key={order.id} className="rounded-lg border border-slate-200 text-xs">
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : order.id)}
                    className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-700">
                        {order.customerName}
                        {order.vendorBooked && <span className="ml-1 text-[10px] text-sky-700">· booked by you</span>}
                      </p>
                      <p className="truncate text-[11px] text-slate-400">
                        {order.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')} ·{' '}
                        {new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold text-emerald-700">
                      +{peso(order.subtotal)} <span className="text-slate-400">{open ? '▲' : '▼'}</span>
                    </span>
                  </button>
                  {open && (
                    <div className="space-y-1 border-t border-slate-100 px-2.5 py-2 text-[11px] text-slate-600">
                      {order.items.map((i, idx) => (
                        <div key={`${i.productId}-${idx}`} className="flex justify-between">
                          <span>
                            {i.quantity}x {i.name}
                          </span>
                          <span>{peso(i.unitPrice * i.quantity)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between border-t border-slate-100 pt-1 font-semibold text-slate-700">
                        <span>Goods (your sales)</span>
                        <span>{peso(order.subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>Delivery fee (driver)</span>
                        <span>{peso(order.deliveryFee)}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>Service fee (platform, paid by customer)</span>
                        <span>{peso(order.serviceFee)}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>Customer paid in total</span>
                        <span>{peso(order.total)}</span>
                      </div>
                      <div className="flex justify-between text-amber-700">
                        <span>Your platform fee for this order</span>
                        <span>− {peso(perOrderFee)}</span>
                      </div>
                      <div className="flex justify-between font-semibold text-emerald-700">
                        <span>Net to you</span>
                        <span>{peso(order.subtotal - perOrderFee)}</span>
                      </div>
                      <p className="pt-1 text-slate-500">
                        {order.paidOnline ? `Paid online via ${order.paymentMethod}` : 'Cash on delivery — driver paid you the goods at pickup'}
                        {order.contactPhone ? ` · ☎ ${order.contactPhone}` : ''}
                      </p>
                      <p className="text-slate-500">
                        🛺 {driver ? `${driver.name} · ${driver.plateNumber}` : ride.driverName ?? 'Driver'} · 🏁{' '}
                        {order.deliveryAddress.label}
                      </p>
                      <p className="text-slate-400">
                        Placed {new Date(order.requestedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        {ride.completedAt ? ` · delivered ${new Date(ride.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <SaasFeeCard
        payerRole="vendor"
        payerId={vendor.id}
        payerName={vendor.name}
        planLabel="Registered Vendor"
        monthlyFee={monthlyFee}
        perBookingFee={perOrderFee}
        bookings={deliveredThisMonth}
        bookingNoun="delivered order"
        title="Dues to the platform"
      />
    </div>
  )
}
