import { useEffect, useState } from 'react'
import { useSession } from '../context/SessionContext'
import { useHasMyOwnTripInFlight } from '../lib/myOwnTripInFlight'
import { isInAppBrowser, safariEscapeUrl } from '../lib/inAppBrowser'
import {
  canAddToHomeScreen,
  installGuideDismissed,
  rememberInstallGuideDismissed,
  shareButtonPlacement,
  shouldOfferInstallGuide,
  type SharePlacement,
} from '../lib/installTarget'

// How to put TODARide on an iPhone's home screen.
//
// Apple does not let a website install itself, and will not: the three taps
// are the customer's to make. So there is no install button here and there
// never can be one — only the clearest possible picture of where those taps
// are, shown at a moment somebody can act on.
//
// What it is worth doing for: an installed app opens with no address bar,
// stays signed in, and keeps its storage. Safari clears an ordinary site's
// data after about a week unvisited, which is how a passenger who books
// twice a month loses their session. It is also the only way an iPhone can
// ever receive a push notification from this app.
//
// The rules for when it appears are in lib/installTarget, where they can be
// tested without a browser.

// Safari's share control: a box with an arrow leaving the top of it.
function ShareGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M12 3v12" strokeLinecap="round" />
      <path d="m8.5 6.5 3.5-3.5 3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 11H4.5A1.5 1.5 0 0 0 3 12.5v7A1.5 1.5 0 0 0 4.5 21h15a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 19.5 11H18" strokeLinecap="round" />
    </svg>
  )
}

// The row iOS shows in the share sheet: a plus inside a rounded square.
function AddToHomeGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <path d="M12 8.5v7M8.5 12h7" strokeLinecap="round" />
    </svg>
  )
}

// The confirm button, which sits in the top right of that screen.
function AddButtonGlyph() {
  return (
    <svg viewBox="0 0 48 24" className="h-7 w-12" aria-hidden>
      <rect x="1" y="3" width="46" height="18" rx="9" fill="currentColor" opacity="0.15" />
      <text x="24" y="16.5" textAnchor="middle" fontSize="10" fontWeight="700" fill="currentColor">
        Add
      </text>
    </svg>
  )
}

// Cannot be a constant: step one is the only instruction in the app whose
// truth depends on which Apple device is holding it.
const steps = (placement: SharePlacement) => [
  {
    glyph: <ShareGlyph />,
    title: 'Tap Share',
    detail:
      placement === 'top-right'
        ? 'The square with an arrow, at the top right of Safari.'
        : 'The square with an arrow, at the bottom of Safari.',
  },
  {
    glyph: <AddToHomeGlyph />,
    title: 'Choose Add to Home Screen',
    detail: 'Scroll down the list of options to find it.',
  },
  {
    glyph: <AddButtonGlyph />,
    title: 'Tap Add',
    detail: 'Top right corner. The TODARide icon appears on your Home Screen.',
  },
]

