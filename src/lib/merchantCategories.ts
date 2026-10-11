import type { BusinessType, Pharmacy } from '../types'

// What kind of shop this is, as a passenger would say it.
//
// The record only knows three things — resto_food, other_commodity,
// pharmacy — which is enough to route an order and useless as a way to find
// a shop. "Other commodity" puts a hardware store, a sari-sari store and a
// school-supplies shop in one bucket, and somebody who needs a kilo of nails
// has nothing to tap.
//
// These categories are the provincial errands a tricycle actually runs in
// San Jose City and Muñoz: food, the botika, the palengke, water, hardware.
// They are deliberately concrete. A passenger looks for "Botika" and
// "Tubig", not "Health" and "Household Services".
//
// A merchant's category can be set on the record (merchantCategory). When it
// is not, it is guessed from the shop's own name — a carinderia calls itself
// a carinderia — and falls back to the business type. Guessing is the right
// default because a category nobody filled in would otherwise leave every
// existing store in "Other", which is where shops go to be unfindable.

export type MerchantCategory =
  | 'food'
  | 'pharmacy'
  | 'merienda'
  | 'sari_sari'
  | 'water'
  | 'palengke'
  | 'bakery'
  | 'hardware'
  | 'school_office'
  | 'agri'
  | 'laundry'
  | 'other'

export interface MerchantCategoryDef {
  id: MerchantCategory
  label: string
  // What it is called here, which is not always what it is called in English.
  sublabel: string
  emoji: string
  // Which order flow the tile opens: the food catalog or PaDeliver's goods
  // catalog. Every category belongs to exactly one.
  catalog: 'food' | 'goods'
  // Words that identify this kind of shop in its own name. Matched on word
  // boundaries against a lowercased name, longest list first — see
  // categoryForVendor.
  keywords: string[]
  // Which kinds of record live in this category. Pharmacies are their own
  // business type, so a Botika tile has to ask for them by name or the
  // goods catalog filters every one of them out.
  businessTypes: BusinessType[]
}

// Order matters: this is the order of the tiles, and Food is first because
// it is what most people open the app for.
export const MERCHANT_CATEGORIES: MerchantCategoryDef[] = [
  {
    id: 'food',
    label: 'Food',
    sublabel: 'Ulam, rice meals, ihaw',
    emoji: '🍽️',
    catalog: 'food',
    keywords: ['carinderia', 'karinderya', 'ihaw', 'grill', 'lugaw', 'silog', 'resto', 'eatery', 'kitchen', 'food', 'rice bowl', 'lutong', 'bbq', 'barbecue', 'inasal'],
    businessTypes: ['resto_food'],
  },
  {
    // Second, because medicine is the errand people send a tricycle for when
    // they cannot go themselves — which is most of the reason they cannot go.
    id: 'pharmacy',
    label: 'Botika',
    sublabel: 'Gamot, vitamins',
    emoji: '💊',
    catalog: 'goods',
    keywords: ['pharmacy', 'botika', 'drug', 'drugstore', 'gamot', 'generics'],
    businessTypes: ['pharmacy'],
  },
  {
    id: 'merienda',
    label: 'Merienda',
    sublabel: 'Kakanin, snacks, milk tea',
    emoji: '🧁',
    catalog: 'food',
    keywords: ['kakanin', 'merienda', 'snack', 'milk tea', 'milktea', 'kape', 'coffee', 'halo-halo', 'samalamig', 'pastil'],
    businessTypes: ['resto_food'],
  },
  {
    id: 'bakery',
    label: 'Bakery',
    sublabel: 'Tinapay, cakes',
    emoji: '🍞',
    catalog: 'food',
    keywords: ['bakery', 'panaderia', 'panadería', 'bakeshop', 'tinapay', 'cake', 'pastry'],
    businessTypes: ['resto_food'],
  },
  {
    id: 'sari_sari',
    label: 'Sari-Sari',
    sublabel: 'Grocery, everyday goods',
    emoji: '🏪',
    catalog: 'goods',
    keywords: ['sari-sari', 'sari sari', 'sarisari', 'grocery', 'mini mart', 'minimart', 'convenience', 'tindahan'],
    businessTypes: ['other_commodity'],
  },
  {
    id: 'palengke',
    label: 'Palengke',
    sublabel: 'Karne, isda, gulay',
    emoji: '🥬',
    catalog: 'goods',
    keywords: ['palengke', 'market', 'meat', 'karne', 'isda', 'fish', 'gulay', 'vegetable', 'poultry', 'manok'],
    businessTypes: ['other_commodity'],
  },
  {
    // Water and gasul together, because they are the same errand: the heavy
    // thing you cannot carry home yourself, refilled and swapped rather than
    // bought new. Plenty of shops sell both from the same corner, and a
    // passenger thinking "kailangan ko ng tubig at gasul" should not have to
    // decide which tile that is.
    id: 'water',
    label: 'Tubig-LPG-Gas',
    sublabel: 'Refill & tank delivery',
    emoji: '💧',
    catalog: 'goods',
    keywords: [
      'water',
      'tubig',
      'refilling',
      'refill',
      'purified',
      'alkaline',
      'aqua',
      'lpg',
      'gasul',
      'gas',
      'solane',
      'propane',
    ],
    businessTypes: ['other_commodity'],
  },
  {
    id: 'hardware',
    label: 'Hardware',
    sublabel: 'Construction supply',
    emoji: '🔨',
    catalog: 'goods',
    keywords: ['hardware', 'construction', 'builders', 'lumber', 'cement', 'paint', 'electrical supply'],
    businessTypes: ['other_commodity'],
  },
  {
    id: 'school_office',
    label: 'School & Office',
    sublabel: 'Supplies, printing',
    emoji: '✏️',
    catalog: 'goods',
    keywords: ['school', 'office supply', 'office supplies', 'bookstore', 'printing', 'photocopy', 'xerox', 'stationery'],
    businessTypes: ['other_commodity'],
  },
  {
    id: 'agri',
    label: 'Agri & Feeds',
    sublabel: 'Bigas, feeds, fertilizer',
    emoji: '🌾',
    catalog: 'goods',
    keywords: ['agri', 'feeds', 'fertilizer', 'rice mill', 'bigas', 'palay', 'farm supply', 'veterinary', 'agrivet'],
    businessTypes: ['other_commodity'],
  },
  {
    id: 'laundry',
    label: 'Laundry',
    sublabel: 'Labada, pickup & drop',
    emoji: '🧺',
    catalog: 'goods',
    keywords: ['laundry', 'labada', 'labahan', 'wash', 'dry clean'],
    businessTypes: ['other_commodity'],
  },
  {
    id: 'other',
    label: 'Other Stores',
    sublabel: 'Everything else',
    emoji: '📦',
    catalog: 'goods',
    keywords: [],
    businessTypes: ['other_commodity'],
  },
]

