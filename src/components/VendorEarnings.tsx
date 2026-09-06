import type { MedsOrder, Ride } from '../types'

// What a delivered order earns the vendor: the goods. The delivery and
// service fees belong to the driver and the platform, and never pass through
// the vendor's hands — a cash order has the driver pay the goods to the
// vendor at pickup and collect everything from the customer; a paid order
// was settled with the vendor directly. Either way the vendor's take is the
// subtotal, so that is what is counted here.
function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function startOfWeek(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  // Monday-start weeks, the way a sari-sari ledger is ruled.
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day)
  return d.getTime()
}

export function VendorEarnings({ orders, rides }: { orders: MedsOrder[]; rides: Ride[] }) {
  // Delivered = dispatched and the ride actually completed. Anything still
  // on the road, or cancelled, is not money yet.
  const delivered = orders
    .filter((o) => o.status === 'dispatched')
    .map((o) => ({ order: o, ride: rides.find((r) => r.id === o.linkedRideId) }))
    .filter((x): x is { order: MedsOrder; ride: Ride } => !!x.ride && x.ride.status === 'completed')
    .map((x) => ({ ...x, at: new Date(x.ride.completedAt ?? x.order.requestedAt).getTime() }))
    .sort((a, b) => b.at - a.at)

  const sum = (since: number) => delivered.filter((d) => d.at >= since).reduce((s, d) => s + d.order.subtotal, 0)
  const count = (since: number) => delivered.filter((d) => d.at >= since).length
  const today = startOfToday()
  const week = startOfWeek()

  const stat = (label: string, amount: number, n: number) => (
    <div className="rounded-lg bg-slate-50 p-2.5 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-base font-extrabold text-slate-800">₱{amount.toLocaleString()}</p>
      <p className="text-[10px] text-slate-500">
        {n} {n === 1 ? 'order' : 'orders'}
      </p>
    </div>
  )

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {stat('Today', sum(today), count(today))}
        {stat('This week', sum(week), count(week))}
        {stat('All time', sum(0), count(0))}
      </div>
      <p className="mt-1.5 text-[11px] text-slate-400">
        Counts the food/goods amount of every delivered order. Delivery and service fees go to the driver and the
        platform, not through you.
      </p>
      {delivered.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">No delivered orders yet.</p>
      ) : (
        <div className="mt-2 space-y-1.5">
          {delivered.slice(0, 15).map(({ order, at }) => (
            <div key={order.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-700">{order.customerName}</p>
                <p className="truncate text-[11px] text-slate-400">
                  {order.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')} ·{' '}
                  {new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <span className="shrink-0 font-semibold text-emerald-700">+₱{order.subtotal}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
