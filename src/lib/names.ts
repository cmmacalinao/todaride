// Names as they read on a moving map.
//
// A callout sits over the tricycle and has to be legible at a glance from a
// phone in a handlebar bracket, so it carries the name and nothing else: the
// "(Student)" and "(Senior)" tags that matter on a fare breakdown are noise
// here, and two full names with tags is wider than the map.
export function shortName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*/g, ' ').trim()
}

// Just what someone is called. Drops the fare tag and the surname initial
// that follows a first name — "Miguel D. (Student)" is a row in a ledger,
// "Miguel" is the person in the sidecar. A trailing initial is the only
// thing removed: a compound given name like "Lola Nena" survives intact,
// which a blunt last-token rule would wreck.
export function firstName(name: string): string {
  const clean = shortName(name)
  const trimmed = clean.replace(/\s+[A-Za-z]\.?$/, '').trim()
  return trimmed || clean
}

// Everyone aboard, short enough to fit. Past two names it stops listing and
// counts instead — by then the number is the useful part, not the roll call.
export function aboardLabel(names: string[]): string {
  const short = names.map(firstName).filter(Boolean)
  if (short.length === 0) return ''
  if (short.length <= 2) return short.join(', ')
  return `${short[0]} +${short.length - 1}`
}
