import { useState } from 'react'
import { useRides } from '../context/RideContext'
import { ANNOUNCEMENT_CATEGORY_LABELS, type AnnouncementAudience } from '../types'

// Which audiences a given viewer is part of. 'all' is in every list, so a
// broadcast to Everyone reaches each surface without the publisher having to
// send it four times.
type Viewer = Exclude<AnnouncementAudience, 'all'>

const CATEGORY_TONE: Record<string, string> = {
  promo: 'border-gold-400/70 bg-gold-50',
  update: 'border-brand-200 bg-brand-50',
  ad: 'border-slate-200 bg-slate-50',
  notice: 'border-slate-200 bg-white',
}

// The receiving end of Admin's global announcements. Every account surface —
// passenger, parent, driver, TODA, pharmacy/vendor, operator, franchise —
// renders this so a promo or an "update coming" notice actually lands
// somewhere, instead of only existing in the admin console that wrote it.
//
// Renders nothing at all when there is no live announcement for this viewer:
// an empty "no announcements" card on the booking screen would be pure noise.

// Whether the reader has folded the feed away. Kept in localStorage rather
// than component state so "hide" actually means hidden — a collapse that
// sprang open again on the next page load would read as the button not
// working. One key for the device: a phone here is one person.
const COLLAPSED_KEY = 'toda-announcements-collapsed'

export function AnnouncementFeed({ viewer }: { viewer: Viewer }) {
  const { announcements } = useRides()
  const [expanded, setExpanded] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === '1'
    } catch {
      return false
    }
  })

  function toggleCollapsed() {
    setCollapsed((wasCollapsed) => {
      const next = !wasCollapsed
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        // A full or blocked localStorage should not stop the panel folding.
      }
      return next
    })
  }

  const mine = announcements.filter((a) => a.active && (a.audience === 'all' || a.audience === viewer))
  if (mine.length === 0) return null

  const visible = expanded ? mine : mine.slice(0, 2)

  // Collapsed: one quiet strip that still says how many are waiting, so
  // folding the feed away never hides the fact that something arrived.
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggleCollapsed}
        className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition hover:bg-slate-50"
      >
        <span aria-hidden className="text-sm leading-none">
          📣
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-500">
          Announcements ({mine.length})
        </span>
        <span className="shrink-0 text-[11px] font-semibold text-brand-600">Show</span>
      </button>
    )
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700">📣 Announcements</h2>
        <span className="flex shrink-0 items-center gap-1.5">
          {mine.length > 1 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
              {mine.length}
            </span>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Hide announcements"
            className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-100"
          >
            Hide
          </button>
        </span>
      </div>

      <div className="space-y-1.5">
        {visible.map((a) => (
          <article key={a.id} className={`rounded-lg border p-2.5 ${CATEGORY_TONE[a.category] ?? 'border-slate-200'}`}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-xs font-semibold text-slate-800">{a.title}</h3>
              <span className="shrink-0 text-[10px] text-slate-400">
                {new Date(a.createdAt).toLocaleDateString()}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-600">{a.body}</p>
            <p className="mt-1 text-[10px] font-medium text-slate-500">
              {ANNOUNCEMENT_CATEGORY_LABELS[a.category]}
            </p>
          </article>
        ))}
      </div>

      {mine.length > 2 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 w-full rounded-lg border border-slate-300 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
        >
          {expanded ? 'Show fewer' : `Show all ${mine.length}`}
        </button>
      )}
    </section>
  )
}
