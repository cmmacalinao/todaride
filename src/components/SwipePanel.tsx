import { useRef, type ReactNode } from 'react'

// A panel resting on the bottom of a map: a one-line header when closed,
// its full contents when pulled up. Swipe up (or tap the header) to open,
// swipe down (or tap it again) to close.
//
// For a form that belongs with the map rather than above it — Group Ride's
// riders and their stops. Open, it is the form; closed, it gets out of the
// way of the centre pin, which is how each of those stops is chosen.
const SWIPE_THRESHOLD_PX = 24

export function SwipePanel({
  title,
  open,
  onOpenChange,
  maxHeightClass = 'max-h-[60vh]',
  children,
}: {
  // The header line, shown open or closed — a summary worth reading at a
  // glance ("3 riders · 2 of 3 stops set").
  title: ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  // How tall the open panel may grow before its contents scroll.
  maxHeightClass?: string
  children: ReactNode
}) {
  const startY = useRef<number | null>(null)
  // A swipe ends in a click too; this stops that click undoing the swipe.
  const swiped = useRef(false)

  return (
    <div className="pointer-events-auto overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-[0_-4px_16px_rgba(0,0,0,0.15)]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          if (swiped.current) {
            swiped.current = false
            return
          }
          onOpenChange(!open)
        }}
        onPointerDown={(e) => {
          startY.current = e.clientY
          // Keep hearing this finger after it slides off the header — a swipe
          // ends well away from where it started, and the lift is what counts.
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerUp={(e) => {
          if (startY.current == null) return
          const dy = e.clientY - startY.current
          startY.current = null
          if (Math.abs(dy) < SWIPE_THRESHOLD_PX) return
          swiped.current = true
          onOpenChange(dy < 0)
        }}
        className="block w-full touch-none select-none px-3 pb-1.5 pt-1.5 text-left"
      >
        <span aria-hidden className="mx-auto mb-1.5 block h-1 w-10 rounded-full bg-slate-300" />
        <span className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-sm font-bold text-slate-800">{title}</span>
          <span aria-hidden className="shrink-0 text-xs text-slate-400">
            {open ? '▼' : '▲'}
          </span>
        </span>
      </button>
      {open && <div className={`overflow-y-auto overscroll-contain px-2 pb-2 ${maxHeightClass}`}>{children}</div>}
    </div>
  )
}
