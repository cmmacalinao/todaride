import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import sendOtp from '../send-otp.mjs'
import verifyOtp from '../verify-otp.mjs'

// The whole OTP path, end to end, with the SMS gateway stubbed: send a code,
// read the digits out of the text that would have gone to the phone, hand
// them back to verify.
//
// Worth having as a test rather than a one-off script because the two halves
// live in separate files, run in separate processes in production, and agree
// only through an HMAC neither of them stores. Nothing in the app exercises
// that agreement — the first thing that ever does is a real person at a real
// signup, and when it is wrong the code is simply "incorrect" forever.
//
// Written on 2026-11-12, when the live site turned out to have no
// environment variables at all and every one of these endpoints was
// answering 503. This proves the code behind them is sound and the fix is
// configuration, not a rewrite.

const SECRET = 'test-signing-secret-not-a-real-one'
const API_KEY = 'test-semaphore-key'

function post(url, body) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://todaridemobility.com' },
    body: JSON.stringify(body),
  })
}

let sentMessages = []

beforeEach(() => {
  sentMessages = []
  process.env.OTP_SIGNING_SECRET = SECRET
  process.env.SEMAPHORE_API_KEY = API_KEY
  delete process.env.SMS_PROVIDER
  // Stands in for Semaphore: records what would have been texted and
  // answers the way the real gateway does on success.
  vi.stubGlobal('fetch', async (url, init) => {
    sentMessages.push({ url: String(url), body: JSON.parse(init.body) })
    return new Response(JSON.stringify([{ status: 'Queued' }]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.OTP_SIGNING_SECRET
  delete process.env.SEMAPHORE_API_KEY
})

async function sendTo(phone) {
  const res = await sendOtp(post('https://todaridemobility.com/api/send-otp', { phone }))
  const payload = await res.json()
  const text = sentMessages.at(-1)?.body?.message ?? ''
  return { status: res.status, payload, code: text.match(/\b(\d{4})\b/)?.[1] ?? null, text }
}

function verify(body) {
  return verifyOtp(post('https://todaridemobility.com/api/verify-otp', body))
}

describe('a code sent is a code that verifies', () => {
  it('sends one SMS, to that number, carrying the code', async () => {
    const { status, payload, code, text } = await sendTo('0917-200-2001')
    expect(status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(sentMessages).toHaveLength(1)
    expect(sentMessages[0].url).toContain('api.semaphore.co')
    expect(sentMessages[0].body.number).toBe('09172002001')
    expect(code).toMatch(/^\d{4}$/)
    expect(text).toContain('expires in 5 minutes')
    // The client is handed proof a code was issued, and nothing that reveals it.
    expect(payload.token).toBeTruthy()
    expect(payload.expiresAt).toBeGreaterThan(Date.now())
    expect(JSON.stringify(payload)).not.toContain(code)
  })

  it('accepts the right code', async () => {
    const phone = '0917-200-2001'
    const { payload, code } = await sendTo(phone)
    const res = await verify({ phone, code, token: payload.token, expiresAt: payload.expiresAt })
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
  })

  it('accepts it however the number was typed, both times', async () => {
    // The app sends whatever the user typed; send and verify must agree
    // after the same normalisation, or a dash costs somebody their account.
    const { payload, code } = await sendTo('0917-200-2001')
    const res = await verify({
      phone: '09172002001',
      code,
      token: payload.token,
      expiresAt: payload.expiresAt,
    })
    expect(res.status).toBe(200)
  })

  it('refuses a wrong code', async () => {
    const phone = '09172002001'
    const { payload, code } = await sendTo(phone)
    const wrong = String((Number(code) + 1) % 10000).padStart(4, '0')
    const res = await verify({ phone, code: wrong, token: payload.token, expiresAt: payload.expiresAt })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Incorrect code.')
  })

  it('refuses a code sent to a different number', async () => {
    const { payload, code } = await sendTo('09172002001')
    const res = await verify({
      phone: '09998887777',
      code,
      token: payload.token,
      expiresAt: payload.expiresAt,
    })
    expect(res.status).toBe(400)
  })

  it('refuses a code whose expiry has been stretched', async () => {
    // expiresAt travels with the client, so it is signed along with the
    // code: moving it invalidates the signature rather than buying time.
    const phone = '09172002001'
    const { payload, code } = await sendTo(phone)
    const res = await verify({
      phone,
      code,
      token: payload.token,
      expiresAt: payload.expiresAt + 60 * 60 * 1000,
    })
    expect(res.status).toBe(400)
  })

  it('refuses an expired code', async () => {
    const phone = '09172002001'
    const { payload, code } = await sendTo(phone)
    const res = await verify({ phone, code, token: payload.token, expiresAt: Date.now() - 1 })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('expired')
  })

  it('refuses a verify with no proof that anything was sent', async () => {
    const res = await verify({ phone: '09172002001', code: '1234' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('send one first')
  })
})

describe('when the server is not configured', () => {
  it('says so, and sends nothing', async () => {
    delete process.env.OTP_SIGNING_SECRET
    delete process.env.SEMAPHORE_API_KEY
    const res = await sendOtp(post('https://todaridemobility.com/api/send-otp', { phone: '09172002001' }))
    expect(res.status).toBe(503)
    expect(sentMessages).toHaveLength(0)
  })

  it('cannot verify either, rather than waving a code through', async () => {
    delete process.env.OTP_SIGNING_SECRET
    const res = await verify({ phone: '09172002001', code: '1234', token: 'x', expiresAt: Date.now() + 1000 })
    expect(res.status).toBe(503)
  })
})

describe('who is allowed to call it', () => {
  const preflightFrom = (origin) =>
    sendOtp(
      new Request('https://todaridemobility.com/api/send-otp', {
        method: 'OPTIONS',
        headers: { Origin: origin },
      }),
    )

  it('answers the installed app, which is cross-origin by construction', async () => {
    // Capacitor serves the APK's files from https://localhost, so every call
    // it makes to the pilot domain is cross-origin and preflighted. Without
    // this the app's signup fails with nothing but a network error.
    const preflight = await preflightFrom('https://localhost')
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe('https://localhost')
  })

  it('tells any other website nothing — those credits are not theirs to spend', async () => {
    const preflight = await preflightFrom('https://someone-elses-site.example')
    expect(preflight.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('needs no CORS at all for the website itself, which is same-origin', async () => {
    const res = await sendOtp(post('https://todaridemobility.com/api/send-otp', { phone: '09172002001' }))
    expect(res.status).toBe(200)
  })
})
