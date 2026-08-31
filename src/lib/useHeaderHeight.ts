import { useEffect, useState, type RefObject } from 'react'

// Measures a fixed header and publishes its height, so the page below can be
// pushed clear of it by the real number rather than a guessed one.
//
// Every header in this app is position:fixed and opaque, so whatever sits
// under it has to be padded out of the way. That padding used to be written
// down as a constant — pt-[50px], pt-[70px] — which is right only at the font
// size it was measured at. Turn up the text size, on an Android set to Large,
// an iPhone on Dynamic Type, or a browser with a minimum font size, and the
// header grows while the padding does not: the top of the page slides behind
// an opaque blue bar. At the largest settings that swallows the logo and the
// first field, and the screen reads as broken rather than as scrolled.
//
// A ResizeObserver keeps the number honest through font changes, rotation and
// anything else that reflows the bar. The value is published as a CSS custom
// property so plain className styling can use it, and returned as well for
// the spacer NavBar renders.
export function useHeaderHeight(ref: RefObject<HTMLElement | null>, deps: unknown[] = []): number {
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const h = Math.round(el.getBoundingClientRect().height)
      // Ignore sub-pixel jitter, which would otherwise re-render on every
      // scroll on browsers that round differently mid-gesture.
      setHeight((prev) => (Math.abs(prev - h) > 1 ? h : prev))
      document.documentElement.style.setProperty('--app-header-h', `${h}px`)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, ...deps])

  return height
}
