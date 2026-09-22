import { useEffect, useRef, useState } from 'react'
import { useRides } from '../context/RideContext'
import type { Ride } from '../types'

// In-app chat between the driver and the passenger on a trip (2026-09-23) —
// every booking that has a driver: Book a Ride, Family, PaDeliver and Food
// Order deliveries. On a Family ride the passenger side is the parent who
// booked it. Messages live on the ride (Ride.messages) and sync with it.

type Side = 'driver' | 'passenger'

const QUICK: Record<Side, string[]> = {
  driver: ["I'm on my way", "I'm at the pickup", 'Where are you exactly?', 'Thank you!'],
  passenger: ["I'm coming out", 'Please wait a minute', 'Where are you now?', 'Thank you!'],
}

function seenKey(rideId: string, as: Side) {
  return `toda-chat-seen-${rideId}-${as}`
}
function readSeen(rideId: string, as: Side): number {
  try {
    return Number(localStorage.getItem(seenKey(rideId, as)) ?? 0) || 0
  } catch {
    return 0
  }
}
function writeSeen(rideId: string, as: Side, n: number) {
  try {
    localStorage.setItem(seenKey(rideId, as), String(n))
  } catch {
    /* storage refused — the badge just shows again */
  }
}

export function RideChatButton({
  ride,
  as,
  senderName,
  otherLabel,
  withLabel = false,
}: {
  ride: Ride
  as: Side
  senderName: string
  // Who is on the other end: "Kuya Dante", "Celeste (parent)".
  otherLabel: string
  withLabel?: boolean
}) {
  const [open, setOpen] = useState(false)
  const theirs = (ride.messages ?? []).filter((m) => m.from !== as).length
  const [seen, setSeen] = useState(() => readSeen(ride.id, as))
  const unread = open ? 0 : Math.max(0, theirs - seen)
  // A buzz when a new message comes in and the chat is closed.
  const lastTheirs = useRef(theirs)
  useEffect(() => {
    if (theirs > lastTheirs.current && !open) {
      try {
        navigator.vibrate?.(150)
      } catch {
        /* no vibration here */
      }
    }
    lastTheirs.current = theirs
  }, [theirs, open])
  useEffect(() => {
    if (!open) return
    writeSeen(ride.id, as, theirs)
    setSeen(theirs)
  }, [open, theirs, ride.id, as])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Chat with ${otherLabel}`}
        title={`Chat with ${otherLabel}`}
        className="relative flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-3 text-brand-800 transition hover:bg-brand-100"
      >
        <span className="text-base leading-none">💬</span>
        {withLabel && <span className="text-[11px] font-semibold">Chat</span>}
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && <RideChatSheet ride={ride} as={as} senderName={senderName} otherLabel={otherLabel} onClose={() => setOpen(false)} />}
    </>
  )
}

function RideChatSheet({
  ride,
  as,
  senderName,
  otherLabel,
  onClose,
}: {
  ride: Ride
  as: Side
  senderName: string
  otherLabel: string
  onClose: () => void
}) {
  const { sendRideMessage } = useRides()
  const [draft, setDraft] = useState('')
  const messages = ride.messages ?? []
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages.length])
  const ended = ride.status === 'completed' || ride.status === 'cancelled'

  function send(text: string) {
    const t = text.trim()
    if (!t || ended) return
    sendRideMessage(ride.id, as, senderName, t)
    setDraft('')
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">💬 {otherLabel}</p>
            <p className="truncate text-[11px] text-slate-500">
              {ride.passengerName} · {ride.dropoff.label.split(',')[0]}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            ✕
          </button>
        </div>
        <div ref={listRef} className="min-h-[160px] flex-1 space-y-1.5 overflow-y-auto px-3 py-2">
          {messages.length === 0 && (
            <p className="py-6 text-center text-[11px] text-slate-400">No messages yet. Say hello, or tap a quick reply below.</p>
          )}
          {messages.map((m) => {
            const mine = m.from === as
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-xs ${
                    mine ? 'rounded-br-sm bg-brand-600 text-white' : 'rounded-bl-sm bg-slate-100 text-slate-800'
                  }`}
                >
                  {!mine && <p className="text-[10px] font-semibold text-slate-500">{m.senderName}</p>}
                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  <p className={`mt-0.5 text-right text-[9px] ${mine ? 'text-white/70' : 'text-slate-400'}`}>
                    {new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
        {ended ? (
          <p className="border-t border-slate-100 px-3 py-2 text-center text-[11px] text-slate-500">This trip has ended — the chat is closed.</p>
        ) : (
          <div className="space-y-1.5 border-t border-slate-100 px-3 py-2">
            <div className="-mx-1 flex flex-nowrap gap-1 overflow-x-auto px-1">
              {QUICK[as].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => send(q)}
                  className="shrink-0 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  {q}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') send(draft)
                }}
                placeholder="Type a message…"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => send(draft)}
                disabled={!draft.trim()}
                className="shrink-0 rounded-lg bg-brand-600 px-3 text-xs font-bold text-white disabled:bg-slate-200 disabled:text-slate-400"
              >
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
