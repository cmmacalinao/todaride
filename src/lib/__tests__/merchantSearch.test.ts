import { describe, expect, it } from 'vitest'
import {
  MIN_QUERY,
  isNearMatch,
  subsequenceSpan,
  matchScore,
  merchantHint,
  normalise,
  searchMerchants,
} from '../merchantSearch'

const shop = (name: string, extra: Record<string, unknown> = {}) => ({ id: `id-${name}`, name, ...extra })

const SHOPS = [
  shop("Aling Nena's Carinderia", { city: 'San Jose City', barangay: 'Malasin' }),
  shop("Kuya Ben's Ihaw-Ihaw", { city: 'San Jose City' }),
  shop('Mercury Drug — San Jose Poblacion', { contactPhone: '0917-500-1001' }),
  shop('Manang Cora’s Lugawan'),
  shop('Nena Hardware'),
]

describe('nothing is offered until something is typed', () => {
  it('shows no one for an empty box — the roster is not a public list', () => {
    expect(searchMerchants(SHOPS, '')).toEqual([])
    expect(searchMerchants(SHOPS, ' ')).toEqual([])
  })

  it('shows no one for a single letter either', () => {
    expect(MIN_QUERY).toBeGreaterThan(1)
    expect(searchMerchants(SHOPS, 'a')).toEqual([])
  })

  it('starts helping at two', () => {
    expect(searchMerchants(SHOPS, 'ne').length).toBeGreaterThan(0)
  })
})

describe('typing a name', () => {
  it('finds a shop by how it starts', () => {
    expect(searchMerchants(SHOPS, 'kuya').map((s) => s.name)).toEqual(["Kuya Ben's Ihaw-Ihaw"])
  })

  it('finds a word in the middle, which is where half these names live', () => {
    // Aling, Mang, Kuya, Manang — the distinguishing word is rarely first.
    const names = searchMerchants(SHOPS, 'nena').map((s) => s.name)
    expect(names).toContain("Aling Nena's Carinderia")
    expect(names).toContain('Nena Hardware')
  })

  it('puts the one that starts with it first', () => {
    expect(searchMerchants(SHOPS, 'nena')[0].name).toBe('Nena Hardware')
  })

  it('ignores apostrophes, dashes, case and spacing', () => {
    expect(searchMerchants(SHOPS, 'ALINGNENAS').map((s) => s.name)).toContain("Aling Nena's Carinderia")
    expect(searchMerchants(SHOPS, 'mercury drug').map((s) => s.name)).toContain('Mercury Drug — San Jose Poblacion')
  })

  it('forgives a dropped letter', () => {
    // A subsequence match, ranked below the real ones.
    expect(searchMerchants(SHOPS, 'mercry').map((s) => s.name)).toContain('Mercury Drug — San Jose Poblacion')
  })

  it('finds nothing when there is nothing to find', () => {
    expect(searchMerchants(SHOPS, 'zzzzzz')).toEqual([])
  })
})

describe('typing a phone number', () => {
  it('finds the shop that registered it', () => {
    expect(searchMerchants(SHOPS, '09175001001').map((s) => s.name)).toEqual(['Mercury Drug — San Jose Poblacion'])
    expect(searchMerchants(SHOPS, '500-1001').map((s) => s.name)).toEqual(['Mercury Drug — San Jose Poblacion'])
  })

  it('does not read a word as a phone number', () => {
    expect(matchScore({ id: 'x', name: 'Something Else', contactPhone: '0917-500-1001' }, 'ihaw')).toBeNull()
  })
})

describe('the list stays still', () => {
  it('caps how many are shown', () => {
    const many = Array.from({ length: 30 }, (_, i) => shop(`Nena Store ${i}`))
    expect(searchMerchants(many, 'nena').length).toBeLessThanOrEqual(8)
  })

  it('breaks ties alphabetically, so it does not reshuffle under a thumb', () => {
    const tied = [shop('Nena Zulu'), shop('Nena Alpha'), shop('Nena Mike')]
    expect(searchMerchants(tied, 'nena').map((s) => s.name)).toEqual(['Nena Alpha', 'Nena Mike', 'Nena Zulu'])
  })
})

describe('the helpers underneath', () => {
  it('strips a name down to letters and digits', () => {
    expect(normalise("Aling Nena's — Carinderia!")).toBe('alingnenascarinderia')
    expect(normalise(null)).toBe('')
  })

  it('measures how far a near-match wanders', () => {
    expect(subsequenceSpan('abc', 'abc')).toBe(3)
    expect(subsequenceSpan('abc', 'aXbXc')).toBe(5)
    expect(subsequenceSpan('acb', 'aXbXc')).toBeNull()
    // The tightest run wins, not the first one found.
    expect(subsequenceSpan('ab', 'aXXXXbab')).toBe(2)
  })

  it('refuses a near-match spread over half a name', () => {
    // The real case: "nena" was matching "Tita Marites Kakanin & Merienda".
    expect(isNearMatch('nena', 'titamariteskakaninmerienda')).toBe(false)
    expect(isNearMatch('mercry', 'mercurydrugsanjosepoblacion')).toBe(true)
  })

  it('tells two shops of the same name apart by where they are', () => {
    expect(merchantHint(SHOPS[0])).toBe('Malasin, San Jose City')
    expect(merchantHint(SHOPS[3])).toBe('')
  })
})
