import { describe, expect, it } from 'vitest'
import {
  DARK_TITLE_SHADOW,
  LIGHT_TITLE_SHADOW,
  TITLE_COLORS,
  TITLE_FONTS,
  isDarkTitleColor,
  relativeLuminance,
  titleColorValue,
  titleFontStack,
  titleTextShadow,
} from '../vendorTitleStyle'

describe('the colours on offer', () => {
  it('gives every one a distinct id and a real hex value', () => {
    const ids = TITLE_COLORS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const c of TITLE_COLORS) {
      expect(c.value, c.label).toMatch(/^#[0-9a-f]{6}$/i)
      expect(c.label.trim(), c.id).not.toBe('')
    }
  })

  it('offers black, which the vendor asked for', () => {
    expect(TITLE_COLORS.some((c) => c.id === 'black')).toBe(true)
    expect(isDarkTitleColor('black')).toBe(true)
  })

  it('keeps white as the first and default choice', () => {
    expect(TITLE_COLORS[0].id).toBe('white')
    // Nothing chosen is white text, the same as it has always been.
    expect(titleColorValue(null)).toBeUndefined()
    expect(titleTextShadow(null)).toBe(LIGHT_TITLE_SHADOW)
  })

  it('has both light and dark on the list, or the shadow logic is pointless', () => {
    const dark = TITLE_COLORS.filter((c) => isDarkTitleColor(c.id))
    expect(dark.length).toBeGreaterThan(0)
    expect(dark.length).toBeLessThan(TITLE_COLORS.length)
  })
})

describe('how bright a colour is', () => {
  it('puts black at the bottom and white at the top', () => {
    expect(relativeLuminance('#000000')).toBe(0)
    // Not exactly 1: the three coefficients sum to 1 in decimal but not in
    // binary floating point. Nothing here cares past the second decimal.
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 10)
  })

  it('weighs green over blue, the way an eye does', () => {
    // Pure blue is dark to look at; pure green is not. A plain average of
    // the channels would call them the same.
    expect(relativeLuminance('#00ff00')).toBeGreaterThan(relativeLuminance('#0000ff'))
    expect(relativeLuminance('#0000ff')).toBeLessThan(0.5)
    expect(relativeLuminance('#00ff00')).toBeGreaterThan(0.5)
  })

  it('reads a three-digit hex the same as its six-digit twin', () => {
    expect(relativeLuminance('#fff')).toBe(relativeLuminance('#ffffff'))
  })

  it('treats nonsense as light, so a bad value never hides the name', () => {
    // Light means the dark shadow — the behaviour every name had before any
    // of this existed. Failing the other way would put a white glow under
    // white text.
    expect(relativeLuminance('not-a-colour')).toBe(1)
  })
})

describe('the shadow follows the colour', () => {
  it('puts a white glow under a dark name', () => {
    expect(titleTextShadow('black')).toBe(DARK_TITLE_SHADOW)
    expect(titleTextShadow('navy')).toBe(DARK_TITLE_SHADOW)
    expect(DARK_TITLE_SHADOW).toContain('255,255,255')
  })

  it('leaves the dark shadow under a light one', () => {
    expect(titleTextShadow('white')).toBe(LIGHT_TITLE_SHADOW)
    expect(titleTextShadow('cream')).toBe(LIGHT_TITLE_SHADOW)
    expect(LIGHT_TITLE_SHADOW).toContain('0,0,0')
  })

  it('falls back to the dark shadow for a colour that is not on the list', () => {
    expect(isDarkTitleColor('mauve-from-an-old-save')).toBe(false)
    expect(titleTextShadow('mauve-from-an-old-save')).toBe(LIGHT_TITLE_SHADOW)
  })
})

describe('the fonts', () => {
  it('keeps Classic as the app default, with no stack of its own', () => {
    expect(TITLE_FONTS[0].id).toBe('classic')
    expect(titleFontStack('classic')).toBeUndefined()
    expect(titleFontStack(null)).toBeUndefined()
  })

  it('fetches nothing — every stack is fonts already on the device', () => {
    for (const f of TITLE_FONTS) {
      expect(f.stack, f.label).not.toMatch(/https?:|url\(/)
    }
  })
})
