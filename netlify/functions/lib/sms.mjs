// One place that sends an SMS, whoever carries it.
//
// Until now Semaphore was called directly from three files — the OTP
// function, the SOS function and the dev server — each with its own copy of
// the same fetch. Adding a provider meant editing three places and hoping
// they stayed alike, and the two that matter most are the ones that carry a
// login code and an emergency alert.
//
// The pilot must not notice this exists. With no new environment variables
// set, every request leaving this module is byte-for-byte the Semaphore
// request that left before it, to the same endpoint, with the same fields.
// The other providers are wired and waiting for the day somebody sets
// SMS_PROVIDER.
//
// Endpoints and field names here are from each provider's own documentation,
// read rather than guessed:
//   Semaphore  https://semaphore.co/docs
//   PhilSMS    https://app.philsms.com/developers/documentation
//   UniSMS     https://unismsapi.com/docs/sms
//
// The three disagree about almost everything — auth scheme, field names, even
// what a phone number looks like — which is the whole argument for them
// meeting behind one function instead of at three call sites.

export const PROVIDERS = ['semaphore', 'philsms', 'unisms']

// A plain GSM-7 segment. Providers bill per segment, and an emoji silently
// converts the whole message to UCS-2, which halves the limit to 70 — so a
// single smiley can turn one chargeable message into two.
export const SINGLE_SEGMENT_CHARS = 160

const DEFAULT_TIMEOUT_MS = 8000

// ── phone numbers ──────────────────────────────────────────────────────────
// Each provider wants a different shape, and getting it wrong is a message
// that silently goes nowhere.

export function digitsOnly(phone) {
  return String(phone ?? '').replace(/[^\d+]/g, '')
}

// 09171234567 and +639171234567 are the same number written two ways; both
// arrive from the app depending on where the user typed it.
export function toPhilippineE164Digits(phone) {
  const raw = digitsOnly(phone).replace(/^\+/, '')
  if (raw.startsWith('63')) return raw
  if (raw.startsWith('0')) return `63${raw.slice(1)}`
  if (raw.startsWith('9') && raw.length === 10) return `63${raw}`
  // Already international, or something this function should not rewrite —
  // a number it does not recognise is passed through rather than mangled.
  return raw
}

export function toE164(phone) {
  const digits = toPhilippineE164Digits(phone)
  return digits.startsWith('+') ? digits : `+${digits}`
}

