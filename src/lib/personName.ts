// How a person's name is shortened for a map marker or a strip of text.
//
// Taking the first word is right for "Celeste Macalinao" and wrong for nearly
// every driver in this app: they are Kuya Marlon, Mang Elmer, Mang Ising, and
// the first word is a title, not a person. A callout reading "Kuya & Celeste"
// names one of the two people in the tricycle. Caught on a real render,
// 2026-10-01, which is the only place it shows.
//
// Filipino honorifics are not a prefix to strip, either: "Kuya Marlon" is what
// a passenger calls him and what the driver would answer to, so the title
// comes along with the name rather than being removed from it.
const HONORIFICS = new Set([
  'kuya',
  'ate',
  'mang',
  'manong',
  'manang',
  'tito',
  'tita',
  'lolo',
  'lola',
  'sir',
  'maam',
  "ma'am",
  'madam',
  'dr',
  'dr.',
  'engr',
  'engr.',
  'atty',
  'atty.',
])

// The shortest form of a name that still names somebody.
export function shortName(full: string | null | undefined, fallback = ''): string {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return fallback
  const first = parts[0].toLowerCase().replace(/[.,]$/, '')
  // A title on its own is not a name: keep what follows it as well. With
  // nothing following — somebody saved as just "Kuya" — the title is all
  // there is, and is better than an empty marker.
  if (HONORIFICS.has(first) && parts.length > 1) return `${parts[0]} ${parts[1]}`
  return parts[0]
}
