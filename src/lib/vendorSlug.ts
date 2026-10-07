// A store's own address: todaridemobility.com/alingnena
//
// A vendor hands out their page on a tarpaulin, in a Messenger reply, or
// written on a receipt. /vendor-page/ph-1759... is not something anyone can
// write down or say out loud, and a link nobody can repeat does not get
// repeated. A slug is the whole difference between a page that spreads and
// one that only works when tapped.
//
// The rules here are deliberately narrow. Lowercase letters, digits and
// hyphens are what survives being written by hand, read over the phone, and
// typed by somebody who is not sure about capitals — and they are what keeps
// two stores from ending up with names that differ only in ways nobody can
// see.
//
// The reserved list is the part that matters most. The slug route is matched
// last, so an existing page always wins, but a store that took "admin" would
// still be a store claiming to be the admin page — and a link to
// todaridemobility.com/admin that opens somebody's carinderia is exactly the
// shape of a phishing page. Names are refused up front rather than being
// shadowed quietly later.

export const SLUG_MIN_LENGTH = 3
export const SLUG_MAX_LENGTH = 30

// Every top-level route the app answers on, plus the words an app of this
// kind grows into later (api, app, www). A store may not take any of them.
//
// Kept as a literal list rather than derived from the router: the router is
// built at runtime from components this module must not import, and a
// reserved word that silently disappeared when a route was renamed is worse
// than one that has to be added by hand.
export const RESERVED_SLUGS: readonly string[] = [
  // Asked for by name.
  'www',
  'app',
  'admin',
  'api',
  'book',
  'drive',
  'vendor',
  'operator',
  'franchise',
  'scan',
  'welcome',
  'og',
  // The rest of the app's own top-level routes.
  'pharmacy',
  'vendor-page',
  'passenger',
  'driver',
  'parent',
  'navcheck',
  // Paths the site itself serves, which a slug would shadow at the edge.
  'assets',
  'icons',
  'index.html',
  'manifest.webmanifest',
  'robots.txt',
  'sitemap.xml',
  'sw.js',
  'app-version.json',
  // Words worth holding back: an account page, a support page and a
  // sign-in page are all things this app will have, and taking one back
  // from a store that has already printed it is not really possible.
  'account',
  'auth',
  'help',
  'login',
  'logout',
  'me',
  'privacy',
  'register',
  'settings',
  'signup',
  'support',
  'terms',
  'track',
  'static',
]

const RESERVED = new Set(RESERVED_SLUGS)

export type SlugProblem =
  | 'empty'
  | 'too-short'
  | 'too-long'
  | 'bad-characters'
  | 'bad-edges'
  | 'double-hyphen'
  | 'reserved'
  | 'taken'

export const SLUG_PROBLEM_MESSAGE: Record<SlugProblem, string> = {
  empty: 'Pick a short name for your link.',
  'too-short': `Use at least ${SLUG_MIN_LENGTH} characters.`,
  'too-long': `Keep it to ${SLUG_MAX_LENGTH} characters or fewer.`,
  'bad-characters': 'Use small letters, numbers and hyphens only — no spaces.',
  'bad-edges': 'It cannot start or end with a hyphen.',
  'double-hyphen': 'Use one hyphen at a time.',
  reserved: 'That one is kept for the app itself. Try another.',
  taken: 'Another store already has that one.',
}

// Whether a slug is well-formed, free, and not one of ours.
//
// `takenBy` is the full set of slugs already in use, as a map to the vendor
// holding each — so a vendor editing their own slug is not told their own
// name is taken.
export function slugProblem(
  raw: string,
  args: { takenBy?: Map<string, string> | Record<string, string>; vendorId?: string } = {},
): SlugProblem | null {
  const slug = raw.trim()
  if (!slug) return 'empty'
  if (/[^a-z0-9-]/.test(slug)) return 'bad-characters'
  if (slug.length < SLUG_MIN_LENGTH) return 'too-short'
  if (slug.length > SLUG_MAX_LENGTH) return 'too-long'
  if (slug.startsWith('-') || slug.endsWith('-')) return 'bad-edges'
  if (slug.includes('--')) return 'double-hyphen'
  if (RESERVED.has(slug)) return 'reserved'

  const owner =
    args.takenBy instanceof Map ? args.takenBy.get(slug) : args.takenBy ? args.takenBy[slug] : undefined
  if (owner && owner !== args.vendorId) return 'taken'
  return null
}

export function isSlugAvailable(
  slug: string,
  args: { takenBy?: Map<string, string> | Record<string, string>; vendorId?: string } = {},
): boolean {
  return slugProblem(slug, args) === null
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED.has(slug.trim().toLowerCase())
}

// What the vendor is shown before they have chosen anything.
//
// "Aling Nena's Store" becomes "alingnena": the apostrophe and the spaces go,
// and so does the word "store", which every other store also has and which
// makes the link longer without telling anybody which store it is.
const NOISE_WORDS = new Set([
  'store',
  'shop',
  'the',
  'and',
  'ng',
  'sa',
  'inc',
  'corp',
  'co',
  'ltd',
  'opc',
  'enterprises',
  'enterprise',
  'trading',
])

