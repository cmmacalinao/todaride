import { useState } from 'react'
import { useRides } from '../context/RideContext'
import { useSession } from '../context/SessionContext'
import {
  ANNOUNCEMENT_AUDIENCE_LABELS,
  ANNOUNCEMENT_CATEGORY_LABELS,
  type AnnouncementAudience,
  type AnnouncementCategory,
} from '../types'

// Global announcements: one message to a whole audience, for promos, ads and
// "an update is coming" notices. Deliberately separate from AdminNote — a
// broadcast has no recipient to look up and no per-account history, so mixing
// the two would mean one form that half-applies to each job.
export function AnnouncementsManager() {
  const { announcements, publishAnnouncement, setAnnouncementActive, removeAnnouncement, logActivity } = useRides()
  const { authedAccount } = useSession()
  const actorName = authedAccount?.role === 'super_admin' ? 'Super Admin' : 'Admin'

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState<AnnouncementCategory>('promo')
  const [audience, setAudience] = useState<AnnouncementAudience>('all')
  const [flash, setFlash] = useState('')

  const live = announcements.filter((a) => a.active)

  function handlePublish() {
    if (!title.trim() || !body.trim()) {
      setFlash('A title and a message are both required.')
      return
    }
    publishAnnouncement({ title: title.trim(), body: body.trim(), category, audience })
    logActivity({
      actorRole: 'admin',
      actorName,
      todaOrgId: null,
      action: 'Published announcement',
      summary: `${ANNOUNCEMENT_CATEGORY_LABELS[category]} "${title.trim()}" sent to ${ANNOUNCEMENT_AUDIENCE_LABELS[audience]}.`,
    })
    setTitle('')
    setBody('')
    setFlash('Announcement published.')
  }

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">📣 New global announcement</h2>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Promotions, advertisements and notices about incoming updates. Everyone in the chosen audience sees it —
          use a note instead when the message is for one account.
        </p>

        <label className="mt-3 block text-[11px] font-medium text-slate-500">Category</label>
        <div className="mt-1 flex flex-wrap gap-1">
          {(Object.keys(ANNOUNCEMENT_CATEGORY_LABELS) as AnnouncementCategory[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                category === c ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {ANNOUNCEMENT_CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>

        <label className="mt-3 block text-[11px] font-medium text-slate-500">Audience</label>
        <select
          value={audience}
          onChange={(e) => setAudience(e.target.value as AnnouncementAudience)}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          {(Object.keys(ANNOUNCEMENT_AUDIENCE_LABELS) as AnnouncementAudience[]).map((a) => (
            <option key={a} value={a}>
              {ANNOUNCEMENT_AUDIENCE_LABELS[a]}
            </option>
          ))}
        </select>

        <label className="mt-3 block text-[11px] font-medium text-slate-500">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. ₱20 off every ride this week"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mt-3 block text-[11px] font-medium text-slate-500">Message</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="What are you announcing?"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />

        <button
          type="button"
          onClick={handlePublish}
          className="mt-3 w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Publish announcement
        </button>
        {flash && <p className="mt-2 text-[11px] font-medium text-brand-700">{flash}</p>}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Published</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
            {live.length} live of {announcements.length}
          </span>
        </div>
        {announcements.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-xs text-slate-400">
            Nothing published yet.
          </p>
        ) : (
          <div className="space-y-2">
            {announcements.map((a) => (
              <div
                key={a.id}
                className={`rounded-lg border p-2.5 text-xs ${
                  a.active ? 'border-brand-200 bg-brand-50' : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-800">{a.title}</p>
                  <span className="shrink-0 text-[10px] text-slate-400">
                    {new Date(a.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-0.5 text-slate-600">{a.body}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  {ANNOUNCEMENT_CATEGORY_LABELS[a.category]} · {ANNOUNCEMENT_AUDIENCE_LABELS[a.audience]} ·{' '}
                  {a.active ? 'live' : 'paused'}
                </p>
                <div className="mt-2 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAnnouncementActive(a.id, !a.active)}
                    className="flex-1 rounded-lg border border-slate-300 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-white"
                  >
                    {a.active ? 'Pause' : 'Make live'}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAnnouncement(a.id)}
                    className="flex-1 rounded-lg border border-slate-300 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-white"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