// The guide as a panel, with no opinion about when it is shown. The menu row
// and the one-time offer below both render this.
export function InstallGuidePanel({
  onClose,
  placement = shareButtonPlacement(),
}: {
  onClose: () => void
  placement?: SharePlacement
}) {
  // Add to Home Screen exists only in Safari. Somebody who opened a shared
  // link inside Messenger or Facebook is in Meta's browser, where the menu
  // item they are about to be told to find is simply not there — so they get
  // a way out to Safari first, and the steps after it.
  const stranded = isInAppBrowser()

  return (
    <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
      <h2 className="text-base font-bold text-navy-900">Install TODARide on your iPhone</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">
        Add it to your Home Screen for faster, easier access to your rides — it opens like an app and keeps you
        signed in.
      </p>

      {stranded && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
          <a
            href={safariEscapeUrl()}
            className="block rounded-lg bg-brand-600 py-2.5 text-center text-xs font-bold text-white transition hover:bg-brand-700"
          >
            🧭 Open in Safari first
          </a>
          <p className="mt-1.5 text-center text-[11px] leading-snug text-amber-800">
            You are in another app's browser, which has no Add to Home Screen. If nothing happens, tap ••• at the
            bottom right, then Open in Safari.
          </p>
        </div>
      )}

      <ol className="mt-3 space-y-2">
        {steps(placement).map((step, i) => (
          <li key={step.title} className="flex items-start gap-3 rounded-lg bg-slate-50 p-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-brand-700 shadow-sm">
              {step.glyph}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold text-navy-900">
                {i + 1}. {step.title}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-2.5 rounded-lg bg-emerald-50 px-3 py-2 text-center text-[11px] font-medium leading-snug text-emerald-800">
        That's it — TODARide is on your Home Screen.
      </p>

      <button
        type="button"
        onClick={onClose}
        className="mt-3 w-full rounded-lg border border-slate-300 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
      >
        Maybe later
      </button>
    </div>
  )
}

// An arrow at the edge of the screen the Share button is actually on.
//
// It cannot press anything — no page can reach Safari's own toolbar — but
// "the square with an arrow" is a hard thing to find if you have never gone
// looking for it, and the hunt is where people give up. Hidden inside an
// in-app browser, where that toolbar is not there at all and the panel is
// telling them to go to Safari first.
function SharePointer({ placement }: { placement: SharePlacement }) {
  if (isInAppBrowser()) return null
  if (placement === 'top-right') {
    return (
      <div className="pointer-events-none fixed right-4 top-2 flex flex-col items-center gap-0.5 text-white">
        <span aria-hidden className="animate-bounce text-2xl leading-none">
          ⌃
        </span>
        <span className="rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold shadow-sm">
          Share is up here
        </span>
      </div>
    )
  }
  return (
    <div className="pointer-events-none mt-2 flex flex-col items-center gap-0.5 text-white">
      <span className="rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold shadow-sm">
        Share is down here
      </span>
      <span aria-hidden className="animate-bounce text-2xl leading-none">
        ⌄
      </span>
    </div>
  )
}

// Asking for the guide from anywhere, without the asker having to own it.
//
// The menu row cannot hold this panel itself: the row lives inside a drawer
// that closes the moment it is tapped, and a modal rendered inside something
// that unmounts goes with it — which is exactly what happened the first time
// this was wired up. So the panel is owned by the component below, which is
// mounted once at the top of the app and outlives every menu.
const OPEN_INSTALL_GUIDE = 'toda:open-install-guide'

export function openInstallGuide(): void {
  window.dispatchEvent(new CustomEvent(OPEN_INSTALL_GUIDE))
}

// The one-time offer, and the one copy of the panel. Offered once to an
// iPhone that has not got the app yet, never during a trip, never to a
// driver, and never again once closed — but always openable by hand from a
// menu, which is what the event above is for.
export function InstallGuideOffer() {
  const { authedAccount } = useSession()
  const tripInFlight = useHasMyOwnTripInFlight()
  const [open, setOpen] = useState(false)
  // Opened by hand rather than offered: closing it must not count as
  // dismissing an offer nobody made.
  const [askedFor, setAskedFor] = useState(false)

  useEffect(() => {
    function onAsk() {
      setAskedFor(true)
      setOpen(true)
    }
    window.addEventListener(OPEN_INSTALL_GUIDE, onAsk)
    return () => window.removeEventListener(OPEN_INSTALL_GUIDE, onAsk)
  }, [])

  useEffect(() => {
    const offer = shouldOfferInstallGuide({
      canAddToHomeScreen: canAddToHomeScreen(),
      dismissed: installGuideDismissed(),
      tripInFlight,
      isDriver: authedAccount?.role === 'driver',
    })
    if (!offer) return
    // A breath before it appears: arriving on a page and having a sheet
    // slide over it in the same instant reads as an ad, and gets closed
    // like one before anybody has read a word.
    const timer = window.setTimeout(() => setOpen(true), 2500)
    return () => window.clearTimeout(timer)
  }, [authedAccount?.role, tripInFlight])

  if (!open) return null

  const placement = shareButtonPlacement()

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-end bg-black/50 p-3 sm:justify-center">
      <InstallGuidePanel
        placement={placement}
        onClose={() => {
          // Only an offer that was made can be dismissed.
          if (!askedFor) rememberInstallGuideDismissed()
          setAskedFor(false)
          setOpen(false)
        }}
      />
      {/* Under the sheet on a phone, which is the gap between it and
          Safari's toolbar; pinned to the top corner on an iPad. */}
      <SharePointer placement={placement} />
    </div>
  )
}

// The way back in, from either menu, for anybody on an iPhone who closed the
// offer or never saw it. Hidden on a device that cannot add to a home screen
// and on one that already has — a row offering an install you already have
// is the app failing to notice.
export function InstallGuideMenuRow({ onNavigate }: { onNavigate?: () => void }) {
  if (!canAddToHomeScreen()) return null
  return (
    <>
      <button
        type="button"
        onClick={() => {
          onNavigate?.()
          openInstallGuide()
        }}
        className="flex w-full items-center gap-2 rounded-lg border-2 border-gold-400 bg-gold-50 px-3 py-2 text-left transition hover:bg-gold-100"
      >
        <span aria-hidden className="text-lg leading-none">
          📲
        </span>
        <span className="min-w-0 flex-1 text-xs font-bold text-navy-900">Install TODARide on this iPhone</span>
      </button>
    </>
  )
}
