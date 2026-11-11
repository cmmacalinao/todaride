import { describe, expect, it } from 'vitest'
import { customerCancelState, DEFAULT_PREP_MINUTES, overdueAfterMinutes } from '../orderTiming'
import type { MedsOrder } from '../../types'

// An order accepted this many minutes ago.
function acceptedAgo(minutes: number): MedsOrder {
  return {
    status: 'confirmed',
    confirmedAt: new Date(Date.now() - minutes * 60000).toISOString(),
    quotedAt: null,
    requestedAt: new Date(Date.now() - minutes * 60000).toISOString(),
  } as unknown as MedsOrder
}

describe('overdueAfterMinutes', () => {
  it('gives a shop its own estimate plus a fixed grace', () => {
    expect(overdueAfterMinutes(10)).toBe(40)
    expect(overdueAfterMinutes(90)).toBe(120)
  })

  it('falls back to the old flat hour when a shop has set nothing', () => {
    expect(overdueAfterMinutes(null)).toBe(60)
    expect(overdueAfterMinutes(undefined)).toBe(60)
    expect(DEFAULT_PREP_MINUTES + 30).toBe(60)
  })
})

describe('customerCancelState while an order is being prepared', () => {
  it('does not call a lechon house late while it is still honestly cooking', () => {
    // 80 minutes in, on a 90-minute kitchen: not late.
    const slow = customerCancelState(acceptedAgo(80), 90)
    expect(slow.overdue).toBe(false)
    expect(slow.canCancel).toBe(false)
  })

  it('does call a milk tea counter late long before an hour is up', () => {
    // 45 minutes in, on a 10-minute counter: late, and cancellable.
    const quick = customerCancelState(acceptedAgo(45), 10)
    expect(quick.overdue).toBe(true)
    expect(quick.canCancel).toBe(true)
    expect(quick.note).toContain('45 min')
  })

  it('keeps the previous behaviour exactly for a shop with no prep time set', () => {
    expect(customerCancelState(acceptedAgo(59)).overdue).toBe(false)
    expect(customerCancelState(acceptedAgo(61)).overdue).toBe(true)
  })
})
