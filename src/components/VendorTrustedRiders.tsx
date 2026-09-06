import { useState } from 'react'
import { useRides } from '../context/RideContext'
import type { Pharmacy } from '../types'

// "Send this delivery to…" — a pick among the vendor's trusted riders for
// one particular delivery, used on the booking form and on an app order's
// dispatch card. "Any available rider" leaves it to dispatch (which still
// tries the first trusted rider on duty before the terminal queue). Riders
// who are off duty stay listed but disabled: a delivery sent to someone
// who is not working just sits there until the offer times out.
export function TrustedRiderSelect({
  vendor,
  value,
  onChange,
}: {
  vendor: Pharmacy
  value: string | null
  onChange: (driverId: string | null) => void
}) {
  const { drivers } = useRides()
  const trusted = (vendor.trustedDriverIds ?? [])
    .map((id) => drivers.find((d) => d.id === id))
    .filter((d): d is NonNullable<typeof d> => !!d && d.verificationStatus === 'approved')
    .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name))

  if (trusted.length === 0) {
    return (
      <p className="text-[11px] text-slate-400">
        Send to any available rider. Add riders under <span className="font-semibold">Trusted Rider</span> to pick one
        here.
      </p>
    )
  }
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500">Send this delivery to</label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
      >
        <option value="">Any available rider (trusted riders on duty first)</option>
        {trusted.map((d) => (
          <option key={d.id} value={d.id} disabled={!d.online}>
            {d.online ? '🟢' : '⚪'} {d.name} · {d.plateNumber}
            {d.online ? '' : ' (off duty)'}
          </option>
        ))}
      </select>
    </div>
  )
}

// The vendor's pick of who carries their food. A starred driver who is on
// duty is offered every delivery from this store first (see
// buildMedsDeliveryRide) — the terminal queue only gets it if they pass or
// are off. Drivers who have already delivered for this vendor are listed
// first, since those are the ones a vendor has an opinion about.
export function VendorTrustedRiders({ vendor }: { vendor: Pharmacy }) {
  const { drivers, rides, todaOrganizations, togglePharmacyTrustedDriver } = useRides()
  const [query, setQuery] = useState('')
  const trusted = new Set(vendor.trustedDriverIds ?? [])

  // How many completed deliveries each driver has done from this store.
  const deliveriesBy = new Map<string, number>()
  for (const r of rides) {
    if (r.status === 'completed' && r.driverId && r.pickup.id === vendor.id) {
      deliveriesBy.set(r.driverId, (deliveriesBy.get(r.driverId) ?? 0) + 1)
    }
  }

  const q = query.trim().toLowerCase()
  const shown = drivers
    .filter((d) => d.verificationStatus === 'approved')
    .filter((d) => !q || d.name.toLowerCase().includes(q) || d.plateNumber.toLowerCase().includes(q))
    .sort((a, b) => {
      const ta = trusted.has(a.id) ? 1 : 0
      const tb = trusted.has(b.id) ? 1 : 0
      if (ta !== tb) return tb - ta
      const da = deliveriesBy.get(a.id) ?? 0
      const db = deliveriesBy.get(b.id) ?? 0
      if (da !== db) return db - da
      return a.name.localeCompare(b.name)
    })

  return (
    <div>
      <p className="text-xs text-slate-500">
        Starred riders get the first offer on every delivery from your store while they're on duty. Tap ★ to add or
        remove one.
      </p>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search riders by name or plate"
        className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      {shown.length === 0 && <p className="mt-2 text-sm text-slate-400">No riders match.</p>}
      <div className="mt-2 space-y-1.5">
        {shown.slice(0, 30).map((d) => {
          const isTrusted = trusted.has(d.id)
          const n = deliveriesBy.get(d.id) ?? 0
          const toda = d.todaOrgId ? todaOrganizations.find((o) => o.id === d.todaOrgId) : null
          return (
            <div
              key={d.id}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs ${
                isTrusted ? 'border-amber-300 bg-amber-50' : 'border-slate-200'
              }`}
            >
              <span
                aria-hidden
                title={d.online ? 'On duty' : 'Off duty'}
                className={`h-2 w-2 shrink-0 rounded-full ${d.online ? 'bg-emerald-500' : 'bg-slate-300'}`}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-700">
                  🛺 {d.name} <span className="font-normal text-slate-400">· {d.plateNumber}</span>
                </p>
                <p className="truncate text-[11px] text-slate-400">
                  {toda ? `${toda.name} · ` : 'Freelance · '}
                  {d.rating > 0 ? `★ ${d.rating.toFixed(1)} · ` : ''}
                  {n > 0 ? `${n} ${n === 1 ? 'delivery' : 'deliveries'} for you` : 'no deliveries for you yet'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => togglePharmacyTrustedDriver(vendor.id, d.id)}
                aria-pressed={isTrusted}
                title={isTrusted ? 'Remove from trusted riders' : 'Add to trusted riders'}
                className={`shrink-0 rounded-md border px-2 py-1 text-[11px] font-semibold ${
                  isTrusted
                    ? 'border-amber-300 bg-white text-amber-600 hover:bg-amber-100'
                    : 'border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100'
                }`}
              >
                {isTrusted ? '★ Trusted · remove' : '＋ Add'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
