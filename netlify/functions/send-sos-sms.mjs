import { corsHeaders, preflightResponse } from './_cors.mjs'

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

  const apiKey = process.env.SEMAPHORE_API_KEY
  const senderName = process.env.SEMAPHORE_SENDER_NAME ?? ''

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
