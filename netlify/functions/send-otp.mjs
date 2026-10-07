import { corsHeaders, preflightResponse } from './_cors.mjs'
import { createHmac, randomInt } from 'node:crypto'
import { sendSms } from './lib/sms.mjs'

// Sends a real one-time code by SMS, from the same domain the app is served
// on.
//
// The local Express server (server/index.js) does the same job for
// development, but it keeps its codes in a Map — which cannot work here. A
// Netlify Function is a fresh process each time, so the invocation that
// verifies a code is almost never the one that sent it.
//
// Rather than add a database for a five-minute secret, the code is signed and
// the signature travels with the client. Verification recomputes it. Nothing
// about the code is recoverable from the signature, so a client holding one
// still has to receive the SMS to know the digits.
//
// The tradeoff, stated plainly: with no stored state there is no server-side
// attempt counter, so a determined attacker could grind a 4-digit code. That
// is the same exposure the local server had. It is acceptable for a pilot and
// would not be for real accounts holding money.

const CODE_TTL_MS = 5 * 60 * 1000

function normalizePhone(phone) {
  return String(phone ?? '').replace(/[^\d+]/g, '')
}

export function signCode(phone, code, expiresAt, secret) {
  return createHmac('sha256', secret).update(`${phone}|${code}|${expiresAt}`).digest('base64url')
}

async function handle(request) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed.' }, { status: 405 })
  }

  const secret = process.env.OTP_SIGNING_SECRET
  // Which provider carries this is lib/sms.mjs's business now (see
  // SMS_PROVIDER). Semaphore's key is still what decides whether sending is
  // configured at all, because it is the one every path falls back to.
  const apiKey = process.env.SEMAPHORE_API_KEY

  if (!secret || !apiKey) {
    // Deliberately explicit: a silent failure here looks to a tester exactly
    // like a phone with no signal.
    return Response.json(
      { error: 'OTP sending is not configured on the server yet.' },
      { status: 503 },
    )
  }

  const body = await request.json().catch(() => ({}))
  const phone = normalizePhone(body.phone)
  if (!phone) return Response.json({ error: 'Phone number is required.' }, { status: 400 })

  const code = String(randomInt(1000, 10000))
  const expiresAt = Date.now() + CODE_TTL_MS
  const message = `Your TodaRide verification code is ${code}. It expires in 5 minutes.`

  const sent = await sendSms({ to: phone, message, purpose: 'otp' })
  if (!sent.ok) {
    return Response.json({ error: `Failed to send SMS: ${sent.error}` }, { status: 502 })
  }

  return Response.json({
    ok: true,
    // The client hands these back on verify. Neither reveals the code.
    token: signCode(phone, code, expiresAt, secret),
    expiresAt,
  })
}

// Every response goes out through here so the CORS headers cannot be
// forgotten on one branch — an error the app would see only as a network
// failure, which is exactly the misdiagnosis this whole fix came from.
export default async function handler(request) {
  const preflight = preflightResponse(request)
  if (preflight) return preflight
  const response = await handle(request)
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(corsHeaders(request))) headers.set(key, value)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
