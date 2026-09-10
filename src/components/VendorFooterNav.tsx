// The six places a vendor goes back to all day, pinned to the bottom of the
// portal the way DriverFooterNav pins the driver's. Menu is the dishes
// themselves (add, edit, price, take something off the menu) — split out
// from Store so it's reachable on its own instead of buried partway down
// that page. Orders is where the work arrives, Book Rider is how a phone
// order gets a driver, Earnings is what the day made, Trusted Rider is who
// they want carrying their food.
export type VendorTab = 'store' | 'menu' | 'orders' | 'book' | 'earnings' | 'trusted'

const VENDOR_TABS: { tab: VendorTab; icon: string; label: string }[] = [
  { tab: 'store', icon: '🏪', label: 'Store' },
  { tab: 'menu', icon: '📋', label: 'Menu' },
  { tab: 'orders', icon: '🧾', label: 'Orders' },
  { tab: 'book', icon: '🛺', label: 'Book Rider' },
  { tab: 'earnings', icon: '💰', label: 'Earnings' },
  { tab: 'trusted', icon: '⭐', label: 'Trusted Rider' },
]

// The same five tabs as VendorFooterNav, as a persistent left rail instead
// of a bottom bar — the desktop view of VendorPortalPage swaps one for the
// other rather than keeping both, since a bottom bar pinned under a wide
// browser window reads as a mobile page that never grew up. Unstyled for
// position/width on purpose: VendorPortalPage sticks this together with a
// couple of store-level shortcuts (theme, View My Page) in one sticky
// column, so the column owns that layout instead of this nav fighting it.
export function VendorSidebarNav({
  active,
  onNavigate,
  orderCount = 0,
  bookEnabled = true,
}: {
  active: VendorTab | null
  onNavigate: (tab: VendorTab) => void
  orderCount?: number
  bookEnabled?: boolean
}) {
  return (
    <nav aria-label="Vendor sections" className="space-y-1">
      {VENDOR_TABS.map((t) => {
        const isActive = t.tab === active
        const badge = t.tab === 'orders' ? orderCount : 0
        const disabled = t.tab === 'book' && !bookEnabled
        return (
          <button
            key={t.tab}
            type="button"
            onClick={() => onNavigate(t.tab)}
            disabled={disabled}
            aria-current={isActive ? 'page' : undefined}
            title={disabled ? 'Accept an order first — Book Rider opens once there is an order to deliver' : t.label}
            className={`relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              disabled
                ? 'cursor-not-allowed text-slate-300'
                : isActive
                  ? 'bg-gold-400 text-navy-900'
                  : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span className="text-lg leading-none">{t.icon}</span>
            <span className="leading-none">{t.label}</span>
            {badge > 0 && (
              <span className="ml-auto min-w-[18px] rounded-full bg-amber-500 px-1.5 text-[10px] font-bold leading-[18px] text-white">
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}

export function VendorFooterNav({
  active,
  onNavigate,
  orderCount = 0,
  bookEnabled = true,
}: {
  active: VendorTab | null
  onNavigate: (tab: VendorTab) => void
  // Orders waiting on the vendor (new, or accepted and not yet dispatched) —
  // a badge on the Orders tab so a vendor reading their earnings still sees
  // work come in.
  orderCount?: number
  // Book Rider is a page of its own now (approved orders to book, and the
  // walk-in booking), so it is always reachable; kept as a prop in case a
  // caller wants to gate it again.
  bookEnabled?: boolean
}) {
  return (
    <nav
      aria-label="Vendor sections"
      // Same placement and layering as DriverFooterNav: bottom edge of the
      // screen above the home indicator, over a full-screen map (z-60), under
      // drawers and modals (z-70+). The page reserves room with pb-20.
      className="fixed inset-x-0 bottom-0 z-[65] border-t border-slate-200 bg-white/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-between px-1 py-1">
        {VENDOR_TABS.map((t) => {
          const isActive = t.tab === active
          const badge = t.tab === 'orders' ? orderCount : 0
          const disabled = t.tab === 'book' && !bookEnabled
          return (
            <button
              key={t.tab}
              type="button"
              onClick={() => onNavigate(t.tab)}
              disabled={disabled}
              aria-current={isActive ? 'page' : undefined}
              title={disabled ? 'Accept an order first — Book Rider opens once there is an order to deliver' : t.label}
              className={`relative flex flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-medium transition-colors ${
                disabled
                  ? 'cursor-not-allowed text-slate-300'
                  : isActive
                    ? 'bg-gold-400 text-navy-900'
                    : 'text-slate-500 hover:bg-slate-50 active:bg-slate-100'
              }`}
            >
              <span className="text-lg leading-none">{t.icon}</span>
              <span className="leading-none">{t.label}</span>
              {badge > 0 && (
                <span className="absolute right-1.5 top-0.5 min-w-[15px] rounded-full bg-amber-500 px-1 text-[9px] font-bold leading-[15px] text-white">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
