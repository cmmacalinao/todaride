import { describe, expect, it } from 'vitest'
import { addressParts, formatAddressLine } from '../addressFormat'

// A reverse-geocoded label is nine segments long and gets printed on a phone
// screen beside a fare. These are the cuts the app makes to it, pinned here
// because the rule is "detail, barangay, city" and nothing else — a change
// that quietly starts keeping the sitio or the province would go unnoticed
// on any one screen while making every one of them longer.
describe('formatAddressLine', () => {
  it('cuts a full postal chain down to detail, barangay, city', () => {
    expect(
      formatAddressLine(
        'Central Luzon State University, Bantug-Villa Cuizon Road, Villa Isidra, Bantug, Muñoz, Nueva Ecija, Central Luzon, 3119, Philippines',
      ),
    ).toBe('CLSU, Bantug, Muñoz')
  })

  it('drops the "Science City of" prefix a city is never called by', () => {
    expect(formatAddressLine('Botanical Garden, CLSU, Science City of Muñoz')).toBe('Botanical Garden, CLSU, Muñoz')
  })

  it('drops the "City" suffix and abbreviates the road type', () => {
    expect(formatAddressLine('Maharlika Highway, Poblacion, San Jose City, Nueva Ecija, Philippines')).toBe(
      'Maharlika Hwy, Poblacion, San Jose',
    )
  })

  it('identifies the parts by name, not by position', () => {
    // "CLSU" is a real barangay of Muñoz, so it is read as one even though it
    // arrives before the street rather than after it.
    expect(addressParts('CLSU, College Ave')).toEqual({ detail: 'College Ave', barangay: 'CLSU', city: null })
  })

  it('leaves a label it cannot identify alone rather than mangling it', () => {
    expect(formatAddressLine('Some Random Shop')).toBe('Some Random Shop')
  })

  it('says a repeated name once', () => {
    expect(formatAddressLine('CLSU, CLSU, Science City of Muñoz')).toBe('CLSU, Muñoz')
  })
})
