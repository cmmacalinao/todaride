import { corsHeaders, preflightResponse } from './_cors.mjs'
import { sendSms } from './lib/sms.mjs'

// Sends one emergency-alert SMS through the same Semaphore account and key
// as send-otp.mjs. No code, no verify step — the caller (see
// lib/safety.ts's notification plan, sent by context/RideContext.tsx) hands
// over the finished message text, this just relays it.
//
// The local Express server (server/index.js) does the same job for
// development, including the same "no key configured yet" console-log
// fallback so the safety flow is fully testable without a live Semaphore
// account.

const MAX_MESSAGE_LENGTH = 480 // ~3 SMS segments; well past what buildIncident's message ever produces

function normalizePhone(phone) {
  return String(phone ?? '').replace(/[^\d+]/g, '')
}

async function handle(request) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed.' }, { status: 405 })
  }

  // See send-otp.mjs: the provider is chosen in lib/sms.mjs, but Semaphore's
  // key is still the test for "is sending configured", since it is the
  // fallback of last resort for an emergency text.
  const apiKey = process.env.SEMAPHORE_API_KEY

  if (!apiKey) {
    // Same explicit-failure stance as send-otp.mjs: a silent success here
    // would show as "delivered" on the safety desk for a text nobody sent.
    return Response.json(
      { error: 'Emergency SMS is not configured on the server yet.' },
      { status: 503 },
    )
  }

  const body = await request.json().catch(() => ({}))
  const phone = normalizePhone(body.phone)
  const message = String(body.message ?? '').trim()
  if (!phone) return Response.json({ error: 'Phone number is required.' }, { status: 400 })
  if (!message) return Response.json({ error: 'Message is required.' }, { status: 400 })
  if (message.length > MAX_MESSAGE_LENGTH) {
    return Response.json({ error: 'Message is too long.' }, { status: 400 })
  }

  const sent = await sendSms({ to: phone, message, purpose: 'sos' })
  if (!sent.ok) {
    return Response.json({ error: `Failed to send SMS: ${sent.error}` }, { status: 502 })
  }

  return Response.json({ ok: true })
}

// Every response goes out through here so the CORS headers cannot be
// forgotten on one branch — see send-otp.mjs for why that matters.
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
