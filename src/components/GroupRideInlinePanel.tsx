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
  stopNumbers,
  paySplit,
  onPaySplitChange,
  fares,
  totalFare,
  maxRiders,
  hasActiveRide,
}: {
  riders: GroupRiderEntry[]
  onAddRider: () => void
  onRemoveRider: (key: string) => void
  onUpdateRider: (key: string, patch: Partial<GroupRiderEntry>) => void
  onPickDestination: (key: string) => void
  pickingForRiderKey: string | null
  // Each rider's place in the drop-off order (1 = first off), for the ones
  // with a destination — see dropOffOrder.
  stopNumbers: Record<string, number>
  paySplit: 'separate' | 'booker'
  onPaySplitChange: (split: 'separate' | 'booker') => void
  fares: (number | null)[]
  totalFare: number | null
  maxRiders: number
  hasActiveRide: boolean
  canSubmit?: boolean
  onSubmit?: () => void
  submitting?: boolean
}) {
  // Each rider's stop wears the same light, see-through green as Where to
  // and Set Destination here — it is a destination too, so it reads as one.
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
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
                {/* The same number the rider's flag carries on the map: the order
                    the tricycle drops everyone off in, nearest first. */}
                {stopNumbers[rider.key] != null && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-[11px] font-bold text-white">
                    {stopNumbers[rider.key]}
                  </span>
                )}
                {rider.isGuest ? `Rider ${i + 1}` : 'You'}
              </span>
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
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-green-500/40 bg-green-500/15 px-2.5 py-1.5 text-left"
              >
                <span className="min-w-0 truncate text-sm font-semibold text-green-900">
                  {formatAddressLine(rider.destination.label)}
                </span>
                <span className="shrink-0 text-[11px] text-green-800/80">Change</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onPickDestination(rider.key)}
                aria-pressed={pickingForRiderKey === rider.key}
                className={`w-full rounded-lg border border-dashed px-2.5 py-1.5 text-left text-sm font-medium transition ${
                  pickingForRiderKey === rider.key
                    ? 'border-green-500/60 bg-green-500/15 text-green-900'
                    : 'border-green-500/60 text-green-700'
                }`}
              >
                {pickingForRiderKey === rider.key ? '🏁 Move the map under the pin, then Set destination' : '🏁 Set destination'}
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

      {/* No Request button here: it sits under the map's Set Destination
          here, where a single ride's Book a Ride is — see PassengerPage. */}
    </section>
  )
}
