import { describe, expect, it } from 'vitest'
import { shortName } from '../personName'

describe('shortName', () => {
  it('keeps the name after a Filipino honorific', () => {
    // The bug this exists for: "Kuya Marlon" shortened to "Kuya" named a
    // title instead of a driver, on the one marker that identifies him.
    expect(shortName('Kuya Marlon')).toBe('Kuya Marlon')
    expect(shortName('Mang Elmer')).toBe('Mang Elmer')
    expect(shortName('Ate Rosa Dela Cruz')).toBe('Ate Rosa')
  })

  it('takes the first name when there is no honorific', () => {
    expect(shortName('Celeste Macalinao')).toBe('Celeste')
    expect(shortName('Celeste M.')).toBe('Celeste')
  })

  it('handles a title written with a full stop', () => {
    expect(shortName('Dr. Santos')).toBe('Dr. Santos')
  })

  it('keeps a lone title rather than showing nothing', () => {
    expect(shortName('Kuya')).toBe('Kuya')
  })

  it('falls back when there is no name at all', () => {
    expect(shortName(null, 'Driver')).toBe('Driver')
    expect(shortName('   ', 'You')).toBe('You')
    expect(shortName(undefined)).toBe('')
  })
})
