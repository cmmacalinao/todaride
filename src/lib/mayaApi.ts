import { isNativeApp } from './platform'
import { PILOT_ORIGIN } from './pilotOrigin'

// Talks to the two Maya functions, which hold the secret key.
//
// Nothing about the merchant account is in this file, and nothing should ever
// be. The secret key can create and refund payments on the account, and
// anything imported from src/ is compiled into a bundle that every visitor
// downloads — a key here would be readable by anyone who opened devtools. It
// lives in a Netlify environment variable and is used only by
// netlify/functions/maya-checkout.mjs and maya-status.mjs.
//
// Same base-URL reasoning as otpApi: the website calls its own origin, and the
// installed app has to be pointed at the pilot's, because Capacitor serves
// from https://localhost where a relative /api path resolves to nothing.
// The origin itself lives in lib/pilotOrigin — otpApi needs the same one.
const API_BASE =
  import.meta.env.VITE_OTP_API_BASE ??
  (import.meta.env.DEV ? 'http://localhost:4000' : isNativeApp() ? PILOT_ORIGIN : '')

export interface CheckoutSession {
  checkoutId: string | null
  redirectUrl: string
}

export interface MayaResult<T> {
  ok: boolean
  data?: T
  error?: string
  // The server is not reachable or not configured — as opposed to Maya
  // refusing the payment. The caller falls back to the manual send-and-quote-
  // a-reference flow rather than leaving the passenger with no way to pay.
  unavailable?: boolean
}

async function post<T>(path: string, body: unknown): Promise<MayaResult<T>> {
  try {
    const res = await fetch(`${API_BASE}/api/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (res.status === 503) return { ok: false, unavailable: true, error: data?.error }
    if (!res.ok) return { ok: false, error: data?.error ?? 'That payment could not be started.' }
    return { ok: true, data: data as T }
  } catch {
    return { ok: false, unavailable: true, error: 'Could not reach the payment server.' }
  }
}

// Opens a hosted Maya page for one fare and returns where to send the
// passenger. The page itself offers whatever channels the merchant account
// has enabled — the app does not choose, and does not need to.
export function createMayaCheckout(args: {
  rideId: string
  total: number
  description: string
}): Promise<MayaResult<CheckoutSession>> {
  return post<CheckoutSession>('maya-checkout', {
    ...args,
    // Where to come back to. The server only honours origins it was
    // configured with, so this is a preference rather than an instruction.
    returnBase: typeof window === 'undefined' ? '' : window.location.origin,
  })
}

// Whether that payment actually completed.
//
// Asked of the server rather than inferred from the URL the passenger came
// back on. A redirect is a URL and anyone can type one; marking a fare paid
// because somebody arrived at /book?paid=... would let a ride be closed from
// the address bar.
export function checkMayaPayment(
  rideId: string,
): Promise<MayaResult<{ paid: boolean; reference: string | null; amount: string | null }>> {
  return post('maya-status', { rideId })
}
