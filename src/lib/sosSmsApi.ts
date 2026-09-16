import { isNativeApp } from './platform'
import { PILOT_ORIGIN } from './pilotOrigin'

// Sends one emergency SMS through server/index.js (dev) or
// netlify/functions/send-sos-sms.mjs (deployed) — see otpApi.ts, which this
// mirrors exactly for the same reasons: a browser can't hold the Semaphore
// key itself, and the installed app's own origin (https://localhost) can't
// resolve a relative /api/* path, so it has to be pointed at the pilot's
// real origin instead.
const SOS_SMS_API_BASE =
  import.meta.env.VITE_OTP_API_BASE ??
  (import.meta.env.DEV ? 'http://localhost:4000' : isNativeApp() ? PILOT_ORIGIN : '')

export interface SosSmsResult {
  ok: boolean
  error?: string
  // The dev server or Netlify function isn't reachable at all, as opposed to
  // reachable but rejecting the request (missing key, bad number). The
  // caller (RideContext's delivery effect) logs either as 'failed' on the
  // notification, but keeps the reason distinct for debugging.
  unreachable?: boolean
}

export async function sendSosSms(phone: string, message: string): Promise<SosSmsResult> {
  try {
    const res = await fetch(`${SOS_SMS_API_BASE}/api/send-sos-sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, message }),
    })
    const data: { error?: string } = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data.error ?? 'Something went wrong.' }
    return { ok: true }
  } catch {
    return { ok: false, unreachable: true }
  }
}
