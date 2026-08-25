import { useEffect, useState } from 'react'
import { isNativeApp } from '../lib/platform'

// The browser's own "install this" event. Not in TypeScript's DOM types
// because it is a Chromium extension to the platform rather than a standard,
// so the shape is declared here from its documented behaviour.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Puts TODA SafeRide on the phone's home screen, as an icon beside the other
// apps.
//
// The app has been installable all along — manifest, icons and service worker
// are all there — but the only way in was a browser menu most people never
// open, buried under three dots and named differently on every phone.
//
// This is deliberately always visible (until it has actually been installed),
// which is the second version of it. The first only appeared when Chrome
// fired `beforeinstallprompt`, and Chrome holds that event back until it
// judges the visitor "engaged" — so the one person guaranteed not to see the
// button was the person who came looking for it. Now the row is always there
// and only its behaviour changes: a real one-tap install where the browser
// offers one, and the two-line recipe for that browser where it does not.
export function InstallAppButton({ className = '' }: { className?: string }) {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [showHow, setShowHow] = useState(false)

  useEffect(() => {
    if (isNativeApp()) return
    function onAvailable(e: Event) {
      // Chrome shows its own mini-infobar unless the page takes the event.
      e.preventDefault()
      setPrompt(e as BeforeInstallPromptEvent)
    }
    function onInstalled() {
      setInstalled(true)
      setPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', onAvailable)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onAvailable)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  // Opened from the home-screen icon rather than a browser tab — already
  // installed, so there is nothing left to offer.
  const standalone =
    typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches
  const isIos = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)

  if (isNativeApp() || installed || standalone) return null

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => {
          if (!prompt) {
            setShowHow((v) => !v)
            return
          }
          void prompt.prompt().then(() =>
            prompt.userChoice.then(({ outcome }) => {
              // A dismissed prompt cannot be raised again from the same
              // event, so fall back to the written recipe rather than leaving
              // a button that does nothing on the second press.
              if (outcome === 'dismissed') setPrompt(null)
            }),
          )
        }}
        className="flex w-full items-center gap-2 rounded-lg border-2 border-gold-400 bg-gold-50 px-3 py-2 text-left transition hover:bg-gold-100"
      >
        <span aria-hidden className="text-lg leading-none">
          📲
        </span>
        {/* The label carries it. The explanation that used to sit under it
            said in two lines what the four words already say, and made this
            row twice the height of every other item in the menu. */}
        <span className="min-w-0 flex-1 text-xs font-bold text-navy-900">Add to Home screen</span>
      </button>

      {showHow && (
        <p className="mt-1 rounded-lg bg-slate-100 px-3 py-2 text-[10px] leading-relaxed text-slate-600">
          {isIos ? (
            <>
              Sa Safari: pindutin ang <span className="font-semibold">Share</span> (ang kahon na may pataas na
              arrow), mag-scroll, tapos <span className="font-semibold">Add to Home Screen</span>.
            </>
          ) : (
            <>
              Sa Chrome: pindutin ang <span className="font-semibold">⋮</span> sa kanang itaas, tapos{' '}
              <span className="font-semibold">Add to Home screen</span> o{' '}
              <span className="font-semibold">Install app</span>.
            </>
          )}
        </p>
      )}
    </div>
  )
}
