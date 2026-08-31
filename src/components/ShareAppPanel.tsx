import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

// Handing the app to somebody standing next to you.
//
// The pilot spreads by word of mouth at a terminal: a driver shows a
// passenger, a passenger shows a friend. That moment needs a code to point a
// camera at and a link to paste into a chat — not an app store, which this
// does not use and would only confuse the ask.
//
// The address is written down here rather than read off window.location. The
// point of the sheet is to hand somebody the pilot, and the pilot lives at one
// address — a code generated on a laptop at localhost, or off the netlify.app
// preview, would scan cleanly and go nowhere the recipient can reach.
export const APP_URL = 'https://todasaferide.com'

// What actually gets handed out. The ?fresh tells the app at the other end
// to throw away whatever build that phone had cached before it opens — see
// freshStart. A phone being handed the app is starting from scratch by
// definition, and the one thing it must not do is open a copy from three
// deploys ago.
export const SHARE_URL = `${APP_URL}/?fresh=1`

export function ShareAppPanel({ onClose }: { onClose: () => void }) {
  const url = SHARE_URL
  const [copied, setCopied] = useState(false)
  const canShare = typeof navigator !== 'undefined' && !!navigator.share


  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access is refused in some in-app browsers and over plain
      // http. The address is printed below in full for exactly this case, so
      // there is always a way to pass it on.
      setCopied(false)
    }
  }

  async function shareLink() {
    try {
      await navigator.share({
        title: 'TODA SafeRide',
        text: 'Book a tricycle, or record the one you are already in.',
        url,
      })
    } catch {
      /* the sheet was dismissed — nothing to report */
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-navy-900">Get TODA SafeRide</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Point a phone camera at the code. It clears out any old copy and opens the app.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            ✕
          </button>
        </div>

        <div className="mt-3 flex justify-center rounded-xl border-2 border-gold-400 bg-white p-3">
          {/* Level H so it still scans with a thumbprint on the screen or a
              crease through a printed copy. */}
          <QRCodeSVG value={url} size={190} level="H" marginSize={2} />
        </div>

        <p className="mt-2 break-all rounded-lg bg-slate-50 px-2.5 py-2 text-center text-xs font-medium text-slate-700">
          {url}
        </p>

        <div className={`mt-3 grid gap-2 ${canShare ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <button
            type="button"
            onClick={() => void copyLink()}
            className="rounded-lg border border-slate-300 bg-white py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
          >
            {copied ? '✓ Copied' : '🔗 Copy link'}
          </button>
          {/* Only where the phone actually has a share sheet. A button that
              opens nothing is worse than no button.

              There used to be an SMS fallback beside this, opening an sms:
              link wherever the user agent looked like a phone. It went: every
              phone that matters already has a share sheet, so it only ever
              appeared where sms: had nothing to handle it — a laptop, or
              anything reporting a phone's user agent without being one. The
              copy button and the code above cover that case honestly. */}
          {canShare && (
            <button
              type="button"
              onClick={() => void shareLink()}
              className="rounded-lg bg-brand-600 py-2 text-xs font-bold text-white transition hover:bg-brand-700"
            >
              📤 Share
            </button>
          )}
        </div>

        <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] leading-snug text-slate-500">
          Opening the link from inside Messenger uses its own browser, which will not share location. Tap ⋯ and
          choose <span className="font-semibold">Open in Chrome</span> or{' '}
          <span className="font-semibold">Safari</span>.
        </p>
      </div>
    </div>
  )
}
