import { useState } from 'react'
import { useRides } from '../context/RideContext'
import type { Passenger } from '../types'
import {
  FAMILY_PLAN_FREE_MONTHS,
  FAMILY_PLAN_MONTHLY_PRICE,
  FAMILY_TERMS,
  FAMILY_TERMS_VERSION,
} from '../lib/familyTerms'

// Family Plan activation (2026-09-23): the one screen between the Family tile
// and the Family page. The account holder reads the Family Plan Terms, ticks
// the three confirmations, signs with their full name, and activates — the
// free year starts then. Until that, the Family page's features stay locked.

export function familyPlanActive(p: Passenger, passengers: Passenger[]): boolean {
  // A member who joined through an invite is covered by the owner's plan.
  if (p.familyOwnerId) {
    const owner = passengers.find((o) => o.id === p.familyOwnerId)
    return !!owner?.familyPlan && owner.familyPlan.termsVersion === FAMILY_TERMS_VERSION
  }
  return !!p.familyPlan && p.familyPlan.termsVersion === FAMILY_TERMS_VERSION
}

function addMonths(d: Date, months: number): Date {
  const x = new Date(d)
  x.setMonth(x.getMonth() + months)
  return x
}

export const formatPlanDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })

export function FamilyTermsText() {
  return (
    <div className="space-y-2 text-[11px] leading-snug text-slate-700">
      <p className="font-bold text-slate-900">TODA Ride Mobility — Family Plan Terms and Conditions</p>
      <p className="text-slate-500">Version {FAMILY_TERMS_VERSION}</p>
      {FAMILY_TERMS.map((s) => (
        <div key={s.title}>
          <p className="font-semibold text-slate-900">{s.title}</p>
          {s.body.map((b, i) => (
            <p key={i} className="mt-0.5">
              {b}
            </p>
          ))}
        </div>
      ))}
    </div>
  )
}

export function FamilyActivation({ passenger }: { passenger: Passenger }) {
  const { activateFamilyPlan, familyPromoDeadline } = useRides()
  // The promo's last day, set by Super Admin. Activating after it gets no
  // free year — and there is no paid plan to take instead yet.
  const promoEnds = new Date(`${familyPromoDeadline}T23:59:59+08:00`)
  const promoOpen = Date.now() <= promoEnds.getTime()
  const [adult, setAdult] = useState(false)
  const [terms, setTerms] = useState(false)
  const [childData, setChildData] = useState(false)
  const [signedName, setSignedName] = useState('')
  const [readAll, setReadAll] = useState(false)
  const renewing = !!passenger.familyPlan && passenger.familyPlan.termsVersion !== FAMILY_TERMS_VERSION
  const freeUntil = addMonths(new Date(), FAMILY_PLAN_FREE_MONTHS)
  const canActivate = (promoOpen || renewing) && adult && terms && childData && signedName.trim().length >= 3

  function activate() {
    if (!canActivate) return
    const now = new Date()
    activateFamilyPlan(passenger.id, {
      // A renewal of the terms keeps the free year that already started.
      activatedAt: passenger.familyPlan?.activatedAt ?? now.toISOString(),
      freeUntil: passenger.familyPlan?.freeUntil ?? addMonths(now, FAMILY_PLAN_FREE_MONTHS).toISOString(),
      termsVersion: FAMILY_TERMS_VERSION,
      signedName: signedName.trim(),
      confirmedAdultGuardian: adult,
      acceptedTerms: terms,
      consentedChildData: childData,
    })
    window.scrollTo({ top: 0 })
  }

  const box = (checked: boolean, set: (v: boolean) => void, text: React.ReactNode) => (
    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white p-2 text-[11px] leading-snug text-slate-700">
      <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600" />
      <span>{text}</span>
    </label>
  )

  return (
    <div className="space-y-2">
      <section className="rounded-xl border border-gold-400 bg-amber-50 p-3 shadow-sm">
        <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
          👨‍👩‍👧 Family Plan
          <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">1-year free promo</span>
        </p>
        <p className="mt-1 text-sm font-extrabold uppercase leading-tight text-red-700">Protect your family. Save ₱6,000.</p>
        <p className="mt-1 text-xs text-slate-700">
          {renewing
            ? 'The Family Plan Terms have been updated. Please read and accept them to keep using the Family Plan.'
            : `Activate now and the ₱${FAMILY_PLAN_MONTHLY_PRICE}/month Family Plan is FREE until ${formatPlanDate(freeUntil.toISOString())}.`}
        </p>
        <ul className="mt-1.5 space-y-0.5 text-[11px] text-slate-700">
          <li>🛺 Book rides for your family, one stop or several (school runs)</li>
          <li>📍 Follow their trips live · 💬 chat with the driver</li>
          <li>⭐ Your own trusted drivers get your family's requests first</li>
          <li>🔒 Children can use the app only through your family</li>
        </ul>
        {!renewing && (
          <p className={`mt-1.5 rounded-md px-2 py-1 text-[11px] font-bold ${promoOpen ? 'bg-red-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
            {promoOpen
              ? `Sign up now — promo ends ${formatPlanDate(promoEnds.toISOString())}!`
              : `The free promo ended on ${formatPlanDate(promoEnds.toISOString())}. The paid Family Plan is coming soon.`}
          </p>
        )}
        <p className="mt-1.5 text-[10px] text-slate-500">Nothing is charged automatically when the free year ends.</p>
      </section>

      <section className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
        <p className="text-xs font-bold text-slate-900">Terms and Conditions</p>
        <div className={`overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2 ${readAll ? 'max-h-none' : 'max-h-48'}`}>
          <FamilyTermsText />
        </div>
        <button type="button" onClick={() => setReadAll((v) => !v)} className="text-[11px] font-semibold text-brand-700 hover:underline">
          {readAll ? 'Show less' : 'Show the full terms'}
        </button>
        {box(
          adult,
          setAdult,
          <>
            I am <span className="font-semibold">18 or older</span>, and I am the <span className="font-semibold">parent or legal guardian</span> — or
            an adult authorized by them — of every minor I add to my family.
          </>,
        )}
        {box(
          terms,
          setTerms,
          <>
            I have read and agree to the <span className="font-semibold">Family Plan Terms and Conditions</span>, including the rules for children
            riding (inside the sidecar, never back-ride) and my responsibility for their trips.
          </>,
        )}
        {box(
          childData,
          setChildData,
          <>
            As their parent or guardian, I <span className="font-semibold">consent</span> to the processing of my family members' personal data —
            including minors' trip records and live location during rides — for their safety, under the Data Privacy Act of 2012 (RA 10173).
          </>,
        )}
        <label className="block text-[11px] font-semibold text-slate-700">
          Type your full name to sign
          <input
            value={signedName}
            onChange={(e) => setSignedName(e.target.value)}
            placeholder={passenger.name}
            className="compact-input mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm font-normal"
          />
        </label>
        <button
          type="button"
          onClick={activate}
          disabled={!canActivate}
          className="w-full rounded-xl bg-brand-600 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
        >
          {canActivate
            ? renewing
              ? 'Accept the updated terms'
              : 'Activate Family Plan — FREE for 1 year'
            : !promoOpen && !renewing
              ? 'The free promo has ended'
              : 'Tick the three boxes and sign to activate'}
        </button>
        <p className="text-center text-[10px] text-slate-400">
          Your acceptance is saved with the date and this version of the terms.
        </p>
      </section>
    </div>
  )
}
