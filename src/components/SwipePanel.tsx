import { useRef, type ReactNode } from 'react'

// A panel resting on the bottom of a map, in three heights:
//   0 — only its first line (the header) shows,
//   1 — half: enough for the form, with the map's centre still in view,
//   2 — tall: nearly the whole map, for a long form.
// Swipe up to go up a step, swipe down to go down one; tapping the header
// flips between the first line and half.
//
// For a form that belongs with the map rather than above it — Group Ride's
// riders and their stops. Open, it is the form; down, it gets out of the way
// of the centre pin, which is how each of those stops is chosen.
const SWIPE_THRESHOLD_PX = 24

export type SwipeLevel = 0 | 1 | 2

export function SwipePanel({
  title,
  level,
  onLevelChange,
  halfHeightClass = 'max-h-[40vh]',
  fullHeightClass = 'max-h-[70vh]',
  children,
}: {
  // The header line, shown at every height — a summary worth reading at a
  // glance ("3 riders · 2 of 3 stops set").
  title: ReactNode
  level: SwipeLevel
  onLevelChange: (level: SwipeLevel) => void
  // How tall the contents may grow at half and at full before they scroll.
  halfHeightClass?: string
  fullHeightClass?: string
  children: ReactNode
}) {
  const startY = useRef<number | null>(null)
  // A swipe ends in a click too; this stops that click undoing the swipe.
  const swiped = useRef(false)

  return (
    <div className="pointer-events-auto overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-[0_-4px_16px_rgba(0,0,0,0.15)]">
      <button
        type="button"
        aria-expanded={level > 0}
        onClick={() => {
          if (swiped.current) {
            swiped.current = false
            return
          }
          onLevelChange(level === 0 ? 1 : 0)
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
          const next = dy < 0 ? Math.min(2, level + 1) : Math.max(0, level - 1)
          onLevelChange(next as SwipeLevel)
        }}
        className="block w-full touch-none select-none px-3 pb-1.5 pt-1.5 text-left"
      >
        <span aria-hidden className="mx-auto mb-1.5 block h-1 w-10 rounded-full bg-slate-300" />
        <span className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-sm font-bold text-slate-800">{title}</span>
          <span aria-hidden className="shrink-0 text-xs text-slate-400">
            {level === 2 ? '▼' : '▲'}
          </span>
        </span>
      </button>
      {level > 0 && (
        <div className={`overflow-y-auto overscroll-contain px-2 pb-2 ${level === 2 ? fullHeightClass : halfHeightClass}`}>
          {children}
        </div>
      )}
    </div>
  )
}
