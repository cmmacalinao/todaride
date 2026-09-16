// A sensor-only, best-effort "something hit this phone hard" signal — never
// a confirmed accident, only ever the reason to ask. See CrashPromptModal
// for what happens with the answer.
//
// Reads the phone's own motion, the way a road does to a tricycle: bumps
// and turns constantly, a real impact rarely. There is no science here
// tuned against real crash data — the three sensitivity levels are plain
// thresholds on how hard a jolt has to be before the prompt shows, meant
// to be adjusted once this has actually ridden on real roads (see
// SafetySettingsPanel). That tuning is why it ships off by default.
import { useEffect, useRef } from 'react'

export type CrashSensitivity = 'low' | 'medium' | 'high'

// Peak acceleration, in m/s², that counts as a possible impact. Lower
// catches gentler jolts — and more speed bumps.
const THRESHOLD_MPS2: Record<CrashSensitivity, number> = {
  low: 38,
  high: 20,
  medium: 28,
}

// Once triggered, ignored for this long — the same pothole should not ask
// three times in the ten seconds it takes to answer once.
const COOLDOWN_MS = 45_000

// iOS gates DeviceMotion behind a permission prompt that only a real tap can
// open (Safari refuses it from code with no user gesture behind it). Call
// this from an actual button press before relying on the hook below;
// everywhere else motion just works with no prompt at all.
export async function requestMotionPermission(): Promise<'granted' | 'denied' | 'unsupported'> {
  const RequestingMotionEvent = DeviceMotionEvent as unknown as {
    requestPermission?: () => Promise<'granted' | 'denied'>
  }
  if (typeof RequestingMotionEvent.requestPermission !== 'function') return 'unsupported'
  try {
    return await RequestingMotionEvent.requestPermission()
  } catch {
    return 'denied'
  }
}

export function motionPermissionNeeded(): boolean {
  const RequestingMotionEvent = typeof DeviceMotionEvent !== 'undefined' ? (DeviceMotionEvent as unknown as { requestPermission?: unknown }) : null
  return typeof RequestingMotionEvent?.requestPermission === 'function'
}

// Listens for a possible impact while `enabled`, and calls `onPossibleCrash`
// at most once per cooldown window. Does nothing (and asks nothing) unless
// `enabled` is true — the caller decides that from the trip's own status and
// the Super Admin switch, never on its own.
export function useCrashDetection(enabled: boolean, sensitivity: CrashSensitivity, onPossibleCrash: () => void) {
  const lastFiredRef = useRef(0)
  const callbackRef = useRef(onPossibleCrash)
  callbackRef.current = onPossibleCrash

  useEffect(() => {
    if (!enabled) return
    if (typeof window === 'undefined' || typeof DeviceMotionEvent === 'undefined') return
    const threshold = THRESHOLD_MPS2[sensitivity]

    function handleMotion(e: DeviceMotionEvent) {
      // Gravity-excluded when the device reports it (most do); falls back to
      // the raw reading, which sits around 9.8 m/s² at rest, so the
      // threshold still has to clear that floor either way.
      const a = e.acceleration ?? e.accelerationIncludingGravity
      if (!a || a.x === null || a.y === null || a.z === null) return
      const magnitude = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z)
      if (magnitude < threshold) return
      const now = Date.now()
      if (now - lastFiredRef.current < COOLDOWN_MS) return
      lastFiredRef.current = now
      callbackRef.current()
    }

    window.addEventListener('devicemotion', handleMotion)
    return () => window.removeEventListener('devicemotion', handleMotion)
  }, [enabled, sensitivity])
}
