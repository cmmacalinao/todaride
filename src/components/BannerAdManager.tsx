import { useRef, useState } from 'react'
import { useRides } from '../context/RideContext'
import { BANNER_AD_SLOT_COUNT } from '../types'

// Uploaded artwork is downscaled and re-encoded before it ever reaches state.
// Everything in this prototype persists to localStorage as one JSON blob, and
// a couple of raw phone photos as base64 would blow the ~5MB quota — which
// does not fail politely, it throws and takes every other saved thing (rides,
// accounts, settings) down with it. 1200px at JPEG 0.72 keeps a banner sharp
// on a phone at roughly 150-250KB.
const MAX_WIDTH = 1200
const JPEG_QUALITY = 0.72

async function downscaleToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_WIDTH / bitmap.width)
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not available')
  // White behind the image so a transparent PNG does not turn black once it
  // is flattened into JPEG.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
}

export function BannerAdManager() {
  const { bannerAds, setBannerAdSlot } = useRides()
  const [busySlot, setBusySlot] = useState<number | null>(null)
  const [error, setError] = useState('')
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  async function handleFile(index: number, file: File | undefined) {
    if (!file) return
    setError('')
    setBusySlot(index)
    try {
      const imageUrl = await downscaleToDataUrl(file)
      setBannerAdSlot(index, {
        id: `ad-${index + 1}-${Date.now()}`,
        imageUrl,
        caption: file.name.replace(/\.[^.]+$/, ''),
      })
    } catch {
      setError('Could not read that image — try a JPG or PNG.')
    } finally {
      setBusySlot(null)
      // Clear the input so re-picking the same file still fires onChange.
      const el = inputs.current[index]
      if (el) el.value = ''
    }
  }

  const filled = bannerAds.filter(Boolean).length

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700">Banner ads</h2>
      <p className="mt-0.5 text-xs text-slate-500">
        Up to {BANNER_AD_SLOT_COUNT} banners fill the ad box at the bottom of the passenger home screen. They
        arrange themselves — one banner takes the whole box, two or four split it evenly. Empty slots are skipped.
      </p>
      <p className="mt-1 text-[11px] text-slate-400">
        {filled} of {BANNER_AD_SLOT_COUNT} slots filled · images are resized to {MAX_WIDTH}px before saving
      </p>

      {error && <p className="mt-2 text-xs font-medium text-amber-700">{error}</p>}

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {Array.from({ length: BANNER_AD_SLOT_COUNT }, (_, i) => {
          const ad = bannerAds[i]
          return (
            <div key={i} className="rounded-lg border border-slate-200 p-2">
              <p className="mb-1.5 text-[11px] font-semibold text-slate-500">Slot {i + 1}</p>
              <div className="flex h-24 items-center justify-center overflow-hidden rounded-md bg-slate-50">
                {ad ? (
                  <img src={ad.imageUrl} alt={ad.caption} className="h-full w-full object-contain" />
                ) : (
                  <span className="text-[11px] text-slate-400">Empty</span>
                )}
              </div>
              <input
                ref={(el) => {
                  inputs.current[i] = el
                }}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void handleFile(i, e.target.files?.[0])}
              />
              <div className="mt-1.5 flex gap-1.5">
                <button
                  type="button"
                  disabled={busySlot === i}
                  onClick={() => inputs.current[i]?.click()}
                  className="flex-1 rounded-md border border-slate-300 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                >
                  {busySlot === i ? 'Resizing…' : ad ? 'Change' : 'Upload'}
                </button>
                {ad && (
                  <button
                    type="button"
                    onClick={() => setBannerAdSlot(i, null)}
                    className="rounded-md border border-amber-300 px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-50"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
