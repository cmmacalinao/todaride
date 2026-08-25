import { PH_ADDRESS_TREE } from '../mock/data'

// Reverse-geocoded labels come back as the full postal chain — "Central Luzon
// State University, Executive Avenue, Bagong Sikat, Bantug, Muñoz, Nueva
// Ecija, Central Luzon, 3120, Philippines". That is nine segments to say a
// place everyone here calls "CLSU", and in a trip history it is printed twice
// per row. These rules cut it down to what actually distinguishes one trip
// from another, without inventing anything the label did not already say.

// Segments that never vary across a tricycle ride and so carry no
// information: the country, the postcode, the region.
const NOISE = [/^philippines$/i, /^\d{4}$/, /^central luzon$/i, /^region\s+[ivx]+/i, /^metro manila$/i]

// Names people already say in short form. Keep this list to institutions
// locals genuinely abbreviate in speech — an abbreviation nobody uses is
// harder to read than the words it replaced.
const LANDMARKS: [RegExp, string][] = [
  [/central luzon state university/i, 'CLSU'],
  [/nueva ecija university of science and technology/i, 'NEUST'],
  [/philippine carabao center/i, 'PCC'],
  [/philippine rice research institute/i, 'PhilRice'],
]

const WORDS: [RegExp, string][] = [
  [/\bAvenue\b/gi, 'Ave'],
  [/\bStreet\b/gi, 'St'],
  [/\bRoad\b/gi, 'Rd'],
  [/\bHighway\b/gi, 'Hwy'],
  [/\bBoulevard\b/gi, 'Blvd'],
  [/\bBarangay\b/gi, 'Brgy.'],
  [/\bSubdivision\b/gi, 'Subd.'],
  [/\bExtension\b/gi, 'Ext.'],
  [/\bcorner\b/gi, 'cor.'],
  [/\bSaint\b/gi, 'St.'],
  [/\bSanto\b/gi, 'Sto.'],
  [/\bSanta\b/gi, 'Sta.'],
]

function segmentsOf(label: string): string[] {
  return label
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !NOISE.some((re) => re.test(s)))
}

function abbreviate(segment: string): string {
  for (const [re, short] of LANDMARKS) if (re.test(segment)) return short
  let out = segment
  for (const [re, short] of WORDS) out = out.replace(re, short)
  return out
}

// One address, trimmed of noise and abbreviated, keeping the `keep` most
// specific segments. `keep` is the only thing that changes between a chip
// (1), a history row (2), a booking card (3) and a receipt (Infinity).
export function shortenAddress(label: string, keep = 2): string {
  const parts = segmentsOf(label).map(abbreviate)
  if (parts.length === 0) return label
  return parts.slice(0, keep).join(', ')
}

// Both ends of one trip. Whatever the two addresses have in common — almost
// always the city, since most trips here start and end in the same one — is
// said once at the end instead of twice in the middle:
//
//   CLSU, Executive Ave → Bagong Sikat, Magtanggol · Muñoz
export function formatTripRoute(from: string, to: string, keep = 2): string {
  const a = segmentsOf(from).map(abbreviate)
  const b = segmentsOf(to).map(abbreviate)
  if (a.length === 0 || b.length === 0) return `${from} → ${to}`
  const shared: string[] = []
  // Never strip a side down to nothing: the last remaining segment is what
  // names the place, even when both ends share it.
  while (a.length > 1 && b.length > 1 && a[a.length - 1] === b[b.length - 1]) {
    shared.unshift(a[a.length - 1])
    a.pop()
    b.pop()
  }
  const left = a.slice(0, keep).join(', ')
  const right = b.slice(0, keep).join(', ')
  const tail = shared[0]
  return `${left} → ${right}${tail ? ` · ${tail}` : ''}`
}

// ---------------------------------------------------------------------
// Detail, barangay, city — the three parts of an address anyone here would
// actually say out loud. Everything else in a geocoded chain (the sitio, the
// province, the region, the postcode, the country) is either implied or
// never varies across a tricycle ride.
//
//   Central Luzon State University, Bantug-Villa Cuizon Road, Villa Isidra,
//   Bantug, Muñoz, Nueva Ecija, Central Luzon, 3119, Philippines
//                                → CLSU, Bantug, Muñoz
//
// Which segment is the barangay and which is the city is not guessed from
// position — the app already knows every province, city and barangay in its
// own address tree, so each segment is looked up rather than counted. A
// label that matches nothing (a custom pin, a shop name) falls back to the
// old "keep the most specific segments" behaviour instead of inventing
// parts it cannot identify.

// Nominatim says "Muñoz" where the tree says "Science City of Muñoz", and
// "San Jose" where it says "San Jose City". Both sides get stripped to the
// bare name before comparing — and the bare name is also what gets shown,
// since it is the shorter of the two and the one people say.
function bareCity(name: string): string {
  return name
    .replace(/^science city of\s+/i, '')
    .replace(/^city of\s+/i, '')
    .replace(/\s+city$/i, '')
    .trim()
}

function buildLookups() {
  const cities = new Map<string, string>()
  const barangays = new Set<string>()
  const provinces = new Set<string>()
  for (const [province, cityMap] of Object.entries(PH_ADDRESS_TREE)) {
    provinces.add(province.toLowerCase())
    for (const [city, brgys] of Object.entries(cityMap)) {
      cities.set(bareCity(city).toLowerCase(), bareCity(city))
      for (const b of brgys) barangays.add(b.replace(/^barangay\s+/i, '').toLowerCase())
    }
  }
  return { cities, barangays, provinces }
}

// Built once: the tree is a module constant, so re-walking it per address —
// and this runs on every row of a trip history — would be pure waste.
let lookups: ReturnType<typeof buildLookups> | null = null
function getLookups() {
  if (!lookups) lookups = buildLookups()
  return lookups
}

export interface AddressParts {
  detail: string | null
  barangay: string | null
  city: string | null
}

// Splits one label into the three parts. Exported for the callers that want
// to lay them out themselves (a form, a receipt) rather than take the
// single joined line.
export function addressParts(label: string): AddressParts {
  const { cities, barangays, provinces } = getLookups()
  const segments = segmentsOf(label)
  let city: string | null = null
  let barangay: string | null = null
  const rest: string[] = []
  for (const segment of segments) {
    const key = segment.toLowerCase()
    const cityKey = bareCity(segment).toLowerCase()
    if (!city && cities.has(cityKey)) {
      city = cities.get(cityKey)!
      continue
    }
    if (provinces.has(key)) continue
    if (!barangay && barangays.has(key.replace(/^barangay\s+/i, ''))) {
      barangay = segment.replace(/^barangay\s+/i, '')
      continue
    }
    rest.push(segment)
  }
  // The most specific unclassified segment is the detail — the venue,
  // building or street the pin actually sits on.
  return { detail: rest.length > 0 ? abbreviate(rest[0]) : null, barangay, city }
}

// The single line: "CLSU, Bantug, Muñoz". Falls back to shortenAddress when
// the label names neither a city nor a barangay this app knows — better a
// trimmed chain than a line with two thirds of it missing.
export function formatAddressLine(label: string): string {
  if (!label) return label
  const { detail, barangay, city } = addressParts(label)
  if (!city && !barangay) return shortenAddress(label, 3)
  const parts = [detail, barangay, city].filter(Boolean) as string[]
  // A detail that just repeats the barangay ("CLSU, CLSU, Muñoz") reads as a
  // mistake; say it once.
  const deduped = parts.filter((p, i) => parts.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === i)
  return deduped.join(', ')
}
