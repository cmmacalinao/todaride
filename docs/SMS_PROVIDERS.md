# SMS providers

Every text this app sends — login codes and emergency alerts — goes through
one function: `sendSms({ to, message, purpose })` in
[`netlify/functions/lib/sms.mjs`](../netlify/functions/lib/sms.mjs).

Three providers are wired: **Semaphore** (what the pilot uses today),
**PhilSMS** and **UniSMS**.

> **During the pilot, nothing changes.** With none of the new variables set,
> the request that leaves this app is the same Semaphore request it always
> was — same endpoint, same fields. PhilSMS and UniSMS are wired and idle
> until somebody sets `SMS_PROVIDER`.

## Environment variables

All read on the server only. **None of these ever reach the browser.**

| Variable | Values | Default | What it does |
| --- | --- | --- | --- |
| `SMS_PROVIDER` | `semaphore` \| `philsms` \| `unisms` | `semaphore` | Who carries login codes |
| `SOS_SMS_PROVIDER` | same | `semaphore` | Who carries emergency alerts |
| `SMS_FALLBACK_PROVIDER` | same | *(none)* | Tried once if the primary clearly fails |
| `SEMAPHORE_SOS_PRIORITY` | `true` \| `false` | `false` | Sends SOS via Semaphore's priority route |
| `SEMAPHORE_API_KEY` | | | Existing. Still required — see below |
| `SEMAPHORE_SENDER_NAME` | | *(empty)* | Existing. Leave unset unless registered |
| `PHILSMS_API_KEY` | | | PhilSMS API token |
| `PHILSMS_SENDER_ID` | | | Registered sender ID, max 11 chars |
| `UNISMS_API_KEY` | | | UniSMS **secret** key |
| `UNISMS_SENDER_ID` | | | Registered sender ID |

**`SEMAPHORE_API_KEY` stays required even after moving providers.** It is
what every path falls back to, and it is still the test for "is sending
configured at all". Remove it and OTP and SOS both return 503.

## For launch

In Netlify → Site configuration → Environment variables:

```
SMS_PROVIDER=philsms
SMS_FALLBACK_PROVIDER=semaphore
SOS_SMS_PROVIDER=semaphore
SEMAPHORE_SOS_PRIORITY=true
PHILSMS_API_KEY=...
PHILSMS_SENDER_ID=TodaRide
```

Which is to say: login codes move to PhilSMS with Semaphore behind them, and
**emergency alerts stay on Semaphore** — on its priority route, which is not
rate limited and costs 2 credits instead of 1.

That split is deliberate. An emergency alert is not where you debut a
provider nobody has watched for a month. Move SOS only after OTP has run on
the new provider long enough that you trust it.

Redeploy after changing variables — functions read the environment at
invocation, but Netlify only applies new values to new deploys.

## How the rules work

**Choosing.** `SMS_PROVIDER` for `purpose: 'otp'`, `SOS_SMS_PROVIDER` for
`purpose: 'sos'`. An unrecognised name falls back to Semaphore rather than
failing to send.

**Missing key.** If the chosen provider has no API key, the server logs a
loud error and sends through Semaphore anyway. A misconfigured launch must
not be a launch where nobody can log in.

**Fallback.** Tried **once**, and only when the primary never accepted the
message — an error response, an auth rejection, or no answer within 8
seconds. Never after the primary has accepted it: two providers accepting
means two different codes on one phone, and the user cannot tell which one
the server will believe.

**Message length.** Providers bill per segment: 160 plain characters, or 70
if the text contains anything outside Latin-1. **One emoji doubles the cost
of every message.** Over-long messages are still sent — an emergency text has
to go — but a warning is logged.

**Logging.** Each message logs provider, purpose, success or failure, and
whether the fallback was used. Never the code, never the message body, never
an API key, and never more than the last four digits of a number.

## Testing a provider

Unit tests mock every HTTP call — `npm run check` sends no SMS.

To test a real provider, do it on a **branch deploy**, not production:

1. Set that provider's key and sender ID in Netlify, plus
   `SMS_PROVIDER=<provider>`.
2. Deploy the branch.
3. Request a login code on your own phone.
4. Read the function log (Netlify → Logs → Functions). You want a line like:
   ```
   [sms] otp via philsms to *******4567: sent
   ```
5. Check the text arrived, and that the **sender name** is what you
   registered — a wrong sender ID is the most common rejection, and the
   provider reports it as a generic failure.

For SOS, set `SOS_SMS_PROVIDER` and trigger an alert from a test account.
Check the alert is received *and* that the safety desk shows it delivered.

### Checking the fallback

Set the primary's key to something invalid and leave
`SMS_FALLBACK_PROVIDER=semaphore`. Request a code. You should receive **one**
text, and the log should read:

```
[sms] otp via philsms to *******4567: failed — Unauthenticated.
[sms] otp via semaphore to *******4567: sent (fallback)
```

Two texts means the fallback rule is broken — stop and fix it before launch.

## Switching back

Delete `SMS_PROVIDER` (or set it to `semaphore`) and redeploy. Everything
returns to the pilot behaviour immediately; no code change is involved.

If a provider fails at launch and you need the quickest possible revert,
deleting that one variable is the whole operation.

## Provider reference

Endpoints and field names below are from each provider's own documentation,
read rather than guessed. If a provider changes its API, this is the list to
re-check.

### Semaphore — <https://semaphore.co/docs>

```
POST https://api.semaphore.co/api/v4/messages     (standard)
POST https://api.semaphore.co/api/v4/priority     (priority, 2 credits)
JSON: { apikey, number, message, sendername? }
```

`number` is sent exactly as the app has it (`09171234567`). Standard is
limited to 120 calls/minute; priority is not rate limited.

### PhilSMS — <https://app.philsms.com/developers/documentation>

```
POST https://app.philsms.com/api/v3/sms/send
Authorization: Bearer <PHILSMS_API_KEY>
JSON: { recipient, sender_id, type: 'plain', message }
```

`recipient` needs the country code **without** a plus: `639171234567`.
Philippine numbers only.

**PhilSMS can answer HTTP 200 with `{"status":"error"}`.** The adapter checks
the body, not just the status code — otherwise a rejected message would be
reported as sent.

### UniSMS — <https://unismsapi.com/docs/sms>

```
POST https://unismsapi.com/api/sms
Authorization: Basic base64(<UNISMS_API_KEY>:)     ← secret as username, empty password
JSON: { recipient, content, sender_id }
```

`recipient` needs E.164 **with** the plus: `+639171234567`. Success is 201
with `message.status: "sent"`.

> **Note on the name.** There are two unrelated services called UniSMS: this
> one (`unismsapi.com`, Philippines) and a Chinese provider at
> `unisms.apistd.com`. This adapter targets the Philippine one. If you
> actually signed up with the other, the adapter needs rewriting — the auth
> scheme and fields are entirely different.
