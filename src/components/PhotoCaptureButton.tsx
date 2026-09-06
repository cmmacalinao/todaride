import { useRef, useState } from 'react'
import { captureNativePhoto, compressImageFile, isNativePlatform } from '../lib/photo'

export function PhotoCaptureButton({ onCapture }: { onCapture: (dataUrl: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  // Tries the native camera first (real app only — see captureNativePhoto);
  // on the web falls back to the file input's own capture="environment"
  // prompt below. The web branch clicks that input synchronously, before
  // any await, or mobile browsers silently refuse to open it at all — see
  // captureNativePhoto's comment.
  function handleTap() {
    if (!isNativePlatform()) {
      inputRef.current?.click()
      return
    }
    setBusy(true)
    void (async () => {
      try {
        const native = await captureNativePhoto({ source: 'camera' })
        if (native) {
          onCapture(native)
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
      const dataUrl = await compressImageFile(file)
      onCapture(dataUrl)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />
      <button
        type="button"
        onClick={handleTap}
        disabled={busy}
        aria-label="Take photo of tricycle and driver"
        className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
      >
        <span className="text-base leading-none">{busy ? '⏳' : '📷'}</span>
        <span className="text-[11px] font-semibold">{busy ? 'Processing…' : 'Photo'}</span>
      </button>
    </>
  )
}
