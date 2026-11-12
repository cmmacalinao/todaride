// Finding your own shop on the login screen by typing it.
//
// The merchant login used to be a tab row (Resto / Shop / Pharmacy) and a
// dropdown listing every registered business by name. Two problems with
// that, and the second is the one that matters: a merchant had to know
// which of three words the app had filed them under before they could look
// for themselves, and anybody who opened the page got the full roster of
// every store in the pilot, for free, without logging in.
//
// So: type and we match. Nothing is listed until at least MIN_QUERY letters
// are typed, which keeps the roster out of a casual visitor's hands while
// still letting an owner who knows their own name find it in three
// characters.

export const MIN_QUERY = 2
export const MAX_SUGGESTIONS = 8

export interface SearchableMerchant {
  id: string
  name: string
  contactPhone?: string | null
  city?: string | null
  barangay?: string | null
}

// Letters and digits only, lowercased. "Aling Nena's Carinderia" and
// "aling nenas carinderia" are the same thing to somebody typing in a hurry,
// and so is a phone number with or without its dashes.
export function normalise(text: string | null | undefined): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

// The typed characters appear in order in the target, and close together:
// the number of characters the match spans, or null if there is no match at
// all. Smaller is tighter, and a perfect substring spans exactly its own
// length.
//
// The span is the whole point. A plain in-order test calls "nena" a match
// for "Tita Marites Kaka(n)in M(e)ri(e)(n)d(a)" — four letters scattered
// over half a name, which is how a typo-forgiving search turns into a
// search that matches everything. Callers reject a span that is too loose.
export function subsequenceSpan(needle: string, haystack: string): number | null {
  if (!needle) return 0
  let best: number | null = null
  for (let start = 0; start < haystack.length; start += 1) {
    if (haystack[start] !== needle[0]) continue
    let i = 0
    for (let j = start; j < haystack.length; j += 1) {
      if (haystack[j] === needle[i]) i += 1
      if (i === needle.length) {
        const span = j - start + 1
        if (best === null || span < best) best = span
        break
      }
    }
    // Nothing starting later can beat a perfect run.
    if (best === needle.length) break
  }
  return best
}

// How far a near-match is allowed to wander before it stops being one. Two
// characters of slack per typed character: enough for a dropped letter or a
// missing space, not enough for four letters spread over a whole name.
export function isNearMatch(needle: string, haystack: string): boolean {
  const span = subsequenceSpan(needle, haystack)
  return span !== null && span <= needle.length * 2
}

// Lower is better. null means no match at all.
export function matchScore(merchant: SearchableMerchant, query: string): number | null {
  const q = normalise(query)
  if (q.length < MIN_QUERY) return null

  const name = normalise(merchant.name)
  if (name.startsWith(q)) return 0
  // A word inside the name: "nena" should find "Aling Nena's", which a
  // plain startsWith would miss and which matters because half the stores
  // here begin with Aling, Mang, Kuya or Manang.
  if (name.includes(q)) return 1

  // The phone number, for an owner who cannot remember how their shop was
  // spelled at signup but knows the number they gave. Digits only, and only
  // when the query is digits — nobody means a phone number by "ihaw".
  const phone = normalise(merchant.contactPhone)
  if (/^\d+$/.test(q) && phone.includes(q)) return 2

  // A near-match is the last resort: a dropped letter, a missing space.
  if (isNearMatch(q, name)) return 3
  return null
}

// The suggestions to show under the box, best first and capped. Ties break
// alphabetically so the order is stable between keystrokes — a list that
// reshuffles under a thumb is how the wrong shop gets tapped.
export function searchMerchants<T extends SearchableMerchant>(
  merchants: T[],
  query: string,
  limit = MAX_SUGGESTIONS,
): T[] {
  const scored: { merchant: T; score: number }[] = []
  for (const merchant of merchants) {
    const score = matchScore(merchant, query)
    if (score !== null) scored.push({ merchant, score })
  }
  scored.sort((a, b) => a.score - b.score || a.merchant.name.localeCompare(b.merchant.name))
  return scored.slice(0, limit).map((s) => s.merchant)
}

// What to show under a name so two stores called "Aling Nena's" can be told
// apart. Empty when there is nothing to add.
export function merchantHint(merchant: SearchableMerchant): string {
  return [merchant.barangay, merchant.city].filter((part) => !!part && String(part).trim()).join(', ')
}
