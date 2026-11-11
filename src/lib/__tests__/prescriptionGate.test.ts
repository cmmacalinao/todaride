import { describe, expect, it } from 'vitest'
import type { MedsOrder, MedicineProduct } from '../../types'

// The rule CREATE_MEDS_ORDER uses to decide an order needs a prescription
// reviewed, and the rule VENDOR_ACCEPT_MENU_ORDER uses to refuse until it
// has been. Both live in the reducer, which cannot be imported without the
// whole context, so they are restated here as the specification they are —
// if either reducer stops agreeing with this file, one of the two is wrong.
function orderNeedsPrescription(items: { productId: string }[], products: MedicineProduct[]): boolean {
  return items.some((item) => products.find((p) => p.id === item.productId)?.category === 'rx')
}

function vendorMayAccept(order: Pick<MedsOrder, 'status' | 'pricedFromMenu' | 'prescriptionStatus'>): boolean {
  return order.status === 'pending_confirmation' && !!order.pricedFromMenu && order.prescriptionStatus !== 'pending'
}

const product = (id: string, category: MedicineProduct['category']): MedicineProduct =>
  ({ id, category }) as MedicineProduct

describe('which orders need a prescription', () => {
  const catalogue = [product('p-rice', 'otc'), product('p-amox', 'rx')]

  it('needs one when any line is a prescription item', () => {
    expect(orderNeedsPrescription([{ productId: 'p-amox' }], catalogue)).toBe(true)
    expect(orderNeedsPrescription([{ productId: 'p-rice' }, { productId: 'p-amox' }], catalogue)).toBe(true)
  })

  it('does not when nothing in the basket is one', () => {
    expect(orderNeedsPrescription([{ productId: 'p-rice' }], catalogue)).toBe(false)
    expect(orderNeedsPrescription([], catalogue)).toBe(false)
  })

  it('does not invent one for an item that is not in the catalogue at all', () => {
    expect(orderNeedsPrescription([{ productId: 'p-ghost' }], catalogue)).toBe(false)
  })
})

describe('whether a merchant may accept and start preparing', () => {
  const base = { status: 'pending_confirmation' as const, pricedFromMenu: true }

  it('refuses while a prescription is waiting to be checked', () => {
    expect(vendorMayAccept({ ...base, prescriptionStatus: 'pending' })).toBe(false)
  })

  it('allows it once the pharmacist has approved it', () => {
    expect(vendorMayAccept({ ...base, prescriptionStatus: 'approved' })).toBe(true)
  })

  it('allows an ordinary order with nothing to check', () => {
    expect(vendorMayAccept({ ...base, prescriptionStatus: 'not_required' })).toBe(true)
  })

  it('lets a rejected prescription through to be declined, rather than freezing the order', () => {
    // Not an endorsement of the medicine: it unblocks the merchant so they
    // can reject the order or ask for a clearer photo, instead of leaving it
    // stuck where neither side can act.
    expect(vendorMayAccept({ ...base, prescriptionStatus: 'rejected' })).toBe(true)
  })
})
