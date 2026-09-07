// Link previews for a vendor's page — and for a single post on it.
//
// The app draws /vendor-page/<id> in the browser, and Facebook's, Messenger's,
// Viber's and WhatsApp's crawlers do not run it — they read the raw HTML and
// see the generic "TodaRide" title, so a shared carinderia link arrived as a
// blank card. This runs at the edge in front of that HTML and writes the
// Open Graph tags every one of those apps reads. Nothing else changes — the
// same index.html is returned with a fuller <head>, and the app takes over
// from there exactly as before, so tapping the card lands on our page.
//
// Two kinds of link, told apart by ?post=:
//   /vendor-page/<id>                 the store — its banner as the picture
//   /vendor-page/<id>?post=<postId>   one post — that post's own photo (or
//                                     its featured dish) as the picture, the
//                                     post's words as the text
// and the image route that serves the picture as a real file:
//   /vendor-page/<id>/og-image[?post=<postId>]
//
// The banner picture is drawn on the vendor's device and stored on the
// record (Pharmacy.bannerThumbDataUrl, see lib/bannerThumb) — a 1200×630
// JPEG of the banner as the page shows it, which is what a crawler wants.
// Before it exists, the cover photo or logo stands in as before.
//
// Reads the same public anon key the app itself ships with — it is not a
// secret — with the site's environment taking precedence when set.

import type { Config, Context } from '@netlify/edge-functions'

const SUPABASE_URL = Netlify.env.get('SUPABASE_URL') ?? Netlify.env.get('VITE_SUPABASE_URL') ?? 'https://yadwpwvkzjzbhzugtdei.supabase.co'
const SUPABASE_KEY =
  Netlify.env.get('SUPABASE_ANON_KEY') ??
  Netlify.env.get('VITE_SUPABASE_ANON_KEY') ??
  'sb_publishable_8H6LxGfWP_ltongE7Rq91g_K_ZLp-i-'

interface PostLike {
  id: string
  text?: string
  photoDataUrl?: string | null
  productId?: string | null
  createdAt?: string
}

interface VendorLike {
  id: string
  name?: string
  tagline?: string | null
  businessType?: string
  addressDetail?: string
  barangay?: string
  city?: string
  logoDataUrl?: string | null
  coverPhotoDataUrl?: string | null
  bannerThumbDataUrl?: string | null
  storeReviews?: { rating: number }[]
  posts?: PostLike[]
}

interface ProductLike {
  id?: string
  pharmacyId?: string
  visible?: boolean
  name?: string
  price?: number
  photoDataUrl?: string | null
}

