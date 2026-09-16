import type { EmergencyContact } from '../types'

export const MAX_EMERGENCY_CONTACTS = 3

// Up to three people to reach if something happens to the passenger. Each
// shows on the emergency screen as a call button. The SMS switch is kept
// but disabled until emergency SMS exists.
export function EmergencyContactsEditor({
  value,
  onChange,
  smsAvailable = false,
}: {
  value: EmergencyContact[]
  onChange: (next: EmergencyContact[]) => void
  smsAvailable?: boolean
}) {
  function update(id: string, patch: Partial<EmergencyContact>) {
    onChange(value.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }
  function add() {
    if (value.length >= MAX_EMERGENCY_CONTACTS) return
    onChange([...value, { id: `ec-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, name: '', phone: '', relationship: '', smsEnabled: false }])
  }
  function remove(id: string) {
    onChange(value.filter((c) => c.id !== id))
  }
  return (
    <div className="space-y-2 rounded-lg border border-slate-100 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-600">Emergency contacts</p>
        <span className="text-[11px] text-slate-400">
          {value.length} of {MAX_EMERGENCY_CONTACTS}
        </span>
      </div>
      {value.length === 0 && <p className="text-[11px] text-slate-400">People to call if something goes wrong on a trip.</p>}
      {value.map((c) => (
        <div key={c.id} className="space-y-1.5 rounded-lg bg-slate-50 p-2">
          <div className="flex gap-1.5">
            <input
              value={c.name}
              onChange={(e) => update(c.id, { name: e.target.value })}
              placeholder="Name"
              className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1.5 text-xs"
            />
            <input
              value={c.relationship}
              onChange={(e) => update(c.id, { relationship: e.target.value })}
              placeholder="Relationship"
              className="w-28 rounded border border-slate-300 px-2 py-1.5 text-xs"
            />
          </div>
          <div className="flex gap-1.5">
            <input
              value={c.phone}
              onChange={(e) => update(c.id, { phone: e.target.value })}
              placeholder="09XX-XXX-XXXX"
              inputMode="tel"
              className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1.5 text-xs"
            />
            <button type="button" onClick={() => remove(c.id)} className="rounded border border-slate-300 px-2 text-xs text-slate-500 hover:bg-slate-100">
              Remove
            </button>
          </div>
          <label className={`flex items-center gap-2 text-[11px] ${smsAvailable ? 'text-slate-600' : 'text-slate-400'}`}>
            <input type="checkbox" checked={c.smsEnabled} disabled={!smsAvailable} onChange={(e) => update(c.id, { smsEnabled: e.target.checked })} />
            Message by SMS during an emergency{smsAvailable ? '' : ' — not available yet'}
          </label>
        </div>
      ))}
      {value.length < MAX_EMERGENCY_CONTACTS && (
        <button type="button" onClick={add} className="w-full rounded-lg border border-dashed border-slate-300 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50">
          + Add a contact
        </button>
      )}
    </div>
  )
}
