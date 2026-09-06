import { useRef, useState } from 'react'
import { captureNativePhoto, compressImageFile, isNativePlatform } from '../lib/photo'

interface DocumentUploadFieldProps {
  label: string
  dataUrl: string | null
  onUpload: (dataUrl: string) => void
  // Optional — when given, a "Remove" button sits next to "Replace" once a
  // photo is uploaded, so a field that isn't required (a QR code, a receipt)
  // can be cleared without picking a new file just to get rid of the old one.
  onRemove?: () => void
  // Optional post-processing between the pick and onUpload — the vendor
  // branding rows use it to clear a flat backdrop (see removeFlatBackground).
  // Absent for documents and QR codes, whose white IS the content.
  prepare?: (dataUrl: string) => Promise<string>
}

export function DocumentUploadField({ label, dataUrl, onUpload, onRemove, prepare }: DocumentUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  // Documents are just as often an existing photo/scan as a fresh one, so
  // (unlike PhotoCaptureButton's live safety photo) this offers a native
  // Camera-or-Photo-Library choice — see captureNativePhoto's 'prompt' mode.
  // The web branch clicks the input synchronously — awaiting anything first
  // makes some mobile browsers silently refuse to open the picker at all.
  function handleTap() {
    if (!isNativePlatform()) {
      inputRef.current?.click()
      return
    }
    setBusy(true)
    void (async () => {
      try {
        const native = await captureNativePhoto({ source: 'prompt' })
        if (native) {
          onUpload(prepare ? await prepare(native) : native)
          return
        }
        inputRef.current?.click()
      } finally {
        setBusy(false)
      }
    })()
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const compressed = await compressImageFile(file)
      onUpload(prepare ? await prepare(compressed) : compressed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-2.5">
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      <button
        type="button"
        onClick={handleTap}
        disabled={busy}
        aria-label={dataUrl ? `Replace ${label}` : `Upload ${label}`}
        className="h-12 w-12 shrink-0 disabled:opacity-60"
      >
        {dataUrl ? (
          <img src={dataUrl} alt={label} className="h-12 w-12 rounded-md object-cover" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-slate-100 text-slate-300">📄</div>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-slate-700">{label}</p>
        <p className="text-[11px] text-slate-400">{dataUrl ? 'Uploaded' : 'Not uploaded'}</p>
      </div>
      <button
        type="button"
        onClick={handleTap}
        disabled={busy}
        className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
      >
        {busy ? '…' : dataUrl ? 'Replace' : 'Upload'}
      </button>
      {dataUrl && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          className="shrink-0 rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-60"
        >
          Remove
        </button>
      )}
    </div>
  )
}
