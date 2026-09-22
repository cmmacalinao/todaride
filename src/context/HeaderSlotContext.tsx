import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

// What the passenger header shows in place of a page title: the three
// service tabs (Book a Ride / Food Order / PaDeliver), with which one is lit.
//
// The header is drawn by NavBar, outside every page, but only the booking
// page knows which service is open. Rather than have NavBar guess from the
// URL and router state (which the booking page changes underneath it), the
// page announces the tabs it wants while it is on screen, and takes them
// back when it leaves — so any other screen under the same header (the
// terminal page, a storefront) gets the plain title again.
export type HeaderTabs = { active: 'toda' | 'food' | 'padeliver' | 'family' }

type HeaderSlot = { tabs: HeaderTabs | null; setTabs: (tabs: HeaderTabs | null) => void }

const HeaderSlotContext = createContext<HeaderSlot>({ tabs: null, setTabs: () => {} })

export function HeaderSlotProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabsState] = useState<HeaderTabs | null>(null)
  const setTabs = useCallback((next: HeaderTabs | null) => {
    // Same content, same object: spares NavBar a render per booking-page render.
    setTabsState((prev) => (prev?.active === next?.active ? prev : next))
  }, [])
  const value = useMemo(() => ({ tabs, setTabs }), [tabs, setTabs])
  return <HeaderSlotContext.Provider value={value}>{children}</HeaderSlotContext.Provider>
}

export function useHeaderSlot() {
  return useContext(HeaderSlotContext)
}

// For the page that owns the tabs: announce them while mounted, clear on
// the way out. Pass null to show the plain title instead.
export function useHeaderTabs(tabs: HeaderTabs | null) {
  const { setTabs } = useHeaderSlot()
  const active = tabs?.active ?? null
  useEffect(() => {
    setTabs(active ? { active } : null)
    return () => setTabs(null)
  }, [active, setTabs])
}
