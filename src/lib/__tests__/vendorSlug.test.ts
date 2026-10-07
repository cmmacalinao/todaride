import { describe, expect, it } from 'vitest'
import {
  isReservedSlug,
  isSlugAvailable,
  normalizeSlugInput,
  publicVendorUrl,
  RESERVED_SLUGS,
  SLUG_MAX_LENGTH,
  slugIndex,
  slugProblem,
  suggestAvailableSlug,
  suggestSlug,
  vendorForSlug,
} from '../vendorSlug'

const taken = (pairs: Record<string, string>) => new Map(Object.entries(pairs))

describe('slug rules', () => {
  it('accepts lowercase letters, numbers and hyphens', () => {
    expect(slugProblem('alingnena')).toBeNull()
    expect(slugProblem('nena-2')).toBeNull()
    expect(slugProblem('store123')).toBeNull()
  })

  it('refuses anything that cannot be written down and read back', () => {
    // Capitals, spaces and punctuation all produce links that get
    // mistyped, and two slugs that differ only by case are two slugs
    // nobody can tell apart out loud.
    expect(slugProblem('AlingNena')).toBe('bad-characters')
    expect(slugProblem('aling nena')).toBe('bad-characters')
    expect(slugProblem("aling'nena")).toBe('bad-characters')
    expect(slugProblem('aling_nena')).toBe('bad-characters')
    expect(slugProblem('aling.nena')).toBe('bad-characters')
    expect(slugProblem('alíngnena')).toBe('bad-characters')
    expect(slugProblem('店')).toBe('bad-characters')
  })

  it('holds the length between 3 and 30', () => {
    expect(slugProblem('ab')).toBe('too-short')
    expect(slugProblem('abc')).toBeNull()
    expect(slugProblem('a'.repeat(SLUG_MAX_LENGTH))).toBeNull()
    expect(slugProblem('a'.repeat(SLUG_MAX_LENGTH + 1))).toBe('too-long')
  })

  it('refuses an empty or blank name', () => {
    expect(slugProblem('')).toBe('empty')
    expect(slugProblem('   ')).toBe('empty')
  })

  it('refuses hyphens at the edges and doubled up', () => {
    expect(slugProblem('-nena')).toBe('bad-edges')
    expect(slugProblem('nena-')).toBe('bad-edges')
    expect(slugProblem('aling--nena')).toBe('double-hyphen')
  })
})

describe('reserved names', () => {
  // The slug route is matched last, so an app page always wins — but a store
  // holding "admin" would still be a store claiming to be the admin page,
  // and that is the shape of a phishing link. Refused up front.
  it('refuses every name the app answers on', () => {
    // The guarantee is that none of them can be taken. "og" is also below
    // the length floor, so it is refused for that reason first — which is
    // true, and still a refusal.
    for (const name of ['www', 'app', 'admin', 'api', 'book', 'drive', 'vendor', 'operator', 'franchise', 'scan', 'welcome', 'og']) {
      expect(slugProblem(name)).not.toBeNull()
      expect(isSlugAvailable(name)).toBe(false)
    }
  })

  it('names it as reserved whenever the name is otherwise usable', () => {
    for (const name of ['www', 'app', 'admin', 'api', 'book', 'drive', 'vendor', 'operator', 'franchise', 'scan', 'welcome']) {
      expect(slugProblem(name)).toBe('reserved')
    }
  })

  it('refuses the rest of the top-level routes too', () => {
    for (const name of ['pharmacy', 'vendor-page', 'driver', 'parent', 'passenger']) {
      expect(slugProblem(name)).toBe('reserved')
    }
  })

  it('holds back names the app will plausibly need later', () => {
    // Taking one of these back from a store that has already printed it on
    // a tarpaulin is not really possible, so they are held from the start.
    for (const name of ['login', 'account', 'support', 'privacy', 'terms', 'settings']) {
      expect(slugProblem(name)).toBe('reserved')
    }
  })

  it('answers about a single name, whatever case it arrives in', () => {
    expect(isReservedSlug('admin')).toBe(true)
    expect(isReservedSlug('  ADMIN  ')).toBe(true)
    expect(isReservedSlug('alingnena')).toBe(false)
  })

  it('does not reserve a name that merely contains a reserved word', () => {
    expect(slugProblem('bookstore')).toBeNull()
    expect(slugProblem('adminas-bakery')).toBeNull()
  })

  it('keeps every reserved entry itself a well-formed lowercase slug', () => {
    // A reserved word with a capital in it could never be typed into the
    // field anyway, so it would protect nothing.
    for (const name of RESERVED_SLUGS) {
      expect(name).toBe(name.toLowerCase())
    }
  })
})

describe('uniqueness', () => {
  const takenBy = taken({ alingnena: 'ph-1', bakery: 'ph-2' })

  it('refuses a slug another store holds', () => {
    expect(slugProblem('alingnena', { takenBy, vendorId: 'ph-9' })).toBe('taken')
  })

  it('lets a store keep its own slug while editing', () => {
    expect(slugProblem('alingnena', { takenBy, vendorId: 'ph-1' })).toBeNull()
  })

  it('reads availability as a plain yes or no', () => {
    expect(isSlugAvailable('freeone', { takenBy })).toBe(true)
    expect(isSlugAvailable('bakery', { takenBy })).toBe(false)
    expect(isSlugAvailable('admin', { takenBy })).toBe(false)
  })

  it('indexes slugs to their owners, ignoring blanks', () => {
    const index = slugIndex([
      { id: 'ph-1', slug: 'alingnena' },
      { id: 'ph-2', slug: null },
      { id: 'ph-3' },
      { id: 'ph-4', slug: '  BAKERY  ' },
    ])
    expect(index.get('alingnena')).toBe('ph-1')
    expect(index.get('bakery')).toBe('ph-4')
    expect(index.size).toBe(2)
  })

  it('gives a duplicated slug to the first holder rather than flickering', () => {
    const index = slugIndex([
      { id: 'ph-1', slug: 'same' },
      { id: 'ph-2', slug: 'same' },
    ])
    expect(index.get('same')).toBe('ph-1')
  })
})

