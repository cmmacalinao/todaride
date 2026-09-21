import { useEffect, useState, type ReactNode } from 'react'
import { TricycleIcon } from './TricycleIcon'

// Shown the moment a ride is booked, until a driver takes it.
//
// Waiting was a line of grey text ("Looking for a nearby driver…") and a list
// of names that had passed — accurate, and easy to read as nothing
// happening. This is the same wait made visible: a driver's face with rings
// going out from it (the request reaching drivers), a tricycle coming down a
// road, and a clock, so a passenger watching the screen can see the app is
// still working on it rather than wondering whether the tap went through.
//
// No driver photo exists in the app yet, so the face is a driver figure, not
// a particular person — until someone accepts there is no particular person
// to show.
export function WaitingForDriverStrip({
  requestedAt,
  offeredTo,
  children,
}: {
  requestedAt: string
  // Whose phone it is ringing on right now, when the terminal queue says.
  offeredTo?: string | null
  // Drawn along the bottom of the strip — the tip offer, on the ride screen.
  children?: ReactNode
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const elapsed = Math.max(0, Math.floor((now - new Date(requestedAt).getTime()) / 1000))
  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`

  return (
    <div
      role="status"
      aria-live="polite"
      className="overflow-hidden rounded-xl border border-green-500/40 bg-green-500/10 px-2.5 py-2"
    >
      <div className="flex items-center gap-2">
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center">
          <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-green-500/30" />
          <span
            aria-hidden
            className="absolute inset-0 animate-ping rounded-full bg-green-500/20 [animation-delay:600ms]"
          />
          {/* A person with a small tricycle badge: "a driver". Not the
              🧑‍✈️ emoji, which is a pilot — an airline captain on most
              phones, and on fonts without that combination a face with an
              aeroplane beside it. */}
          <span className="relative flex h-9 w-9 items-center justify-center rounded-full border-2 border-green-600 bg-white text-lg shadow-sm">
            🧑
            <span className="absolute -bottom-1 -right-1.5 flex h-4 w-5 items-center justify-center rounded-full border border-green-600 bg-white p-0.5 shadow-sm">
              <TricycleIcon className="h-full w-full" />
            </span>
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-1 text-xs font-bold leading-tight text-green-900">
            Finding your driver
            <span aria-hidden className="inline-flex gap-0.5">
              <span className="h-1 w-1 animate-bounce rounded-full bg-green-700" />
              <span className="h-1 w-1 animate-bounce rounded-full bg-green-700 [animation-delay:150ms]" />
              <span className="h-1 w-1 animate-bounce rounded-full bg-green-700 [animation-delay:300ms]" />
            </span>
          </p>
          <p className="truncate text-[10px] leading-tight text-green-800/80">
            {offeredTo ? `Asking ${offeredTo} now` : 'Asking the nearest TODA drivers'}
          </p>
        </div>
        <span className="shrink-0 rounded-md bg-white px-1.5 py-0.5 font-mono text-xs font-semibold text-green-800 shadow-sm">
          {clock}
        </span>
      </div>

      {/* A tricycle making its way along a road, over and over — the one
          picture everybody reads as "on its way", before anybody is. */}
      <div aria-hidden className="relative mt-1 h-5">
        <div className="absolute inset-x-0 bottom-1 border-b-2 border-dashed border-green-600/40" />
        <div className="waiting-driver-drive absolute bottom-1 h-4 w-6">
          <TricycleIcon className="h-full w-full" />
        </div>
      </div>
      {children && <div className="mt-1 border-t border-green-600/20 pt-1.5">{children}</div>}
    </div>
  )
}