export const CATEGORY_BY_ID: Record<MerchantCategory, MerchantCategoryDef> = Object.fromEntries(
  MERCHANT_CATEGORIES.map((c) => [c.id, c]),
) as Record<MerchantCategory, MerchantCategoryDef>

// Where a shop lands when nothing else identifies it.
function defaultForBusinessType(businessType: BusinessType | undefined): MerchantCategory {
  if (businessType === 'resto_food') return 'food'
  if (businessType === 'pharmacy') return 'pharmacy'
  return 'other'
}

// Word-boundary match, so "Grill" finds a grill house and "Aling Grace"
// does not land in Agri because her name contains "agri".
function nameMentions(name: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(name)
}

export type CategorizableVendor = Pick<Pharmacy, 'name' | 'businessType'> & {
  merchantCategory?: MerchantCategory | null
}

export function categoryForVendor(vendor: CategorizableVendor): MerchantCategory {
  // Set by hand wins over any guess — a shop knows what it is.
  const chosen = vendor.merchantCategory
  if (chosen && chosen in CATEGORY_BY_ID) return chosen

  const name = String(vendor.name ?? '').toLowerCase()
  for (const category of MERCHANT_CATEGORIES) {
    // A food shop cannot be guessed into a goods category and the reverse,
    // or an "Ihaw-Ihaw sa Hardware St." ends up under Hardware.
    // A shop can only be guessed into a category that accepts its kind of
    // record, so a pharmacy never lands in Hardware and a carinderia never
    // lands in Botika.
    if (!category.businessTypes.includes(vendor.businessType)) continue
    if (category.keywords.some((k) => nameMentions(name, k))) return category.id
  }
  return defaultForBusinessType(vendor.businessType)
}

export interface CategoryTile extends MerchantCategoryDef {
  count: number
}

// Which business types the catalog should ask for when this tile is tapped.
export function businessTypesForCategory(id: MerchantCategory | null | undefined): BusinessType[] | null {
  if (!id) return null
  return CATEGORY_BY_ID[id]?.businessTypes ?? null
}

// The tiles to draw, in order, with how many shops are behind each.
//
// Empty categories are left out by default. A tile that opens an empty list
// is a promise the app cannot keep, and a passenger who taps "Tubig" and
// finds nothing learns not to tap anything. Pass includeEmpty when recruiting
// merchants and you want the gaps visible.
export function merchantCategoryTiles(
  vendors: CategorizableVendor[],
  { includeEmpty = false }: { includeEmpty?: boolean } = {},
): CategoryTile[] {
  const counts = new Map<MerchantCategory, number>()
  for (const vendor of vendors) {
    const id = categoryForVendor(vendor)
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return MERCHANT_CATEGORIES.map((c) => ({ ...c, count: counts.get(c.id) ?? 0 })).filter(
    (c) => includeEmpty || c.count > 0,
  )
}
