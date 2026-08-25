import { formatAddressLine } from '../lib/addressFormat'
import type { MockLocation } from '../types'

export interface GroupRiderEntry {
  key: string
  passengerId: string
  name: string
  phone: string
  isGuest: boolean
  destination: MockLocation | null
}

// Group Ride, inline on the booking page instead of its own — every rider's
// destination is set on the SAME pickup/destination map already on screen
// (see PassengerPage's pickingForGroupRiderKey), not a second map built just
// for this panel. Tapping "Set destination" here points that shared map's
// pin-drop at this rider instead of the page's own dropoff; picking a place
// on it fills this row and switches the map back to normal.
export function GroupRideInlinePanel({
  riders,
  onAddRider,
  onRemoveRider,
  onUpdateRider,
  onPickDestination,
  pickingForRiderKey,
  paySplit,
  onPaySplitChange,
  fares,
  totalFare,
  maxRiders,
  hasActiveRide,
  canSubmit,
  onSubmit,
  submitting,
}: {
  riders: GroupRiderEntry[]
  onAddRider: () => void
  onRemoveRider: (key: string) => void
  onUpdateRider: (key: string, patch: Partial<GroupRiderEntry>) => void
  onPickDestination: (key: string) => void
  pickingForRiderKey: string | null
  paySplit: 'separate' | 'booker'
  onPaySplitChange: (split: 'separate' | 'booker') => void
  fares: (number | null)[]
  totalFare: number | null
  maxRiders: number
  hasActiveRide: boolean
  canSubmit: boolean
  onSubmit: () => void
  submitting: boolean
}) {
  return (
    <section className="space-y-2 rounded-xl border border-slate-300 bg-white p-3 shadow-sm">
      <div>
        <p className="text-sm font-bold text-slate-800">👥 Group Ride</p>
        <p className="text-[11px] text-slate-500">
          One booking, everyone's own stop — pickup above is where the whole group boards.
        </p>
      </div>

      {hasActiveRide && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          You already have a ride in progress — finish or cancel it before booking a group ride.
        </p>
      )}

      <div className="space-y-2">
        {riders.map((rider, i) => (
          <div key={rider.key} className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-slate-700">{rider.isGuest ? `Rider ${i + 1}` : 'You'}</span>
              {rider.isGuest && (
                <button
                  type="button"
                  onClick={() => onRemoveRider(rider.key)}
                  className="text-[11px] font-medium text-amber-700 hover:underline"
                >
                  Remove
                </button>
              )}
            </div>
            {rider.isGuest ? (
              <div className="mb-1.5 grid grid-cols-2 gap-1.5">
                <input
                  value={rider.name}
                  onChange={(e) => onUpdateRider(rider.key, { name: e.target.value })}
                  placeholder="Their name"
                  className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                />
                <input
                  value={rider.phone}
                  onChange={(e) => onUpdateRider(rider.key, { phone: e.target.value })}
                  placeholder="Their mobile (optional)"
                  className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                />
              </div>
            ) : (
              <p className="mb-1.5 text-sm font-semibold text-slate-800">{rider.name}</p>
            )}
            {rider.destination ? (
              <button
                type="button"
                onClick={() => onPickDestination(rider.key)}
                className="flex w-full items-center justify-between gap-2 rounded-lg bg-dest-fill px-2.5 py-1.5 text-left"
              >
                <span className="min-w-0 truncate text-sm font-semibold text-dest-text">
                  {formatAddressLine(rider.destination.label)}
                </span>
                <span className="shrink-0 text-[11px] text-dest-subtext">Change</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onPickDestination(rider.key)}
                aria-pressed={pickingForRiderKey === rider.key}
                className={`w-full rounded-lg border border-dashed px-2.5 py-1.5 text-left text-sm font-medium transition ${
                  pickingForRiderKey === rider.key
                    ? 'border-dest-accent bg-dest-fill text-dest-text'
                    : 'border-dest-accent text-dest-accent'
                }`}
              >
                {pickingForRiderKey === rider.key ? '🏁 Tap the map above to set it' : '🏁 Set destination'}
              </button>
            )}
            {fares[i] != null && (
              <p className="mt-1 text-[11px] text-slate-500">
                {paySplit === 'booker' && rider.isGuest ? 'Covered by the booker' : `Fare: ₱${fares[i]}`}
              </p>
            )}
          </div>
        ))}
      </div>

      {riders.length < maxRiders && (
        <button
          type="button"
          onClick={onAddRider}
          className="w-full rounded-lg border border-dashed border-slate-300 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          + Add another rider
        </button>
      )}

      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Payment</p>
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => onPaySplitChange('separate')}
            aria-pressed={paySplit === 'separate'}
            className={`flex w-full items-start gap-2 rounded-lg border p-2 text-left transition ${
              paySplit === 'separate' ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <span aria-hidden className="mt-0.5 text-sm">
              {paySplit === 'separate' ? '🔘' : '⚪'}
            </span>
            <span className="text-xs">
              <span className="block font-semibold text-slate-800">Bill separately</span>
              <span className="block text-slate-500">Each rider pays their own fare when they get off.</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => onPaySplitChange('booker')}
            aria-pressed={paySplit === 'booker'}
            className={`flex w-full items-start gap-2 rounded-lg border p-2 text-left transition ${
              paySplit === 'booker' ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <span aria-hidden className="mt-0.5 text-sm">
              {paySplit === 'booker' ? '🔘' : '⚪'}
            </span>
            <span className="text-xs">
              <span className="block font-semibold text-slate-800">I'll pay for everyone</span>
              <span className="block text-slate-500">
                {totalFare !== null ? `One combined fare: ₱${totalFare}` : 'One combined fare, charged to you.'}
              </span>
            </span>
          </button>
        </div>
      </div>

      <button
        type="button"
        disabled={!canSubmit || submitting}
        onClick={onSubmit}
        className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
      >
        Request Group Ride{riders.length > 1 ? ` · ${riders.length} riders` : ''}
      </button>
    </section>
  )
}
