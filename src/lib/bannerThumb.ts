// A picture of the vendor's banner, for link previews.
//
// Facebook, Messenger, Viber and WhatsApp show one image with a shared link,
// and they fetch it as a plain file — they never run the app, so the banner
// a customer sees on the page (gradient, banner art, the profile photo
// seated where the vendor dragged it, name and tagline over it) does not
// exist for them unless something draws it into an actual image. This does,
// on the vendor's own device, with the same ingredients the page uses, and
// the result is stored on the Pharmacy record (bannerThumbDataUrl) so the
// edge function (netlify/edge-functions/vendor-og.ts) can hand it out.
//
// 1200×630 is the size every crawler is happiest with (1.91:1, "large
// image" cards); JPEG at 0.8 keeps it around 60–100 KB.
import type { Pharmacy } from '../types'
import { resolveVendorAccent } from '../components/VendorStorefront'

const W = 1200
const H = 630

// Tailwind stops the theme gradients are written in — see VENDOR_THEME_COLORS
// and VENDOR_THEME in VendorStorefront — resolved to the hex the browser
// paints, since a canvas cannot read a class name.
const TW: Record<string, string> = {
  'amber-500': '#f59e0b',
  'amber-700': '#b45309',
  'orange-500': '#f97316',
  'orange-600': '#ea580c',
  'orange-900': '#7c2d12',
  'rose-500': '#f43f5e',
  'red-500': '#ef4444',
  'teal-500': '#14b8a6',
  'cyan-600': '#0891b2',
  'blue-500': '#3b82f6',
  'blue-600': '#2563eb',
  'indigo-500': '#6366f1',
  'indigo-600': '#4f46e5',
  'indigo-700': '#4338ca',
  'violet-500': '#8b5cf6',
  'violet-600': '#7c3aed',
  'purple-500': '#a855f7',
  'fuchsia-600': '#c026d3',
  'pink-400': '#f472b6',
  'emerald-500': '#10b981',
  'emerald-600': '#059669',
  'green-500': '#22c55e',
  'lime-400': '#a3e635',
  'yellow-400': '#facc15',
  'stone-900': '#1c1917',
  'slate-600': '#475569',
  'slate-800': '#1e293b',
  'slate-900': '#0f172a',
  black: '#000000',
}

function gradientStops(gradient: string): string[] {
  return gradient
    .split(/\s+/)
    .map((token) => token.replace(/^(from|via|to)-/, ''))
    .map((name) => TW[name] ?? '#f97316')
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

// The same shapes VendorBannerArt draws, in the same 600×160 frame,
// anchored left and scaled to the banner's height (xMinYMid slice).
function drawBannerArt(ctx: CanvasRenderingContext2D) {
  const s = H / 160
  ctx.save()
  ctx.scale(s, s)
  const fill = (d: string, color: string) => {
    ctx.fillStyle = color
    ctx.fill(new Path2D(d))
  }
  fill('M-20 44 C 120 -12, 300 78, 620 8 L 620 -10 L -20 -10 Z', 'rgba(255,255,255,0.10)')
  fill('M260 160 C 380 118, 480 92, 620 44 L 620 160 Z', 'rgba(255,255,255,0.08)')
  fill('M-20 118 C 90 88, 180 142, 300 118 S 500 78, 620 100 L 620 112 C 500 94, 400 132, 300 130 S 90 104, -20 130 Z', 'rgba(255,255,255,0.32)')
  fill('M-20 136 C 100 110, 200 152, 330 130 S 520 96, 620 118 L 620 128 C 520 108, 430 144, 330 142 S 100 126, -20 148 Z', 'rgba(255,255,255,0.16)')
  const ink = 'rgba(120, 20, 0, 0.22)'
  const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, r)
    ctx.fill()
  }
  const fork = (tx: number, ty: number, deg: number) => {
    ctx.save()
    ctx.translate(tx, ty)
    ctx.rotate((deg * Math.PI) / 180)
    ctx.scale(0.8, 0.8)
    ctx.fillStyle = ink
    roundRect(-3, -30, 6, 34, 3)
    roundRect(6, -32, 6, 36, 3)
    roundRect(15, -30, 6, 34, 3)
    roundRect(-3, 0, 24, 14, 5)
    roundRect(6, 10, 7, 60, 3.5)
    ctx.restore()
  }
  fork(44, 62, -14)
  fork(196, 44, 22)
  // Splash.
  ctx.save()
  ctx.translate(6, 10)
  ctx.scale(0.85, 0.85)
  fill('M62 48 c 6 -12, 14 -10, 12 2 c -1 8, -6 12, -10 14 c -2 -4, -4 -10, -2 -16 z', ink)
  fill('M80 66 c -1 -10, 8 -14, 12 -6 c 2 5, -2 12, -8 16 c -3 -3, -4 -6, -4 -10 z', ink)
  ctx.beginPath()
  ctx.arc(54, 84, 3.5, 0, Math.PI * 2)
  ctx.fillStyle = ink
  ctx.fill()
  ctx.restore()
  // Chef's hat.
  ctx.save()
  ctx.translate(122, 46)
  ctx.rotate((-18 * Math.PI) / 180)
  ctx.scale(0.85, 0.85)
  ctx.strokeStyle = ink
  ctx.lineWidth = 5
  ctx.lineJoin = 'round'
  ctx.stroke(new Path2D('M-16 10 a 10 10 0 1 1 8 -16 a 12 12 0 1 1 20 4 a 9 9 0 1 1 4 14 v 6 h -36 z'))
  ctx.stroke(new Path2D('M-20 22 h 40 v 8 h -40 z'))
  ctx.restore()
  ctx.restore()
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1)
  return `${t}…`
}

