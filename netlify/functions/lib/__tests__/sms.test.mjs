import { describe, expect, it, vi } from 'vitest'
import {
  chooseProvider,
  hasNonGsmCharacters,
  maskPhone,
  messageFitsOneSegment,
  providerHasKey,
  resolvePrimary,
  sendSms,
  toE164,
  toPhilippineE164Digits,
} from '../sms.mjs'

const silent = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })

// Every HTTP call in this file is a stub. Nothing here sends an SMS.
const okJson = (body = {}) => ({ ok: true, status: 200, statusText: 'OK', json: async () => body })
const errJson = (status, body = {}) => ({
  ok: false,
  status,
  statusText: 'Error',
  json: async () => body,
})

describe('choosing a provider', () => {
  // The pilot must not notice this module exists.
  it('is Semaphore when nothing is configured', () => {
    expect(chooseProvider({ purpose: 'otp', env: {} })).toEqual({ primary: 'semaphore', fallback: null })
    expect(chooseProvider({ purpose: 'sos', env: {} })).toEqual({ primary: 'semaphore', fallback: null })
  })

  it('follows SMS_PROVIDER for codes', () => {
    expect(chooseProvider({ purpose: 'otp', env: { SMS_PROVIDER: 'philsms' } }).primary).toBe('philsms')
    expect(chooseProvider({ purpose: 'otp', env: { SMS_PROVIDER: 'unisms' } }).primary).toBe('unisms')
  })

  // An emergency alert is not where you debut a provider nobody has watched.
  it('keeps SOS on its own setting, defaulting to Semaphore even when OTPs have moved', () => {
    const env = { SMS_PROVIDER: 'philsms' }
    expect(chooseProvider({ purpose: 'sos', env }).primary).toBe('semaphore')
    expect(chooseProvider({ purpose: 'sos', env: { ...env, SOS_SMS_PROVIDER: 'unisms' } }).primary).toBe('unisms')
  })

  it('ignores a name it does not recognise rather than failing to send', () => {
    expect(chooseProvider({ purpose: 'otp', env: { SMS_PROVIDER: 'twilio' } }).primary).toBe('semaphore')
    expect(chooseProvider({ purpose: 'otp', env: { SMS_PROVIDER: '' } }).primary).toBe('semaphore')
  })

  it('reads the provider whatever case it is written in', () => {
    expect(chooseProvider({ purpose: 'otp', env: { SMS_PROVIDER: ' PhilSMS ' } }).primary).toBe('philsms')
  })

  it('takes a fallback only when it differs from the primary', () => {
    expect(chooseProvider({ purpose: 'otp', env: { SMS_PROVIDER: 'philsms', SMS_FALLBACK_PROVIDER: 'semaphore' } }).fallback).toBe('semaphore')
    expect(chooseProvider({ purpose: 'otp', env: { SMS_PROVIDER: 'philsms', SMS_FALLBACK_PROVIDER: 'philsms' } }).fallback).toBeNull()
    expect(chooseProvider({ purpose: 'otp', env: {} }).fallback).toBeNull()
  })
})

describe('a missing API key', () => {
  it('knows which key each provider needs', () => {
    expect(providerHasKey('semaphore', { SEMAPHORE_API_KEY: 'k' })).toBe(true)
    expect(providerHasKey('philsms', { PHILSMS_API_KEY: 'k' })).toBe(true)
    expect(providerHasKey('unisms', { UNISMS_API_KEY: 'k' })).toBe(true)
    expect(providerHasKey('philsms', { SEMAPHORE_API_KEY: 'k' })).toBe(false)
  })

  // A misconfigured launch must not be a launch where nobody can log in.
  it('carries on with Semaphore, loudly, when the chosen provider has no key', () => {
    const log = silent()
    const out = resolvePrimary({ purpose: 'otp', env: { SMS_PROVIDER: 'philsms', SEMAPHORE_API_KEY: 'k' }, log })
    expect(out).toMatchObject({ provider: 'semaphore', substituted: true })
    expect(log.error).toHaveBeenCalledOnce()
    expect(log.error.mock.calls[0][0]).toMatch(/PHILSMS_API_KEY/)
  })

  it('says so rather than pretending when nothing at all is configured', async () => {
    const log = silent()
    const fetchImpl = vi.fn()
    const res = await sendSms({ to: '09171234567', message: 'hi', purpose: 'otp' }, { env: {}, fetchImpl, log })
    expect(res.ok).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(log.error).toHaveBeenCalled()
  })
})

