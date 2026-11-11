import type { MedsOrder } from '../types'

// How long a customer waits before an order counts as overdue, and what they
// may do about it.
//
// Lives here rather than in VendorMenuBooking because it is arithmetic over
// an order and nothing else — and in the component it could not be tested
// without loading Leaflet.

// A vendor who has not answered at all. There is nothing to cook yet, so the
// only question is how long silence is tolerable.
const UNANSWERED_OVERDUE_MIN = 15

// What a shop that has not said otherwise is assumed to take.
export const DEFAULT_PREP_MINUTES = 30

// Grace beyond the shop's own estimate before a waiting customer is told the
// order is late. One flat hour judged a lechon house that says ninety minutes
// and a milk tea counter that says ten by the same clock — the first was
// called late while still cooking honestly, the second was given fifty
// minutes of silence before anybody noticed.
const OVERDUE_GRACE_MIN = 30

export function overdueAfterMinutes(prepMinutes: number | null | undefined): number {
  return (prepMinutes ?? DEFAULT_PREP_MINUTES) + OVERDUE_GRACE_MIN
}

// Whether a customer can pull this order back, and the line that says why.
// Unanswered orders (no quotation yet) can always be cancelled — nothing
// has been cooked. A quoted one is a quotation they may still turn down.
// An accepted order being prepared can be cancelled only once it is long
// overdue with no rider booked. Nothing with a rider on the road.
export function customerCancelState(
  order: MedsOrder,
  prepMinutes?: number | null,
): { canCancel: boolean; note: string | null; overdue: boolean } {
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
    const overdue = waited >= overdueAfterMinutes(prepMinutes)
    return {
      canCancel: overdue,
      overdue,
      note: overdue ? `Accepted ${waited} min ago and still no rider booked — long overdue` : null,
    }
  }
  return { canCancel: false, overdue: false, note: null }
}