export async function renderBannerThumbnail(pharmacy: Pharmacy): Promise<string | null> {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // Gradient, the same diagonal (bg-gradient-to-br) as the page.
  const accent = resolveVendorAccent(pharmacy)
  const stops = gradientStops(accent.gradient)
  const grad = ctx.createLinearGradient(0, 0, W, H)
  stops.forEach((color, i) => grad.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), color))
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)
  drawBannerArt(ctx)

  // The profile photo, seated where the vendor put it: the page's header
  // keeps the picture `scale × header height` tall, centred on
  // (x%, y%) of the header (see VendorHeaderCard). Same rule, this frame.
  if (pharmacy.coverPhotoDataUrl && !pharmacy.coverPhotoDataUrl.endsWith('.svg')) {
    const photo = await loadImage(pharmacy.coverPhotoDataUrl)
    if (photo && photo.naturalWidth > 0) {
      const pos = { x: 75, y: 50, scale: 1, ...(pharmacy.coverPhotoPosition ?? {}) }
      const ph = H * (pos.scale ?? 1)
      const pw = (photo.naturalWidth / photo.naturalHeight) * ph
      const cx = (pos.x / 100) * W
      const cy = (pos.y / 100) * H
      ctx.drawImage(photo, cx - pw / 2, cy - ph / 2, pw, ph)
    }
  }

  // A dark sweep from the left so the name reads over any photo.
  const shade = ctx.createLinearGradient(0, 0, W * 0.75, 0)
  shade.addColorStop(0, 'rgba(0,0,0,0.45)')
  shade.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, W, H)

  // Logo (or the type's emoji) in a white-rimmed tile, name and tagline
  // beside it — the header's own arrangement, larger.
  const tile = 170
  const tileX = 60
  const tileY = H / 2 - tile / 2
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(tileX, tileY, tile, tile, 28)
  ctx.fillStyle = '#ffffff'
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = 24
  ctx.fill()
  ctx.restore()
  const logo = pharmacy.logoDataUrl ? await loadImage(pharmacy.logoDataUrl) : null
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(tileX + 8, tileY + 8, tile - 16, tile - 16, 22)
  ctx.clip()
  if (logo && logo.naturalWidth > 0) {
    // object-cover
    const r = Math.max((tile - 16) / logo.naturalWidth, (tile - 16) / logo.naturalHeight)
    const dw = logo.naturalWidth * r
    const dh = logo.naturalHeight * r
    ctx.drawImage(logo, tileX + 8 + (tile - 16 - dw) / 2, tileY + 8 + (tile - 16 - dh) / 2, dw, dh)
  } else {
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(tileX + 8, tileY + 8, tile - 16, tile - 16)
    ctx.font = '96px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(accent.icon, tileX + tile / 2, tileY + tile / 2 + 8)
  }
  ctx.restore()

  const textX = tileX + tile + 44
  const maxText = W - textX - 60
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = 10
  ctx.shadowOffsetY = 2
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 64px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
  ctx.fillText(truncate(ctx, pharmacy.name, maxText), textX, H / 2 - 4)
  if (pharmacy.tagline) {
    ctx.font = 'italic 34px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.fillText(truncate(ctx, pharmacy.tagline, maxText), textX, H / 2 + 48)
  }
  ctx.shadowColor = 'transparent'
  // The service line, small, bottom-left of the text column.
  ctx.font = '600 26px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.fillText(`${accent.icon} ${accent.label} · TODA SafeRide Food Express`, textX, H / 2 + 104)

  return canvas.toDataURL('image/jpeg', 0.8)
}

// Everything the thumbnail is drawn from — when any of it changes, the
// stored picture is stale.
export function bannerThumbKey(pharmacy: Pharmacy): string {
  const pos = pharmacy.coverPhotoPosition ?? null
  return JSON.stringify([
    pharmacy.name,
    pharmacy.tagline ?? null,
    pharmacy.themeColor ?? null,
    pharmacy.businessType,
    (pharmacy.coverPhotoDataUrl ?? '').length,
    (pharmacy.logoDataUrl ?? '').length,
    pos && [Math.round(pos.x), Math.round(pos.y), Math.round((pos.scale ?? 1) * 100)],
  ])
}
