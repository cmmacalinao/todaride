// How a shop's menu is laid out for customers.
//
// A vertical list is right for a carinderia with eight dishes: everything is
// on one screen and the category chips are barely needed. Shelves — a
// horizontal row per category, swiped sideways — are right for a sari-sari
// with two hundred lines across a dozen categories, where a list is an
// endless scroll and the chips are the only way to navigate.
//
// Neither is right for both, and the shop knows which it is. So the choice
// is offered to everyone, and defaults to 'auto' so nobody has to make it:
// a threshold is a poor gate but a perfectly good default, and a shop that
// disagrees overrides it in one tap.

export type MenuLayout = 'auto' | 'list' | 'shelves'
export type ResolvedMenuLayout = 'list' | 'shelves'

export interface LayoutItem {
  menuCategory?: string | null
  visible?: boolean
}

// Shelves earn their place when there is enough to navigate: several real
// categories, and more items than fit comfortably in one scroll. Both, not
// either — twenty dishes in one category is still a list, and three
// categories holding one item each is three sad rows.
export const SHELVES_MIN_CATEGORIES = 3
export const SHELVES_MIN_ITEMS = 12

export function categoryOf(item: LayoutItem): string {
  return item.menuCategory?.trim() || 'Menu'
}

export function resolveMenuLayout(layout: MenuLayout | null | undefined, items: LayoutItem[]): ResolvedMenuLayout {
  if (layout === 'list' || layout === 'shelves') return layout
  const visible = items.filter((i) => i.visible !== false)
  const categories = new Set(visible.map(categoryOf))
  return categories.size >= SHELVES_MIN_CATEGORIES && visible.length >= SHELVES_MIN_ITEMS ? 'shelves' : 'list'
}

export interface Shelf<T> {
  category: string
  items: T[]
}

// A shelf holding one item is mostly empty space where a product should be,
// so thin categories are swept into a single row at the end rather than
// drawn as rows of their own. The sweep only happens when there is something
// to sweep into — one lonely category on its own keeps its name, because
// "More" with one thing under it tells a customer nothing.
export const MIN_SHELF_ITEMS = 2
export const OVERFLOW_SHELF = 'More'

export function buildShelves<T extends LayoutItem>(items: T[]): Shelf<T>[] {
  const visible = items.filter((i) => i.visible !== false)
  const byCategory = new Map<string, T[]>()
  for (const item of visible) {
    const key = categoryOf(item)
    const list = byCategory.get(key)
    if (list) list.push(item)
    else byCategory.set(key, [item])
  }

  const full: Shelf<T>[] = []
  const thin: T[] = []
  for (const [category, list] of byCategory) {
    if (list.length >= MIN_SHELF_ITEMS) full.push({ category, items: list })
    else thin.push(...list)
  }

  if (thin.length === 0) return full
  // Nothing to merge them into: keep them as they were rather than filing a
  // shop's only categories under "More".
  if (full.length === 0) {
    return Array.from(byCategory, ([category, list]) => ({ category, items: list }))
  }
  return [...full, { category: OVERFLOW_SHELF, items: thin }]
}
