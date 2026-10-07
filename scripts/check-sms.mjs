// Check an SMS provider is actually configured, without anybody reading the
// key out loud.
//
// Setting up a provider means pasting a token into a dashboard and then
// finding out whether it worked by asking a real person to watch their phone.
// This does the finding out: it reports which providers are configured, and
// on request sends exactly one text and says which provider carried it.
//
// The key is never printed, never logged and never leaves the machine it is
// set on. What you see is a masked fingerprint — enough to tell "the right
// key is loaded" from "no key is loaded", and useless to anybody reading over
// your shoulder.
//
//   node scripts/check-sms.mjs                      # what is configured
//   node scripts/check-sms.mjs --send 09171234567   # send ONE real text
//   node scripts/check-sms.mjs --send 09171234567 --provider philsms
//   node scripts/check-sms.mjs --send 09171234567 --purpose sos
//
// Reads server/.env, so it checks the same values the dev server uses. For
// the deployed site the variables live in Netlify, and the equivalent test is
// in docs/SMS_PROVIDERS.md.

import { readFileSync } from 'node:fs'
import { chooseProvider, maskPhone, messageFitsOneSegment, PROVIDERS, providerHasKey, sendSms } from '../netlify/functions/lib/sms.mjs'

// Minimal .env reader — no dependency, and it must not choke on a value
// containing '='.
function loadEnvFile(path) {
  try {
    const out = {}
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
      if (value) out[key] = value
    }
    return out
  } catch {
    return {}
  }
}

// Enough to recognise a key, useless to steal: length and last three.
function fingerprint(value) {
  if (!value) return 'not set'
  return `set (${value.length} chars, ends ${value.slice(-3)})`
}

const env = { ...loadEnvFile('server/.env'), ...process.env }
const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? null : args[i + 1] ?? ''
}

const KEY_NAMES = {
  semaphore: ['SEMAPHORE_API_KEY', 'SEMAPHORE_SENDER_NAME'],
  philsms: ['PHILSMS_API_KEY', 'PHILSMS_SENDER_ID'],
  unisms: ['UNISMS_API_KEY', 'UNISMS_SENDER_ID'],
}

console.log('\nSMS configuration (server/.env + process env)\n')
for (const provider of PROVIDERS) {
  const [keyVar, senderVar] = KEY_NAMES[provider]
  const ready = providerHasKey(provider, env)
  console.log(`  ${ready ? '✓' : '·'} ${provider.padEnd(10)} ${keyVar}: ${fingerprint(env[keyVar])}`)
  console.log(`    ${' '.repeat(10)} ${senderVar}: ${env[senderVar] ? `"${env[senderVar]}"` : 'not set'}`)
}

const otp = chooseProvider({ purpose: 'otp', env })
const sos = chooseProvider({ purpose: 'sos', env })
console.log('')
console.log(`  Login codes    -> ${otp.primary}${otp.fallback ? ` (fallback: ${otp.fallback})` : ''}`)
console.log(
  `  Emergency SOS  -> ${sos.primary}${sos.fallback ? ` (fallback: ${sos.fallback})` : ''}${
    String(env.SEMAPHORE_SOS_PRIORITY ?? '').toLowerCase() === 'true' ? ' [priority route]' : ''
  }`,
)

// A provider named but not keyed is the mistake this script exists to catch:
// it still sends, through Semaphore, so nothing looks broken until the bill
// arrives with nothing on it.
for (const [label, choice] of [['SMS_PROVIDER', otp], ['SOS_SMS_PROVIDER', sos]]) {
  if (!providerHasKey(choice.primary, env)) {
    console.log(`\n  ⚠ ${label} selects ${choice.primary}, which has no API key.`)
    console.log('    Messages will go through Semaphore instead, and the server log will say so.')
  }
}

const to = flag('send')
if (to === null) {
  console.log('\nNothing sent. Add --send <number> to send one real text.\n')
  process.exit(0)
}

if (!to) {
  console.error('\n--send needs a phone number, e.g. --send 09171234567\n')
  process.exit(1)
}

const purpose = flag('purpose') === 'sos' ? 'sos' : 'otp'
const forced = flag('provider')
const sendEnv = forced
  ? { ...env, ...(purpose === 'sos' ? { SOS_SMS_PROVIDER: forced } : { SMS_PROVIDER: forced }) }
  : env

// Says what it is so nobody mistakes it for a real code or a real emergency.
const message =
  purpose === 'sos'
    ? 'TODA Ride Mobility test: this is a provider check, not a real emergency. Please ignore.'
    : 'TODA Ride Mobility test: provider check. No action needed.'

console.log(`\nSending one ${purpose} test to ${maskPhone(to)}...`)
console.log(`  message is ${message.length} chars — ${messageFitsOneSegment(message) ? 'one segment' : 'MORE than one segment'}`)

const result = await sendSms({ to, message, purpose }, { env: sendEnv })

console.log('')
if (result.ok) {
  console.log(`  ✓ accepted by ${result.provider}${result.usedFallback ? ' (via fallback)' : ''}`)
  console.log('    Accepted is not delivered — check the handset before calling it done.')
} else {
  console.log(`  ✗ failed via ${result.provider}${result.usedFallback ? ' (fallback also failed)' : ''}`)
  console.log(`    ${result.error}`)
  console.log('    A rejected sender ID is the most common cause; it often reads as a generic error.')
}
console.log('')
process.exit(result.ok ? 0 : 1)
