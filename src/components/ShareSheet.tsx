import { useState } from 'react'

// Where a vendor page link can be sent. Explicit targets rather than only
// navigator.share: the native sheet exists on phones but not on most
// desktop browsers, and even on a phone a tap that opens "the OS thing" reads
// as vaguer than a row of the apps people here actually use. Facebook and
// Messenger first — in the pilot's barangays that is where a carinderia's
// customers already are.
//
// Same modal shape as ContactSheet, so the two sheets a vendor reaches from
// the header read as one family.
export function ShareSheet({ title, url, onClose }: { title: string; url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const encodedUrl = encodeURIComponent(url)
  const encodedText = encodeURIComponent(`${title} — order on TODA SafeRide: ${url}`)
  // lib.dom types navigator.share as always present; browsers disagree, so
  // this has to be a runtime check rather than a type-level one.
  const canNativeShare = typeof navigator.share === 'function'

  const targets: { label: string; icon: string; href: string }[] = [
    { label: 'Facebook', icon: '📘', href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` },
    // The app-scheme link opens Messenger directly on a phone, which is where
    // this gets used; a desktop without Messenger simply does nothing, and
    // the Facebook row beside it covers that case.
    { label: 'Messenger', icon: '💬', href: `fb-messenger://share/?link=${encodedUrl}` },
    { label: 'WhatsApp', icon: '🟢', href: `https://wa.me/?text=${encodedText}` },
    { label: 'Viber', icon: '💜', href: `viber://forward?text=${encodedText}` },
    { label: 'X', icon: '✖️', href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodeURIComponent(title)}` },
  ]

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked — the link is printed below so it can still be
      // selected by hand.
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title, url })
      onClose()
    } catch {
      // Cancelled the OS sheet — stay on ours.
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Share ${title}`}
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-3 sm:items-center"
      onClick={onClose}
    >
      <div className="w-full max-w-xs rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-center text-sm font-bold text-navy-900">Share {title}</p>
        <p className="mt-0.5 truncate text-center text-[11px] text-slate-500">{url}</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {targets.map((t) => (
            <a
              key={t.label}
              href={t.href}
              target="_blank"
              rel="noreferrer"
              className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              <span aria-hidden className="text-xl leading-none">
                {t.icon}
              </span>
              {t.label}
            </a>
          ))}
          <button
            type="button"
            onClick={() => void copyLink()}
            className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <span aria-hidden className="text-xl leading-none">
              {copied ? '✓' : '🔗'}
            </span>
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
        {canNativeShare && (
          <button
            type="button"
            onClick={() => void nativeShare()}
            className="mt-2 w-full rounded-xl border border-brand-300 bg-brand-50 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-100"
          >
            More apps…
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full py-1.5 text-center text-xs font-semibold text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
