import { corsHeaders, preflightResponse } from './_cors.mjs'
import { createHmac, timingSafeEqual } from 'node:crypto'

// Checks a code against the signature issued when it was sent. See
// send-otp.mjs for why the secret travels with the client rather than sitting
// in a table.

function normalizePhone(phone) {
  return String(phone ?? '').replace(/[^\d+]/g, '')
}

function signCode(phone, code, expiresAt, secret) {
  return createHmac('sha256', secret).update(`${phone}|${code}|${expiresAt}`).digest('base64url')
}

// Compared byte by byte in constant time. A plain === leaks, through how long
// it takes to fail, how much of a guess was right — enough to reconstruct a
// signature one character at a time.
function sameSignature(a, b) {
  const left = Buffer.from(String(a))
  const right = Buffer.from(String(b))
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

async function handle(request) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed.' }, { status: 405 })
  }

  const secret = process.env.OTP_SIGNING_SECRET
  if (!secret) {
    return Response.json({ error: 'OTP verification is not configured on the server yet.' }, { status: 503 })
  }

  const body = await request.json().catch(() => ({}))
  const phone = normalizePhone(body.phone)
  const code = String(body.code ?? '').trim()
  const token = String(body.token ?? '')
  const expiresAt = Number(body.expiresAt ?? 0)

  if (!phone || !code) return Response.json({ error: 'Phone number and code are required.' }, { status: 400 })
  if (!token || !expiresAt) {
    return Response.json({ error: 'No code was sent to this number — send one first.' }, { status: 400 })
  }
  if (Date.now() > expiresAt) {
    return Response.json({ error: 'Code expired — request a new one.' }, { status: 400 })
  }

  if (!sameSignature(token, signCode(phone, code, expiresAt, secret))) {
    return Response.json({ error: 'Incorrect code.' }, { status: 400 })
  }

  return Response.json({ ok: true })
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
