import { useRef, useState } from 'react'
import type { DriverAccessMessage } from '../types'

// The conversation between a paused driver and the App Admin: the driver says
// why the pause can be lifted ("paid the dues yesterday", with a photo of the
// receipt), Admin answers. Kept on the driver's record, so the reason a pause
// began and ended stays with the account.
export function DriverAccessThread({
  messages,
  viewer,
  onSend,
  placeholder,
}: {
  messages: DriverAccessMessage[]
  viewer: 'driver' | 'admin'
  onSend: (text: string, photoDataUrl: string | null) => void
  placeholder?: string
}) {
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [openPhoto, setOpenPhoto] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function pickPhoto(file: File | undefined) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setPhoto(typeof reader.result === 'string' ? reader.result : null)
    reader.readAsDataURL(file)
  }

  function send() {
    const trimmed = text.trim()
    if (!trimmed && !photo) return
    onSend(trimmed, photo)
    setText('')
    setPhoto(null)
  }

  return (
    <div className="space-y-2">
      {messages.length > 0 && (
        <div className="max-h-56 space-y-1.5 overflow-y-auto">
          {messages.map((m) => {
            const mine = m.from === viewer
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs ${
                    mine ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-800'
                  }`}
                >
                  <p className={`text-[10px] font-semibold ${mine ? 'text-brand-100' : 'text-slate-500'}`}>
                    {m.from === 'admin' ? 'Admin' : 'Driver'} · {new Date(m.at).toLocaleString()}
                  </p>
                  {m.text && <p className="whitespace-pre-wrap">{m.text}</p>}
                  {m.photoDataUrl && (
                    <button type="button" onClick={() => setOpenPhoto(m.photoDataUrl!)} className="mt-1 block">
                      <img src={m.photoDataUrl} alt="Attached photo" className="h-16 w-16 rounded object-cover" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="space-y-1.5">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder={placeholder ?? 'Write a message…'}
          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
        />
        {photo && (
          <div className="flex items-center gap-2">
            <img src={photo} alt="Photo to send" className="h-12 w-12 rounded object-cover" />
            <button type="button" onClick={() => setPhoto(null)} className="text-[11px] text-slate-500 underline">
              Remove photo
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0])} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            📷 Photo
          </button>
          <button
            type="button"
            onClick={send}
            disabled={!text.trim() && !photo}
            className="flex-1 rounded-lg bg-brand-600 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Send
          </button>
        </div>
      </div>

      {openPhoto && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4" onClick={() => setOpenPhoto(null)}>
          <img src={openPhoto} alt="Attached photo enlarged" className="max-h-[80vh] max-w-full rounded-lg" />
        </div>
      )}
    </div>
  )
}
