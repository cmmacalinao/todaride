import { useRef, useState } from 'react'

interface CropRect {
  id: string
  // Stored as a fraction (0-1) of the image's natural size, not display
  // pixels — so a crop drawn at one display width still extracts correctly
  // if the viewport (and therefore the rendered <img> size) changes.
  xPct: number
  yPct: number
  wPct: number
  hPct: number
}

export interface ExtractedCrop {
  id: string
  dataUrl: string
}

const CROP_JPEG_QUALITY = 0.75
// Matches compressImageFile's own cap (lib/photo.ts) — a dish photo doesn't
// need to be any bigger than that, and a menu-board photo is often high-res
// enough that an uncapped crop could still come out multiple megapixels.
const CROP_MAX_WIDTH = 480

// Lets a vendor photograph (or upload) one photo of a whole menu board and
// cut out several individual dish photos from it, instead of photographing
// each dish separately. Draw a box per dish (pointer down/drag/up, same
// gesture on touch and mouse), then "Extract crops" turns each box into its
// own small image via a canvas.
export function MenuBoardCropper({ onExtracted }: { onExtracted: (crops: ExtractedCrop[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [sourceDataUrl, setSourceDataUrl] = useState<string | null>(null)
  const [rects, setRects] = useState<CropRect[]>([])
  const [draft, setDraft] = useState<{ startX: number; startY: number; x: number; y: number; w: number; h: number } | null>(null)
  const [extracting, setExtracting] = useState(false)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setSourceDataUrl(reader.result as string)
      setRects([])
    }
    reader.readAsDataURL(file)
  }

  function pointFromEvent(e: React.PointerEvent) {
    const box = containerRef.current?.getBoundingClientRect()
    if (!box) return { x: 0, y: 0 }
    return {
      x: Math.min(Math.max(e.clientX - box.left, 0), box.width),
      y: Math.min(Math.max(e.clientY - box.top, 0), box.height),
    }
  }

  function handlePointerDown(e: React.PointerEvent) {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    const p = pointFromEvent(e)
    setDraft({ startX: p.x, startY: p.y, x: p.x, y: p.y, w: 0, h: 0 })
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!draft) return
    const p = pointFromEvent(e)
    const x = Math.min(draft.startX, p.x)
    const y = Math.min(draft.startY, p.y)
    const w = Math.abs(p.x - draft.startX)
    const h = Math.abs(p.y - draft.startY)
    setDraft({ ...draft, x, y, w, h })
  }

  function handlePointerUp() {
    if (!draft || !containerRef.current) {
      setDraft(null)
      return
    }
    const box = containerRef.current.getBoundingClientRect()
    // Ignore an accidental tap/click that produced no real drag.
    if (draft.w > 12 && draft.h > 12 && box.width > 0 && box.height > 0) {
      setRects((prev) => [
        ...prev,
        {
          id: `crop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          xPct: draft.x / box.width,
          yPct: draft.y / box.height,
          wPct: draft.w / box.width,
          hPct: draft.h / box.height,
        },
      ])
    }
    setDraft(null)
  }

  function removeRect(id: string) {
    setRects((prev) => prev.filter((r) => r.id !== id))
  }

  function handleExtract() {
    const img = imgRef.current
    if (!img || rects.length === 0) return
    setExtracting(true)
    try {
      const crops: ExtractedCrop[] = rects.map((r, i) => {
        const sourceW = Math.max(1, Math.round(r.wPct * img.naturalWidth))
        const sourceH = Math.max(1, Math.round(r.hPct * img.naturalHeight))
        const scale = Math.min(1, CROP_MAX_WIDTH / sourceW)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(sourceW * scale)
        canvas.height = Math.round(sourceH * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) return { id: r.id, dataUrl: '' }
        ctx.drawImage(
          img,
          Math.round(r.xPct * img.naturalWidth),
          Math.round(r.yPct * img.naturalHeight),
          sourceW,
          sourceH,
          0,
          0,
          canvas.width,
          canvas.height,
        )
        void i
        return { id: r.id, dataUrl: canvas.toDataURL('image/jpeg', CROP_JPEG_QUALITY) }
      })
      onExtracted(crops.filter((c) => c.dataUrl))
      setSourceDataUrl(null)
      setRects([])
    } finally {
      setExtracting(false)
    }
  }

  if (!sourceDataUrl) {
    return (
      <div>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full rounded-lg border border-dashed border-slate-300 bg-white py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          📷 Upload a photo of your whole menu board
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-500">
        Drag a box around each dish to cut it out as its own photo, then tap Extract crops.
      </p>
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="relative touch-none select-none overflow-hidden rounded-lg border border-slate-300"
      >
        <img ref={imgRef} src={sourceDataUrl} alt="Menu board" className="block w-full" draggable={false} />
        {rects.map((r, i) => (
          <div
            key={r.id}
            style={{
              position: 'absolute',
              left: `${r.xPct * 100}%`,
              top: `${r.yPct * 100}%`,
              width: `${r.wPct * 100}%`,
              height: `${r.hPct * 100}%`,
            }}
            className="border-2 border-brand-500 bg-brand-500/10"
          >
            <span className="absolute -top-5 left-0 rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {i + 1}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                removeRect(r.id)
              }}
              className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] font-semibold text-amber-700 shadow-sm"
            >
              ×
            </button>
          </div>
        ))}
        {draft && (
          <div
            style={{ position: 'absolute', left: draft.x, top: draft.y, width: draft.w, height: draft.h }}
            className="border-2 border-dashed border-brand-400 bg-brand-400/10"
          />
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleExtract}
          disabled={rects.length === 0 || extracting}
          className="flex-1 rounded-lg bg-brand-600 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {extracting ? 'Extracting…' : `Extract ${rects.length || ''} crop${rects.length === 1 ? '' : 's'}`.trim()}
        </button>
        <button
          type="button"
          onClick={() => {
            setSourceDataUrl(null)
            setRects([])
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
