import { useEffect, useState } from 'react'
import { useRides } from '../context/RideContext'
import type { Passenger } from '../types'
import { ShareAppPanel, familyDriverInviteUrl } from './ShareAppPanel'

// Family → trusted drivers (2026-09-22). The family adds their own tricycle
// drivers — by sending a link (the driver signs in, or signs up, as a Driver
// from it) or by picking one who has driven them before. A family booking
// goes to the chosen trusted driver first; "Others" lets dispatch find
// anyone. A trusted driver who passes lets the ride go to others as usual.

// 'others', or the id of the trusted driver to ask first ('' = the first one).
export type FamilyDriverChoice = string

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function newDriverCode(): string {
  let s = 'D'
  for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  return s
}
const firstName = (name: string) => name.replace(/^(Kuya|Ate|Mang|Aling)\s+/i, '').split(' ')[0]

// Which trusted driver a booking should ask first, or null for anyone.
export function familyDriverPick(owner: Passenger, choice: FamilyDriverChoice): string | null {
  if (choice === 'others') return null
  const ids = owner.familyTrustedDriverIds ?? []
  return ids.includes(choice) ? choice : ids[0] ?? null
}

export function FamilyDriverRow({
  owner,
  choice,
  onChoice,
}: {
  owner: Passenger
  choice: FamilyDriverChoice
  onChoice: (c: FamilyDriverChoice) => void
}) {
  const { drivers, rides, addFamilyTrustedDriver, removeFamilyTrustedDriver, setFamilyDriverInvite } = useRides()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const trusted = (owner.familyTrustedDriverIds ?? [])
    .map((id) => drivers.find((d) => d.id === id))
    .filter((d): d is NonNullable<typeof d> => !!d)
  const picked = familyDriverPick(owner, choice)
  // Drivers who have driven this family before (or the saved favourite) and
  // are not trusted yet — one tap adds them.
  const familyIds = new Set([owner.id, ...(owner.familyMembers ?? []).map((m) => m.passengerId).filter(Boolean)])
  const pastIds = [
    ...(owner.favoriteDriverId ? [owner.favoriteDriverId] : []),
    ...rides
      .filter((r) => r.status === 'completed' && r.driverId && (familyIds.has(r.passengerId) || r.familyBookerId === owner.id))
      .map((r) => r.driverId!),
  ]
  const past = [...new Set(pastIds)]
    .filter((id) => !trusted.some((t) => t.id === id))
    .map((id) => drivers.find((d) => d.id === id))
    .filter((d): d is NonNullable<typeof d> => !!d)
    .slice(0, 6)

  const [query, setQuery] = useState('')
  const ownerFirst = owner.name.split(' ')[0]
  const q = query.trim().toLowerCase()
  const qDigits = q.replace(/\D/g, '')
  const searching = q.length >= 2
  const found = searching
    ? drivers
        .filter((d) => !trusted.some((t) => t.id === d.id))
        .filter(
          (d) =>
            d.name.toLowerCase().includes(q) ||
            d.plateNumber.toLowerCase().includes(q) ||
            (qDigits.length >= 4 && d.phone.replace(/\D/g, '').includes(qDigits)),
        )
        .slice(0, 6)
    : []

  function openInvite() {
    if (!owner.familyDriverInviteCode) setFamilyDriverInvite(owner.id, newDriverCode())
    setInviteOpen(true)
  }
  const chip = (active: boolean) =>
    `rounded-md px-2 py-1.5 text-[11px] font-semibold transition ${
      active ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200'
    }`

  return (
    <div className="space-y-1">
      <div className="flex items-start gap-1.5">
        <span className="w-[42%] shrink-0 pt-1.5 text-[11px] font-semibold text-slate-600">🛺 Driver</span>
        <div className="flex min-w-0 flex-1 flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
          {/* Each trusted driver carries their own ✕, the same as a family
              member's chip — adding and removing in one place (2026-09-23). */}
          {trusted.map((d) => (
            <span key={d.id} className={`flex items-center ${picked === d.id ? 'rounded-md bg-brand-600' : ''}`}>
              <button type="button" onClick={() => onChoice(d.id)} className={chip(picked === d.id)}>
                ⭐ {firstName(d.name)}
              </button>
              <button
                type="button"
                aria-label={`Remove ${d.name}`}
                title={`Remove ${d.name}`}
                onClick={() => {
                  removeFamilyTrustedDriver(owner.id, d.id)
                  if (picked === d.id) onChoice('others')
                }}
                className={`pr-1.5 text-[10px] font-bold ${picked === d.id ? 'text-white/80' : 'text-red-600/80'} hover:opacity-100`}
              >
                ✕
              </button>
            </span>
          ))}
          <button type="button" onClick={() => onChoice('others')} className={chip(picked === null)}>
            {trusted.length ? 'Others' : 'Any nearby driver'}
          </button>
          <button
            type="button"
            onClick={() => setAddOpen((v) => !v)}
            aria-expanded={addOpen}
            className="rounded-md border border-dashed border-amber-400 bg-white px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-50"
          >
            {addOpen ? 'Close' : '+ Add trusted driver'}
          </button>
        </div>
      </div>
      <p className="text-[10px] leading-snug text-slate-500">
        {picked
          ? `${trusted.find((d) => d.id === picked)?.name} gets the request first. If they pass, it goes to other drivers.`
          : trusted.length
            ? 'Any nearby driver can take it.'
            : 'Add the tricycle driver your family already knows — their requests go to them first.'}
      </p>
      {addOpen && (
        <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-2">
          {/* Search the registered drivers first; one not found is sent the
              link to register, which marks them as this family's driver. */}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a registered driver — name, plate or mobile"
            className="compact-input w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
          />
          {searching && (
            <div className="space-y-1">
              {found.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    addFamilyTrustedDriver(owner.id, d.id)
                    onChoice(d.id)
                    setQuery('')
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-left text-[11px] hover:bg-slate-50"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-semibold text-slate-800">{d.name}</span>
                    <span className="text-slate-500"> · {d.plateNumber}</span>
                  </span>
                  <span className="shrink-0 font-bold text-brand-700">⭐ Make trusted</span>
                </button>
              ))}
              {found.length === 0 && (
                <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug text-amber-900">
                  No registered driver matches “{query.trim()}”. Send them the link below — they register as a driver and are
                  marked as {ownerFirst}'s family trusted driver.
                </p>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={openInvite}
            className="w-full rounded-lg bg-brand-600 py-1.5 text-[11px] font-bold text-white hover:bg-brand-700"
          >
            📲 Not in the list? Send them a link to register
          </button>
          {past.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Or pick one who drove you</p>
              <div className="flex flex-wrap gap-1.5">
                {past.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      addFamilyTrustedDriver(owner.id, d.id)
                      onChoice(d.id)
                    }}
                    className="rounded-full border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    + {d.name} · {d.plateNumber}
                  </button>
                ))}
              </div>
            </div>
          )}
          {trusted.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Your trusted drivers</p>
              <div className="flex flex-wrap gap-1.5">
                {trusted.map((d) => (
                  <span key={d.id} className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900">
                    ⭐ {d.name}
                    <button
                      type="button"
                      aria-label={`Remove ${d.name}`}
                      onClick={() => removeFamilyTrustedDriver(owner.id, d.id)}
                      className="font-bold text-red-600"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {inviteOpen && owner.familyDriverInviteCode && (
        <ShareAppPanel
          onClose={() => setInviteOpen(false)}
          url={familyDriverInviteUrl(owner.familyDriverInviteCode)}
          title="Invite your trusted driver"
          subtitle={`Your driver scans this (or opens the link) and signs in as a Driver — new drivers sign up first. They become a trusted driver for ${owner.name.split(' ')[0]}'s family and get your family's requests first. Code ${owner.familyDriverInviteCode}.`}
        />
      )}
    </div>
  )
}

// Driver side: a driver who opened a family's driver link is linked to that
// family as soon as they are signed in, and told so once.
export function TrustedDriverLinker({ driverId }: { driverId: string }) {
  const { passengers, linkFamilyTrustedDriver } = useRides()
  const [linkedTo, setLinkedTo] = useState<string | null>(null)
  useEffect(() => {
    let code: string | null = null
    try {
      code = localStorage.getItem('toda-trusted-driver-invite')
    } catch {
      return
    }
    if (!code) return
    const family = passengers.find((p) => p.familyDriverInviteCode === code)
    // Not in this phone's copy yet (still syncing) — try again when it is.
    if (!family) return
    linkFamilyTrustedDriver(code, driverId)
    setLinkedTo(family.name)
    try {
      localStorage.removeItem('toda-trusted-driver-invite')
    } catch {
      /* storage refused — linking again is harmless */
    }
  }, [driverId, passengers, linkFamilyTrustedDriver])
  if (!linkedTo) return null
  return (
    <div className="mx-3 mt-2 flex items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
      <span aria-hidden className="text-base leading-none">⭐</span>
      <span className="flex-1">
        You are now <span className="font-bold">{linkedTo}</span>'s family trusted driver. Their family's ride requests come to
        you first.
      </span>
      <button type="button" onClick={() => setLinkedTo(null)} aria-label="Close" className="font-bold text-emerald-700">
        ✕
      </button>
    </div>
  )
}
