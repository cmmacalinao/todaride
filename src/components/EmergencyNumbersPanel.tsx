import type { ReactNode } from 'react'
import { EmergencyHotlines } from './EmergencyHotlines'

// The emergency numbers list as an overlay, with its own bar: the emergency
// mark, an optional hamburger for the page underneath, and a close on the top
// row. The close is at the TOP and the bar is sticky because the list is long
// — a button at the bottom means scrolling past every hotline in the country
// to get out of a screen you opened by accident.
//
// Shared by the public header and the driver app so the panel is one thing
// that behaves one way, rather than a layout copied per screen.
export function EmergencyNumbersPanel({
  onClose,
  onOpenMenu,
  province,
  city,
  scopeToLocation = true,
  children,
}: {
  onClose: () => void
  onOpenMenu?: () => void
  province?: string
  city?: string
  scopeToLocation?: boolean
  // Rendered above the hotline list — the driver app puts its panic button
  // here so both halves of "emergency" live behind one icon.
  children?: ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-h-[85vh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-danger-200 bg-danger-600 px-3 py-2">
          {onOpenMenu && (
            <button
              type="button"
              onClick={onOpenMenu}
              aria-label="Menu"
              title="Menu"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xl text-white hover:bg-white/15 active:bg-white/25"
            >
              ☰
            </button>
          )}
          <span aria-hidden className="text-lg leading-none">
            🛡️
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">Emergency numbers</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close emergency numbers"
            title="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-lg font-bold text-white hover:bg-white/15 active:bg-white/25"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {children}
          <EmergencyHotlines province={province} city={city} scopeToLocation={scopeToLocation} hideTitle />
        </div>
      </div>
    </div>
  )
}

// The small mark that stands in for the whole emergency panel. A badge shows
// when this account already has an SOS open, so the collapsed state can still
// say "something is happening" without being expanded.
export function EmergencyNumbersButton({
  onClick,
  alertOpen = false,
}: {
  onClick: () => void
  alertOpen?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Safety — emergency contacts"
      title="Safety — SOS and hotline numbers"
      // The shield and the word Safety, the same as the passenger's Safety
      // tile and the trip screen's button: the red SOS square read as an
      // alarm to press, and what it opens is every way to reach help.
      className={`relative flex h-11 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-danger-300 bg-danger-50 leading-none shadow-sm transition hover:bg-danger-100 ${
        alertOpen ? 'ring-2 ring-danger-300 ring-offset-2' : ''
      }`}
    >
      <span aria-hidden className="text-[17px] leading-none">🛡️</span>
      <span className="text-[10px] font-bold leading-none text-danger-800">Safety</span>
      {alertOpen && (
        <span
          aria-hidden
          className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-gold-400"
        />
      )}
    </button>
  )
}
