// Brings a notification to the middle of the screen the instant it appears.
//
// Deliberately not a smooth scroll: an alert that glides into place over half
// a second is one the reader can scroll past before it lands, and on the
// driver's side that half second is spent looking at the wrong part of the
// screen. Callers wrap this in a requestAnimationFrame so the browser has
// laid the new card out before we ask the platform where it is.
export function showInMiddle(el: HTMLElement | null): void {
  if (!el) return
  el.scrollIntoView({ block: 'center', behavior: 'auto' })
}

// Same, but re-asserted once after the surrounding view has settled.
//
// When a whole screen replaces the one before it — the booking form giving
// way to the live trip — the new content is still growing when the first
// call runs, and the browser clamps the scroll position underneath it. A
// single centring lands correctly and is then undone. The second pass is
// what makes it stick. Returns a cleanup for the caller's effect.
export function showInMiddleWhenSettled(el: HTMLElement | null, delayMs = 250): () => void {
  if (!el) return () => {}
  const raf = requestAnimationFrame(() => showInMiddle(el))
  const timer = setTimeout(() => showInMiddle(el), delayMs)
  return () => {
    cancelAnimationFrame(raf)
    clearTimeout(timer)
  }
}

// Puts a freshly-opened view back at its own top.
//
// Not scrollIntoView on a sentinel: that aligns to the scrollport edge, which
// a sticky header is already sitting on, so the result is a few pixels of
// movement and a heading still off-screen. This walks up to whatever is
// actually scrolling — the window in the real app, a pane div inside the
// split-screen simulator — and sends it home.
export function scrollViewToTop(el: HTMLElement | null): void {
  let node: HTMLElement | null = el?.parentElement ?? null
  while (node) {
    const style = getComputedStyle(node)
    if (node.scrollHeight > node.clientHeight + 4 && ['auto', 'scroll'].includes(style.overflowY)) {
      node.scrollTop = 0
      return
    }
    node = node.parentElement
  }
  el?.ownerDocument?.defaultView?.scrollTo({ top: 0 })
}

// The same, held for a moment. A page that mounts a Leaflet map grows after
// its first paint — tiles load, the map claims its height — and the browser
// pushes the scroll position down to compensate, undoing a single scroll-to-
// top. So repeat it until the layout stops moving.
export function scrollViewToTopWhenSettled(el: HTMLElement | null, forMs = 900): () => void {
  if (!el) return () => {}
  const id = setInterval(() => scrollViewToTop(el), 100)
  const stop = setTimeout(() => clearInterval(id), forMs)
  scrollViewToTop(el)
  return () => {
    clearInterval(id)
    clearTimeout(stop)
  }
}
// NOTE: keepInView used to live here — a 3-second timer that scrolled a
// moving map back to the middle of the screen whenever it drifted out of
// view. It was removed along with the maps' automatic re-zoom: between them
// they meant the page could not be left alone. It also made the driver's
// cancellation note impossible to fill in, since opening the keyboard pushed
// the map off screen and the timer hauled the page back three seconds later,
// taking the text field with it.