export function suggestSlug(name: string): string {
  // Strip accents so "Muñoz" becomes "munoz" rather than losing the ñ.
  const plain = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // The possessive goes with the apostrophe: "Aling Nena's Store" should
    // read "alingnena", not "alingnenas" — the stray s is an artefact of
    // dropping the punctuation, not part of the name anybody says.
    .replace(/['’]s\b/g, '')

  const words = plain.split(/[^a-z0-9]+/).filter(Boolean)
  const meaningful = words.filter((w) => !NOISE_WORDS.has(w))
  // Everything was a noise word ("The Store"): keep what there is rather
  // than hand back nothing.
  const kept = meaningful.length > 0 ? meaningful : words

  let slug = kept.join('').slice(0, SLUG_MAX_LENGTH)
  // A name of only punctuation, or a non-Latin one, leaves nothing usable.
  if (slug.length < SLUG_MIN_LENGTH) slug = ''
  return slug
}

// A free slug for this vendor: the suggestion, or the suggestion with a
// number after it. Falls back to the vendor's id when a name gives nothing
// usable — a working link beats a pretty one that does not exist.
export function suggestAvailableSlug(
  name: string,
  args: { takenBy?: Map<string, string> | Record<string, string>; vendorId?: string; fallback?: string } = {},
): string {
  const base = suggestSlug(name)
  if (base && isSlugAvailable(base, args)) return base

  if (base) {
    for (let n = 2; n <= 99; n++) {
      const suffix = String(n)
      const candidate = base.slice(0, SLUG_MAX_LENGTH - suffix.length) + suffix
      if (isSlugAvailable(candidate, args)) return candidate
    }
  }

  const fallback = (args.fallback ?? args.vendorId ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/^-+|-+$/g, '')
  return isSlugAvailable(fallback, args) ? fallback : ''
}

// What the vendor typed, tidied as they type it. Not validation — this only
// removes what could never be valid, so the field does not fight somebody
// typing a capital or a space.
export function normalizeSlugInput(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, SLUG_MAX_LENGTH)
}

export interface SlugOwner {
  id: string
  slug?: string | null
}

// Slug -> vendor id, for the checks above.
export function slugIndex(vendors: SlugOwner[]): Map<string, string> {
  const index = new Map<string, string>()
  for (const v of vendors) {
    const slug = (v.slug ?? '').trim().toLowerCase()
    // First writer keeps it. Two vendors holding one slug should not be
    // possible, but if it ever happens the page must still resolve to one
    // of them rather than flickering between the two.
    if (slug && !index.has(slug)) index.set(slug, v.id)
  }
  return index
}

// Which vendor a public URL is asking for, if any.
//
// Only a vendor the admin has approved has a public page: an unapproved
// store has not been checked by anybody, and a public page is this
// platform vouching for it. A hidden store resolves to nothing too — see
// the "store not available" page.
export function vendorForSlug<T extends SlugOwner & { verificationStatus?: string; pageHidden?: boolean }>(
  vendors: T[],
  slug: string | undefined,
): T | null {
  const wanted = (slug ?? '').trim().toLowerCase()
  if (!wanted) return null
  const found = vendors.find((v) => (v.slug ?? '').trim().toLowerCase() === wanted)
  if (!found) return null
  if (found.verificationStatus && found.verificationStatus !== 'approved') return null
  return found
}

// Give every store that has none a link of its own.
//
// Slugs were suggested at registration, which leaves every store that
// registered before this existed on /vendor-page/<id> until somebody opens
// the portal and taps the suggestion. Most never would — a merchant does not
// go looking in settings for a feature nobody told them about — so the
// stores that have been trading longest would be the ones without a usable
// link.
//
// Two things make this safe to run on shared state. It is deterministic:
// vendors are processed in id order, so two devices computing it from the
// same list reach the same answer rather than racing to different ones. And
// it never moves a slug that already exists — a link somebody has printed is
// never reassigned, whatever else changes around it.
export function backfillSlugs<T extends SlugOwner & { name?: string }>(vendors: T[]): (T & SlugOwner)[] {
  const index = slugIndex(vendors)
  const assigned = new Map<string, string>()

  // Id order, not list order: the order of the array depends on which device
  // merged what, and an assignment that depends on that is an assignment two
  // devices can disagree about.
  for (const vendor of [...vendors].sort((a, b) => a.id.localeCompare(b.id))) {
    if ((vendor.slug ?? '').trim()) continue
    const slug = suggestAvailableSlug(vendor.name ?? '', {
      takenBy: index,
      vendorId: vendor.id,
      fallback: vendor.id,
    })
    if (!slug) continue
    index.set(slug, vendor.id)
    assigned.set(vendor.id, slug)
  }

  if (assigned.size === 0) return vendors
  return vendors.map((v) => (assigned.has(v.id) ? { ...v, slug: assigned.get(v.id)! } : v))
}

// Whether a URL path could be a store address at all.
//
// Used by the signed-out branch of the router, which dispatches on the path
// rather than on a route table and so has to decide for itself. One segment
// only, well-formed, and never a reserved word — so /admin reaches the admin
// gate rather than a storefront, whatever any store has managed to save.
//
// Being wrong in the permissive direction is harmless (an unknown slug shows
// "we could not find that store"); being wrong in the other direction hides
// an app page, so the check is deliberately strict.
export function isVendorSlugPath(pathname: string): boolean {
  const trimmed = pathname.replace(/^\/+/, '').replace(/\/+$/, '')
  if (!trimmed || trimmed.includes('/')) return false
  return slugProblem(trimmed) === null
}

export function publicVendorUrl(origin: string, slug: string | null | undefined, fallbackId?: string): string {
  const base = origin.replace(/\/+$/, '')
  if (slug && slug.trim()) return `${base}/${slug.trim()}`
  return `${base}/vendor-page/${fallbackId ?? ''}`
}
