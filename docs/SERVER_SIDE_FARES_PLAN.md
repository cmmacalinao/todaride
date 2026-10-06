# Moving fare and fee calculation off the phone

**Status: plan only. Nothing in this document is implemented.**

Today the phone decides what a ride costs. `RideContext`'s `ACKNOWLEDGE_RIDE_PAYMENT`
computes `earnedFare`, `platformFee`, `todaCommission` and `driverPayout`, calls
`marketingSplit` for the four-way fee split, and writes the whole `payment`
record into shared state. Supabase stores what the client sends.

That is fine while every phone runs code we shipped and nobody has a reason to
lie. It stops being fine the moment money is real: the fee is the platform's
revenue, the split pays third parties, and the device that computes it belongs
to one of the parties.

## What changes

On completion the client posts *facts* — ride id, who drove, distance and
duration actually travelled, the route, COD details — and the server replies
with the finished `payment`. The client displays it and stores what came back.
It computes nothing.

The server recomputes the fare from the tariffs it holds, applies the same fee
rules, and writes the payment row itself.

## Where it goes

Two options, and they are not equally good.

**Netlify function** (`netlify/functions/complete-ride.mjs`). Matches what is
already there — `send-sos-sms.mjs`, `maya-checkout.mjs` — same deploy, same
secrets, same CORS helper. The weakness is that it is only as authoritative as
the client's willingness to call it: a modified client could still write a
payment row straight to Supabase.

**Supabase RPC + row-level security.** A `complete_ride(...)` function, with
RLS forbidding direct writes to `payment` fields. This is the one that actually
closes the hole, because then there is no path to a payment row that does not
go through the function. It costs more: the fee rules have to exist in SQL or
in a Postgres function, which means they exist twice.

**Recommendation: Netlify function first, RLS second.** The function is a day's
work and moves the computation; the RLS is what makes it binding. Doing the
first alone is worth it — it gets the arithmetic to one place — but it should
be understood as a refactor, not yet a control.

## Keeping one source of truth for the rules

The fee split must not be written twice. `lib/marketingProgram.ts`,
`lib/todaBilling.ts` and `lib/businessPhase.ts` are already pure and have no
React or DOM imports, so a Netlify function can import them directly:

```js
import { marketingSplit } from '../../src/lib/marketingProgram.ts'
```

This is the main argument for the Netlify route. If the logic moves to SQL it
has to be reimplemented, and two implementations of a money rule will drift —
the only question is when.

## Affected files

| File | Change |
|---|---|
| `src/context/RideContext.tsx` | `ACKNOWLEDGE_RIDE_PAYMENT` stops computing; it calls the endpoint and stores the reply. The biggest change by far. |
| `src/lib/completeRideApi.ts` | New. Same shape as `sosSmsApi.ts` — `PILOT_ORIGIN` for the native app, relative path on the web. |
| `netlify/functions/complete-ride.mjs` | New. Recomputes and writes. |
| `server/index.js` | Dev equivalent, as it already does for OTP and SOS. |
| `src/lib/marketingProgram.ts`, `todaBilling.ts`, `businessPhase.ts` | Unchanged — imported by both sides. |
| `src/lib/fares.ts` / tariff lookup | Must be callable server-side: no `import.meta.env`, no browser globals. |
| `src/types/index.ts` | `Payment` gains `computedBy: 'client' \| 'server'` and `computedAt`, so a row's provenance is visible. |
| `src/components/TripMonitor.tsx`, `DriverEarnings`, receipts | Display only; they already read `ride.payment`. |

## Migration

No destructive migration is needed, which is the good news.

1. `payment.computedBy` is optional. Absent means a client-computed row from
   before the change. Nothing is rewritten — old rides keep what they recorded,
   exactly as the Rotary share already does.
2. Tariffs, `commissionPerRide`, `rotaryShareSettings`, `businessPhase` and each
   TODA's `billingMode` must be readable by the server. They are already in the
   shared state Supabase holds; the function reads them rather than trusting the
   client to send them. **Anything the client sends that the server could look up
   itself is an attack surface.**
3. If the RLS step is taken, `payment` columns become writable only by the
   function's role. That one *is* a migration and needs a window, because an old
   client in somebody's pocket will start failing to write.

## Reusing the tests

The existing tests are the reason this is tractable. `marketingProgram.test.ts`,
`todaBilling.test.ts`, `businessPhase.test.ts` and `feeReport.test.ts` test pure
functions with no React, so they keep passing unchanged and now cover the server
path too — the same functions, called from somewhere else.

What needs adding:

- A contract test: given a fixed ride, the server's reply equals what the client
  would have computed. Run it against the dev server during the dual-write phase
  below; it is the thing that catches a drift before a passenger does.
- Endpoint tests for the failure paths: unknown ride, already-paid ride, a ride
  whose driver has since changed TODA.

## Rollout

1. **Shadow.** Deploy the function. The client still computes and writes as now,
   but also calls the endpoint and logs any mismatch. Change nothing on the
   strength of this until the log is quiet for a week of real rides.
2. **Server authoritative, client fallback.** The client uses the server's answer
   and falls back to its own only when the call fails. A ride must never be
   un-completable because a function is down — the driver is standing at the
   roadside.
3. **Server only.** Remove the fallback. Add `computedBy: 'server'`.
4. **RLS.** Only after step 3 has run for a month and no client is still falling
   back.

## Risks

- **Offline completion.** The driver finishes a trip in a dead spot. Today it
  completes locally. A server-only path cannot, so step 2's fallback has to
  survive as a queued retry, and a queued completion must be idempotent — the
  function must reject a second completion for the same ride id rather than
  paying the partner twice.
- **Two implementations.** Only if the SQL route is taken. Avoidable by importing
  the TypeScript.
- **A new single point of failure.** Rides cannot complete if the function is
  down. Mitigated by step 2 and by the retry queue.
- **Latency at the worst moment.** Completion is when the passenger is getting out.
  The payment screen must not wait on a round trip; it should show the fare it
  expects and reconcile, the way the Maya flow already reads its status back.
- **Clock skew.** `referralActive` is time-based. Use the server's clock, or a
  recruit whose window closed yesterday pays out on a phone whose date is wrong.
- **Stale settings.** The function must read `businessPhase` and `billingMode` at
  completion, not from what the client cached at booking. A TODA that moved to a
  flat plan mid-trip should get the flat-plan answer.

## What this does not fix

The fare still depends on distance the phone reported. Moving the arithmetic
server-side does not make the odometer honest — that needs the route check
already in `lib/stuckTrip.ts` and `reroute.ts` applied server-side too, which is
a separate piece of work and a bigger one.
