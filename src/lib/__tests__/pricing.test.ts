import { describe, expect, it } from 'vitest'
import { DEFAULT_PRICING_SETTINGS, sanitisePricingSettings } from '../pricing'
import { buildFamilyTerms, FAMILY_PLAN_FREE_MONTHS, FAMILY_PLAN_MONTHLY_PRICE } from '../familyTerms'

describe('pricing settings', () => {
  it('defaults to the values that used to be hard-coded', () => {
    // An install that never touches these must behave exactly as before.
    expect(DEFAULT_PRICING_SETTINGS.familyPlanMonthlyPrice).toBe(FAMILY_PLAN_MONTHLY_PRICE)
    expect(DEFAULT_PRICING_SETTINGS.familyPlanFreeMonths).toBe(FAMILY_PLAN_FREE_MONTHS)
    expect(DEFAULT_PRICING_SETTINGS.medsServiceFee).toBe(15)
    expect(DEFAULT_PRICING_SETTINGS.medsDeliveryFee).toBe(25)
  })

  it('keeps values Admin has set', () => {
    const s = sanitisePricingSettings({ familyPlanMonthlyPrice: 650, medsDeliveryFee: 30 })
    expect(s.familyPlanMonthlyPrice).toBe(650)
    expect(s.medsDeliveryFee).toBe(30)
  })

  it('refuses a negative price rather than paying the customer', () => {
    const s = sanitisePricingSettings({ familyPlanMonthlyPrice: -100, medsServiceFee: -1 })
    expect(s.familyPlanMonthlyPrice).toBe(DEFAULT_PRICING_SETTINGS.familyPlanMonthlyPrice)
    expect(s.medsServiceFee).toBe(DEFAULT_PRICING_SETTINGS.medsServiceFee)
  })

  it('falls back when a value is not a number at all', () => {
    const s = sanitisePricingSettings({ medsDeliveryFee: Number.NaN })
    expect(s.medsDeliveryFee).toBe(DEFAULT_PRICING_SETTINGS.medsDeliveryFee)
  })

  it('keeps free months whole', () => {
    // Half a free month is not something anybody can be given.
    expect(sanitisePricingSettings({ familyPlanFreeMonths: 6.4 }).familyPlanFreeMonths).toBe(6)
  })

  it('allows a price of zero, which is a real decision', () => {
    expect(sanitisePricingSettings({ medsServiceFee: 0 }).medsServiceFee).toBe(0)
  })
})

describe('family terms read the configured prices', () => {
  it('quotes whatever is set, not what was compiled in', () => {
    const section = buildFamilyTerms(6, 650).find((s) => s.title === '8. Fares, payment and the promo')
    expect(section?.body[0]).toContain('free for 6 months')
    expect(section?.body[0]).toContain('₱650/month')
  })

  it('falls back to the defaults when called with nothing', () => {
    const section = buildFamilyTerms().find((s) => s.title === '8. Fares, payment and the promo')
    expect(section?.body[0]).toContain(`${FAMILY_PLAN_FREE_MONTHS} months`)
    expect(section?.body[0]).toContain(`₱${FAMILY_PLAN_MONTHLY_PRICE}/month`)
  })

  it('leaves every other section untouched', () => {
    const before = buildFamilyTerms()
    const after = buildFamilyTerms(6, 650)
    expect(after).toHaveLength(before.length)
    for (let i = 0; i < before.length; i++) {
      if (before[i].title === '8. Fares, payment and the promo') continue
      expect(after[i]).toEqual(before[i])
    }
  })

  it('keeps the rest of the pricing section, not just the first line', () => {
    const section = buildFamilyTerms(6, 650).find((s) => s.title === '8. Fares, payment and the promo')
    expect(section?.body.length).toBeGreaterThan(1)
    expect(section?.body[1]).toContain('Nothing is charged automatically')
  })
})
