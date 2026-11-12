// The handful of looks a shop's name can take.
//
// A short, curated list on purpose. A free-text font box produces a page
// nobody can read and a colour picker produces white-on-white — and neither
// mistake is one a merchant can see coming from the panel. These are the
// combinations that stay legible over a photo banner, and the worst a
// vendor can do with them is pick one that is not to your taste.
//
// Every stack is made of fonts already on the device. Nothing is fetched:
// the page a merchant hands out on a tarpaulin has to render on a cheap
// phone on mobile data, and a webfont is a round trip before the shop's own
// name appears.

export interface TitleFont {
  id: string
  label: string
  stack: string
}

export const TITLE_FONTS: TitleFont[] = [
  { id: 'classic', label: 'Classic', stack: '' },
  { id: 'serif', label: 'Serif', stack: 'Georgia, "Times New Roman", serif' },
  { id: 'rounded', label: 'Rounded', stack: 'ui-rounded, "Segoe UI Rounded", "Trebuchet MS", system-ui, sans-serif' },
  { id: 'condensed', label: 'Condensed', stack: '"Arial Narrow", "Helvetica Neue", Arial, sans-serif' },
  { id: 'typewriter', label: 'Typewriter', stack: 'ui-monospace, "Courier New", monospace' },
]

export interface TitleColor {
  id: string
  label: string
  value: string
}

// Light, bright and dark — the dark half added 2026-11-12 on the vendor's
// own asking. The old list was light tints only, on the reasoning that dark
// text on a dark photo is the one thing a shadow cannot rescue. True of a
// DARK shadow, which is all the storefront used to draw. A white halo
// rescues it, so the shadow now follows the colour instead of the colour
// being limited by the shadow (see titleTextShadow).
//
// Still a curated list rather than a colour wheel: a free picker produces
// white-on-white, and that is a mistake a merchant cannot see coming from
// this panel.
export const TITLE_COLORS: TitleColor[] = [
  // Light — over a dark photo, with a dark shadow behind them.
  { id: 'white', label: 'White', value: '#ffffff' },
  { id: 'cream', label: 'Cream', value: '#fef3c7' },
  { id: 'gold', label: 'Gold', value: '#fcd34d' },
  { id: 'mint', label: 'Mint', value: '#d1fae5' },
  { id: 'sky', label: 'Sky', value: '#dbeafe' },
  { id: 'rose', label: 'Rose', value: '#ffe4e6' },
  // Bright — a shop that wants its name to shout.
  { id: 'orange', label: 'Orange', value: '#f97316' },
  { id: 'red', label: 'Red', value: '#dc2626' },
  { id: 'emerald', label: 'Emerald', value: '#059669' },
  { id: 'blue', label: 'Blue', value: '#2563eb' },
  { id: 'violet', label: 'Violet', value: '#7c3aed' },
  // Dark — for a pale banner, or none at all, and carried by a white halo.
  { id: 'black', label: 'Black', value: '#111111' },
  { id: 'charcoal', label: 'Charcoal', value: '#374151' },
  { id: 'navy', label: 'Navy', value: '#1e3a8a' },
  { id: 'maroon', label: 'Maroon', value: '#7f1d1d' },
  { id: 'forest', label: 'Forest', value: '#14532d' },
]

export function titleFontStack(id: string | null | undefined): string | undefined {
  const found = TITLE_FONTS.find((f) => f.id === id)
  return found && found.stack ? found.stack : undefined
}

export function titleColorValue(id: string | null | undefined): string | undefined {
  return TITLE_COLORS.find((c) => c.id === id)?.value
}

// How bright a colour is to the eye, 0 (black) to 1 (white). Green weighs
// most and blue least, which is why #ffff00 reads as light and #0000ff does
// not. sRGB coefficients, no gamma correction — the decision here is one
// bit, and the borderline cases are not on the list.
export function relativeLuminance(hex: string): number {
  const clean = String(hex).replace('#', '').trim()
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const n = Number.parseInt(full, 16)
  if (!Number.isFinite(n) || full.length !== 6) return 1
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

export function isDarkTitleColor(id: string | null | undefined): boolean {
  const value = titleColorValue(id)
  return value ? relativeLuminance(value) < 0.5 : false
}

// The shadow a colour needs to survive whatever photo is behind it, which
// is the opposite of the colour itself: dark text gets a white halo, light
// text gets the dark drop-shadow it always had.
//
// The halo is two shadows rather than one — a tight one for the edge and a
// wider, softer one — because a single 1px shadow disappears against a busy
// photo at the exact size a shop's name is drawn.
export const LIGHT_TITLE_SHADOW = '0 1px 2px rgba(0,0,0,0.55)'
export const DARK_TITLE_SHADOW =
  '0 1px 2px rgba(255,255,255,0.9), 0 0 6px rgba(255,255,255,0.75), 0 0 12px rgba(255,255,255,0.5)'

export function titleTextShadow(id: string | null | undefined): string {
  return isDarkTitleColor(id) ? DARK_TITLE_SHADOW : LIGHT_TITLE_SHADOW
}
