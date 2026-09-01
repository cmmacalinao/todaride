import { corsHeaders, preflightResponse } from './_cors.mjs'

// Did that payment actually go through?
//
// The passenger comes back to the app on a redirect URL, and a redirect is
// not evidence: it is a URL, and anyone can type one. Marking a fare paid
// because somebody arrived at /book?paid=… would let a passenger close a ride
// without paying for it by editing the address bar.
//
// So the app asks the server, the server asks Maya with the secret key, and
// the answer comes from the only party that actually knows.

const DEFAULT_API_BASE = 'https://pg-sandbox.paymaya.com'

async function handle(request) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed.' }, { status: 405 })
  }

  const secretKey = process.env.MAYA_SECRET_KEY
  const apiBase = process.env.MAYA_API_BASE || DEFAULT_API_BASE
  if (!secretKey) {
    return Response.json({ error: 'Payment is not configured on this server yet.' }, { status: 503 })
  }

  const body = await request.json().catch(() => ({}))
  // The ride id, which was sent to Maya as the request reference number when
  // the checkout was opened - so the payment can be looked up by it without
  // the app having to remember a checkout id across a redirect.
  const rideId = String(body.rideId ?? '').trim()
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(rideId)) {
    return Response.json({ error: 'A ride id is required.' }, { status: 400 })
  }

  const auth = Buffer.from(`${secretKey}:`).toString('base64')

  let res
  try {
    res = await fetch(`${apiBase}/payments/v1/payment-rrns/${encodeURIComponent(rideId)}`, {
      headers: { Authorization: `Basic ${auth}` },
    })
  } catch {
    return Response.json({ error: 'Could not reach the payment provider.' }, { status: 502 })
  }

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    console.warn('[maya] status lookup failed', res.status, data)
    return Response.json({ error: 'Could not check this payment.' }, { status: 502 })
  }

  // Maya returns the payments made against a reference. One that succeeded is
  // enough; the rest are abandoned attempts, which are normal and not a
  // failure to report.
  const payments = Array.isArray(data) ? data : data ? [data] : []
  const paid = payments.find((p) => String(p?.status).toUpperCase() === 'PAYMENT_SUCCESS')

  return Response.json(
    {
      paid: !!paid,
      // Shown to the passenger and stored on the ride, so a dispute has
      // something to quote that both sides can look up.
      reference: paid?.receiptNumber ?? paid?.id ?? null,
      amount: paid?.totalAmount?.value ?? null,
    },
    { headers: corsHeaders(request) },
  )
}

export default async function (request) {
  return preflightResponse(request) ?? (await handle(request))
}
