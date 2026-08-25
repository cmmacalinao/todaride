import { useMemo, useState } from 'react'
import { useRides } from '../context/RideContext'
import { AccountActionsPanel } from './AccountActionsPanel'
import { activeSuspension } from '../lib/accountOps'
import { ACCOUNT_KIND_LABELS, type AccountKind } from '../types'

const KIND_ORDER: AccountKind[] = ['passenger', 'driver', 'parent', 'toda', 'pharmacy', 'operator', 'franchise']

// One place to reach *any* client individually. The monitoring pages already
// open a passenger, driver or parent record, but a pharmacy, vendor, TODA,
// operator or franchise has no such page — without this, half the account
// types would be unreachable for a note or a suspension.
export function ClientNotesCenter() {
  const {
    passengers,
    drivers,
    parents,
    todaOrganizations,
    pharmacies,
    operators,
    franchises,
    accountSuspensions,
    adminNotes,
  } = useRides()

  const [kind, setKind] = useState<AccountKind>('passenger')
  const [selectedId, setSelectedId] = useState('')
  const [search, setSearch] = useState('')

  const directory = useMemo<{ id: string; name: string; meta: string }[]>(() => {
    switch (kind) {
      case 'passenger':
        return passengers.map((p) => ({ id: p.id, name: p.name, meta: `${p.phone} · ${p.city}` }))
      case 'driver':
        return drivers.map((d) => ({ id: d.id, name: d.name, meta: `${d.plateNumber} · ${d.city}` }))
      case 'parent':
        return parents.map((p) => ({ id: p.id, name: p.name, meta: `${p.phone} · ${p.city}` }))
      case 'toda':
        return todaOrganizations.map((o) => ({ id: o.id, name: o.name, meta: o.city }))
      case 'pharmacy':
        return pharmacies.map((p) => ({ id: p.id, name: p.name, meta: `${p.businessType} · ${p.city}` }))
      case 'operator':
        return operators.map((o) => ({ id: o.id, name: o.name, meta: o.city }))
      case 'franchise':
        return franchises.map((f) => ({ id: f.id, name: f.name, meta: f.city }))
    }
  }, [kind, passengers, drivers, parents, todaOrganizations, pharmacies, operators, franchises])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? directory.filter((d) => `${d.name} ${d.meta}`.toLowerCase().includes(q)) : directory
  }, [directory, search])

  const selected = directory.find((d) => d.id === selectedId) ?? null

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">✉️ Notes &amp; account actions</h2>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Pick a client to send them a private note, or to pause their account for a set number of days after a
          complaint.
        </p>

        <div className="mt-3 flex flex-wrap gap-1">
          {KIND_ORDER.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k)
                setSelectedId('')
              }}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                kind === k ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {ACCOUNT_KIND_LABELS[k]}
            </button>
          ))}
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${ACCOUNT_KIND_LABELS[kind].toLowerCase()}s…`}
          className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />

        <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-1 py-3 text-center text-xs text-slate-400">No match.</p>
          ) : (
            filtered.map((entry) => {
              const suspended = activeSuspension(accountSuspensions, kind, entry.id)
              const noteCount = adminNotes.filter((n) => n.kind === kind && n.accountId === entry.id).length
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setSelectedId(entry.id === selectedId ? '' : entry.id)}
                  className={`w-full rounded-lg border p-2 text-left text-xs transition ${
                    selectedId === entry.id
                      ? 'border-brand-400 bg-brand-50'
                      : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-medium text-slate-700">{entry.name}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {noteCount > 0 && (
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                          ✉️ {noteCount}
                        </span>
                      )}
                      {suspended && (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                          ⏸ paused
                        </span>
                      )}
                    </span>
                  </div>
                  <p className="truncate text-[11px] text-slate-400">{entry.meta}</p>
                </button>
              )
            })
          )}
        </div>
      </section>

      {selected && (
        <section className="rounded-xl border border-brand-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">
            {ACCOUNT_KIND_LABELS[kind]} — {selected.name}
          </h3>
          <AccountActionsPanel kind={kind} accountId={selected.id} accountName={selected.name} />
        </section>
      )}
    </div>
  )
}
