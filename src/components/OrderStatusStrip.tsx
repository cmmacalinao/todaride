import type { MedsOrder, Ride } from '../types'

// One order's journey, the same five steps whoever is looking: the customer
// waiting for it, the vendor cooking it, the driver carrying it. Which step
// is lit comes from the order until a ride exists, and from the ride after —
// the order's own status stops at 'dispatched' (see PHARMACY_PROCESS_MEDS_ORDER).
export type OrderStage = 'placed' | 'accepted' | 'rider_booked' | 'on_the_way' | 'delivered' | 'cancelled' | 'declined'

export const ORDER_STAGE_LABELS: Record<OrderStage, string> = {
  placed: 'Order placed',
  accepted: 'Vendor accepted',
  rider_booked: 'Rider booked',
  on_the_way: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  declined: 'Declined',
}

const STEPS: OrderStage[] = ['placed', 'accepted', 'rider_booked', 'on_the_way', 'delivered']

export function orderStage(order: MedsOrder, ride: Ride | undefined): OrderStage {
  if (order.status === 'cancelled') return 'cancelled'
  if (order.status === 'rejected') return 'declined'
  if (order.status === 'pending_confirmation' || order.status === 'quoted') return 'placed'
  if (order.status === 'confirmed' || order.status === 'ready_for_pickup') return 'accepted'
  // dispatched — the ride says how far along it is.
  if (!ride) return 'rider_booked'
  switch (ride.status) {
    case 'requested':
    case 'accepted':
    case 'driver_arriving':
      return 'rider_booked'
    case 'ongoing':
      return 'on_the_way'
    case 'completed':
      return 'delivered'
    case 'cancelled':
      return 'cancelled'
    case 'declined':
      return 'declined'
  }
}

// What the lit step means right now, in a sentence — the driver's name once
// there is one, since "rider booked" with nobody named is a question.
export function orderStageDetail(order: MedsOrder, ride: Ride | undefined): string {
  const stage = orderStage(order, ride)
  const driver = ride?.driverName
  switch (stage) {
    case 'placed':
      return 'Waiting for the vendor to accept'
    case 'accepted':
      return order.deliveryMode === 'self_book' ? 'Ready — customer books their own ride' : 'Being prepared — rider not booked yet'
    case 'rider_booked':
      return ride?.status === 'requested' || !driver
        ? 'Finding a TODA SafeRide rider…'
        : ride.legProgress >= 1
          ? `${driver} is at the store picking it up`
          : `${driver} is heading to the store`
    case 'on_the_way':
      return `${driver ?? 'Rider'} is on the way to the customer`
    case 'delivered':
      return `Delivered${driver ? ` by ${driver}` : ''}`
    case 'cancelled':
      return 'Cancelled'
    case 'declined':
      return order.rejectionReason ? `Declined — ${order.rejectionReason}` : 'Declined'
  }
}

export function OrderStatusStrip({ order, ride, compact = false }: { order: MedsOrder; ride: Ride | undefined; compact?: boolean }) {
  const stage = orderStage(order, ride)
  const ended = stage === 'cancelled' || stage === 'declined'
  const lit = ended ? -1 : STEPS.indexOf(stage)
  return (
    <div>
      <ol className={`flex items-center ${compact ? 'gap-0.5' : 'gap-1'}`}>
        {STEPS.map((step, i) => (
          <li key={step} className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
            <span
              aria-hidden
              className={`h-1.5 w-full rounded-full ${
                ended ? 'bg-slate-200' : i <= lit ? (i === lit ? 'bg-brand-600' : 'bg-brand-400') : 'bg-slate-200'
              }`}
            />
            {!compact && (
              <span className={`truncate text-[9px] ${i <= lit && !ended ? 'font-semibold text-brand-800' : 'text-slate-400'}`}>
                {ORDER_STAGE_LABELS[step]}
              </span>
            )}
          </li>
        ))}
      </ol>
      <p className={`mt-1 text-[11px] ${ended ? 'text-amber-700' : 'text-slate-600'}`}>
        <span className="font-semibold">{ORDER_STAGE_LABELS[stage]}</span> · {orderStageDetail(order, ride)}
      </p>
    </div>
  )
}
