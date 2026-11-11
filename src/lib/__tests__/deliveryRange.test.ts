import { describe, expect, it } from 'vitest'
import { deliveryRangeMessage, deliveryRangeState } from '../deliveryRange'

describe('deliveryRangeState', () => {
  it('accepts anything when the shop set no limit — exactly as before this existed', () => {
    expect(deliveryRangeState(null, 50).withinRange).toBe(true)
    expect(deliveryRangeState(undefined, 50).withinRange).toBe(true)
    // A nonsense limit is no limit, not a shop that refuses everything.
    expect(deliveryRangeState(0, 50).withinRange).toBe(true)
    expect(deliveryRangeState(-3, 50).withinRange).toBe(true)
  })

  it('does not refuse an address that has not been picked yet', () => {
    expect(deliveryRangeState(5, null).withinRange).toBe(true)
    expect(deliveryRangeState(5, undefined).withinRange).toBe(true)
    expect(deliveryRangeState(5, Number.NaN).withinRange).toBe(true)
  })

  it('allows the limit itself, and refuses past it', () => {
    expect(deliveryRangeState(5, 5).withinRange).toBe(true)
    expect(deliveryRangeState(5, 4.9).withinRange).toBe(true)
    expect(deliveryRangeState(5, 5.1).withinRange).toBe(false)
  })

  it('says how far past the limit it is, to one decimal', () => {
    const state = deliveryRangeState(5, 9.25)
    expect(state.overBy).toBe(4.3)
    expect(state.km).toBe(9.25)
    expect(state.limitKm).toBe(5)
  })
})

describe('deliveryRangeMessage', () => {
  it('says nothing at all when there is nothing to say', () => {
    expect(deliveryRangeMessage(deliveryRangeState(5, 3), "Aling Nena's")).toBeNull()
    expect(deliveryRangeMessage(deliveryRangeState(null, 30), "Aling Nena's")).toBeNull()
    expect(deliveryRangeMessage(deliveryRangeState(5, null), "Aling Nena's")).toBeNull()
  })

  it('names the shop, the limit and the actual distance when it is too far', () => {
    const message = deliveryRangeMessage(deliveryRangeState(5, 9), "Aling Nena's")
    expect(message).toBe("Aling Nena's delivers within 5 km. This address is 9 km away — 4 km too far.")
  })
})
