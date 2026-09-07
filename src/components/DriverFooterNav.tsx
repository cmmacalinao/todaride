import { useState } from 'react'
import type { DrawerSection } from './NavDrawer'
import { ContactSheet } from './ContactSheet'

// The categories a driver actually moves between during a shift. This is the
// same set the hamburger drawer lists, minus the account/settings items — a
// footer is for the places you go back to twenty times an hour, not the ones
// you visit once. Ordered the way a shift runs: check the board, take work,
// drive it, see what it paid.
const DRIVER_TABS: { section: DrawerSection; icon: string; label: string }[] = [
  { section: 'home', icon: '🏠', label: 'Home' },
  { section: 'requests', icon: '🚗', label: 'Requests' },
  { section: 'current', icon: '📍', label: 'Trip' },
  { section: 'queue', icon: '🚏', label: 'Pila' },
  { section: 'earnings', icon: '💰', label: 'Earnings' },
  { section: 'history', icon: '🧾', label: 'History' },
]

interface DriverFooterNavProps {
  active: DrawerSection | null
  onNavigate: (section: DrawerSection) => void
  // Waiting requests, shown as a badge on the Requests tab. A driver looking
  // at their earnings still needs to know work came in.
  requestCount?: number
  // A freelance driver belongs to no terminal, so there is no line to stand
  // in — the tab is dropped rather than shown leading nowhere.
  showQueue?: boolean
  // Highlighted while a trip is live, for the same reason: it is the one
  // place the driver needs to get back to in a hurry.
  tripActive?: boolean
  // The rider on the driver's current job — present from the moment a
  // request is accepted (not only once the trip is under way), since a
  // driver on the way to a pickup is exactly who needs to say "running 2
  // minutes late" or confirm which gate to wait at. Absent between jobs:
  // this bar is shared by every screen a driver visits, including the ones
  // with nobody to call.
  contact?: { name: string; phone: string } | null
}

export function DriverFooterNav({
  active,
  onNavigate,
  requestCount = 0,
  showQueue = true,
  tripActive = false,
  contact = null,
}: DriverFooterNavProps) {
  const [contactOpen, setContactOpen] = useState(false)
  const tabs = DRIVER_TABS.filter((t) => showQueue || t.section !== 'queue')
  return (
    <>
      <nav
        aria-label="Driver sections"
        // Fixed to the bottom edge of the screen, not to the end of the
        // page — the safe-area inset keeps it above the home indicator on a
        // real handset. The page below reserves room for it with pb-20.
        //
        // z-65 clears the full-screen map (z-60) so this one bar stays put
        // when a map takes the screen, rather than being covered and then
        // drawn a second time inside the map's own overlay — which is what
        // used to happen, and showed as two strips stacked on a phone where
        // the map layer did not quite reach the bottom edge. Still under the
        // drawers and modals (z-70 and up), which are meant to cover it.
        className="fixed inset-x-0 bottom-0 z-[65] border-t border-slate-200 bg-white/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-between px-1 py-1">
        {tabs.map((tab) => {
          const isActive = tab.section === active
          const badge = tab.section === 'requests' ? requestCount : 0
          const pulse = tab.section === 'current' && tripActive
          return (
            <button
              key={tab.section}
              type="button"
              onClick={() => onNavigate(tab.section)}
              aria-current={isActive ? 'page' : undefined}
              title={tab.label}
              className={`relative flex flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-medium transition-colors ${
                isActive ? 'bg-gold-400 text-navy-900' : 'text-slate-500 hover:bg-slate-50 active:bg-slate-100'
              }`}
            >
              <span className={`text-lg leading-none ${pulse ? 'animate-pulse' : ''}`}>{tab.icon}</span>
              <span className="leading-none">{tab.label}</span>
              {badge > 0 && (
                <span className="absolute right-1.5 top-0.5 min-w-[15px] rounded-full bg-amber-500 px-1 text-[9px] font-bold leading-[15px] text-white">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </button>
          )
        })}
        {/* Not one of the section tabs above — those are places, this is an
            action, on whoever is riding with the driver right now. Kept to
            the same visual language so it reads as part of the same bar
            rather than a bolted-on extra. */}
        {contact && (
          <button
            type="button"
            onClick={() => setContactOpen(true)}
            title={`Contact ${contact.name}`}
            className="relative flex flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-medium text-slate-500 transition-colors hover:bg-slate-50 active:bg-slate-100"
          >
            <span className="text-lg leading-none">☎️</span>
            <span className="leading-none">Contact</span>
          </button>
        )}
        </div>
      </nav>
      {contact && contactOpen && (
        <ContactSheet name={contact.name} phone={contact.phone} onClose={() => setContactOpen(false)} />
      )}
    </>
  )
}
