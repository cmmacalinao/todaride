import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

export type AdminTab =
  | 'overview'
  | 'todas'
  | 'terminals'
  | 'addterminal'
  | 'boundaries'
  | 'landmarks'
  | 'partners'
  | 'drivers'
  | 'rides'
  | 'fees'
  | 'settings'
  | 'announce'
  | 'checklist'

export const ADMIN_TABS: { id: AdminTab; icon: string; label: string }[] = [
  { id: 'overview', icon: '📊', label: 'Overview' },
  { id: 'todas', icon: '🛺', label: 'TODAs' },
  { id: 'terminals', icon: '🚏', label: 'Terminals' },
  { id: 'addterminal', icon: '➕', label: 'Add Terminal' },
  { id: 'boundaries', icon: '🗺️', label: 'TODA Boundaries' },
  { id: 'landmarks', icon: '📍', label: 'Landmarks' },
  { id: 'partners', icon: '🏢', label: 'Partners' },
  { id: 'drivers', icon: '🧑‍✈️', label: 'Drivers' },
  { id: 'rides', icon: '🗺️', label: 'Rides & Safety' },
  // Every figure that decides what somebody pays or keeps, in one place.
  // They were spread across two halves of the Settings tab with banner ads
  // and the accounting lock between them, so answering "what do we charge?"
  // meant scrolling past things that have nothing to do with money.
  { id: 'fees', icon: '💸', label: 'Fees & Tariff' },
  { id: 'settings', icon: '⚙️', label: 'Settings' },
  { id: 'announce', icon: '📣', label: 'Announce & Notes' },
  // Last in the row on purpose: it is a guide somebody opens deliberately,
  // not a section they pass through while running the pilot.
  { id: 'checklist', icon: '✅', label: 'Checklist' },
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
      // Two rows on a phone, one on anything wider.
      //
      // Ten sections in a single row is a long sideways scroll for the ones
      // at the end; four wrapped rows was 118px of screen before any content.
      // Two rows filled column by column — which is what grid-flow-col with
      // grid-rows-2 does — halves the scrolling distance and still costs only
      // two lines. From sm up there is room for the plain row again.
      className="sticky z-10 -mx-4 grid snap-x auto-cols-max grid-flow-col grid-rows-2 gap-1 overflow-x-auto bg-slate-100 px-4 py-1 sm:mx-0 sm:flex sm:grid-rows-1 sm:items-center sm:rounded-lg sm:px-1"
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
