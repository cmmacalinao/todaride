import { haversineDistanceMeters } from '../lib/geo'
import { driverDispatchGps, estimateOutOfAreaBreakdown, getTerminalGps } from '../mock/data'
import type { Driver, GeoCoords, Ride, Terminal, TodaOrganization } from '../types'

export interface NearbyDriver {
  driver: Driver
  distanceMeters: number | null
  orgName: string | null
  terminalName: string | null
  busy: boolean
  // What this particular driver would cost. The trip's own fare is the same
  // whoever comes, but a driver sitting outside their TODA's area has to be
  // paid for the extra distance to get here — so the total genuinely differs
  // per driver, and a passenger choosing between them should see it.
  outOfAreaFee: number
  outOfAreaKm: number
  fare: number
}

// The drivers a passenger could actually be given, nearest first. Only
// approved, active, online members appear: showing someone who cannot come is
// worse than showing a shorter list. Drivers already on a trip stay in the
// list but marked, because "he is on a trip, I'll wait" is a decision a
// passenger is entitled to make for a driver they trust.
export function buildNearbyDrivers(
  drivers: Driver[],
  pickupGps: GeoCoords | null,
  terminals: Terminal[],
  orgs: TodaOrganization[],
  rides: Ride[],
  // The trip's base fare, before any per-driver distance charge.
  baseFare: number,
  todaRadiusKm: number,
  outOfAreaPerKm: number,
  limit = 12,
): NearbyDriver[] {
  const busyIds = new Set(
    rides
      .filter((r) => r.driverId && ['accepted', 'driver_arriving', 'ongoing'].includes(r.status))
      .map((r) => r.driverId!),
  )
  return drivers
    .filter((d) => d.verificationStatus === 'approved' && d.accessStatus === 'active' && d.online)
    .map((d) => {
      const gps = driverDispatchGps(d, terminals, orgs)
      const org = d.todaOrgId ? orgs.find((o) => o.id === d.todaOrgId) : null
      const terminal = d.homeTerminalId ? terminals.find((t) => t.id === d.homeTerminalId) : null
      const area = estimateOutOfAreaBreakdown(gps, getTerminalGps(org), todaRadiusKm, outOfAreaPerKm)
      return {
        driver: d,
        distanceMeters: gps && pickupGps ? Math.round(haversineDistanceMeters(gps, pickupGps)) : null,
        orgName: org?.name ?? null,
        terminalName: terminal?.name ?? null,
        busy: busyIds.has(d.id),
        outOfAreaFee: area.fee,
        outOfAreaKm: area.extraKm,
        fare: baseFare + area.fee,
      }
    })
    .sort((a, b) => {
      if (a.busy !== b.busy) return a.busy ? 1 : -1
      return (a.distanceMeters ?? Number.POSITIVE_INFINITY) - (b.distanceMeters ?? Number.POSITIVE_INFINITY)
    })
    .slice(0, limit)
}

function formatDistance(meters: number | null): string {
  if (meters === null) return 'Distance unknown'
  if (meters < 1000) return `${meters} m away`
  return `${(meters / 1000).toFixed(1)} km away`
}

interface NearbyDriversPickerProps {
  open: boolean
  onClose: () => void
  nearby: NearbyDriver[]
  // Chosen for this one booking; cleared after it is placed.
  requestedDriverId: string | null
  onRequestDriver: (driverId: string | null) => void
  // Saved on the account and used for every future booking.
  favoriteDriverId: string | null
  onSetFavorite: (driverId: string | null) => void
  // The fare for this trip. Shown once at the top rather than on every card,
  // because it is set by the route — it does not change with who drives it,
  // and a number repeated down a list reads as one that varies.
  estimatedFare: number
  hasDestination: boolean
}

export function NearbyDriversPicker({
  open,
  onClose,
  nearby,
  requestedDriverId,
  onRequestDriver,
  favoriteDriverId,
  onSetFavorite,
  estimatedFare,
  hasDestination,
}: NearbyDriversPickerProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Nearby drivers"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-slate-800">🛵 Drivers near you</span>
            <span className="block text-[11px] text-slate-500">
              Nearest first. Pick one for this ride, or star a driver to be offered them every time. A driver
              coming from outside the area charges for the extra distance, so the fare is on each card.
            </span>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close nearby drivers"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-lg font-bold text-slate-500 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2">
          <span className="text-[11px] font-medium text-slate-600">
            {hasDestination ? 'Fare from here' : 'Estimated fare — set a destination first'}
          </span>
          <span className="shrink-0 text-base font-bold text-slate-800">
            {hasDestination ? `₱${estimatedFare}` : '—'}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {nearby.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 px-3 py-5 text-center text-xs text-slate-400">
              No drivers online near you right now. Book anyway — the request goes to the first driver who comes
              on.
            </p>
          ) : (
            <div className="space-y-1.5">
              {nearby.map(({ driver, distanceMeters, orgName, terminalName, busy, outOfAreaFee, outOfAreaKm, fare }) => {
                const picked = requestedDriverId === driver.id
                const starred = favoriteDriverId === driver.id
                return (
                  <div
                    key={driver.id}
                    className={`rounded-lg border p-2.5 ${
                      picked ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-800">
                          {driver.name} {starred && <span title="Your favourite driver">⭐</span>}
                        </span>
                        <span className="block truncate text-[11px] text-slate-500">
                          {driver.plateNumber}
                          {driver.ratingCount > 0 && ` · ★ ${driver.rating.toFixed(1)} (${driver.ratingCount})`}
                        </span>
                        <span className="block truncate text-[10px] text-slate-400">
                          {terminalName ?? orgName ?? 'Freelance driver'}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                          📍 {formatDistance(distanceMeters)}
                        </span>
                        {hasDestination && (
                          <span
                            className={`mt-0.5 block text-sm font-bold ${
                              outOfAreaFee > 0 ? 'text-amber-700' : 'text-slate-800'
                            }`}
                          >
                            ₱{fare}
                          </span>
                        )}
                      </span>
                    </div>

                    {hasDestination && outOfAreaFee > 0 && (
                      <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-800">
                        +₱{outOfAreaFee} — coming from {outOfAreaKm.toFixed(1)} km outside the area. Nearer drivers
                        cost less.
                      </p>
                    )}

                    {busy && (
                      <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-800">
                        On a trip right now — picking them means waiting until they finish.
                      </p>
                    )}

                    <div className="mt-2 flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => onRequestDriver(picked ? null : driver.id)}
                        className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
                          picked
                            ? 'bg-brand-600 text-white hover:bg-brand-700'
                            : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {picked ? '✓ Requested for this ride' : 'Request this driver'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onSetFavorite(starred ? null : driver.id)}
                        title={starred ? 'Remove as favourite' : 'Make this driver my favourite'}
                        aria-pressed={starred}
                        className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                          starred
                            ? 'bg-gold-400 text-navy-900 hover:bg-gold-500'
                            : 'border border-slate-300 text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {starred ? '★ Favourite' : '☆ Favourite'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 px-4 py-2.5">
          {/* The difference between the two actions, said once where the
              decision is made: one is for this ride, the other is standing. */}
          <p className="text-[10px] leading-snug text-slate-500">
            <span className="font-semibold text-slate-600">Requested</span> applies to your next booking only.{' '}
            <span className="font-semibold text-slate-600">Favourite</span> is saved and gets first offer on every
            ride. Either way, if they do not answer in time the ride goes to the nearest available driver.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-2 w-full rounded-lg bg-slate-100 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