describe('suggesting a slug from the store name', () => {
  it('turns a store name into something writable', () => {
    expect(suggestSlug("Aling Nena's Store")).toBe('alingnena')
    expect(suggestSlug('Bakery ni Mang Tonio')).toBe('bakerynimangtonio')
  })

  it('drops accents rather than the letter under them', () => {
    expect(suggestSlug('Muñoz Carinderia')).toBe('munozcarinderia')
  })

  it('keeps something when the name is only noise words', () => {
    expect(suggestSlug('The Store')).toBe('thestore')
  })

  it('gives nothing for a name with no usable letters', () => {
    expect(suggestSlug('!!!')).toBe('')
    expect(suggestSlug('店')).toBe('')
  })

  it('never suggests something longer than the limit', () => {
    expect(suggestSlug('A'.repeat(80)).length).toBeLessThanOrEqual(SLUG_MAX_LENGTH)
  })

  it('numbers a suggestion that is already taken', () => {
    const takenBy = taken({ alingnena: 'ph-1' })
    expect(suggestAvailableSlug("Aling Nena's Store", { takenBy, vendorId: 'ph-9' })).toBe('alingnena2')
  })

  it('steps past a reserved suggestion', () => {
    // "Book" would otherwise suggest the app's own booking route.
    expect(suggestAvailableSlug('Book')).toBe('book2')
  })

  it('falls back to the id when the name yields nothing', () => {
    expect(suggestAvailableSlug('!!!', { vendorId: 'ph-77' })).toBe('ph-77')
  })

  it('suggests something valid for every case it returns', () => {
    for (const name of ["Aling Nena's Store", 'Muñoz Carinderia', 'Book', 'The Store']) {
      const slug = suggestAvailableSlug(name, { vendorId: 'ph-1' })
      expect(slugProblem(slug)).toBeNull()
    }
  })
})

describe('normalizeSlugInput', () => {
  // Tidying as somebody types, not validation — the field must not fight a
  // vendor who types a capital or a space.
  it('lets a vendor type naturally', () => {
    expect(normalizeSlugInput('Aling Nena')).toBe('alingnena')
    expect(normalizeSlugInput('ALING-NENA')).toBe('aling-nena')
    expect(normalizeSlugInput('aling--nena')).toBe('aling-nena')
    expect(normalizeSlugInput('Muñoz')).toBe('munoz')
  })

  it('stops at the maximum length', () => {
    expect(normalizeSlugInput('a'.repeat(50)).length).toBe(SLUG_MAX_LENGTH)
  })

  it('leaves a leading hyphen alone so it can be typed through', () => {
    // Removing it mid-typing would make "my-store" impossible to type from
    // the left. slugProblem is what refuses it on save.
    expect(normalizeSlugInput('-')).toBe('-')
  })
})

describe('resolving a public URL to a store', () => {
  const vendors = [
    { id: 'ph-1', slug: 'alingnena', verificationStatus: 'approved' },
    { id: 'ph-2', slug: 'pending-one', verificationStatus: 'pending' },
    { id: 'ph-3', slug: 'rejected-one', verificationStatus: 'rejected' },
    { id: 'ph-4', slug: null, verificationStatus: 'approved' },
  ]

  it('finds an approved store by its slug', () => {
    expect(vendorForSlug(vendors, 'alingnena')?.id).toBe('ph-1')
    expect(vendorForSlug(vendors, '  ALINGNENA ')?.id).toBe('ph-1')
  })

  // A public page is the platform vouching for the store. Nobody has
  // checked an unapproved one.
  it('refuses a store nobody has approved', () => {
    expect(vendorForSlug(vendors, 'pending-one')).toBeNull()
    expect(vendorForSlug(vendors, 'rejected-one')).toBeNull()
  })

  it('returns nothing for an unknown or empty slug', () => {
    expect(vendorForSlug(vendors, 'nobody')).toBeNull()
    expect(vendorForSlug(vendors, '')).toBeNull()
    expect(vendorForSlug(vendors, undefined)).toBeNull()
  })

  it('does not match a store that has no slug', () => {
    expect(vendorForSlug(vendors, 'ph-4')).toBeNull()
  })
})

describe('publicVendorUrl', () => {
  it('uses the slug when there is one', () => {
    expect(publicVendorUrl('https://todaridemobility.com', 'alingnena')).toBe(
      'https://todaridemobility.com/alingnena',
    )
  })

  it('tolerates a trailing slash on the origin', () => {
    expect(publicVendorUrl('https://todaridemobility.com/', 'alingnena')).toBe(
      'https://todaridemobility.com/alingnena',
    )
  })

  it('falls back to the id route for a store with no slug yet', () => {
    expect(publicVendorUrl('https://todaridemobility.com', null, 'ph-1')).toBe(
      'https://todaridemobility.com/vendor-page/ph-1',
    )
  })
})
