import { useMemo, useState } from 'react'
import { useRides } from '../context/RideContext'
import {
  normalizeSlugInput,
  publicVendorUrl,
  SLUG_PROBLEM_MESSAGE,
  slugIndex,
  slugProblem,
  suggestAvailableSlug,
} from '../lib/vendorSlug'
import type { Pharmacy } from '../types'

// The store's own address, chosen by the store.
//
// A vendor hands their page out on a tarpaulin, in a Messenger reply, or
// written on a receipt — and /vendor-page/ph-1759382... cannot be written
// down or said out loud. This is the field that turns the page into
// something a customer can repeat to a neighbour.
//
// The availability check runs as they type rather than on save. Being told
// "taken" after committing to a name is how somebody ends up with
// alingnena7; being told while the cursor is still in the field is how they
// end up with the name they wanted.
export function VendorSlugEditor({ pharmacy }: { pharmacy: Pharmacy }) {
  const { pharmacies, setVendorSlug, publicBaseUrl } = useRides()
  const [draft, setDraft] = useState(pharmacy.slug ?? '')
  const [saved, setSaved] = useState(false)

  const taken = useMemo(() => slugIndex(pharmacies), [pharmacies])
  const origin = publicBaseUrl || 'https://todaridemobility.com'

  const suggestion = useMemo(
    () => suggestAvailableSlug(pharmacy.name, { takenBy: taken, vendorId: pharmacy.id, fallback: pharmacy.id }),
    [pharmacy.name, pharmacy.id, taken],
  )

  const problem = draft ? slugProblem(draft, { takenBy: taken, vendorId: pharmacy.id }) : null
  const unchanged = draft === (pharmacy.slug ?? '')
  const canSave = !!draft && !problem && !unchanged

  return (
    <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700">🔗 Your page link</h2>
      <p className="text-[11px] leading-snug text-slate-500">
        This is the address you give out — on a tarpaulin, in a message, or written on a receipt. Pick something
        short that somebody can type from memory. You can change it later, but anyone holding the old link will
        not find you.
      </p>

      <div className="flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1.5">
        <span className="shrink-0 text-xs text-slate-400">{origin.replace(/^https?:\/\//, '')}/</span>
        <input
          value={draft}
          onChange={(e) => {
            setDraft(normalizeSlugInput(e.target.value))
            setSaved(false)
          }}
          placeholder={suggestion}
          className="min-w-0 flex-1 text-sm outline-none"
          aria-label="Your page address"
        />
      </div>

      {/* Said while the cursor is still in the field, not after saving. */}
      {draft && problem && <p className="text-[11px] text-red-700">{SLUG_PROBLEM_MESSAGE[problem]}</p>}
      {draft && !problem && !unchanged && (
        <p className="text-[11px] text-brand-700">✓ Available — {publicVendorUrl(origin, draft)}</p>
      )}
      {draft && unchanged && pharmacy.slug && (
        <p className="text-[11px] text-slate-500">Your page: {publicVendorUrl(origin, pharmacy.slug)}</p>
      )}

      {!draft && suggestion && (
        <button
          type="button"
          onClick={() => setDraft(suggestion)}
          className="text-[11px] font-semibold text-brand-700 underline"
        >
          Use {suggestion}
        </button>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!canSave}
          onClick={() => {
            setVendorSlug(pharmacy.id, draft)
            setSaved(true)
          }}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-400"
        >
          Save link
        </button>
        {saved && unchanged && <span className="text-[11px] font-medium text-brand-700">✓ Saved</span>}
      </div>
    </section>
  )
}
