import { useState } from 'react'

// "Clear history" for a person's own history list — passenger trips, driver
// trips, a merchant's orders. Asks first, and only ever hides: the caller
// records a cleared-at time and filters its list with isClearedFromHistory.
export function ClearHistoryControl({ message, onClear }: { message: string; onClear: () => void }) {
  const [confirming, setConfirming] = useState(false)
  if (!confirming) {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          🗑️ Clear history
        </button>
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
      <p>{message}</p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => {
            onClear()
            setConfirming(false)
          }}
          className="flex-1 rounded-lg bg-amber-600 py-1.5 font-bold text-white hover:bg-amber-700"
        >
          Clear history
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="flex-1 rounded-lg border border-slate-300 bg-white py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// Whether a finished item dropped out of the list when history was cleared:
// it was requested at or before the clear. Callers only pass finished items —
// anything still under way always shows.
export function isClearedFromHistory(requestedAt: string | null | undefined, clearedAt: string | null | undefined): boolean {
  return !!clearedAt && (requestedAt ?? '') <= clearedAt
}
