import { useMemo, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useRides } from '../context/RideContext'

type Target = 'home' | 'signup' | 'driver' | 'terminal' | 'custom'

const TARGET_LABELS: Record<Target, string> = {
  home: 'App home',
  signup: 'Sign-up page',
  driver: "A driver's tricycle sticker",
  terminal: 'A terminal poster',
  custom: 'Custom link',
}

// Makes the codes that get printed — on the banner, on a terminal tarpaulin,
// on the sticker inside a tricycle. Kept in Admin rather than left to an
// online QR generator because the link has to be built from the app's own
// published address and its own driver ids: a code typed by hand into some
// website is a code nobody can check, and a wrong one is only discovered
// after it is printed a hundred times.
export function QrCodeCreator() {
  const { publicBaseUrl, drivers, terminals, todaOrganizations } = useRides()
  const [target, setTarget] = useState<Target>('home')
  const [driverId, setDriverId] = useState('')
  const [terminalId, setTerminalId] = useState('')
  const [custom, setCustom] = useState('')
  const [size, setSize] = useState(512)
  const previewRef = useRef<HTMLDivElement>(null)

  const base = publicBaseUrl || window.location.origin
  // A code encoding "localhost" is unscannable by anyone but this machine —
  // it must be caught here, not at the printer.
  const baseIsLocal = /localhost|127\.0\.0\.1/.test(base)

  const bookable = drivers.filter((d) => d.verificationStatus === 'approved' && d.accessStatus === 'active')
  const activeTerminals = terminals.filter((t) => t.isActive)

  const { url, caption } = useMemo(() => {
    switch (target) {
      case 'signup':
        return { url: `${base}/welcome`, caption: 'Create your TODA Ride Mobility account' }
      case 'driver': {
        const d = bookable.find((x) => x.id === driverId)
        return d
          ? { url: `${base}/scan/${d.id}`, caption: `Record mo ang Biyahe — ${d.name} · ${d.plateNumber}` }
          : { url: '', caption: '' }
      }
      case 'terminal': {
        const t = activeTerminals.find((x) => x.id === terminalId)
        const org = t?.todaOrgId ? todaOrganizations.find((o) => o.id === t.todaOrgId) : null
        return t
          ? { url: `${base}/welcome`, caption: `${t.name}${org ? ` · ${org.name}` : ''}` }
          : { url: '', caption: '' }
      }
      case 'custom':
        return { url: custom.trim(), caption: 'TODA Ride Mobility' }
      default:
        return { url: base, caption: 'TODA Ride Mobility — Safe Rides for You and Your Family' }
    }
  }, [target, base, driverId, terminalId, custom, bookable, activeTerminals, todaOrganizations])

  function download(kind: 'svg' | 'png') {
    const svg = previewRef.current?.querySelector('svg')
    if (!svg) return
    const source = new XMLSerializer().serializeToString(svg)
    const name = `toda-saferide-qr-${target}${driverId ? `-${driverId}` : ''}`

    if (kind === 'svg') {
      triggerDownload(new Blob([source], { type: 'image/svg+xml' }), `${name}.svg`)
      return
    }
    // Printers usually want a raster. Drawn at the chosen size onto a white
    // canvas — a transparent QR photographs as grey-on-grey and will not scan.
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, size, size)
      ctx.drawImage(img, 0, 0, size, size)
      canvas.toBlob((blob) => blob && triggerDownload(blob, `${name}.png`), 'image/png')
    }
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(source)))}`
  }

  function triggerDownload(blob: Blob, filename: string) {
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = filename
    a.click()
    URL.revokeObjectURL(href)
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Builds a scannable code from the app&apos;s own published address, ready to drop into the banner artwork or
        send to a printer. Download as SVG for print (stays sharp at any size) or PNG for anything that will not
        take vector art.
      </p>

      {baseIsLocal && (
        <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] font-medium text-amber-800">
          The app&apos;s public address is not set, so these codes point at <code>{base}</code> — reachable only from
          this machine. Set it in Super Admin › Public app address before printing anything.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {(Object.keys(TARGET_LABELS) as Target[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTarget(t)}
            className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition ${
              target === t
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {TARGET_LABELS[t]}
          </button>
        ))}
      </div>

      {target === 'driver' && (
        <select
          value={driverId}
          onChange={(e) => setDriverId(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">Select a driver…</option>
          {bookable.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} · {d.plateNumber}
            </option>
          ))}
        </select>
      )}

      {target === 'terminal' && (
        <select
          value={terminalId}
          onChange={(e) => setTerminalId(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">Select a terminal…</option>
          {activeTerminals.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}

      {target === 'custom' && (
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="https://…"
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        />
      )}

      <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-start">
        <div ref={previewRef} className="shrink-0 rounded-lg bg-white p-2 shadow-sm">
          {/* Level H so the code still scans with a logo pasted over the
              middle, which is what the banner artwork does. */}
          <QRCodeSVG value={url || ' '} size={168} level="H" marginSize={2} />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-[11px] font-semibold text-slate-600">This code opens</p>
            <p className="break-all text-xs font-medium text-slate-800">{url || '— pick a target above —'}</p>
            {caption && <p className="mt-0.5 text-[11px] text-slate-500">Suggested caption: {caption}</p>}
          </div>
          <label className="block">
            <span className="mb-0.5 block text-[11px] font-medium text-slate-600">Export size · {size}px</span>
            <input
              type="range"
              min={256}
              max={2048}
              step={128}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="w-full"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!url}
              onClick={() => download('svg')}
              className="flex-1 rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
            >
              ⬇ SVG for print
            </button>
            <button
              type="button"
              disabled={!url}
              onClick={() => download('png')}
              className="flex-1 rounded-lg border border-slate-300 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              ⬇ PNG {size}px
            </button>
          </div>
        </div>
      </div>

      <p className="text-[11px] leading-snug text-slate-400">
        A poster code sends people to the app in general. The code that records a trip against a particular
        tricycle is the per-driver one — pick &ldquo;A driver&apos;s tricycle sticker&rdquo; for those, one per
        tricycle.
      </p>
    </div>
  )
}
