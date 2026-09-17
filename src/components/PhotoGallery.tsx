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

  const shown = photos.filter((p) => !p.removedAt && p.dataUrl)
  const deletedCount = photos.length - shown.length
  const preview = shown.find((p) => p.id === previewId) ?? null

  if (shown.length === 0 && deletedCount === 0) return null

  function close() {
    setPreviewId(null)
    setConfirming(false)
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-slate-600">
        {title}
        {deletedCount > 0 && <span className="ml-1.5 font-normal text-slate-400">· {deletedCount} deleted</span>}
      </p>
      {shown.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {shown.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreviewId(p.id)}
              aria-label={`Open safety photo taken ${new Date(p.takenAt).toLocaleTimeString()}`}
              className="shrink-0 overflow-hidden rounded-lg border border-slate-200"
            >
              <img src={p.dataUrl} alt="Safety record" className="h-14 w-14 object-cover" />
            </button>
          ))}
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
