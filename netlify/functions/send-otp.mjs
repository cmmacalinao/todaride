import { createHmac, randomInt } from 'node:crypto'

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

export default async function handler(request) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed.' }, { status: 405 })
  }

  const secret = process.env.OTP_SIGNING_SECRET
  const apiKey = process.env.SEMAPHORE_API_KEY
  const senderName = process.env.SEMAPHORE_SENDER_NAME ?? ''

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

  const res = await fetch('https://api.semaphore.co/api/v4/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apikey: apiKey,
      number: phone,
      message,
      ...(senderName ? { sendername: senderName } : {}),
    }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = (data && (data.message || JSON.stringify(data))) || res.statusText
    return Response.json({ error: `Failed to send SMS: ${detail}` }, { status: 502 })
  }

  return Response.json({
    ok: true,
    // The client hands these back on verify. Neither reveals the code.
    token: signCode(phone, code, expiresAt, secret),
    expiresAt,
  })
}
