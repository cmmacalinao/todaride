import { useState } from 'react'
import { useRides } from '../context/RideContext'
import { PassengerDetailModal } from './AccountDetailModals'
import { activeSuspension } from '../lib/accountOps'

export function AdminPassengerDirectory() {
  const { rides, passengers, parentLinks, parents, accountSuspensions } = useRides()
  const [openId, setOpenId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const query = search.trim().toLowerCase()
  const filteredPassengers = passengers.filter((p) => {
    if (!query) return true
    const link = parentLinks.find((l) => l.studentPassengerId === p.id)
    const guardian = link ? parents.find((pr) => pr.id === link.parentId) : null
    return p.name.toLowerCase().includes(query) || (guardian?.name.toLowerCase().includes(query) ?? false)
  })

  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold text-slate-700">Passenger records</h2>
      <p className="mb-2 text-[11px] text-slate-500">
        Tap a name to open the full record — trips, spend, incident reports — and to pause the account or send a note.
      </p>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by passenger or guardian name"
        className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
      />
      <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
        {filteredPassengers.length === 0 && (
          <p className="text-sm text-slate-400">
            {query ? `No passengers match "${search.trim()}".` : 'No passengers registered yet.'}
          </p>
        )}
        {filteredPassengers.map((p) => {
          const passengerRides = rides
            .filter((r) => r.passengerId === p.id)
            .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())
          const link = parentLinks.find((l) => l.studentPassengerId === p.id)
          const guardian = link ? parents.find((pr) => pr.id === link.parentId) : null
          const suspended = activeSuspension(accountSuspensions, 'passenger', p.id)

          return (
            <div
              key={p.id}
              className="rounded-lg border border-slate-200 bg-white p-3 text-sm transition hover:border-brand-300"
            >
              <button
                type="button"
                onClick={() => setOpenId(p.id)}
                className="flex w-full items-center justify-between gap-2 text-left"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-700">
                    {p.name} · Age {p.age}
                  </p>
                  <p className="text-xs text-slate-400">
                    {passengerRides.length} ride(s) on record
                    {guardian && ` · guardian: ${guardian.name} (${link!.relationship})`}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {suspended && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                      ⏸ paused
                    </span>
                  )}
                  {p.isStudent && (
                    <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                      Student
                    </span>
                  )}
                </div>
              </button>

            </div>
          )
        })}
      </div>

      {openId && <PassengerDetailModal passengerId={openId} onClose={() => setOpenId(null)} />}
    </section>
  )
}
