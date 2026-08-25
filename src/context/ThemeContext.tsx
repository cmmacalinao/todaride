import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type ThemeId = 'teal-gold' | 'blue-royal' | 'facebook-blue'

export interface ThemeOption {
  id: ThemeId
  label: string
  tagline: string
  // Hex, for the picker UI's swatch dots only — not read by the app's own
  // styling, which goes through the CSS variables in theme.css instead.
  swatches: string[]
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'facebook-blue',
    label: '1. Facebook Blue',
    tagline: 'Familiar · Trusted · Social',
    swatches: ['#1877f2', '#4a90e2', '#93c5fd', '#94a3b8'],
  },
  {
    id: 'blue-royal',
    label: 'Blue (Royal)',
    tagline: 'Clean · Trustworthy · Professional',
    swatches: ['#1e3a8a', '#0f766e', '#dc2626', '#cbd5e1'],
  },
  {
    id: 'teal-gold',
    label: 'Teal & Gold (Original)',
    tagline: 'Safety · Warmth · Familiar',
    swatches: ['#0b7d78', '#ffc300', '#075854', '#f4f6f8'],
  },
]

// Bumped from 'toda-theme' when Royal Blue became the default. The old key
// is not read: the provider used to save the theme on every mount, so every
// existing install has 'facebook-blue' written to it whether or not anyone
// ever chose it — and a stored value wins over the default. Ignoring that key
// is what lets the new default actually reach the phones already out there.
// Only a deliberate pick is stored now (see setTheme), so this key never
// needs bumping again.
const STORAGE_KEY = 'toda-theme-v2'
// Royal Blue is the saved/current theme — see theme.css, whose bare
// :root carries these same values so first paint matches before this ever
// runs.
const DEFAULT_THEME: ThemeId = 'blue-royal'

function isThemeId(value: string | null): value is ThemeId {
  return value === 'teal-gold' || value === 'blue-royal' || value === 'facebook-blue'
}

function readStoredTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return isThemeId(raw) ? raw : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

interface ThemeContextValue {
  theme: ThemeId
  setTheme: (theme: ThemeId) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(readStoredTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // Storage is written here rather than in the effect above so that what it
  // holds means "somebody chose this", not "this is what the app happened to
  // start as". The difference only shows itself when the default changes:
  // saving on mount would silently pin every existing install to the old
  // default forever.
  function setTheme(next: ThemeId) {
    setThemeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Best-effort persistence — the theme still applies for this tab.
    }
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
