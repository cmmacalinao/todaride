import { useEffect, useRef } from 'react'

// The sound a driver hears when work arrives.
//
// A tricycle driver is not looking at the phone. It is mounted on the
// handlebars, or in a pocket, and the screen is one of several things
// competing with the road — so a request that announces itself only by
// changing a bell emoji from 🔕 to 🔔 is a request that gets missed, and a
// missed request goes to the next driver in the queue. Asked for after the
// pilot run on 2026-09-29.
//
// Synthesised rather than played from a file: no asset to download on a
// carrier connection, nothing to 404 after a deploy, and it works the first
// time on a phone that has never opened the app before. Two short rising
// tones, twice — close enough to a notification that nobody has to learn it,
// short enough not to be the thing a driver turns the volume down to escape.

let context: AudioContext | null = null

type AudioContextCtor = typeof AudioContext

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (context) return context
  const Ctor: AudioContextCtor | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext
  if (!Ctor) return null
  try {
    context = new Ctor()
  } catch {
    return null
  }
  return context
}

// Browsers refuse to make noise until the person has touched the page at
// least once, and a context created before that starts suspended and stays
// suspended. So the first touch anywhere wakes it — by then the driver has
// tapped something (gone online, opened a screen), and the beep that matters
// is the one that comes later.
if (typeof window !== 'undefined') {
  const unlock = () => {
    const ctx = audioContext()
    if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => {})
  }
  window.addEventListener('pointerdown', unlock, { once: false, passive: true })
  window.addEventListener('touchstart', unlock, { once: false, passive: true })
}

function tone(ctx: AudioContext, startAt: number, frequency: number, seconds: number) {
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.value = frequency
  // Eased in and out rather than switched on: a square-edged start and stop
  // is heard as a click on a phone speaker, on top of the note itself.
  gain.gain.setValueAtTime(0.0001, startAt)
  gain.gain.exponentialRampToValueAtTime(0.35, startAt + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + seconds)
  oscillator.connect(gain)
  gain.connect(ctx.destination)
  oscillator.start(startAt)
  oscillator.stop(startAt + seconds + 0.02)
}

export function playRequestAlert() {
  const ctx = audioContext()
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
  try {
    const now = ctx.currentTime
    // Two rising pairs: ta-DA, ta-DA.
    tone(ctx, now, 880, 0.12)
    tone(ctx, now + 0.15, 1175, 0.16)
    tone(ctx, now + 0.45, 880, 0.12)
    tone(ctx, now + 0.6, 1175, 0.16)
  } catch {
    // A phone that will not make this noise is not a phone with a problem.
  }
  // For a phone face-down in a pocket, or on silent — the buzz is the half of
  // this that survives either.
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.([120, 80, 120])
  } catch {
    // Not supported; the tones already went out.
  }
}

// Sounds when the number of waiting requests goes up — a new job arriving —
// and not when it goes down, which is somebody else having taken one.
export function useIncomingRequestAlert(count: number, enabled = true) {
  const lastCount = useRef(count)
  useEffect(() => {
    const before = lastCount.current
    lastCount.current = count
    if (!enabled) return
    if (count > before) playRequestAlert()
  }, [count, enabled])
}
