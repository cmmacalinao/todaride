// A small library of common Filipino dishes/drinks/desserts — used two
// ways: (1) a vendor can quick-pick from it instead of typing a dish name
// from scratch (see VendorMenuManager's "Common Filipino dishes" tool), and
// (2) whenever a menu item has no photo yet, its name is matched against
// this list so it shows a dish-specific icon on a themed colour tile
// instead of a generic plate (see getDefaultDishVisual).
//
// Deliberately illustrative, not photographic: real photography of a named
// dish is someone else's copyrighted work, and this app has no license to
// redistribute it. A vendor can always replace this with their own real
// photo (see MenuItemForm's photo upload) — this is only what shows, or
// what a quick-pick prefills, until they do.
export type FilipinoDishCategory = 'Ulam' | 'Grill' | 'Rice' | 'Noodles' | 'Breakfast' | 'Soup' | 'Street Food' | 'Dessert' | 'Drinks'

export interface FilipinoDish {
  name: string
  category: FilipinoDishCategory
  emoji: string
  bg: string
  // Alternate spellings/short forms matched against a typed menu item name
  // in addition to the dish's own name — see getDefaultDishVisual.
  aliases?: string[]
}

// Ordered most-specific first within each group so a more specific dish
// (e.g. "Chicken Inasal") is matched before a broader one that shares a
// word with it ("Chicken Adobo") would get a chance to.
export const FILIPINO_DISH_LIBRARY: FilipinoDish[] = [
  // Ulam (viands)
  { name: 'Chicken Adobo', category: 'Ulam', emoji: '🍗', bg: 'bg-amber-100', aliases: ['adobong manok'] },
  { name: 'Pork Adobo', category: 'Ulam', emoji: '🍗', bg: 'bg-amber-100', aliases: ['adobong baboy', 'adobo'] },
  { name: 'Sinigang na Baboy', category: 'Ulam', emoji: '🍲', bg: 'bg-orange-100', aliases: ['sinigang'] },
  { name: 'Kare-Kare', category: 'Ulam', emoji: '🥘', bg: 'bg-amber-100', aliases: ['kare kare', 'karekare'] },
  { name: 'Beef Caldereta', category: 'Ulam', emoji: '🍛', bg: 'bg-red-100', aliases: ['kaldereta', 'caldereta'] },
  { name: 'Menudo', category: 'Ulam', emoji: '🍲', bg: 'bg-orange-100' },
  { name: 'Afritada', category: 'Ulam', emoji: '🍲', bg: 'bg-red-100' },
  { name: 'Bicol Express', category: 'Ulam', emoji: '🌶️', bg: 'bg-red-100' },
  { name: 'Sisig', category: 'Ulam', emoji: '🍳', bg: 'bg-orange-100', aliases: ['sizzling sisig'] },
  { name: 'Pinakbet', category: 'Ulam', emoji: '🥬', bg: 'bg-green-100', aliases: ['pakbet'] },
  { name: 'Ginisang Gulay', category: 'Ulam', emoji: '🥦', bg: 'bg-green-100', aliases: ['mixed vegetables'] },
  { name: 'Bulalo', category: 'Ulam', emoji: '🍲', bg: 'bg-orange-100' },
  { name: 'Dinuguan', category: 'Ulam', emoji: '🍛', bg: 'bg-rose-100' },
  { name: 'Fried Bangus', category: 'Ulam', emoji: '🐟', bg: 'bg-cyan-100', aliases: ['bangus'] },
  { name: 'Fried Tilapia', category: 'Ulam', emoji: '🐟', bg: 'bg-cyan-100', aliases: ['tilapia'] },
  { name: 'Ginataang Kalabasa', category: 'Ulam', emoji: '🥘', bg: 'bg-amber-100' },
  { name: 'Lechon Kawali', category: 'Ulam', emoji: '🐖', bg: 'bg-rose-100', aliases: ['lechon'] },
  { name: 'Crispy Pata', category: 'Ulam', emoji: '🐖', bg: 'bg-rose-100' },

  // Grill / street food
  { name: 'Pork BBQ', category: 'Grill', emoji: '🍢', bg: 'bg-orange-100', aliases: ['barbecue', 'bbq'] },
  { name: 'Chicken Inasal', category: 'Grill', emoji: '🍗', bg: 'bg-amber-100', aliases: ['inasal'] },
  { name: 'Isaw', category: 'Street Food', emoji: '🍢', bg: 'bg-orange-100' },
  { name: 'Fishball', category: 'Street Food', emoji: '🐟', bg: 'bg-cyan-100' },
  { name: 'Kwek-Kwek', category: 'Street Food', emoji: '🥚', bg: 'bg-amber-100', aliases: ['kwek kwek', 'tokneneng'] },
  { name: 'Balut', category: 'Street Food', emoji: '🥚', bg: 'bg-stone-100' },
  { name: 'Turon', category: 'Street Food', emoji: '🍌', bg: 'bg-yellow-100' },

  // Rice / noodles / breakfast
  { name: 'Plain Rice', category: 'Rice', emoji: '🍚', bg: 'bg-stone-100', aliases: ['rice'] },
  { name: 'Garlic Rice', category: 'Rice', emoji: '🍚', bg: 'bg-stone-100', aliases: ['sinangag'] },
  { name: 'Pancit Canton', category: 'Noodles', emoji: '🍜', bg: 'bg-yellow-100', aliases: ['pancit'] },
  { name: 'Pancit Bihon', category: 'Noodles', emoji: '🍜', bg: 'bg-yellow-100', aliases: ['bihon'] },
  { name: 'Sotanghon', category: 'Noodles', emoji: '🍜', bg: 'bg-yellow-100' },
  { name: 'Palabok', category: 'Noodles', emoji: '🍝', bg: 'bg-orange-100' },
  { name: 'Lumpiang Shanghai', category: 'Street Food', emoji: '🥟', bg: 'bg-lime-100', aliases: ['lumpia'] },
  { name: 'Tapsilog', category: 'Breakfast', emoji: '🥩', bg: 'bg-amber-100', aliases: ['tapa'] },
  { name: 'Tocilog', category: 'Breakfast', emoji: '🥓', bg: 'bg-pink-100', aliases: ['tocino'] },
  { name: 'Longsilog', category: 'Breakfast', emoji: '🌭', bg: 'bg-red-100', aliases: ['longganisa'] },
  { name: 'Arroz Caldo', category: 'Breakfast', emoji: '🍚', bg: 'bg-yellow-100', aliases: ['lugaw', 'goto'] },
  { name: 'Champorado', category: 'Breakfast', emoji: '🍫', bg: 'bg-amber-100' },
  { name: 'Sopas', category: 'Soup', emoji: '🍲', bg: 'bg-yellow-100' },
  { name: 'Tinola', category: 'Soup', emoji: '🍜', bg: 'bg-yellow-100' },

  // Dessert
  { name: 'Halo-Halo', category: 'Dessert', emoji: '🍧', bg: 'bg-sky-100', aliases: ['halo halo'] },
  { name: 'Leche Flan', category: 'Dessert', emoji: '🍮', bg: 'bg-amber-100', aliases: ['flan'] },
  { name: 'Bibingka', category: 'Dessert', emoji: '🍰', bg: 'bg-amber-100' },
  { name: 'Puto', category: 'Dessert', emoji: '🍥', bg: 'bg-pink-100' },
  { name: 'Cassava Cake', category: 'Dessert', emoji: '🍰', bg: 'bg-amber-100' },
  { name: 'Buko Pandan', category: 'Dessert', emoji: '🥥', bg: 'bg-emerald-100' },

  // Drinks
  { name: 'Taho', category: 'Drinks', emoji: '🥤', bg: 'bg-amber-100' },
  { name: 'Buko Juice', category: 'Drinks', emoji: '🥥', bg: 'bg-emerald-100', aliases: ['buko'] },
  { name: 'Iced Tea', category: 'Drinks', emoji: '🧊', bg: 'bg-sky-100' },
  { name: 'Sago\'t Gulaman', category: 'Drinks', emoji: '🥤', bg: 'bg-sky-100', aliases: ['sago gulaman'] },
  { name: 'Softdrinks', category: 'Drinks', emoji: '🥤', bg: 'bg-sky-100', aliases: ['soda', 'coke', 'sprite'] },
  { name: 'Bottled Water', category: 'Drinks', emoji: '💧', bg: 'bg-sky-100', aliases: ['water'] },
]

export interface DishDefaultVisual {
  emoji: string
  bg: string
}

// Matches a typed menu item name against the library's dish names/aliases
// (case-insensitive substring) — used to give an unphotographed item a
// dish-specific icon instead of a generic plate. Returns null when nothing
// matches, so the caller falls back to its own generic placeholder.
export function getDefaultDishVisual(name: string): DishDefaultVisual | null {
  const needle = name.trim().toLowerCase()
  if (!needle) return null
  for (const dish of FILIPINO_DISH_LIBRARY) {
    const keywords = [dish.name.toLowerCase(), ...(dish.aliases ?? [])]
    if (keywords.some((k) => needle.includes(k))) return { emoji: dish.emoji, bg: dish.bg }
  }
  return null
}
