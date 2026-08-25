import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

export type AdminTab =
  | 'overview'
  | 'todas'
  | 'terminals'
  | 'addterminal'
  | 'boundaries'
  | 'partners'
  | 'drivers'
  | 'rides'
  | 'settings'
  | 'announce'

export const ADMIN_TABS: { id: AdminTab; icon: string; label: string }[] = [
  { id: 'overview', icon: '📊', label: 'Overview' },
  { id: 'todas', icon: '🛺', label: 'TODAs' },
  { id: 'terminals', icon: '🚏', label: 'Terminals' },
  { id: 'addterminal', icon: '➕', label: 'Add Terminal' },
  { id: 'boundaries', icon: '🗺️', label: 'TODA Boundaries' },
  { id: 'partners', icon: '🏢', label: 'Partners' },
  { id: 'drivers', icon: '🧑‍✈️', label: 'Drivers' },
  { id: 'rides', icon: '🗺️', label: 'Rides & Safety' },
  { id: 'settings', icon: '⚙️', label: 'Settings & Fees' },
  { id: 'announce', icon: '📣', label: 'Announce & Notes' },
]

// The section strip used to be local state inside AdminPage, so it vanished
// the moment you opened Driver or Passenger monitoring — and getting back to
// a section meant returning to /admin first and re-picking it. Making the URL
// the source of truth turns the strip into ordinary navigation that every
// admin surface can show.
export function useAdminTab(): AdminTab {
  const [searchParams] = useSearchParams()
  const raw = searchParams.get('tab')
  return ADMIN_TABS.some((t) => t.id === raw) ? (raw as AdminTab) : 'overview'
}

export function AdminSectionTabs() {
  const navigate = useNavigate()
  const location = useLocation()
  const active = useAdminTab()
  // Only the /admin page renders sections, so a tab press from Driver or
  // Passenger monitoring has to go there rather than just set a query on a
  // page that would ignore it.
  const onAdminPage = location.pathname === '/admin'

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
      {ADMIN_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => navigate(`/admin?tab=${tab.id}`)}
          className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
            onAdminPage && active === tab.id ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200'
          }`}
        >
          {tab.icon} {tab.label}
        </button>
      ))}
    </div>
  )
}
