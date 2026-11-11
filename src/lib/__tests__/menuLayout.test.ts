import { describe, expect, it } from 'vitest'
import { buildShelves, OVERFLOW_SHELF, resolveMenuLayout, type LayoutItem } from '../menuLayout'

function items(spec: Record<string, number>, overrides: Partial<LayoutItem> = {}): LayoutItem[] {
  const out: LayoutItem[] = []
  for (const [category, count] of Object.entries(spec)) {
    for (let i = 0; i < count; i += 1) out.push({ menuCategory: category, ...overrides })
  }
  return out
}

describe('resolveMenuLayout', () => {
  const bigShop = items({ Ulam: 5, Rice: 4, Drinks: 4, Snacks: 3 })
  const carinderia = items({ Ulam: 4, Rice: 2, Drinks: 2 })

  it('respects an explicit choice, whatever the catalogue looks like', () => {
    expect(resolveMenuLayout('shelves', carinderia)).toBe('shelves')
    expect(resolveMenuLayout('list', bigShop)).toBe('list')
  })

  it('gives a big, varied catalogue shelves automatically', () => {
    expect(resolveMenuLayout('auto', bigShop)).toBe('shelves')
    expect(resolveMenuLayout(null, bigShop)).toBe('shelves')
    expect(resolveMenuLayout(undefined, bigShop)).toBe('shelves')
  })

  it('leaves a small shop as a list — eight dishes are not four shelves', () => {
    expect(resolveMenuLayout('auto', carinderia)).toBe('list')
  })

  it('needs both breadth and depth, not either alone', () => {
    // Plenty of items, one category.
    expect(resolveMenuLayout('auto', items({ Ulam: 30 }))).toBe('list')
    // Plenty of categories, almost nothing in them.
    expect(resolveMenuLayout('auto', items({ A: 1, B: 1, C: 1, D: 1 }))).toBe('list')
  })

  it('counts only what a customer can see', () => {
    const hidden = items({ Ulam: 5, Rice: 5, Drinks: 5 }, { visible: false })
    expect(resolveMenuLayout('auto', hidden)).toBe('list')
  })
})

describe('buildShelves', () => {
  it('keeps a row per category when each has enough to show', () => {
    const shelves = buildShelves(items({ Ulam: 3, Rice: 2 }))
    expect(shelves.map((s) => s.category)).toEqual(['Ulam', 'Rice'])
    expect(shelves[0].items).toHaveLength(3)
  })

  it('sweeps one-item categories into a single row rather than drawing empty shelves', () => {
    const shelves = buildShelves(items({ Ulam: 4, Rice: 3, Sabon: 1, Yelo: 1 }))
    expect(shelves.map((s) => s.category)).toEqual(['Ulam', 'Rice', OVERFLOW_SHELF])
    expect(shelves[2].items).toHaveLength(2)
  })

  it('does not file a shop’s only categories under "More"', () => {
    // Nothing is big enough to be a shelf, so there is nothing to sweep into.
    const shelves = buildShelves(items({ Sabon: 1, Yelo: 1 }))
    expect(shelves.map((s) => s.category)).toEqual(['Sabon', 'Yelo'])
  })

  it('leaves hidden items out of the shelves entirely', () => {
    const visible = items({ Ulam: 3 })
    const hidden = items({ Rice: 4 }, { visible: false })
    const shelves = buildShelves([...visible, ...hidden])
    expect(shelves.map((s) => s.category)).toEqual(['Ulam'])
  })

  it('files an item with no category of its own under Menu, not under undefined', () => {
    const shelves = buildShelves([{ menuCategory: null }, { menuCategory: '  ' }])
    expect(shelves.map((s) => s.category)).toEqual(['Menu'])
    expect(shelves[0].items).toHaveLength(2)
  })
})
