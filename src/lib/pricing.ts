import type { PricingSettings } from '../types'
import { FAMILY_PLAN_FREE_MONTHS, FAMILY_PLAN_MONTHLY_PRICE } from './familyTerms'

// Prices that used to be constants in the source and are now settings.
//
// The defaults are the values that were hard-coded, so an install that has
// never touched these behaves exactly as it did before — the change is that
// Admin can now move them without a release.
//
// A price change applies to new orders and activations only. That is not a
// policy bolted on here but a property of how the records already work: a
// delivery order stores the delivery and service fees it was quoted, and a
// family plan stores the terms version and free-until date it was activated
// under. Nothing re-reads these settings to re-price something already
// agreed, and nothing should.
export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  familyPlanMonthlyPrice: FAMILY_PLAN_MONTHLY_PRICE,
  familyPlanFreeMonths: FAMILY_PLAN_FREE_MONTHS,
  // Matches DEFAULT_MEDS_SERVICE_FEE / DEFAULT_MEDS_DELIVERY_FEE in
  // mock/data.ts, which remain as the seed values a fresh vendor starts from.
  medsServiceFee: 15,
  medsDeliveryFee: 25,
}

// A price is a number of pesos and cannot be negative. Admin typing a stray
// minus should not produce a fee that pays the customer.
export function sanitisePricingSettings(input: Partial<PricingSettings>): PricingSettings {
  const clamp = (value: unknown, fallback: number): number => {
    const n = Number(value)
    return Number.isFinite(n) && n >= 0 ? n : fallback
  }
  return {
    familyPlanMonthlyPrice: clamp(input.familyPlanMonthlyPrice, DEFAULT_PRICING_SETTINGS.familyPlanMonthlyPrice),
    // Months are whole: half a free month is not a thing anybody can be
    // given, and rounding it at the point of use would hide the oddity.
    familyPlanFreeMonths: Math.round(clamp(input.familyPlanFreeMonths, DEFAULT_PRICING_SETTINGS.familyPlanFreeMonths)),
    medsServiceFee: clamp(input.medsServiceFee, DEFAULT_PRICING_SETTINGS.medsServiceFee),
    medsDeliveryFee: clamp(input.medsDeliveryFee, DEFAULT_PRICING_SETTINGS.medsDeliveryFee),
  }
}