// Never log a whole number. A log line is read by more people than the
// message ever was, and a phone number identifies a person.
export function maskPhone(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (digits.length <= 4) return digits ? `****${digits}` : '****'
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`
}

// ── message length ─────────────────────────────────────────────────────────

export function hasNonGsmCharacters(message) {
  // Anything outside the Latin-1 range forces UCS-2 — emoji above all.
  // eslint-disable-next-line no-control-regex
  return /[^\u0000-ÿ]/.test(String(message ?? ''))
}

export function messageFitsOneSegment(message) {
  const text = String(message ?? '')
  return !hasNonGsmCharacters(text) && text.length <= SINGLE_SEGMENT_CHARS
}

// ── which provider ─────────────────────────────────────────────────────────

function readProvider(value, fallback) {
  const wanted = String(value ?? '').trim().toLowerCase()
  return PROVIDERS.includes(wanted) ? wanted : fallback
}

// Semaphore unless somebody has said otherwise, in writing, on the server.
//
// SOS has its own setting and its own default. An emergency alert is not a
// place to debut a provider nobody has watched for a month, so it stays on
// the one with a delivery history even after OTPs have moved.
export function chooseProvider({ purpose, env = {} }) {
  const primary =
    purpose === 'sos'
      ? readProvider(env.SOS_SMS_PROVIDER, 'semaphore')
      : readProvider(env.SMS_PROVIDER, 'semaphore')
  const fallbackRaw = String(env.SMS_FALLBACK_PROVIDER ?? '').trim().toLowerCase()
  const fallback = PROVIDERS.includes(fallbackRaw) && fallbackRaw !== primary ? fallbackRaw : null
  return { primary, fallback }
}

export function providerHasKey(provider, env = {}) {
  if (provider === 'semaphore') return !!env.SEMAPHORE_API_KEY
  if (provider === 'philsms') return !!env.PHILSMS_API_KEY
  if (provider === 'unisms') return !!env.UNISMS_API_KEY
  return false
}

// A launch that is misconfigured must not be a launch with no OTPs.
//
// If the chosen provider has no key, say so loudly in the server log and
// carry the message on Semaphore, which has one. Falling back silently would
// hide the mistake until somebody noticed the bill was zero; refusing to send
// would lock every user out of their account over a typo in a dashboard.
export function resolvePrimary({ purpose, env = {}, log = console }) {
  const { primary, fallback } = chooseProvider({ purpose, env })
  if (providerHasKey(primary, env)) return { provider: primary, fallback, substituted: false }

  if (primary !== 'semaphore' && providerHasKey('semaphore', env)) {
    log.error?.(
      `[sms] ${primary.toUpperCase()}_API_KEY is not set but SMS_PROVIDER selects it — falling back to Semaphore. Set the key or change the provider.`,
    )
    return { provider: 'semaphore', fallback: null, substituted: true }
  }
  // Nothing is configured. The caller reports this honestly rather than
  // pretending to have sent something.
  return { provider: primary, fallback, substituted: false, missingKey: true }
}

// ── adapters ───────────────────────────────────────────────────────────────
// Each returns { ok, detail } and throws only on a transport failure.

// Unchanged from what the three call sites were doing, deliberately: same
// endpoint, same JSON, same optional sendername. The priority route is the
// documented twin of /messages — identical fields and response, 2 credits
// instead of 1, and not rate limited. Worth it for an emergency, which is
// why it is opt-in per purpose rather than on for everything.
async function sendViaSemaphore({ to, message, env, fetchImpl, signal, priority }) {
  const endpoint = priority
    ? 'https://api.semaphore.co/api/v4/priority'
    : 'https://api.semaphore.co/api/v4/messages'
  const senderName = env.SEMAPHORE_SENDER_NAME ?? ''
  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apikey: env.SEMAPHORE_API_KEY,
      number: digitsOnly(to),
      message,
      ...(senderName ? { sendername: senderName } : {}),
    }),
    signal,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    return { ok: false, detail: (data && (data.message || JSON.stringify(data))) || res.statusText }
  }
  return { ok: true, detail: null }
}

// PhilSMS answers 200 with {"status":"error"} for some rejections, so the
// body decides, not the HTTP code. Wants the number without a plus.
async function sendViaPhilSms({ to, message, env, fetchImpl, signal }) {
  const res = await fetchImpl('https://app.philsms.com/api/v3/sms/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.PHILSMS_API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      recipient: toPhilippineE164Digits(to),
      sender_id: env.PHILSMS_SENDER_ID ?? '',
      type: 'plain',
      message,
    }),
    signal,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    return { ok: false, detail: (data && (data.message || JSON.stringify(data))) || res.statusText }
  }
  if (data && String(data.status).toLowerCase() === 'error') {
    return { ok: false, detail: data.message || 'PhilSMS reported an error.' }
  }
  return { ok: true, detail: null }
}

// UniSMS authenticates with the secret as a Basic username and no password,
// wants E.164 with the plus, and calls the body `content`. 201 on success,
// with the message status in the body.
async function sendViaUniSms({ to, message, env, fetchImpl, signal }) {
  const basic = Buffer.from(`${env.UNISMS_API_KEY}:`).toString('base64')
  const res = await fetchImpl('https://unismsapi.com/api/sms', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      recipient: toE164(to),
      content: message,
      sender_id: env.UNISMS_SENDER_ID ?? '',
    }),
    signal,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const detail =
      (data && (data.message || data.error || data.detail || JSON.stringify(data))) || res.statusText
    return { ok: false, detail }
  }
  const status = data?.message?.status
  if (status && String(status).toLowerCase() === 'failed') {
    return { ok: false, detail: data.message.fail_reason || 'UniSMS reported a failed message.' }
  }
  return { ok: true, detail: null }
}

const ADAPTERS = {
  semaphore: sendViaSemaphore,
  philsms: sendViaPhilSms,
  unisms: sendViaUniSms,
}

async function attempt({ provider, to, message, env, fetchImpl, timeoutMs, priority }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await ADAPTERS[provider]({
      to,
      message,
      env,
      fetchImpl,
      signal: controller.signal,
      priority,
    })
  } catch (err) {
    // A timeout and a dead socket are the same thing to the caller: the
    // message was not accepted, so the fallback may try.
    const aborted = err?.name === 'AbortError'
    return { ok: false, detail: aborted ? `No response within ${timeoutMs}ms.` : err?.message || String(err) }
  } finally {
    clearTimeout(timer)
  }
}

// Send one message. Returns { ok, provider, usedFallback, error }.
//
// The fallback runs only when the primary never accepted the message. Once a
// provider has taken it, a second send would mean a second code arriving on
// the same phone, and the user cannot tell which one the server will believe
// — so an accepted-but-undelivered message is left as it is.
export async function sendSms(
  { to, message, purpose = 'otp' },
  { env = process.env, fetchImpl = fetch, log = console, timeoutMs = DEFAULT_TIMEOUT_MS } = {},
) {
  const masked = maskPhone(to)
  const resolved = resolvePrimary({ purpose, env, log })

  if (resolved.missingKey) {
    log.error?.(`[sms] no API key configured for ${resolved.provider} — cannot send ${purpose} to ${masked}`)
    return { ok: false, provider: resolved.provider, usedFallback: false, error: 'SMS is not configured.' }
  }

  if (!messageFitsOneSegment(message)) {
    // Not refused — a long emergency text must still go. Said out loud,
    // because it is billed as two and nobody sees that until the invoice.
    log.warn?.(
      `[sms] ${purpose} message is longer than one segment (${String(message).length} chars${
        hasNonGsmCharacters(message) ? ', contains non-GSM characters' : ''
      }) — this will be billed as more than one SMS`,
    )
  }

  const priority = purpose === 'sos' && String(env.SEMAPHORE_SOS_PRIORITY ?? '').toLowerCase() === 'true'

  const first = await attempt({
    provider: resolved.provider,
    to,
    message,
    env,
    fetchImpl,
    timeoutMs,
    priority,
  })

  if (first.ok) {
    log.info?.(`[sms] ${purpose} via ${resolved.provider} to ${masked}: sent`)
    return { ok: true, provider: resolved.provider, usedFallback: false, error: null }
  }

  log.error?.(`[sms] ${purpose} via ${resolved.provider} to ${masked}: failed — ${first.detail}`)

  const fallback = resolved.fallback
  if (!fallback || !providerHasKey(fallback, env)) {
    if (fallback) {
      log.error?.(`[sms] fallback ${fallback} is set but has no API key — not attempted`)
    }
    return { ok: false, provider: resolved.provider, usedFallback: false, error: first.detail }
  }

  const second = await attempt({ provider: fallback, to, message, env, fetchImpl, timeoutMs, priority })
  if (second.ok) {
    log.info?.(`[sms] ${purpose} via ${fallback} to ${masked}: sent (fallback)`)
    return { ok: true, provider: fallback, usedFallback: true, error: null }
  }

  log.error?.(`[sms] ${purpose} via ${fallback} to ${masked}: failed (fallback) — ${second.detail}`)
  return { ok: false, provider: fallback, usedFallback: true, error: second.detail }
}
