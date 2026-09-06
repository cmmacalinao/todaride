// "Come back here after signing in."
//
// A shared vendor link lands a visitor on a public storefront; the moment
// they register to order, the app's role redirect would drop them on the
// generic start screen with no memory of the store they came for. The path
// is parked here for the length of the tab and taken exactly once, by the
// redirect that runs after login (see App.tsx). Only rider-app paths are
// honoured, so nothing can steer a fresh account anywhere else.
const RETURN_TO_KEY = 'toda-return-to'

export function rememberReturnTo(path: string) {
  try {
    sessionStorage.setItem(RETURN_TO_KEY, path)
  } catch {
    // Private mode — they still get the app, just at its usual start.
  }
}

// Read-only, so it is safe to call while rendering (React may render twice
// and throw the first pass away — a read that also cleared would leave the
// second pass with nothing). Clearing is a separate step, done once the
// app has actually arrived there (see the effect in App.tsx).
export function peekReturnTo(): string | null {
  try {
    const path = sessionStorage.getItem(RETURN_TO_KEY)
    return path && path.startsWith('/book') ? path : null
  } catch {
    return null
  }
}

export function clearReturnTo() {
  try {
    sessionStorage.removeItem(RETURN_TO_KEY)
  } catch {
    // Nothing stored, or storage refused — either way there is nothing left.
  }
}
