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
    // Frozen directly under the app header, and one row rather than four.
    //
    // Wrapping put ten sections on four lines and ate 118px of a phone screen
    // before a single figure appeared; scrolling sideways spends 34px and
    // costs a swipe. --app-header-h is measured and republished by NavBar
    // (the header's height changes with the ad strip and the toolbar's
    // wrapping), so this sits against it instead of a number written here by
    // hand and left to rot.
    //
    // The negative margins and matching padding let the row bleed to both
    // edges of the screen: a strip that scrolls should look like it runs off
    // the side, not stop short of it.
    <div
      className="sticky z-10 -mx-4 flex snap-x items-center gap-1 overflow-x-auto bg-slate-100 px-4 py-1 sm:mx-0 sm:rounded-lg sm:px-1"
      style={{ top: 'var(--app-header-h, 0px)' }}
    >
      {ADMIN_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => navigate(`/admin?tab=${tab.id}`)}
          className={`shrink-0 snap-start whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
            onAdminPage && active === tab.id ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200'
          }`}
        >
          {tab.icon} {tab.label}
        </button>
      ))}
    </div>
  )
}
