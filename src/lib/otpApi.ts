// Talks to the local Express server (see server/index.js) which holds the
// Semaphore API key and actually sends the SMS — a browser-only app can't
// call a paid SMS gateway directly without exposing the key to anyone who
// opens devtools.
// In development that is the Express server on port 4000. In a build it is
// empty on purpose: the deployed app calls its own origin, where
// netlify.toml routes /api/* to the functions in netlify/functions. Same
// paths either way, so this file does not care which is answering.
const OTP_API_BASE =
  import.meta.env.VITE_OTP_API_BASE ?? (import.meta.env.DEV ? 'http://localhost:4000' : '')

// The signature issued by the last send, held between the two calls.
// A Netlify Function is a fresh process per request and keeps nothing, so
// the proof that a code was issued has to travel with the client — see
// netlify/functions/send-otp.mjs. The local Express server ignores these
// fields and checks its own Map instead, so one client serves both.
let issued: { phone: string; token: string; expiresAt: number } | null = null

interface OtpApiResult {
  ok: boolean
  error?: string
  // The server (npm run server) isn't running at all — as opposed to the
  // server being up but rejecting the request. Callers use this to silently
  // fall back to an on-screen simulated code instead of surfacing an error,
  // so the app is still fully testable without the OTP server running. Once
  // the server (and a Semaphore key) is set up, this stops firing and real
  // texts go out automatically — no code changes needed then.
  unreachable?: boolean
}

interface OtpApiPayload {
  error?: string
  token?: string
  expiresAt?: number
}

async function postJson(path: string, body: unknown): Promise<OtpApiResult & OtpApiPayload> {
  try {
    const res = await fetch(`${OTP_API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data: OtpApiPayload = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data.error ?? 'Something went wrong.' }
    return { ok: true, token: data.token, expiresAt: data.expiresAt }
  } catch {
    return { ok: false, unreachable: true }
  }
}

export async function sendRealOtp(phone: string): Promise<OtpApiResult> {
  const result = await postJson('/api/send-otp', { phone })
  issued = result.ok && result.token && result.expiresAt
    ? { phone, token: result.token, expiresAt: result.expiresAt }
    : null
  return result
}

export function verifyRealOtp(phone: string, code: string): Promise<OtpApiResult> {
  const proof = issued && issued.phone === phone ? issued : null
  return postJson('/api/verify-otp', {
    phone,
    code,
    token: proof?.token,
    expiresAt: proof?.expiresAt,
  })
}
