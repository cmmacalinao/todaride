import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useRides } from '../context/RideContext'
import { EmergencyNumbersPanel } from './EmergencyNumbersPanel'
import { ContactUsForm } from './ContactUsForm'
import { THEME_OPTIONS, useTheme } from '../context/ThemeContext'

// Header for the screens shown before anyone logs in — the landing page, the
// role chooser and the login gate. Mirrors the signed-in header (hamburger,
// logo, back/forward) so the chrome does not appear and disappear as you move
// between them, and so a visitor who taps into Sign up has a way back that
// isn't the browser's own button.
//
// Its menu is deliberately short: everything a logged-out visitor can
// legitimately reach. Emergency numbers are in there on purpose — needing them
// is not a reason to have an account.
export function PublicHeader({ title = 'TODA SafeRide' }: { title?: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { medsEnabled, vendorsEnabled } = useRides()
  // The landing page already shows the full mark in the middle of the screen,
  // so a second copy in the header is a duplicate, and back/forward arrows
  // have nowhere to go from the first screen of the app. Every other public
  // screen is somewhere you arrived FROM here, so those keep both.
  const onLanding = location.pathname === '/'
  const [menuOpen, setMenuOpen] = useState(false)
  const [showHotlines, setShowHotlines] = useState(false)
  const [showContact, setShowContact] = useState(false)
  const [showTheme, setShowTheme] = useState(false)
  const { theme, setTheme } = useTheme()
  const activeThemeOption = THEME_OPTIONS.find((t) => t.id === theme)

  const items: { label: string; icon: string; onClick: () => void }[] = [
    { label: 'Home', icon: '🏠', onClick: () => navigate('/') },
    // Both words on purpose: the role chooser is where an existing user
    // picks which portal to sign in to as well as where a new one signs up.
    { label: 'Create an account/Login', icon: '📝', onClick: () => navigate('/welcome?mode=signup') },
    { label: 'Driver login', icon: '🛵', onClick: () => navigate('/drive?mode=login') },
    { label: 'TODA Admin login', icon: '🏛️', onClick: () => navigate('/drive?mode=toda_admin') },
    { label: 'Operator login', icon: '🏢', onClick: () => navigate('/operator') },
    ...(medsEnabled || vendorsEnabled
      ? [
          {
            label: 'Partner with us',
            icon: '🏪',
            onClick: () => navigate(vendorsEnabled ? '/vendor' : '/pharmacy'),
          },
        ]
      : []),
    { label: 'Contact us', icon: '✉️', onClick: () => setShowContact(true) },
    { label: 'Emergency numbers', icon: '🆘', onClick: () => setShowHotlines(true) },
    // Only in this menu, not the signed-in NavDrawer — the app-wide colour
    // concept is a whole-app setting, not something to duplicate into every
    // role's own drawer.
    { label: `Theme: ${activeThemeOption?.label ?? ''}`, icon: '🎨', onClick: () => setShowTheme(true) },
    { label: 'Admin Operation', icon: '🔐', onClick: () => navigate('/admin') },
  ]

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-20 border-b border-brand-700 bg-brand-600">
        <div className="mx-auto flex max-w-lg items-center gap-2 px-4 py-1.5">
          <div className={`flex shrink-0 flex-col items-center gap-0.5 ${onLanding ? '' : '-mt-1'}`}>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Menu"
              title="Menu"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-2xl text-white hover:bg-white/10 active:bg-white/20"
            >
              ☰
            </button>
            {!onLanding && (
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  aria-label="Go back"
                  className="flex h-5 w-5 items-center justify-center rounded border border-white/25 text-[11px] text-slate-200 hover:bg-white/10 active:bg-white/20"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => navigate(1)}
                  aria-label="Go forward"
                  className="flex h-5 w-5 items-center justify-center rounded border border-white/25 text-[11px] text-slate-200 hover:bg-white/10 active:bg-white/20"
                >
                  ›
                </button>
              </div>
            )}
          </div>
          {!onLanding && (
            <Link to="/" aria-label="TODA SafeRide home">
              <img src="/logo.webp" alt="TODA SafeRide" className="h-11 w-auto shrink-0 object-contain" />
            </Link>
          )}
          <span className="min-w-0 truncate text-sm font-semibold text-gold-400">{title}</span>
        </div>
      </header>

      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/50"
            onClick={() => setMenuOpen(false)}
            aria-hidden
          />
          <div className="fixed inset-y-0 left-0 z-[70] w-72 max-w-[85%] overflow-y-auto bg-white shadow-xl">
            <div className="flex items-center justify-between bg-brand-600 px-4 py-3">
              <span className="text-sm font-semibold text-gold-400">TODA SafeRide</span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="rounded-md px-2 py-1 text-lg text-white hover:bg-white/10"
              >
                ×
              </button>
            </div>
            <nav className="p-2">
              {items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    setShowHotlines(false)
                    item.onClick()
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-100"
                >
                  <span className="text-base leading-none">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </nav>
            <p className="px-4 pb-4 text-[11px] text-slate-400">Prototype · simulated data</p>
          </div>
        </>
      )}

      {showContact && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">✉️ Contact us</h2>
              <button
                type="button"
                onClick={() => setShowContact(false)}
                aria-label="Close"
                className="rounded-md px-2 py-1 text-lg text-slate-400 hover:bg-slate-100"
              >
                ×
              </button>
            </div>
            <ContactUsForm onDone={() => setShowContact(false)} />
          </div>
        </div>
      )}

      {showHotlines && (
        // Not scoped to a location: a logged-out visitor has no registered
        // city for us to narrow the list to.
        <EmergencyNumbersPanel
          scopeToLocation={false}
          onClose={() => setShowHotlines(false)}
          onOpenMenu={() => setMenuOpen(true)}
        />
      )}

      {showTheme && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">🎨 Theme</h2>
              <button
                type="button"
                onClick={() => setShowTheme(false)}
                aria-label="Close"
                className="rounded-md px-2 py-1 text-lg text-slate-400 hover:bg-slate-100"
              >
                ×
              </button>
            </div>
            <p className="mb-3 text-xs text-slate-500">
              The colour concept the whole app uses — applies everywhere, for everyone on this device.
            </p>
            <div className="space-y-2">
              {THEME_OPTIONS.map((option) => {
                const active = option.id === theme
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setTheme(option.id)}
                    aria-pressed={active}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                      active ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex shrink-0 gap-1">
                      {option.swatches.map((hex, i) => (
                        <span
                          key={i}
                          aria-hidden
                          className="h-6 w-6 rounded-full border border-black/10"
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-800">{option.label}</span>
                      <span className="block text-xs text-slate-500">{option.tagline}</span>
                    </span>
                    {active && <span className="shrink-0 text-brand-600">✓</span>}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
