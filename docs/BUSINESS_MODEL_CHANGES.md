# Business model changes — branch `business-model`

Branched from `origin/version5e` at `f66c1d9`. Seven commits, one per task.
Nothing deployed, nothing merged, no production command run.

**Final `npm run check`: 396 tests across 38 files, green. Typecheck clean.**
Nothing was skipped or reverted.

---

## BM-1 — Business phase switch

A Super Admin setting, `'pilot' | 'launch'`, defaulting to `pilot`. In pilot the
platform fee is ₱0, TODA and Operator monthly plans and per-booking fees are not
billed, vendor per-order fees are ₱0, and AdSense does not render.

Done as a phase rather than by zeroing the prices. A pilot that works by setting
everything to zero **loses the prices**, and whoever starts charging later has to
remember what they were. Every function takes the saved value and returns the
effective one; nothing writes. Entering pilot cannot destroy a configured price.

An unset phase reads as pilot — an install upgrading into this version must not
begin charging people because it gained a setting it has never seen.

**Files:** `src/lib/businessPhase.ts` (new), `RideContext.tsx`, `SuperAdminPage.tsx`,
`AdminPage.tsx`, `TodaAdminPage.tsx`, `GoogleAdSlot.tsx`, `VendorEarnings.tsx`
**Tests:** `businessPhase.test.ts` — 9

---

## BM-2 — AdSense on the landing page only

Passenger, driver and parent placements removed from the component and the
settings UI.

**Worth knowing: none of them was ever rendered.** `GoogleAdSlot` had no call
site anywhere in the app, so these were five slot ids an admin could fill in that
would never have shown an ad.

The five keys stay in `AdSensePlacementSlots` as optional rather than deleted, so
stored settings keep parsing and a saved slot id is not silently thrown away.
Advertiser and BannerAd untouched.

**Files:** `types/index.ts`, `GoogleAdSlot.tsx`, `IncomePromotionSettingsSection.tsx`
**Tests:** none added — this removes a surface rather than adding behaviour.

---

## BM-3 — Payments straight to drivers

Super Admin switch "Online fare collection via platform merchant account", **off
by default**. Off: cash, or the driver's own GCash/Maya shown with name, number
and QR. On: Maya Checkout exactly as before. Maya functions untouched.

The driver's wallet appears beside cash rather than as a third "method", because
the outcome is the same — the driver is paid directly and confirms it. The screen
says "the app does not handle this money", since claiming to have processed a
payment we never saw would be the wrong thing to tell either party in a dispute.

**Files:** `RidePaymentForm.tsx`, `PassengerPage.tsx`, `RideContext.tsx`, `SuperAdminPage.tsx`
**Tests:** none added — the logic is a single boolean gate; the behaviour is UI.

---

## BM-4 — TODA billing mode

`billingMode` on `TodaOrganization`, `'per_ride'` (default) or `'flat_plan'`.
Per ride: drivers pay the fee, the TODA owes no plan. Flat plan: the TODA pays
its plan, its drivers' rides carry no fee.

Why it needed preventing: on a double-billed statement **neither number is wrong
on its own**, so nobody notices.

**A consequence, tested rather than patched around:** a flat-plan TODA's rides
generate no partner commission, no TODA referral reward and no Rotary share. All
three are shares *of the fee*, and a ride with no fee has nothing to share. The
test exists so a later reader does not mistake it for a bug.

The fee report gained a **fee-free rides** column so a low gross reads as
explained rather than as lost revenue. Admin MRR counts only flat-plan TODAs.
App Admin only; each change is logged.

**Files:** `src/lib/todaBilling.ts` (new), `types/index.ts`, `RideContext.tsx`,
`AdminPage.tsx`, `feeReport.ts`
**Tests:** `todaBilling.test.ts` — 9; `feeReport.test.ts` +1

---

## BM-5 — Prices as settings

Family Plan monthly price and free months, and the order service and delivery
fees, are now settings with the old constants as defaults.

`DEFAULT_PABILI_SERVICE_FEE` **was already a setting** (`pabiliServiceFee`,
Admin-adjustable), so it was left where it is rather than duplicated.

The Family Plan terms now quote the prices in force. Terms naming a price nobody
charges are worse than no terms, and this is the document a family agrees to.

"Applies to new orders and activations only" is a property of the records, not a
rule added here: an order stores the fees it was quoted, a plan stores the terms
version and free-until date it was activated under.

Negative prices are refused; free months round to whole months; zero is allowed
as a real decision.

**Files:** `src/lib/pricing.ts` (new), `familyTerms.ts`, `types/index.ts`,
`RideContext.tsx`, `FamilyActivation.tsx`, `VendorMenuBooking.tsx`, `SuperAdminPage.tsx`
**Tests:** `pricing.test.ts` — 10

---

## BM-6 — Operating costs and break-even

Monthly cost lines, with total cost, GreenTech net per fee-paying ride, rides
needed, rides this month, and the gap. Second sheet in the existing workbook.

Net per ride is **measured, not assumed** — the mix moves it: mostly-unreferred
months net ₱2.50 a ride, mostly-referred ones ₱1.50, which changes the
break-even count by two thirds.

"Not enough data" is a real answer rather than a zero. A net derived from zero
rides is an invention, so the figure is null, the UI says so, and the sheet
writes the words. Fee-free rides are excluded — they are not cheap rides, they
are rides outside the question. A net of exactly zero is distinguished from no
data at all, without dividing by zero.

**Files:** `src/lib/breakEven.ts` (new), `types/index.ts`, `RideContext.tsx`, `SuperAdminPage.tsx`
**Tests:** `breakEven.test.ts` — 11

---

## BM-7 — Server-side fares plan (document only)

`docs/SERVER_SIDE_FARES_PLAN.md`. No code.

Two conclusions worth your attention:

1. **A Netlify function and a Supabase RPC are not equivalent.** The function
   moves the arithmetic to one place — worth doing — but a modified client could
   still write a payment row directly. Only RLS forbidding direct writes closes
   that. Recommended: function first, RLS second, and don't mistake the first for
   the second.
2. **The rules must not be written twice.** `marketingProgram`, `todaBilling` and
   `businessPhase` are pure with no React imports, so a Netlify function can
   import them as-is. Reimplementing the split in SQL means two versions of a
   money rule, which will drift.

It also records what this would *not* fix: the fare still rests on distance the
phone reported.

---

## Decisions to confirm

1. **BM-3 default is OFF**, so no passenger is offered Maya until you turn it on.
   Intended per the brief, but it changes what a passenger sees today.
2. **BM-1 default is `pilot`**, so on first load after this branch the platform
   fee is ₱0 regardless of `commissionPerRide`. The saved value is untouched and
   returns at Launch. Confirm you want pilot as the landing state.
3. **BM-5 left `pabiliServiceFee` where it was** rather than moving it into the
   new `pricingSettings` object — it was already Admin-settable and moving it
   would have been a migration for no gain.
4. **BM-4's no-shares consequence** for flat-plan TODAs is deliberate and tested.
   If you want a flat-plan TODA's recruiters still paid, that needs a funding
   source — it cannot come from a fee that was not charged.
5. **BM-2 removed settings that never did anything.** If those placements were
   meant to render somewhere and simply never got wired, say so and they can come
   back.

## Not done

- No deploy, release, APK, `cap sync`, Netlify or Supabase command was run.
- No commits to `version5e` or `main`; no merge.
- `commissionPerRide`, the Rotary settings and the referral rules are unchanged.
