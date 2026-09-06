// Link previews for a vendor's page.
//
// The app draws /vendor-page/<id> in the browser, and Facebook's, Messenger's,
// Viber's and WhatsApp's crawlers do not run it — they read the raw HTML and
// see the generic "TodaRide" title, so a shared carinderia link arrived as a
// blank card. This runs at the edge in front of that HTML and writes the
// Open Graph tags every one of those apps reads: the vendor's name, tagline,
// address and menu size, and their own logo or profile photo as the image.
// Nothing else changes — the same index.html is returned with a fuller <head>,
// and the app takes over from there exactly as before.
//
// Two routes, both under the vendor's path so nothing new has to be shared:
//   /vendor-page/<id>            the page, with Open Graph tags injected
//   /vendor-page/<id>/og-image   the vendor's photo as a real image URL
// The photo is stored as a data URL inside the shared state (see
// Pharmacy.coverPhotoDataUrl / logoDataUrl); a crawler needs an https URL it
// can fetch, so the second route decodes it on the way out.
//
// Reads the same public anon key the app itself ships with — it is not a
// secret — with the site's environment taking precedence when set.

import type { Config, Context } from '@netlify/edge-functions'

const SUPABASE_URL = Netlify.env.get('SUPABASE_URL') ?? Netlify.env.get('VITE_SUPABASE_URL') ?? 'https://yadwpwvkzjzbhzugtdei.supabase.co'
const SUPABASE_KEY =
  Netlify.env.get('SUPABASE_ANON_KEY') ??
  Netlify.env.get('VITE_SUPABASE_ANON_KEY') ??
  'sb_publishable_8H6LxGfWP_ltongE7Rq91g_K_ZLp-i-'

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
  storeReviews?: { rating: number }[]
}

interface ProductLike {
  pharmacyId?: string
  visible?: boolean
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

export default async function handler(request: Request, context: Context) {
  const url = new URL(request.url)
  const match = /^\/vendor-page\/([^/]+)(\/og-image)?\/?$/.exec(url.pathname)
  if (!match) return context.next()
  const [, id, wantsImage] = match

  const state = await loadState()
  const vendor = state?.pharmacies.find((p) => p.id === id)

  if (wantsImage) {
    // Profile photo first, logo second — but Facebook's crawler renders WebP
    // inconsistently, so a PNG/JPEG candidate wins over a WebP one even if
    // it is the second choice. Only when both are WebP is WebP served.
    const candidates = [vendor?.coverPhotoDataUrl, vendor?.logoDataUrl]
      .filter((p): p is string => !!p)
      .map(dataUrlToBytes)
      .filter((d): d is { bytes: Uint8Array; type: string } => !!d)
    const decoded = candidates.find((d) => d.type !== 'image/webp') ?? candidates[0] ?? null
    if (!decoded) {
      // No photo of their own: the app's own icon, so the card is never blank.
      return Response.redirect(`${url.origin}/pwa-512x512.png`, 302)
    }
    return new Response(decoded.bytes, {
      headers: {
        'Content-Type': decoded.type,
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*',
      },
    })
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
  const description = [
    vendor.tagline,
    `${kind}${items ? ` · ${items} item${items === 1 ? '' : 's'} on the menu` : ''}${rating ? ` · ★ ${rating}` : ''}`,
    where,
    'Order on TODA SafeRide Food Express — delivered by a TODA rider.',
  ]
    .filter(Boolean)
    .join(' · ')
  const title = `${name} — TODA SafeRide Food Express`
  const pageUrl = `${url.origin}/vendor-page/${encodeURIComponent(id)}`
  const imageUrl = `${pageUrl}/og-image`

  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="TODA SafeRide" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(pageUrl)}" />`,
    `<meta property="og:image" content="${escapeHtml(imageUrl)}" />`,
    `<meta property="og:image:alt" content="${escapeHtml(name)}" />`,
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
