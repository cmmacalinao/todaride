import { describe, expect, it } from 'vitest'
import { isVendorSlugPath, RESERVED_SLUGS, slugProblem } from '../vendorSlug'

// The same three URL shapes the edge function recognises
// (netlify/edge-functions/vendor-og.ts parseTarget). Mirrored here so a
// change to the patterns has to be made in a place a test is watching.
function parseTarget(pathname: string): { key: string; by: 'id' | 'slug'; wantsImage: boolean } | null {
  const legacy = /^\/vendor-page\/([^/]+)(\/og-image)?\/?$/.exec(pathname)
  if (legacy) return { key: legacy[1], by: 'id', wantsImage: !!legacy[2] }

  const image = /^\/og\/([a-z0-9-]{3,30})\.jpg$/.exec(pathname)
  if (image) return { key: image[1], by: 'slug', wantsImage: true }

  const page = /^\/([a-z0-9-]{3,30})\/?$/.exec(pathname)
  if (page) return { key: page[1], by: 'slug', wantsImage: false }

  return null
}

describe('which paths are treated as a store address', () => {
  it('claims a single well-formed segment', () => {
    expect(isVendorSlugPath('/alingnena')).toBe(true)
    expect(isVendorSlugPath('/alingnena/')).toBe(true)
    expect(isVendorSlugPath('/nena-2')).toBe(true)
  })

  // Being wrong this way hides an app page, so the check is strict.
  it('never claims an app route', () => {
    for (const name of RESERVED_SLUGS) {
      expect(isVendorSlugPath(`/${name}`)).toBe(false)
    }
  })

  it('never claims a deeper path', () => {
    expect(isVendorSlugPath('/book/start')).toBe(false)
    expect(isVendorSlugPath('/admin/super')).toBe(false)
    expect(isVendorSlugPath('/vendor-page/ph-1')).toBe(false)
    expect(isVendorSlugPath('/alingnena/menu')).toBe(false)
  })

  it('never claims the root, or something that could not be a slug', () => {
    expect(isVendorSlugPath('/')).toBe(false)
    expect(isVendorSlugPath('')).toBe(false)
    expect(isVendorSlugPath('/ab')).toBe(false)
    expect(isVendorSlugPath('/Alingnena')).toBe(false)
    expect(isVendorSlugPath('/aling nena')).toBe(false)
    expect(isVendorSlugPath('/favicon.ico')).toBe(false)
    expect(isVendorSlugPath('/sw.js')).toBe(false)
  })

  it('agrees with the rules a vendor is held to', () => {
    // Anything the router would claim must be something a vendor could
    // actually have saved, or the page could never exist.
    for (const path of ['/alingnena', '/nena-2', '/bakery123']) {
      expect(slugProblem(path.slice(1))).toBeNull()
    }
  })
})

describe('the URL shapes the edge function answers', () => {
  it('keeps the original id route working, image and all', () => {
    expect(parseTarget('/vendor-page/ph-1')).toEqual({ key: 'ph-1', by: 'id', wantsImage: false })
    expect(parseTarget('/vendor-page/ph-1/og-image')).toEqual({ key: 'ph-1', by: 'id', wantsImage: true })
  })

  it('reads a store address as a page', () => {
    expect(parseTarget('/alingnena')).toEqual({ key: 'alingnena', by: 'slug', wantsImage: false })
  })

  it('reads /og/<slug>.jpg as that page picture', () => {
    expect(parseTarget('/og/alingnena.jpg')).toEqual({ key: 'alingnena', by: 'slug', wantsImage: true })
  })

  it('claims nothing it should not', () => {
    expect(parseTarget('/')).toBeNull()
    expect(parseTarget('/book/start')).toBeNull()
    expect(parseTarget('/assets/index-abc123.js')).toBeNull()
    expect(parseTarget('/og/alingnena.png')).toBeNull()
    expect(parseTarget('/og/Alingnena.jpg')).toBeNull()
  })
})

// The picture a crawler is given, in order of preference. Mirrors the tiers
// in the edge function: a store with no photographs at all must still get a
// card, because a broken image in a Messenger thread reads as a broken link.
function ogImageFor(vendor: {
  bannerThumbDataUrl?: string | null
  coverPhotoDataUrl?: string | null
  logoDataUrl?: string | null
  pageHidden?: boolean
  verificationStatus?: string
}): string {
  const DEFAULT = '/og-image.png'
  if (vendor.pageHidden) return DEFAULT
  if (vendor.verificationStatus && vendor.verificationStatus !== 'approved') return DEFAULT
  return vendor.bannerThumbDataUrl || vendor.coverPhotoDataUrl || vendor.logoDataUrl || DEFAULT
}

describe('the og image falls back rather than breaking', () => {
  it('prefers the drawn banner, then the cover photo, then the logo', () => {
    expect(ogImageFor({ bannerThumbDataUrl: 'banner', coverPhotoDataUrl: 'cover', logoDataUrl: 'logo' })).toBe('banner')
    expect(ogImageFor({ coverPhotoDataUrl: 'cover', logoDataUrl: 'logo' })).toBe('cover')
    expect(ogImageFor({ logoDataUrl: 'logo' })).toBe('logo')
  })

  it('gives the default image to a store with no pictures at all', () => {
    expect(ogImageFor({})).toBe('/og-image.png')
    expect(ogImageFor({ bannerThumbDataUrl: null, coverPhotoDataUrl: null, logoDataUrl: null })).toBe('/og-image.png')
  })

  // The card IS the page, as far as a Messenger thread is concerned — a
  // hidden store leaking its name and photograph through a preview would
  // leave the page alive after it was taken down.
  it('gives the default image for a hidden store, however many photos it has', () => {
    expect(ogImageFor({ bannerThumbDataUrl: 'banner', coverPhotoDataUrl: 'cover', pageHidden: true })).toBe(
      '/og-image.png',
    )
  })

  it('gives the default image for a store nobody has approved', () => {
    expect(ogImageFor({ bannerThumbDataUrl: 'banner', verificationStatus: 'pending' })).toBe('/og-image.png')
    expect(ogImageFor({ bannerThumbDataUrl: 'banner', verificationStatus: 'rejected' })).toBe('/og-image.png')
    expect(ogImageFor({ bannerThumbDataUrl: 'banner', verificationStatus: 'approved' })).toBe('banner')
  })
})
