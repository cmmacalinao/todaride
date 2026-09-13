import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { PILOT_ORIGIN } from '../lib/pilotOrigin'

// Handing the app to somebody standing next to you.
//
// The pilot spreads by word of mouth at a terminal: a driver shows a
// passenger, a passenger shows a friend. That moment needs a code to point a
// camera at and a link to paste into a chat — not an app store, which this
// does not use and would only confuse the ask.
//
// The address is written down here rather than read off window.location. The
// point of the sheet is to hand somebody the pilot, and the pilot lives at one
// address — a code generated on a laptop at localhost would scan cleanly and
// go nowhere the recipient can reach. Which address that is lives in
// lib/pilotOrigin, since the OTP and payment calls have to agree with it.
export const APP_URL = PILOT_ORIGIN

// What actually gets handed out. The ?fresh tells the app at the other end
// to throw away whatever build that phone had cached before it opens — see
// freshStart. A phone being handed the app is starting from scratch by
// definition, and the one thing it must not do is open a copy from three
// deploys ago.
export const SHARE_URL = `${APP_URL}/?fresh=1`

export function ShareAppPanel({ onClose }: { onClose: () => void }) {
  const url = SHARE_URL
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const canShare = typeof navigator !== 'undefined' && !!navigator.share

  // The older way of copying, kept because the modern one is not always
  // there. navigator.clipboard is undefined outside a secure context and is
  // refused outright by several in-app browsers — and this panel exists to be
  // used inside exactly those, where somebody is passing the pilot along in a
  // Messenger thread. execCommand is deprecated and still the only thing that
  // works in those hosts.
  function copyTheOldWay(text: string): boolean {
    try {
      const field = document.createElement('textarea')
      field.value = text
      // Off-screen rather than hidden: a field with display:none cannot be
      // selected, and selection is the whole mechanism here.
      field.style.position = 'fixed'
      field.style.top = '-1000px'
      field.setAttribute('readonly', '')
      document.body.appendChild(field)
      field.select()
      field.setSelectionRange(0, text.length)
      const ok = document.execCommand('copy')
      document.body.removeChild(field)
      return ok
    } catch {
      return false
    }
  }

  async function copyLink() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
        setCopyState('copied')
        setTimeout(() => setCopyState('idle'), 2000)
        return
      }
    } catch {
      // Refused. Fall through and try the old way rather than giving up —
      // the previous version stopped here, which looked to the user like a
      // button that did nothing at all.
    }
    const ok = copyTheOldWay(url)
    setCopyState(ok ? 'copied' : 'failed')
    if (ok) setTimeout(() => setCopyState('idle'), 2000)
  }

  async function shareLink() {
    try {
      await navigator.share({
        title: 'TODA Ride Mobility',
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
            <h2 className="text-base font-bold text-navy-900">Get TODA Ride Mobility</h2>
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

        {/* Tapping selects the whole address, so it can be copied by hand
            when the clipboard is refused — which is the case this panel is
            most likely to meet. */}
        <p
          onClick={(e) => {
            const range = document.createRange()
            range.selectNodeContents(e.currentTarget)
            const selection = window.getSelection()
            selection?.removeAllRanges()
            selection?.addRange(range)
          }}
          className="mt-2 cursor-pointer select-all break-all rounded-lg bg-slate-50 px-2.5 py-2 text-center text-xs font-medium text-slate-700"
        >
          {url}
        </p>
        {copyState === 'failed' && (
          <p className="mt-1 text-center text-[11px] leading-snug text-amber-700">
            Hindi pumayag ang browser na kopyahin ito. Pindutin nang matagal ang address sa itaas, tapos
            piliin ang <span className="font-semibold">Copy</span>.
          </p>
        )}

        <div className={`mt-3 grid gap-2 ${canShare ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <button
            type="button"
            onClick={() => void copyLink()}
            className="rounded-lg border border-slate-300 bg-white py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
          >
            {copyState === 'copied' ? '✓ Copied' : '🔗 Copy link'}
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
