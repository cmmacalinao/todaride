import { describe, expect, it } from 'vitest'
import type { MedicineProduct } from '../../types'
import {
  BASIC_MEDICINES,
  basicMedicineId,
  basicMedicineProducts,
  isEstimatedPrice,
  missingBasicMedicines,
} from '../medicineCatalog'

const owned = (name: string, genericName: string | null = null): MedicineProduct =>
  ({ id: `x-${name}`, pharmacyId: 'pharm-1', name, genericName, category: 'otc', price: 1, inStock: true }) as MedicineProduct

describe('the basic medicine list itself', () => {
  it('prices every item, and never at zero', () => {
    for (const m of BASIC_MEDICINES) {
      expect(m.estimatedPrice, m.name).toBeGreaterThan(0)
      expect(m.name.trim(), 'a blank name').not.toBe('')
      expect(m.unit.trim(), m.name).not.toBe('')
    }
  })

  it('carries no restricted drugs — a starter shelf is not where those belong', () => {
    expect(BASIC_MEDICINES.every((m) => m.category === 'otc' || m.category === 'rx')).toBe(true)
  })

  it('lists each medicine once', () => {
    const names = BASIC_MEDICINES.map((m) => m.name.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
  })

  it('keeps the antibiotics and maintenance drugs on prescription', () => {
    const rxGroups = BASIC_MEDICINES.filter((m) => m.group === 'Antibiotics' || m.group === 'Maintenance')
    expect(rxGroups.length).toBeGreaterThan(0)
    expect(rxGroups.every((m) => m.category === 'rx')).toBe(true)
  })
})

describe('what a pharmacy is missing', () => {
  it('is the whole list for a shelf with nothing on it', () => {
    expect(missingBasicMedicines([])).toHaveLength(BASIC_MEDICINES.length)
  })

  it('skips an item the store already carries under the same name', () => {
    const missing = missingBasicMedicines([owned('Cetirizine 10mg')])
    expect(missing.some((m) => m.name === 'Cetirizine 10mg')).toBe(false)
    expect(missing).toHaveLength(BASIC_MEDICINES.length - 1)
  })

  it('skips it under a brand name too, by what it is made of', () => {
    // The real case: a seeded store carries "Biogesic 500mg", which is the
    // list's "Paracetamol 500mg" by another name.
    const missing = missingBasicMedicines([owned('Biogesic 500mg', 'Paracetamol')])
    expect(missing.some((m) => m.genericName === 'Paracetamol' && m.unit === 'Per tablet')).toBe(false)
  })

  it('still offers the syrup to a store that carries the tablet', () => {
    // A bottle of paracetamol syrup is a different product from a
    // paracetamol tablet, however identical the generic name. Matching on
    // the generic alone had a store that carries Biogesic silently skipping
    // the syrup, the drops and anything else made of the same thing.
    const missing = missingBasicMedicines([owned('Biogesic 500mg', 'Paracetamol')])
    expect(missing.some((m) => m.name === 'Paracetamol syrup 250mg/5ml')).toBe(true)
    expect(missing.some((m) => m.name === 'Paracetamol drops 100mg/ml')).toBe(true)
    // ...while the tablet it really is stays skipped.
    expect(missing.some((m) => m.name === 'Paracetamol 500mg')).toBe(false)
  })

  it('is not fooled by capitals or extra spaces', () => {
    const missing = missingBasicMedicines([owned('  cetirizine   10MG  ')])
    expect(missing.some((m) => m.name === 'Cetirizine 10mg')).toBe(false)
  })

  it("judges one store by its own shelf, not another store's", () => {
    const list = basicMedicineProducts('pharm-2', [])
    expect(list.every((p) => p.pharmacyId === 'pharm-2')).toBe(true)
  })
})

describe('the products handed to a pharmacy', () => {
  const products = basicMedicineProducts('pharm-9')

  it("arrives priced as an estimate, not as the store's price", () => {
    expect(products.every((p) => isEstimatedPrice(p))).toBe(true)
  })

  it('is in stock and visible, so the shelf is not empty on day one', () => {
    expect(products.every((p) => p.inStock)).toBe(true)
  })

  it('gives every item a shelf and a unit', () => {
    expect(products.every((p) => !!p.menuCategory && !!p.description)).toBe(true)
  })

  it('uses ids that are stable for the same store and item', () => {
    expect(basicMedicineId('pharm-9', 'Cetirizine 10mg')).toBe(basicMedicineId('pharm-9', 'cetirizine 10mg'))
    expect(basicMedicineId('pharm-9', 'Cetirizine 10mg')).not.toBe(basicMedicineId('pharm-8', 'Cetirizine 10mg'))
    expect(new Set(products.map((p) => p.id)).size).toBe(products.length)
  })

  it('adds nothing twice when run again on what it already added', () => {
    expect(basicMedicineProducts('pharm-9', products)).toHaveLength(0)
  })
})

describe('whose price it is', () => {
  it("reads a store-set price as the store's own", () => {
    expect(isEstimatedPrice({ priceIsEstimate: false })).toBe(false)
  })

  it("treats a product from before this existed as the store's own, not an estimate", () => {
    // Every price in the app predates the flag and was typed by somebody.
    // Undefined must therefore mean black, never grey.
    expect(isEstimatedPrice({ priceIsEstimate: undefined })).toBe(false)
  })
})
