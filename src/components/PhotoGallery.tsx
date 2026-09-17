import { useState } from 'react'
import type { RidePhoto } from '../types'

// A trip's safety photos: thumbnails, tap for full size, and — for the person
// who took one — a way to delete it.
//
// Deleting is real: the picture itself is dropped from the trip (see
// REMOVE_SAFETY_PHOTO), and only a marker that a photo was deleted is kept,
// so a phone still holding an older copy of the trip cannot bring it back.
// Asked twice on purpose, because it cannot be undone.
export function PhotoGallery({
  photos,
  canDelete,
  onDelete,
  title = 'Safety photos',
}: {
  photos: RidePhoto[]
  // Whether this viewer may delete a given photo — the person who took it.
  canDelete?: (photo: RidePhoto) => boolean
  onDelete?: (photo: RidePhoto) => void
  title?: string
}) {
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  // Choosing several to delete at once.
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmingMany, setConfirmingMany] = useState(false)

  const shown = photos.filter((p) => !p.removedAt && p.dataUrl)
  const deletedCount = photos.length - shown.length
  const preview = shown.find((p) => p.id === previewId) ?? null
  const deletable = shown.filter((p) => canDelete?.(p) && onDelete)

  function stopSelecting() {
    setSelecting(false)
    setSelected(new Set())
    setConfirmingMany(false)
  }

  if (shown.length === 0 && deletedCount === 0) return null

  function close() {
    setPreviewId(null)
    setConfirming(false)
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-600">
          {title}
          {deletedCount > 0 && <span className="ml-1.5 font-normal text-slate-400">· {deletedCount} deleted</span>}
        </p>
        {deletable.length > 1 && (
          <button
            type="button"
            onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
            className="text-[11px] font-semibold text-brand-700 underline"
          >
            {selecting ? 'Cancel' : 'Select'}
          </button>
        )}
      </div>
      {shown.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {shown.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                if (!selecting) return setPreviewId(p.id)
                if (!(canDelete?.(p) && onDelete)) return
                setSelected((prev) => {
                  const next = new Set(prev)
                  if (next.has(p.id)) next.delete(p.id)
                  else next.add(p.id)
                  return next
                })
              }}
              aria-label={
                selecting
                  ? `${selected.has(p.id) ? 'Unselect' : 'Select'} safety photo taken ${new Date(p.takenAt).toLocaleTimeString()}`
                  : `Open safety photo taken ${new Date(p.takenAt).toLocaleTimeString()}`
              }
              aria-pressed={selecting ? selected.has(p.id) : undefined}
              className={`relative shrink-0 overflow-hidden rounded-lg border-2 ${selected.has(p.id) ? 'border-danger-600' : 'border-slate-200'}`}
            >
              <img src={p.dataUrl} alt="Safety record" className={`h-14 w-14 object-cover ${selecting && !selected.has(p.id) ? 'opacity-70' : ''}`} />
              {selecting && (
                <span
                  aria-hidden
                  className={`absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-bold ${selected.has(p.id) ? 'border-danger-600 bg-danger-600 text-white' : 'border-white bg-white/80 text-transparent'}`}
                >
                  ✓
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {selecting && (
        <div className="space-y-1.5 rounded-lg border border-danger-200 bg-danger-50 p-2">
          {!confirmingMany ? (
            <button
              type="button"
              disabled={selected.size === 0}
              onClick={() => setConfirmingMany(true)}
              className="w-full rounded-lg bg-danger-600 py-1.5 text-xs font-bold text-white hover:bg-danger-700 disabled:cursor-not-allowed disabled:bg-danger-300"
            >
              🗑️ Delete {selected.size > 0 ? `${selected.size} selected` : 'selected'}
            </button>
          ) : (
            <>
              <p className="text-center text-xs font-semibold text-danger-900">
                Delete {selected.size} photo{selected.size === 1 ? '' : 's'}? They are removed for everyone and cannot be recovered.
              </p>
              <button
                type="button"
                onClick={() => {
                  for (const p of shown) if (selected.has(p.id)) onDelete?.(p)
                  stopSelecting()
                }}
                className="w-full rounded-lg bg-danger-600 py-1.5 text-xs font-bold text-white hover:bg-danger-700"
              >
                Yes, delete {selected.size}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingMany(false)}
                className="w-full rounded-lg border border-slate-300 bg-white py-1.5 text-xs font-semibold text-slate-700"
              >
                Keep them
              </button>
            </>
          )}
        </div>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-3 bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Safety photo"
          onClick={close}
        >
          <img
            src={preview.dataUrl}
            alt="Safety record enlarged"
            className="max-h-[65vh] max-w-full rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="text-xs text-white/80">Taken {new Date(preview.takenAt).toLocaleString()}</p>
          <div className="flex w-full max-w-xs flex-col gap-2" onClick={(e) => e.stopPropagation()}>
            {canDelete?.(preview) && onDelete && !confirming && (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="w-full rounded-lg border border-danger-400 bg-white py-2 text-sm font-semibold text-danger-700 hover:bg-danger-50"
              >
                🗑️ Delete photo
              </button>
            )}
            {confirming && (
              <div className="space-y-2 rounded-lg bg-white p-3 text-center">
                <p className="text-sm font-semibold text-slate-800">Delete this photo?</p>
                <p className="text-[11px] text-slate-500">It is removed from this trip for everyone and cannot be recovered.</p>
                <button
                  type="button"
                  onClick={() => {
                    onDelete?.(preview)
                    close()
                  }}
                  className="w-full rounded-lg bg-danger-600 py-2 text-sm font-bold text-white hover:bg-danger-700"
                >
                  Yes, delete it
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="w-full rounded-lg border border-slate-300 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Keep it
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={close}
              className="w-full rounded-lg bg-white/90 py-2 text-sm font-semibold text-slate-800 hover:bg-white"
            >
              ✕ Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
