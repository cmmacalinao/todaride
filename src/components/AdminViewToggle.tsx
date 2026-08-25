import { setAdminViewMode, useAdminViewMode, type AdminViewMode } from '../lib/adminViewMode'

const OPTIONS: { value: AdminViewMode; icon: string; label: string }[] = [
  { value: 'mobile', icon: '📱', label: 'Mobile' },
  { value: 'desktop', icon: '🖥️', label: 'Desktop' },
]

// Switches the admin surfaces between the phone-width column everything else
// in the app uses and a wide layout for working at a real screen. Only the
// admin pages render this — a driver or passenger has no use for it, and the
// partner portals inherit whatever the admin picked while being viewed from
// inside Super Admin.
export function AdminViewToggle() {
  const { mode } = useAdminViewMode()

  return (
    <div className="flex items-center gap-1 rounded-lg bg-white/15 p-0.5" role="group" aria-label="Page width">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setAdminViewMode(o.value)}
          aria-pressed={mode === o.value}
          title={`${o.label} view`}
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition ${
            mode === o.value ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-200 hover:text-white'
          }`}
        >
          <span aria-hidden className="text-xs leading-none">
            {o.icon}
          </span>
          <span className="hidden sm:inline">{o.label}</span>
        </button>
      ))}
    </div>
  )
}
