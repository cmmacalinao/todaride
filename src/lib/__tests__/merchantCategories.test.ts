import { describe, expect, it } from 'vitest'
import {
  categoryChoicesFor,
  categoryForVendor,
  MERCHANT_CATEGORIES,
  businessTypesForCategory,
  merchantCategoryTiles,
  type CategorizableVendor,
} from '../merchantCategories'

const food = (name: string, merchantCategory?: CategorizableVendor['merchantCategory']): CategorizableVendor => ({
  name,
  businessType: 'resto_food',
  merchantCategory,
})
const goods = (name: string, merchantCategory?: CategorizableVendor['merchantCategory']): CategorizableVendor => ({
  name,
  businessType: 'other_commodity',
  merchantCategory,
})

describe('the category list itself', () => {
  // What most people open the app for.
  it('puts Food first', () => {
    expect(MERCHANT_CATEGORIES[0].id).toBe('food')
  })

  it('keeps the two food tiles together, then Botika', () => {
    // Merienda is the other half of the same hunger — somebody scanning for
    // something to eat should not read past the pharmacy to find it.
    expect(MERCHANT_CATEGORIES[1].id).toBe('merienda')
    expect(MERCHANT_CATEGORIES[2].id).toBe('pharmacy')
  })

  it('ends with the catch-all, so nothing is stranded before it', () => {
    expect(MERCHANT_CATEGORIES[MERCHANT_CATEGORIES.length - 1].id).toBe('other')
  })

  it('gives every category a label, an emoji and a catalog', () => {
    for (const c of MERCHANT_CATEGORIES) {
      expect(c.label.length).toBeGreaterThan(0)
      expect(c.emoji.length).toBeGreaterThan(0)
      expect(['food', 'goods']).toContain(c.catalog)
      expect(c.businessTypes.length).toBeGreaterThan(0)
    }
  })

  it('has no duplicate ids', () => {
    const ids = MERCHANT_CATEGORIES.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('working out what a shop is', () => {
  it('reads the real seeded shops correctly', () => {
    expect(categoryForVendor(food("Aling Nena's Carinderia"))).toBe('food')
    expect(categoryForVendor(food('CLSU Grill & Rice Bowl'))).toBe('food')
    expect(categoryForVendor(food("Kuya Ben's Ihaw-Ihaw"))).toBe('food')
    expect(categoryForVendor(food("Manang Cora's Lugawan"))).toBe('food')
    expect(categoryForVendor(food('Tita Marites Kakanin & Merienda'))).toBe('merienda')
    expect(categoryForVendor(goods("Nanay Rosing's Sari-Sari Store"))).toBe('sari_sari')
    expect(categoryForVendor(goods('Mang Tomas Hardware & Construction Supply'))).toBe('hardware')
    expect(categoryForVendor(goods("Criselda's School & Office Supplies"))).toBe('school_office')
  })

  it('recognises the errands a tricycle actually runs', () => {
    expect(categoryForVendor(goods('Crystal Clear Water Refilling Station'))).toBe('water')
    // Gasul rides with water: the same errand, often the same corner shop.
    expect(categoryForVendor(goods('JB Gasul LPG Dealer'))).toBe('water')
    expect(categoryForVendor(goods('Solane Gas Station'))).toBe('water')
    expect(categoryForVendor(goods('Muñoz Agri & Feeds Center'))).toBe('agri')
    expect(categoryForVendor(goods('Labada Express Laundry'))).toBe('laundry')
    expect(categoryForVendor(goods('Aling Belen Meat Shop'))).toBe('palengke')
    expect(categoryForVendor(food('Sweet Corner Bakery'))).toBe('bakery')
  })

  // A shop knows what it is better than a keyword does.
  it('lets an explicit category beat the guess', () => {
    expect(categoryForVendor(goods("Nanay Rosing's Sari-Sari Store", 'water'))).toBe('water')
    expect(categoryForVendor(food('Unnamed', 'merienda'))).toBe('merienda')
  })

  it('ignores an explicit category it does not recognise', () => {
    expect(categoryForVendor(goods('Mang Tomas Hardware', 'nonsense' as never))).toBe('hardware')
  })

  it('falls back by business type when the name says nothing', () => {
    expect(categoryForVendor(food('JM'))).toBe('food')
    expect(categoryForVendor(goods('JM'))).toBe('other')
  })

  // "Ihaw-Ihaw sa Hardware St." is a food shop with a street name in it.
  it('never guesses a food shop into a goods category, or the reverse', () => {
    expect(categoryForVendor(food('Ihaw-Ihaw sa Hardware St.'))).toBe('food')
    expect(categoryForVendor(goods('Water District Hardware'))).toBe('water')
  })

  // A keyword buried inside a longer word is not a match.
  it('matches whole words only', () => {
    expect(categoryForVendor(goods('Agrippina Beauty Supply'))).toBe('other')
    expect(categoryForVendor(goods('Megaswater Trading'))).toBe('other')
  })

  it('copes with punctuation and case', () => {
    expect(categoryForVendor(goods('SARI-SARI NI ALING PACITA'))).toBe('sari_sari')
    expect(categoryForVendor(goods('Tubig, Atbp.'))).toBe('water')
  })
})

describe('the tiles drawn on the start page', () => {
  const seeded = [
    food("Aling Nena's Carinderia"),
    food('CLSU Grill & Rice Bowl'),
    food("Kuya Ben's Ihaw-Ihaw"),
    food("Manang Cora's Lugawan"),
    food('Tita Marites Kakanin & Merienda'),
    goods("Nanay Rosing's Sari-Sari Store"),
    goods('Mang Tomas Hardware & Construction Supply'),
    goods("Criselda's School & Office Supplies"),
  ]

  it('counts the shops behind each category', () => {
    const tiles = merchantCategoryTiles(seeded)
    const byId = Object.fromEntries(tiles.map((t) => [t.id, t.count]))
    expect(byId.food).toBe(4)
    expect(byId.merienda).toBe(1)
    expect(byId.sari_sari).toBe(1)
    expect(byId.hardware).toBe(1)
    expect(byId.school_office).toBe(1)
  })

  // A tile that opens an empty list is a promise the app cannot keep.
  it('leaves out categories with no shops', () => {
    const ids = merchantCategoryTiles(seeded).map((t) => t.id)
    expect(ids).not.toContain('water')
    expect(ids).not.toContain('laundry')
  })

  it('can show the gaps when recruiting merchants', () => {
    const tiles = merchantCategoryTiles(seeded, { includeEmpty: true })
    expect(tiles.length).toBe(MERCHANT_CATEGORIES.length)
    expect(tiles.find((t) => t.id === 'water')?.count).toBe(0)
  })

  it('keeps Food first among what is shown', () => {
    expect(merchantCategoryTiles(seeded)[0].id).toBe('food')
  })

  it('shows nothing at all when there are no shops', () => {
    expect(merchantCategoryTiles([])).toEqual([])
  })
})

describe('pharmacies', () => {
  const pharmacy = (name: string): CategorizableVendor => ({ name, businessType: 'pharmacy' })

  it('puts every pharmacy under Botika, named or not', () => {
    expect(categoryForVendor(pharmacy('Mercury Drug — San Jose Poblacion'))).toBe('pharmacy')
    expect(categoryForVendor(pharmacy('Watsons — Town Center'))).toBe('pharmacy')
    expect(categoryForVendor(pharmacy('Rose Pharmacy — San Jose City'))).toBe('pharmacy')
    // No recognisable word in the name at all — still a pharmacy by record.
    expect(categoryForVendor(pharmacy('JM'))).toBe('pharmacy')
  })

  // A pharmacy is its own business type, so a Botika tile has to ask for it
  // by name or the goods catalog filters every one of them out.
  it('asks the catalog for pharmacy records', () => {
    expect(businessTypesForCategory('pharmacy')).toEqual(['pharmacy'])
    expect(businessTypesForCategory('food')).toEqual(['resto_food'])
    expect(businessTypesForCategory('hardware')).toEqual(['other_commodity'])
    expect(businessTypesForCategory(null)).toBeNull()
  })

  it('never guesses a non-pharmacy into Botika', () => {
    expect(categoryForVendor(goods('Botika ng Barangay Hardware'))).not.toBe('pharmacy')
    expect(categoryForVendor(food('Generics Lugawan'))).toBe('food')
  })

  it('counts pharmacies on the start page', () => {
    const tiles = merchantCategoryTiles([pharmacy('Mercury Drug'), pharmacy('Watsons'), food('Carinderia ni Nena')])
    const byId = Object.fromEntries(tiles.map((t) => [t.id, t.count]))
    expect(byId.pharmacy).toBe(2)
    expect(byId.food).toBe(1)
  })
})

describe('Solar Lights', () => {
  it('finds a solar shop by name', () => {
    expect(categoryForVendor(goods('Sunbright Solar Lights & Panels'))).toBe('solar')
    expect(categoryForVendor(goods('NE Off-Grid Solar Supply'))).toBe('solar')
  })

  it('leaves an ordinary hardware store where it was', () => {
    expect(categoryForVendor(goods('Mang Tomas Hardware & Construction Supply'))).toBe('hardware')
  })
})

describe('tubig and gasul share a tile', () => {
  it('takes both kinds of shop', () => {
    expect(categoryForVendor(goods('Crystal Clear Water Refilling'))).toBe('water')
    expect(categoryForVendor(goods('JB Gasul LPG Dealer'))).toBe('water')
  })
})

describe('coming-soon tiles sit below the stocked ones', () => {
  const seeded = [food("Aling Nena's Carinderia"), goods('Mang Tomas Hardware')]

  it('puts every stocked category before every empty one', () => {
    const tiles = merchantCategoryTiles(seeded, { includeEmpty: true })
    const lastStocked = tiles.map((t) => t.count > 0).lastIndexOf(true)
    const firstEmpty = tiles.findIndex((t) => t.count === 0)
    expect(lastStocked).toBeLessThan(firstEmpty)
  })

  it('keeps the list order within each group', () => {
    const tiles = merchantCategoryTiles(seeded, { includeEmpty: true })
    const stocked = tiles.filter((t) => t.count > 0).map((t) => t.id)
    const empty = tiles.filter((t) => t.count === 0).map((t) => t.id)
    // Food comes before Hardware in the list, and so it does here.
    expect(stocked).toEqual(['food', 'hardware'])
    // The empties keep the list's order too, whatever that order is —
    // asserting the order itself rather than today's first entry, so moving
    // a category does not break a test about sorting.
    const listOrder = MERCHANT_CATEGORIES.map((c) => c.id).filter((id) => empty.includes(id))
    expect(empty).toEqual(listOrder)
  })

  it('changes nothing when empty tiles are hidden', () => {
    const ids = merchantCategoryTiles(seeded).map((t) => t.id)
    expect(ids).toEqual(['food', 'hardware'])
  })
})

describe('what registration offers a merchant', () => {
  it('offers a resto the food categories only', () => {
    const ids = categoryChoicesFor('resto_food').map((c) => c.id)
    expect(ids).toEqual(['food', 'merienda', 'bakery'])
  })

  it('offers a goods store the goods categories only', () => {
    const ids = categoryChoicesFor('other_commodity').map((c) => c.id)
    expect(ids).toContain('sari_sari')
    expect(ids).toContain('solar')
    expect(ids).not.toContain('food')
    expect(ids).not.toContain('pharmacy')
  })

  it('offers a pharmacy exactly one place to be', () => {
    expect(categoryChoicesFor('pharmacy').map((c) => c.id)).toEqual(['pharmacy'])
  })

  // "Other Stores" is where an unclassified shop lands, not somewhere a
  // merchant should put themselves on purpose.
  it('never offers Other Stores', () => {
    for (const type of ['resto_food', 'other_commodity', 'pharmacy'] as const) {
      expect(categoryChoicesFor(type).map((c) => c.id)).not.toContain('other')
    }
  })

  it('only offers categories a shop of that type can actually be guessed into', () => {
    for (const type of ['resto_food', 'other_commodity', 'pharmacy'] as const) {
      for (const choice of categoryChoicesFor(type)) {
        expect(choice.businessTypes).toContain(type)
      }
    }
  })
})
