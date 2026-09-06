import { useState } from 'react'

// Ready-made profile photos for a vendor who has nothing to upload yet —
// eight Filipino dishes, background already removed, ~5 KB each (see
// public/store-profiles/, produced from FOOD DATABASE/catalog/photo profile).
// Served as static files and only copied into the vendor's record (as a data
// URL, like an upload) once one is actually picked, so browsing costs nothing.
const SEED_PHOTOS = [
  { file: 'food_1.webp', label: 'Bistek' },
  { file: 'food_2.webp', label: 'Inihaw na isda' },
  { file: 'food_3.webp', label: 'Pork BBQ' },
  { file: 'food_4.webp', label: 'Lechon manok' },
  { file: 'food_5.webp', label: 'Fried chicken' },
  { file: 'food_7.webp', label: 'Chicken bistek' },
  { file: 'food_8.webp', label: 'Chicken pastel' },
  { file: 'food_9.webp', label: 'Pochero' },
]

// The chooser behind "📷 Profile Photo". Upload is deliberately the first
// tile — the vendor's own picture is always the better answer, the seeds are
// for getting a page looking finished in the meantime. Same modal shape as
// ShareSheet/ContactSheet.
export function ProfilePhotoPicker({
  onUpload,
  onPick,
  onClose,
}: {
  onUpload: () => void
  onPick: (dataUrl: string) => void
  onClose: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)

  async function pick(file: string) {
    setBusy(file)
    try {
      const blob = await (await fetch(`/store-profiles/${file}`)).blob()
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(reader.error)
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(blob)
      })
      onPick(dataUrl)
      onClose()
    } catch {
      setBusy(null)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose a profile photo"
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-3 sm:items-center"
      onClick={onClose}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-center text-sm font-bold text-navy-900">Profile photo</p>
        <p className="mt-0.5 text-center text-[11px] text-slate-500">Upload your own, or start with one of these.</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => {
              onClose()
              onUpload()
            }}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-brand-300 bg-brand-50 text-xs font-semibold text-brand-700 hover:bg-brand-100"
          >
            <span aria-hidden className="text-2xl leading-none">
              📷
            </span>
            Upload photo
          </button>
          {SEED_PHOTOS.map((p) => (
            <button
              key={p.file}
              type="button"
              disabled={busy !== null}
              onClick={() => void pick(p.file)}
              title={p.label}
              className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-1 hover:bg-slate-100 disabled:opacity-60"
            >
              <img src={`/store-profiles/${p.file}`} alt={p.label} loading="lazy" className="max-h-full max-w-full object-contain" />
            </button>
          ))}
        </div>
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
