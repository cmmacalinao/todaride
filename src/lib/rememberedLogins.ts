// Who has signed in on this phone before.
//
// The login box asks for a name, an email or a mobile number, and typing any
// of them in full on a handset is a chore — especially on a shared family
// phone, where the answer alternates between two or three people.
//
// What it deliberately does NOT do is search the account list. The merchant
// login can suggest shops as you type because a shop is a public business
// already listed in the app's catalogue. The people who sign in here are
// passengers, parents and drivers, and a box that completed their names
// would hand the pilot's roster of private individuals to anyone who opened
// the login screen — paired with a four-digit PIN, that turns guessing
// somebody's account into a much shorter job.
//
// So the only identifiers ever offered are the ones typed on this device,
// and they never leave it.

export const REMEMBERED_LOGINS_KEY = 'toda-remembered-logins'

// Three is a shared family phone. More than that and the list is a wall of
// chips over the field they are meant to help with.
export const REMEMBERED_LIMIT = 3

export interface RememberedLogin {
  identifier: string
  // When it was last used, so the one somebody signs in with most sits
  // first. ISO, like every other timestamp in this app.
  at: string
}

// Same identifier written two ways — "Juan Dela Cruz" and "juan dela cruz",
// "0917-200-2001" and "09172002001" — is one entry, not two.
function sameIdentifier(a: string, b: string): boolean {
  const bare = (text: string) => text.trim().toLowerCase().replace(/[\s-]/g, '')
  return bare(a) === bare(b)
}

// The list after somebody signs in: most recent first, no duplicates,
// capped. Pure, so the rule can be tested without a browser.
export function withRememberedLogin(
  list: RememberedLogin[],
  identifier: string,
  at: string,
  limit = REMEMBERED_LIMIT,
): RememberedLogin[] {
  const trimmed = identifier.trim()
  if (!trimmed) return list
  const rest = list.filter((entry) => !sameIdentifier(entry.identifier, trimmed))
  return [{ identifier: trimmed, at }, ...rest].slice(0, limit)
}

export function withoutRememberedLogin(list: RememberedLogin[], identifier: string): RememberedLogin[] {
  return list.filter((entry) => !sameIdentifier(entry.identifier, identifier))
}

// What to show under the box for what has been typed so far. Empty query
// shows everything remembered — this is a list of three, not a search
// result, and hiding it until somebody types would defeat the point.
export function matchingRememberedLogins(list: RememberedLogin[], query: string): RememberedLogin[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return list
  const matches = list.filter((entry) => entry.identifier.toLowerCase().includes(needle))
  // Nothing is offered once what is typed is already one of them: the
  // suggestion would be the thing they just finished typing.
  return matches.filter((entry) => !sameIdentifier(entry.identifier, query))
}

function safeStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

export function readRememberedLogins(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): RememberedLogin[] {
  try {
    const raw = storage?.getItem(REMEMBERED_LOGINS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Anything of the wrong shape is dropped rather than throwing: a corrupt
    // convenience must never be able to stop somebody logging in.
    return parsed
      .filter((entry): entry is RememberedLogin => !!entry && typeof (entry as RememberedLogin).identifier === 'string')
      .slice(0, REMEMBERED_LIMIT)
  } catch {
    return []
  }
}

function write(list: RememberedLogin[], storage: Pick<Storage, 'setItem'> | undefined = safeStorage()): void {
  try {
    storage?.setItem(REMEMBERED_LOGINS_KEY, JSON.stringify(list))
  } catch {
    // Private browsing, or storage full. The box simply offers nothing.
  }
}

export function rememberLogin(identifier: string, now: Date = new Date()): void {
  write(withRememberedLogin(readRememberedLogins(), identifier, now.toISOString()))
}

export function forgetLogin(identifier: string): void {
  write(withoutRememberedLogin(readRememberedLogins(), identifier))
}