// One read of the shared state; cached briefly at the edge so a burst of
// crawler hits (Facebook fetches a link several times) costs one query.
async function loadState(): Promise<{ pharmacies: VendorLike[]; medicineProducts: ProductLike[] } | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/app_state?id=eq.singleton&select=state`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    })
    if (!res.ok) return null
    const rows = (await res.json()) as { state?: { pharmacies?: VendorLike[]; medicineProducts?: ProductLike[] } }[]
    const state = rows[0]?.state
    if (!state) return null
    return { pharmacies: state.pharmacies ?? [], medicineProducts: state.medicineProducts ?? [] }
  } catch {
    return null
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; type: string } | null {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl)
  if (!m) return null
  const type = m[1]
  if (m[2]) {
    const bin = atob(m[3])
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return { bytes, type }
  }
  return { bytes: new TextEncoder().encode(decodeURIComponent(m[3])), type }
}

// The picture for a set of candidates, in order of preference: a data URL
// is decoded and served; a path shipped with the site is redirected to.
// SVG is skipped everywhere — Facebook will not render it as a preview.
// Facebook's crawler renders WebP inconsistently, so among data URLs a
// PNG/JPEG wins over a WebP even when it is a later choice.
function pictureResponse(origin: string, candidates: (string | null | undefined)[]): Response | null {
  const photos = candidates.filter((p): p is string => !!p && !p.endsWith('.svg'))
  const decoded = photos
    .filter((p) => p.startsWith('data:'))
    .map(dataUrlToBytes)
    .filter((d): d is { bytes: Uint8Array; type: string } => !!d && !d.type.includes('svg'))
  const best = decoded.find((d) => d.type !== 'image/webp') ?? decoded[0] ?? null
  if (best) {
    return new Response(best.bytes, {
      headers: {
        'Content-Type': best.type,
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
  const pathPhoto = photos.find((p) => p.startsWith('/'))
  if (pathPhoto) return Response.redirect(`${origin}${pathPhoto}`, 302)
  return null
}

export default async function handler(request: Request, context: Context) {
  const url = new URL(request.url)
  const match = /^\/vendor-page\/([^/]+)(\/og-image)?\/?$/.exec(url.pathname)
  if (!match) return context.next()
  const [, id, wantsImage] = match
  const postId = url.searchParams.get('post')

  const state = await loadState()
  const vendor = state?.pharmacies.find((p) => p.id === id)
  const post = postId ? vendor?.posts?.find((p) => p.id === postId) ?? null : null
  const featured = post?.productId ? state?.medicineProducts.find((p) => p.id === post.productId) ?? null : null

  if (wantsImage) {
    // A post: its own photo, else the dish it features, else the store's
    // banner. The store: the banner picture, else the cover photo or logo,
    // else the app's own icon so the card is never blank.
    // Tiers, not one flat list: the WebP-avoidance inside pictureResponse
    // must never let the store's banner (a JPEG) win over the post's own
    // photo (a WebP) — the post is what was shared.
    const tiers: (string | null | undefined)[][] = [
      ...(post ? [[post.photoDataUrl, featured?.photoDataUrl]] : []),
      [vendor?.bannerThumbDataUrl],
      [vendor?.coverPhotoDataUrl, vendor?.logoDataUrl],
    ]
    for (const tier of tiers) {
      const picture = pictureResponse(url.origin, tier)
      if (picture) return picture
    }
    return Response.redirect(`${url.origin}/pwa-512x512.png`, 302)
  }

  // The page itself: let the platform serve index.html as usual, then fill
  // the head. Only HTML is touched; anything else passes through untouched.
  const response = await context.next()
  const contentType = response.headers.get('content-type') ?? ''
  if (!vendor || !contentType.includes('text/html')) return response

  const name = vendor.name ?? 'Registered Vendor'
  const items = state!.medicineProducts.filter((p) => p.pharmacyId === vendor.id && p.visible !== false).length
  const reviews = vendor.storeReviews ?? []
  const rating = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null
  const kind = vendor.businessType === 'resto_food' ? 'Resto / Food' : vendor.businessType === 'other_commodity' ? 'Store' : 'Pharmacy'
  const where = [vendor.addressDetail, vendor.barangay, vendor.city].filter(Boolean).join(', ')

  let title: string
  let description: string
  let pageUrl = `${url.origin}/vendor-page/${encodeURIComponent(id)}`
  let imageUrl = `${pageUrl}/og-image`
  let ogType = 'website'
  if (post) {
    // The post is the card: the store's name as the title, the post's own
    // words (and the dish it features) as the text, its photo as the picture.
    title = `${name} — TODA SafeRide Food Express`
    const words = (post.text ?? '').trim().replace(/\s+/g, ' ').slice(0, 200)
    const dish = featured?.name ? `${featured.name}${featured.price != null ? ` ₱${featured.price}` : ''}` : null
    description = [words, dish, 'Order on TODA SafeRide Food Express — delivered by a TODA rider.'].filter(Boolean).join(' · ')
    pageUrl = `${pageUrl}?post=${encodeURIComponent(post.id)}`
    imageUrl = `${imageUrl}?post=${encodeURIComponent(post.id)}`
    ogType = 'article'
  } else {
    title = `${name} — TODA SafeRide Food Express`
    description = [
      vendor.tagline,
      `${kind}${items ? ` · ${items} item${items === 1 ? '' : 's'} on the menu` : ''}${rating ? ` · ★ ${rating}` : ''}`,
      where,
      'Order on TODA SafeRide Food Express — delivered by a TODA rider.',
    ]
      .filter(Boolean)
      .join(' · ')
  }

  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<meta property="og:type" content="${ogType}" />`,
    `<meta property="og:site_name" content="TODA SafeRide" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(pageUrl)}" />`,
    `<meta property="og:image" content="${escapeHtml(imageUrl)}" />`,
    `<meta property="og:image:alt" content="${escapeHtml(post ? `${name}: ${(post.text ?? '').slice(0, 80)}` : name)}" />`,
    ...(post ? [] : [`<meta property="og:image:width" content="1200" />`, `<meta property="og:image:height" content="630" />`]),
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />`,
  ].join('\n    ')

  const html = await response.text()
  // Replace the generic title and drop any default og tags, then add ours.
  const rewritten = html
    .replace(/<title>[^<]*<\/title>/, '')
    .replace(/<meta (?:property|name)="(?:og:|twitter:|description)[^"]*" content="[^"]*"\s*\/?>\s*/g, '')
    .replace('</head>', `    ${tags}\n  </head>`)

  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'public, max-age=120')
  headers.delete('content-length')
  return new Response(rewritten, { status: response.status, headers })
}

export const config: Config = {
  path: '/vendor-page/*',
}
