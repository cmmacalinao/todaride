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

// Light tints only, with the storefront's own drop-shadow behind them. Dark
// text on a dark photo is the one combination that cannot be rescued by a
// shadow, so it is not on offer.
export const TITLE_COLORS: TitleColor[] = [
  { id: 'white', label: 'White', value: '#ffffff' },
  { id: 'cream', label: 'Cream', value: '#fef3c7' },
  { id: 'gold', label: 'Gold', value: '#fcd34d' },
  { id: 'mint', label: 'Mint', value: '#d1fae5' },
  { id: 'sky', label: 'Sky', value: '#dbeafe' },
  { id: 'rose', label: 'Rose', value: '#ffe4e6' },
]

export function titleFontStack(id: string | null | undefined): string | undefined {
  const found = TITLE_FONTS.find((f) => f.id === id)
  return found && found.stack ? found.stack : undefined
}

export function titleColorValue(id: string | null | undefined): string | undefined {
  return TITLE_COLORS.find((c) => c.id === id)?.value
}
