import { useRides } from '../context/RideContext'
import {
  DAY_SHORT,
  emptyOpeningHours,
  hasOpeningHours,
  openingHoursSummary,
  type OpeningHours,
} from '../lib/openingHours'
import type { Pharmacy } from '../types'

// Monday first, because that is how a week reads on a door. The values are
// Date.getDay() indexes, so Sunday stays 0 wherever it is drawn.
const WEEK = [1, 2, 3, 4, 5, 6, 0]

const DEFAULT_DAY = { open: '07:00', close: '19:00' }

// When a shop is open, set by the shop.
//
// The "Open now" badge on every storefront used to come from one manual
// switch. A switch is only true while somebody remembers to flip it, and
// nobody opens the app at 9pm to say they have gone home — so the badge told
// customers a shut shop was open and orders arrived at a dark store. Hours
// make it answer itself.
export function VendorHoursEditor({ pharmacy }: { pharmacy: Pharmacy }) {
  const { setVendorOpeningHours, setPharmacyOpen } = useRides()
  const hours: OpeningHours = (pharmacy.openingHours as OpeningHours) ?? emptyOpeningHours()
  const on = hasOpeningHours(hours)

  function write(next: OpeningHours) {
    setVendorOpeningHours(pharmacy.id, next.some((d) => d !== null) ? next : null)
  }

  function setDay(day: number, value: { open: string; close: string } | null) {
    const next = [...hours]
    next[day] = value
    write(next)
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-slate-700">🕒 Opening hours</h2>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
          {on
            ? 'Your page shows Open or Closed by the clock. You can still close early any time with the switch below.'
            : 'Not set — your page says whatever the switch below says, until somebody remembers to change it.'}
        </p>
      </div>

      {/* The manual switch stays, and keeps its own line, because it is the
          one a shop reaches for when the rice runs out at 2pm. It can only
          close: being open is a promise someone has to be there to keep. */}
      <label className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
        <span className="text-xs font-medium text-slate-700">
          {pharmacy.isOpen ? 'Taking orders' : 'Closed right now'}
          <span className="block text-[11px] font-normal text-slate-400">
            {on ? 'Turn off to close early, whatever the hours say.' : 'Turn off when you are not taking orders.'}
          </span>
        </span>
        <input
          type="checkbox"
          checked={pharmacy.isOpen}
          onChange={(e) => setPharmacyOpen(pharmacy.id, e.target.checked)}
          className="h-5 w-9 shrink-0 accent-brand-600"
        />
      </label>

      <div className="space-y-1.5">
        {WEEK.map((day) => {
          const entry = hours[day] ?? null
          return (
            <div key={day} className="flex items-center gap-2">
              <span className="w-9 shrink-0 text-[11px] font-semibold text-slate-600">{DAY_SHORT[day]}</span>
              <input
                type="checkbox"
                checked={!!entry}
                onChange={(e) => setDay(day, e.target.checked ? DEFAULT_DAY : null)}
                aria-label={`Open on ${DAY_SHORT[day]}`}
                className="h-4 w-4 shrink-0 accent-brand-600"
              />
              {entry ? (
                <>
                  <input
                    type="time"
                    value={entry.open}
                    onChange={(e) => setDay(day, { ...entry, open: e.target.value })}
                    aria-label={`${DAY_SHORT[day]} opening time`}
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                  />
                  <span className="text-[11px] text-slate-400">to</span>
                  <input
                    type="time"
                    value={entry.close}
                    onChange={(e) => setDay(day, { ...entry, close: e.target.value })}
                    aria-label={`${DAY_SHORT[day]} closing time`}
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                  />
                </>
              ) : (
                <span className="flex-1 text-[11px] text-slate-400">Closed</span>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {/* Most shops here keep one set of hours and open seven days. Typing
            that fourteen times is the reason a schedule never gets filled
            in at all. */}
        <button
          type="button"
          onClick={() => {
            const base = WEEK.map((d) => hours[d]).find((d) => d) ?? DEFAULT_DAY
            write(emptyOpeningHours().map(() => ({ ...base })))
          }}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
        >
          Same every day
        </button>
        <button
          type="button"
          onClick={() => {
            const base = WEEK.map((d) => hours[d]).find((d) => d) ?? DEFAULT_DAY
            const next = emptyOpeningHours()
            for (const d of [1, 2, 3, 4, 5, 6]) next[d] = { ...base }
            write(next)
          }}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
        >
          Mon–Sat
        </button>
        {on && (
          <button
            type="button"
            onClick={() => write(emptyOpeningHours())}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            Clear
          </button>
        )}
      </div>

      {on && (
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-semibold text-slate-600">Customers see</p>
          {openingHoursSummary(hours).map((line) => (
            <p key={line} className="text-[11px] text-slate-500">
              {line}
            </p>
          ))}
        </div>
      )}
    </section>
  )
}
