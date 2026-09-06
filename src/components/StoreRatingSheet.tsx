import { useState } from 'react'
import { StarRating } from './StarRating'
import type { Pharmacy, StoreReview } from '../types'

// Average and count from the reviews themselves — see Pharmacy.storeReviews.
export function storeRatingSummary(pharmacy: Pharmacy): { average: number; count: number } {
  const reviews = pharmacy.storeReviews ?? []
  if (reviews.length === 0) return { average: 0, count: 0 }
  const total = reviews.reduce((sum, r) => sum + r.rating, 0)
  return { average: Math.round((total / reviews.length) * 10) / 10, count: reviews.length }
}

// "Rate this store" — the same modal shape as ShareSheet/ContactSheet.
// Stars first, a line of text if they want, and the latest reviews under
// it so a customer sees what others said before adding their own.
export function StoreRatingSheet({
  pharmacy,
  existing,
  onSubmit,
  onClose,
}: {
  pharmacy: Pharmacy
  // This customer's earlier review, if any — shown pre-filled so "rate
  // again" reads as editing, not as a second vote.
  existing: StoreReview | null
  onSubmit: (rating: number, text: string | null) => void
  onClose: () => void
}) {
  const [rating, setRating] = useState(existing?.rating ?? 0)
  const [text, setText] = useState(existing?.text ?? '')
  const { average, count } = storeRatingSummary(pharmacy)
  const others = (pharmacy.storeReviews ?? []).filter((r) => r.customerId !== existing?.customerId).slice(0, 5)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Rate this store"
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-3 sm:items-center"
      onClick={onClose}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-center text-sm font-bold text-navy-900">⭐ Rate {pharmacy.name}</p>
        <p className="mt-0.5 text-center text-[11px] text-slate-500">
          {count > 0 ? `★ ${average.toFixed(1)} from ${count} ${count === 1 ? 'rating' : 'ratings'}` : 'Be the first to rate this store.'}
        </p>
        <div className="mt-3 flex justify-center">
          <StarRating value={rating} onChange={setRating} />
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="What was good? What could be better? (optional)"
          className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={rating === 0}
          onClick={() => {
            onSubmit(rating, text.trim() || null)
            onClose()
          }}
          className="mt-2 w-full rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {existing ? 'Update my rating' : 'Submit rating'}
        </button>
        {others.length > 0 && (
          <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-2">
            {others.map((r) => (
              <div key={r.customerId} className="text-xs">
                <p className="text-slate-700">
                  <span className="text-amber-500">{'★'.repeat(r.rating)}</span>
                  <span className="text-slate-300">{'★'.repeat(5 - r.rating)}</span>{' '}
                  <span className="font-medium">{r.customerName}</span>
                </p>
                {r.text && <p className="text-[11px] text-slate-500">{r.text}</p>}
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full py-1.5 text-center text-xs font-semibold text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
