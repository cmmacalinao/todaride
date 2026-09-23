import { useState } from 'react'

// "Book for others" — lets whoever's booking (a passenger or a parent) put
// the ride under a different name/phone than their own account, e.g. a
// relative or neighbor without the app. No account is created for that
// person; the ride just carries their name/phone directly (see
// makeGuestPassengerId) so the driver can identify and call them.
export interface GuestRiderState {
  bookingFor: 'self' | 'other' | 'family'
  setBookingFor: (v: 'self' | 'other' | 'family') => void
  otherName: string
  setOtherName: (v: string) => void
  otherPhone: string
  setOtherPhone: (v: string) => void
  // Their age (2026-09-24). A child riding alone is booked by an adult, and
  // it is that adult the driver must be able to reach — so a minor's own
  // mobile is optional and the booker's number goes on the ride instead.
  otherAge: string
  setOtherAge: (v: string) => void
  reset: () => void
}

export function useGuestRider(): GuestRiderState {
  const [bookingFor, setBookingFor] = useState<'self' | 'other' | 'family'>('self')
  const [otherName, setOtherName] = useState('')
  const [otherPhone, setOtherPhone] = useState('')
  const [otherAge, setOtherAge] = useState('')
  function reset() {
    setBookingFor('self')
    setOtherName('')
    setOtherPhone('')
    setOtherAge('')
  }
  return { bookingFor, setBookingFor, otherName, setOtherName, otherPhone, setOtherPhone, otherAge, setOtherAge, reset }
}

// Generated fresh per booking, not tied to any real account — a guest ride
// never resolves in the Admin passenger directory or anywhere account
// lookups happen, same as any real ride-hailing app's "book for someone
// else" doesn't create an account for that person either.
export function makeGuestPassengerId(): string {
  return `guest-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export function GuestRiderFields({
  state,
  selfLabel,
}: {
  state: GuestRiderState
  selfLabel: string
}) {
  return (
    <div className="space-y-2">
      <div>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => state.setBookingFor('self')}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${
              state.bookingFor === 'self' ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-500'
            }`}
          >
            {selfLabel}
          </button>
          <button
            type="button"
            onClick={() => state.setBookingFor('other')}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${
              state.bookingFor === 'other' ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-500'
            }`}
          >
            Someone else
          </button>
        </div>
      </div>
      {state.bookingFor === 'other' && (
        <div className="grid grid-cols-2 gap-2">
          <input
            value={state.otherName}
            onChange={(e) => state.setOtherName(e.target.value)}
            placeholder="Their name"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={state.otherPhone}
            onChange={(e) => state.setOtherPhone(e.target.value)}
            placeholder="Their mobile number"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      )}
    </div>
  )
}