describe('the request each provider actually receives', () => {
  // With nothing new set, what leaves must be what left before this module
  // existed — same endpoint, same fields.
  it('sends Semaphore exactly what it always sent', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson({ message_id: 1 }))
    await sendSms(
      { to: '09171234567', message: 'Your code is 1234.', purpose: 'otp' },
      { env: { SEMAPHORE_API_KEY: 'key-1', SEMAPHORE_SENDER_NAME: 'TodaRide' }, fetchImpl, log: silent() },
    )
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.semaphore.co/api/v4/messages')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      apikey: 'key-1',
      number: '09171234567',
      message: 'Your code is 1234.',
      sendername: 'TodaRide',
    })
  })

  it('omits sendername when none is set, as before', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson())
    await sendSms({ to: '09171234567', message: 'hi' }, { env: { SEMAPHORE_API_KEY: 'k' }, fetchImpl, log: silent() })
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).not.toHaveProperty('sendername')
  })

  it('uses the documented PhilSMS endpoint, bearer auth and field names', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson({ status: 'success' }))
    await sendSms(
      { to: '09171234567', message: 'Your code is 1234.' },
      {
        env: { SMS_PROVIDER: 'philsms', PHILSMS_API_KEY: 'tok', PHILSMS_SENDER_ID: 'TodaRide' },
        fetchImpl,
        log: silent(),
      },
    )
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://app.philsms.com/api/v3/sms/send')
    expect(init.headers.Authorization).toBe('Bearer tok')
    expect(JSON.parse(init.body)).toEqual({
      recipient: '639171234567',
      sender_id: 'TodaRide',
      type: 'plain',
      message: 'Your code is 1234.',
    })
  })

  it('uses the documented UniSMS endpoint, basic auth and field names', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      statusText: 'Created',
      json: async () => ({ message: { status: 'sent' } }),
    })
    await sendSms(
      { to: '09171234567', message: 'Your code is 1234.' },
      { env: { SMS_PROVIDER: 'unisms', UNISMS_API_KEY: 'sec', UNISMS_SENDER_ID: 'TodaRide' }, fetchImpl, log: silent() },
    )
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://unismsapi.com/api/sms')
    // Secret as the username, empty password — the documented scheme.
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('sec:').toString('base64')}`)
    expect(JSON.parse(init.body)).toEqual({
      recipient: '+639171234567',
      content: 'Your code is 1234.',
      sender_id: 'TodaRide',
    })
  })

  it('leaves SOS on the standard Semaphore route unless priority is asked for', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson())
    const env = { SEMAPHORE_API_KEY: 'k' }
    await sendSms({ to: '09171234567', message: 'help', purpose: 'sos' }, { env, fetchImpl, log: silent() })
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.semaphore.co/api/v4/messages')

    fetchImpl.mockClear()
    await sendSms(
      { to: '09171234567', message: 'help', purpose: 'sos' },
      { env: { ...env, SEMAPHORE_SOS_PRIORITY: 'true' }, fetchImpl, log: silent() },
    )
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.semaphore.co/api/v4/priority')
  })

  it('never puts the priority route under a login code', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson())
    await sendSms(
      { to: '09171234567', message: 'code', purpose: 'otp' },
      { env: { SEMAPHORE_API_KEY: 'k', SEMAPHORE_SOS_PRIORITY: 'true' }, fetchImpl, log: silent() },
    )
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.semaphore.co/api/v4/messages')
  })
})

describe('reading each provider failure correctly', () => {
  // PhilSMS answers 200 with status:"error" for some rejections, so the body
  // decides, not the HTTP code. Treating that as success would report a text
  // as sent that nobody received.
  it('treats a PhilSMS 200 with status error as a failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson({ status: 'error', message: 'Invalid sender id' }))
    const res = await sendSms(
      { to: '09171234567', message: 'hi' },
      { env: { SMS_PROVIDER: 'philsms', PHILSMS_API_KEY: 'tok' }, fetchImpl, log: silent() },
    )
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/Invalid sender id/)
  })

  it('treats a UniSMS failed message as a failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      statusText: 'Created',
      json: async () => ({ message: { status: 'failed', fail_reason: 'Blocked' } }),
    })
    const res = await sendSms(
      { to: '09171234567', message: 'hi' },
      { env: { SMS_PROVIDER: 'unisms', UNISMS_API_KEY: 'sec' }, fetchImpl, log: silent() },
    )
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/Blocked/)
  })

  it('reports an auth rejection', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(errJson(401, { message: 'Unauthenticated.' }))
    const res = await sendSms(
      { to: '09171234567', message: 'hi' },
      { env: { SMS_PROVIDER: 'philsms', PHILSMS_API_KEY: 'bad' }, fetchImpl, log: silent() },
    )
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/Unauthenticated/)
  })
})

describe('falling back', () => {
  const env = {
    SMS_PROVIDER: 'philsms',
    SMS_FALLBACK_PROVIDER: 'semaphore',
    PHILSMS_API_KEY: 'tok',
    SEMAPHORE_API_KEY: 'k',
  }

  it('sends once through the fallback when the primary clearly fails', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(errJson(500, { message: 'boom' }))
      .mockResolvedValueOnce(okJson())
    const res = await sendSms({ to: '09171234567', message: 'hi' }, { env, fetchImpl, log: silent() })
    expect(res).toMatchObject({ ok: true, provider: 'semaphore', usedFallback: true })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(fetchImpl.mock.calls[1][0]).toBe('https://api.semaphore.co/api/v4/messages')
  })

  // The rule that matters: a user must never receive two different codes and
  // have to guess which one the server will believe.
  it('never falls back after the primary has accepted the message', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson({ status: 'success' }))
    const res = await sendSms({ to: '09171234567', message: 'hi' }, { env, fetchImpl, log: silent() })
    expect(res).toMatchObject({ ok: true, provider: 'philsms', usedFallback: false })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('falls back on a timeout', async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
              const err = new Error('aborted')
              err.name = 'AbortError'
              reject(err)
            })
          }),
      )
      .mockResolvedValueOnce(okJson())
    const res = await sendSms({ to: '09171234567', message: 'hi' }, { env, fetchImpl, log: silent(), timeoutMs: 10 })
    expect(res).toMatchObject({ ok: true, provider: 'semaphore', usedFallback: true })
  })

  it('tries only once more, not repeatedly', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(errJson(500, { message: 'boom' }))
    const res = await sendSms({ to: '09171234567', message: 'hi' }, { env, fetchImpl, log: silent() })
    expect(res).toMatchObject({ ok: false, usedFallback: true })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('does not attempt a fallback that has no key', async () => {
    const log = silent()
    const fetchImpl = vi.fn().mockResolvedValue(errJson(500, { message: 'boom' }))
    const res = await sendSms(
      { to: '09171234567', message: 'hi' },
      { env: { SMS_PROVIDER: 'philsms', SMS_FALLBACK_PROVIDER: 'unisms', PHILSMS_API_KEY: 'tok' }, fetchImpl, log },
    )
    expect(res.usedFallback).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(log.error.mock.calls.some((c) => /fallback unisms/.test(c[0]))).toBe(true)
  })

  it('does not fall back when none is configured', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(errJson(500, { message: 'boom' }))
    const res = await sendSms(
      { to: '09171234567', message: 'hi' },
      { env: { SEMAPHORE_API_KEY: 'k' }, fetchImpl, log: silent() },
    )
    expect(res).toMatchObject({ ok: false, usedFallback: false })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('what gets written to the log', () => {
  it('masks all but the last four digits', () => {
    expect(maskPhone('09171234567')).toBe('*******4567')
    expect(maskPhone('+639171234567')).toBe('********4567')
    expect(maskPhone('1234')).toBe('****1234')
    expect(maskPhone('')).toBe('****')
    expect(maskPhone(null)).toBe('****')
  })

  it('never writes the message body or a whole number', async () => {
    const log = silent()
    const fetchImpl = vi.fn().mockResolvedValue(okJson())
    await sendSms(
      { to: '09171234567', message: 'Your TodaRide verification code is 4821.' },
      { env: { SEMAPHORE_API_KEY: 'k' }, fetchImpl, log },
    )
    const written = [...log.info.mock.calls, ...log.warn.mock.calls, ...log.error.mock.calls].flat().join(' ')
    expect(written).not.toMatch(/4821/)
    expect(written).not.toMatch(/09171234567/)
    expect(written).toMatch(/\*{3}4567/)
  })

  it('names the provider, the purpose and whether a fallback was used', async () => {
    const log = silent()
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(errJson(500, { message: 'boom' }))
      .mockResolvedValueOnce(okJson())
    await sendSms(
      { to: '09171234567', message: 'hi', purpose: 'sos' },
      {
        env: { SOS_SMS_PROVIDER: 'philsms', SMS_FALLBACK_PROVIDER: 'semaphore', PHILSMS_API_KEY: 't', SEMAPHORE_API_KEY: 'k' },
        fetchImpl,
        log,
      },
    )
    const written = [...log.info.mock.calls, ...log.error.mock.calls].flat().join(' ')
    expect(written).toMatch(/philsms/)
    expect(written).toMatch(/sos/)
    expect(written).toMatch(/fallback/)
  })

  it('never writes an API key', async () => {
    const log = silent()
    const fetchImpl = vi.fn().mockResolvedValue(errJson(401, { message: 'bad key' }))
    await sendSms(
      { to: '09171234567', message: 'hi' },
      { env: { SMS_PROVIDER: 'philsms', PHILSMS_API_KEY: 'super-secret-token' }, fetchImpl, log },
    )
    const written = [...log.info.mock.calls, ...log.warn.mock.calls, ...log.error.mock.calls].flat().join(' ')
    expect(written).not.toMatch(/super-secret-token/)
  })
})

describe('message length', () => {
  it('counts a plain 160-character message as one segment', () => {
    expect(messageFitsOneSegment('a'.repeat(160))).toBe(true)
    expect(messageFitsOneSegment('a'.repeat(161))).toBe(false)
  })

  // One emoji turns the whole message to UCS-2 and halves the limit, so a
  // smiley quietly doubles the bill.
  it('treats an emoji as breaking the single-segment rule', () => {
    expect(hasNonGsmCharacters('Your code is 1234 🎉')).toBe(true)
    expect(messageFitsOneSegment('Your code is 1234 🎉')).toBe(false)
    expect(hasNonGsmCharacters('Your code is 1234.')).toBe(false)
  })

  it('warns but still sends, because an emergency text must go', async () => {
    const log = silent()
    const fetchImpl = vi.fn().mockResolvedValue(okJson())
    const res = await sendSms(
      { to: '09171234567', message: 'x'.repeat(200), purpose: 'sos' },
      { env: { SEMAPHORE_API_KEY: 'k' }, fetchImpl, log },
    )
    expect(res.ok).toBe(true)
    expect(log.warn).toHaveBeenCalled()
  })

  it('keeps the live OTP text inside one segment', () => {
    // The exact string send-otp.mjs builds, with the longest possible code.
    expect(messageFitsOneSegment('Your TodaRide verification code is 9999. It expires in 5 minutes.')).toBe(true)
  })
})

describe('phone number shapes', () => {
  it('gives PhilSMS a country code with no plus', () => {
    expect(toPhilippineE164Digits('09171234567')).toBe('639171234567')
    expect(toPhilippineE164Digits('+639171234567')).toBe('639171234567')
    expect(toPhilippineE164Digits('639171234567')).toBe('639171234567')
    expect(toPhilippineE164Digits('9171234567')).toBe('639171234567')
  })

  it('gives UniSMS E.164 with the plus', () => {
    expect(toE164('09171234567')).toBe('+639171234567')
    expect(toE164('+639171234567')).toBe('+639171234567')
  })

  it('passes a number it does not recognise through rather than mangling it', () => {
    expect(toPhilippineE164Digits('14155550123')).toBe('14155550123')
  })
})
