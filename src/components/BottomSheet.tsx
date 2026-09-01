import { useEffect, useRef, useState, type ReactNode } from 'react'

// A panel that sits over the map and is dragged up and down by its handle.
//
// The booking screen used to be a column: a strip of map with the form
// stacked under it, so the map — the thing that answers "where am I and where
// is that" — got the smallest share of the phone and the form got the rest,
// whether or not anybody was filling it in. This inverts it. The map takes
// the screen, and the form rides over it at whatever height the person wants
// right now: pushed down to look at the map, pulled up to type.
//
// Positioned against its parent rather than the window, so the page below the
// map is still reachable by scrolling past it. The parent must be `relative`.
export type SheetSnap = 'peek' | 'half' | 'full'

// As a fraction of the map area's height. Peek shows the handle and the first
// row; full stops short of the top so the map is never entirely hidden and
// the sheet still reads as a sheet rather than a page.
const SNAP_FRACTION: Record<SheetSnap, number> = {
  peek: 0.26,
  half: 0.58,
  full: 0.92,
}

const ORDER: SheetSnap[] = ['peek', 'half', 'full']

// Below this, a drag is a tap — and a tap on the handle steps the sheet open,
// so it works for anyone who does not think to drag it.
const DRAG_SLOP_PX = 8

export function BottomSheet({
  children,
  snap,
  onSnapChange,
  label = 'Booking panel',
}: {
  children: ReactNode
  snap: SheetSnap
  onSnapChange: (snap: SheetSnap) => void
  label?: string
}) {
  const outerRef = useRef<HTMLDivElement | null>(null)
  const handleRef = useRef<HTMLDivElement | null>(null)
  // Height while a finger is down. Null the rest of the time, when the snap
  // point owns the height and CSS animates between them.
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const dragHeightRef = useRef<number | null>(null)
  dragHeightRef.current = dragHeight
  const dragRef = useRef<{ startY: number; startHeight: number; moved: boolean } | null>(null)
  const snapRef = useRef(snap)
  snapRef.current = snap

  // The map area this sheet is laid over.
  const areaHeight = () => outerRef.current?.parentElement?.clientHeight ?? 480
  const heightFor = (s: SheetSnap) => Math.round(areaHeight() * SNAP_FRACTION[s])
  const nearestSnap = (height: number): SheetSnap =>
    ORDER.reduce((best, s) =>
      Math.abs(heightFor(s) - height) < Math.abs(heightFor(best) - height) ? s : best,
    )

  useEffect(() => {
    const el = handleRef.current
    if (!el) return

    const onDown = (e: PointerEvent) => {
      const sheet = el.parentElement
      if (!sheet) return
      dragRef.current = { startY: e.clientY, startHeight: sheet.getBoundingClientRect().height, moved: false }
      // Keeps receiving moves when the finger slides off the handle, which on
      // a handle this size is most drags.
      el.setPointerCapture?.(e.pointerId)
    }

    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      // Up is negative on screen and taller for the sheet.
      const delta = drag.startY - e.clientY
      if (Math.abs(delta) > DRAG_SLOP_PX) drag.moved = true
      const min = heightFor('peek') * 0.5
      const max = heightFor('full')
      setDragHeight(Math.max(min, Math.min(max, drag.startHeight + delta)))
    }

    const onUp = (e: PointerEvent) => {
      const drag = dragRef.current
      dragRef.current = null
      el.releasePointerCapture?.(e.pointerId)
      const height = dragHeightRef.current
      setDragHeight(null)
      if (!drag) return
      if (!drag.moved) {
        const i = ORDER.indexOf(snapRef.current)
        onSnapChange(ORDER[(i + 1) % ORDER.length])
        return
      }
      if (height != null) onSnapChange(nearestSnap(height))
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={outerRef} className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center">
      <section
        aria-label={label}
        className="pointer-events-auto flex w-full flex-col overflow-hidden rounded-t-2xl border-t border-slate-200 bg-white shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.45)]"
        style={{
          // A snap is a ceiling, not a fixed size, at rest. Peek, half and
          // full used to set the sheet's exact height, so a sheet holding
          // three short rows was stretched to the same height as one holding
          // ten — leaving a blank gap between the last row and whatever sat
          // below the sheet, most often the Book button. maxHeight lets the
          // section shrink to its own content and only grows to the snap's
          // full height once the content actually needs it; the inner
          // overflow-y-auto div still catches anything taller than that.
          //
          // While a finger is down this reverts to an explicit height, which
          // a drag needs to track the finger in real time rather than the
          // content's own size.
          ...(dragHeight != null ? { height: dragHeight } : { maxHeight: heightFor(snap) }),
          // No transition while a finger is down, or the sheet lags behind it.
          transition: dragHeight == null ? 'max-height .22s ease-out' : undefined,
        }}
      >
        {/* The grab handle. The bar is 4px; the target around it is 28, which
            is what a thumb on a moving tricycle actually needs. */}
        <div
          ref={handleRef}
          role="button"
          tabIndex={0}
          aria-label={`${label} — drag to resize`}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') onSnapChange(ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(snap) + 1)])
            if (e.key === 'ArrowDown') onSnapChange(ORDER[Math.max(0, ORDER.indexOf(snap) - 1)])
          }}
          className="flex shrink-0 cursor-grab touch-none items-center justify-center py-2.5 active:cursor-grabbing"
        >
          <span className="h-1 w-10 rounded-full bg-slate-300" />
        </div>
        {/* Only this scrolls, so a drag on the handle is always a resize and
            never a scroll of what is underneath it. */}
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain px-3 pb-4">{children}</div>
      </section>
    </div>
  )
}
