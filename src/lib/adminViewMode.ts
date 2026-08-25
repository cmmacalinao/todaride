import { useSyncExternalStore } from 'react'

export type AdminViewMode = 'mobile' | 'desktop'

const STORAGE_KEY = 'toda-admin-view-mode'

// A per-device display preference, deliberately kept out of RideContext:
// it isn't app data (nothing about it belongs in a ride record or should
// travel to another account), it's just how this operator likes their own
// screen. Module-level rather than component state so every admin surface
// on the page — the page shell, the toggle, an embedded partner dashboard —
// reads and re-renders from one value instead of drifting apart.
let current: AdminViewMode = read()
const listeners = new Set<() => void>()

function read(): AdminViewMode {
  if (typeof window === 'undefined') return 'mobile'
  try {
    return localStorage.getItem(STORAGE_KEY) === 'desktop' ? 'desktop' : 'mobile'
  } catch {
    return 'mobile'
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setAdminViewMode(mode: AdminViewMode) {
  current = mode
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Private-mode/quota failures shouldn't break the layout — the choice
    // just won't survive a reload.
  }
  listeners.forEach((l) => l())
}

// Width the admin page shells apply. Everything inside is already fluid, so
// widening the container is all it takes — desktop mode gives long tables
// and side-by-side cards room instead of squeezing them into a phone column
// on a 27" monitor.
export const ADMIN_CONTAINER_CLASS: Record<AdminViewMode, string> = {
  mobile: 'max-w-lg',
  desktop: 'max-w-6xl',
}

export function useAdminViewMode(): { mode: AdminViewMode; containerClass: string } {
  const mode = useSyncExternalStore(
    subscribe,
    () => current,
    () => 'mobile' as AdminViewMode,
  )
  return { mode, containerClass: ADMIN_CONTAINER_CLASS[mode] }
}
