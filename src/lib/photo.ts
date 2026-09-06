import { Capacitor } from '@capacitor/core'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'

const MAX_WIDTH = 480
const JPEG_QUALITY = 0.7
const WEBP_QUALITY = 0.8

// WebP keeps transparency AND is around a third smaller than PNG or JPEG at
// the same look, which matters here because every image lives inside the
// shared state blob. Only Safari before 14 can't encode it; the check is a
// real encode attempt, since a browser that can't just hands back PNG.
let webpSupported: boolean | null = null
function canEncodeWebp(): boolean {
  if (webpSupported === null) {
    const probe = document.createElement('canvas')
    probe.width = 1
    probe.height = 1
    webpSupported = probe.toDataURL('image/webp').startsWith('data:image/webp')
  }
  return webpSupported
}

function encodeCanvas(canvas: HTMLCanvasElement, alpha: boolean): string {
  if (canEncodeWebp()) return canvas.toDataURL('image/webp', WEBP_QUALITY)
  return alpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', JPEG_QUALITY)
}

export function compressImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Could not load image'))
      img.onload = () => {
        const scale = Math.min(1, MAX_WIDTH / img.width)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas not supported'))
          return
        }
        // A PNG/WebP keeps its transparency and comes back as PNG: a cut-out
        // dish or logo dropped onto the vendor banner (see VendorHeaderCard)
        // has to float on the themed art, not sit in a white box. Anything
        // else (camera JPEGs, mostly) is flattened to JPEG — smaller, and it
        // had no alpha to lose. JPEG has no alpha channel, so for that path
        // the canvas is filled white first: an unpainted canvas is
        // transparent black, and a source with any transparency would have
        // come through as solid black.
        const keepAlpha = file.type === 'image/png' || file.type === 'image/webp'
        if (!keepAlpha) {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(encodeCanvas(canvas, keepAlpha))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

// A synchronous check every "tap to upload" button below uses to decide
// whether it's safe to await captureNativePhoto before falling back to the
// file input, or whether it must click that input immediately instead (see
// captureNativePhoto's own comment) — never both unconditionally.
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform()
}

// Makes a flat backdrop transparent — a dish shot on white, a logo on a plain
// card — by flood-filling from the picture's edges: every pixel connected to
// the border whose colour is close to the border's own colour is cleared,
// and nothing enclosed by the subject is touched (a white plate inside the
// dish keeps its white). Purely on-device canvas work: instant, no upload to
// any service, no model to download. It is not a cut-out tool for busy
// photos — offered as a button rather than run on every upload for that
// reason. Always returns a PNG, since JPEG can't hold the transparency.
export interface RemoveBackgroundOptions {
  tolerance?: number
  // Only act when the border really is one flat colour (see flatness below);
  // otherwise hand the picture back untouched. This is what the automatic
  // on-upload pass uses, so a scenic photo — sky one side, road the other —
  // is never carved up. The manual button leaves it off: the vendor asked.
  onlyIfFlat?: boolean
}

export function removeFlatBackground(dataUrl: string, opts: RemoveBackgroundOptions = {}): Promise<string> {
  const tolerance = opts.tolerance ?? 48
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onerror = () => reject(new Error('Could not load image'))
    img.onload = () => {
      const w = img.width
      const h = img.height
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas not supported'))
        return
      }
      ctx.drawImage(img, 0, 0)
      const image = ctx.getImageData(0, 0, w, h)
      const px = image.data

      // The backdrop's colour: the average of the border pixels, which for
      // a plain background is the background itself. Far more robust than
      // assuming "white": a cream card or a grey studio sweep works too.
      let r = 0
      let g = 0
      let b = 0
      let sq = 0
      let n = 0
      const sample = (i: number) => {
        r += px[i]
        g += px[i + 1]
        b += px[i + 2]
        sq += px[i] * px[i] + px[i + 1] * px[i + 1] + px[i + 2] * px[i + 2]
        n += 1
      }
      for (let x = 0; x < w; x++) {
        sample(x * 4)
        sample(((h - 1) * w + x) * 4)
      }
      for (let y = 0; y < h; y++) {
        sample(y * w * 4)
        sample((y * w + w - 1) * 4)
      }
      r /= n
      g /= n
      b /= n

      // Flatness: how much the border pixels stray from their own average
      // (a standard deviation across the three channels). A plain backdrop
      // — white card, grey sweep — sits well under 20 even with a shadow;
      // a real scene is far above it.
      const spread = Math.sqrt(Math.max(0, sq / n - (r * r + g * g + b * b)))
      if (opts.onlyIfFlat && spread > 24) {
        resolve(dataUrl)
        return
      }

      const isBackdrop = (i: number) => {
        const dr = px[i] - r
        const dg = px[i + 1] - g
        const db = px[i + 2] - b
        return Math.sqrt(dr * dr + dg * dg + db * db) <= tolerance
      }

      // Flood fill from every border pixel. A plain Uint8 visited map and an
      // explicit stack — recursion would blow the stack on a phone photo.
      const visited = new Uint8Array(w * h)
      const stack: number[] = []
      const push = (x: number, y: number) => {
        const p = y * w + x
        if (visited[p]) return
        visited[p] = 1
        if (isBackdrop(p * 4)) stack.push(p)
        else visited[p] = 2 // seen, and it is subject — a wall
      }
      for (let x = 0; x < w; x++) {
        push(x, 0)
        push(x, h - 1)
      }
      for (let y = 0; y < h; y++) {
        push(0, y)
        push(w - 1, y)
      }
      while (stack.length) {
        const p = stack.pop()!
        px[p * 4 + 3] = 0
        const x = p % w
        const y = (p - x) / w
        if (x > 0) push(x - 1, y)
        if (x < w - 1) push(x + 1, y)
        if (y > 0) push(x, y - 1)
        if (y < h - 1) push(x, y + 1)
      }

      // Soften the cut edge by one pixel so the subject doesn't look
      // scissored: any kept pixel touching a cleared one goes half-alpha.
      const cleared = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && px[(y * w + x) * 4 + 3] === 0
      const edge: number[] = []
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4
          if (px[i + 3] === 0) continue
          if (cleared(x - 1, y) || cleared(x + 1, y) || cleared(x, y - 1) || cleared(x, y + 1)) edge.push(i)
        }
      }
      for (const i of edge) px[i + 3] = 128

      // Crop to what's left. The cleared margins are pure waste in storage
      // (every image rides in the shared state blob), and a tight cut-out
      // also places more naturally on the banner. A few pixels of padding
      // keep the softened edge intact.
      let minX = w
      let minY = h
      let maxX = -1
      let maxY = -1
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (px[(y * w + x) * 4 + 3] === 0) continue
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
      if (maxX < 0) {
        // Everything was backdrop — nothing to keep, so keep the original.
        resolve(dataUrl)
        return
      }
      const pad = 2
      const cropX = Math.max(0, minX - pad)
      const cropY = Math.max(0, minY - pad)
      const cropW = Math.min(w, maxX + pad + 1) - cropX
      const cropH = Math.min(h, maxY + pad + 1) - cropY
      const out = document.createElement('canvas')
      out.width = cropW
      out.height = cropH
      const octx = out.getContext('2d')
      if (!octx) {
        reject(new Error('Canvas not supported'))
        return
      }
      octx.putImageData(image, -cropX, -cropY)
      resolve(encodeCanvas(out, true))
    }
    img.src = dataUrl
  })
}

export interface CapturePhotoOptions {
  // 'camera' locks to the live camera only — used for the tricycle+driver
  // safety photo, where letting someone pick an old gallery photo would
  // defeat the point. 'prompt' lets the user choose Camera or Photo Library
  // — used for documents (NBI clearance, license, prescriptions), which are
  // just as often an existing photo/scan as a fresh one.
  source?: 'camera' | 'prompt'
}

// Native-app photo capture via Capacitor's Camera plugin — gives a real
// native camera/gallery picker and proper OS permission prompts instead of
// the browser's file-picker chrome, when this is actually running inside
// the wrapped native app (see PhotoCaptureButton/DocumentUploadField/
// MultiImageUploadField, which all try this first and fall back to their
// existing <input type="file" capture> on the web). `width`/`quality` here
// match compressImageFile's own resize target, so a native capture and a
// web upload end up the same rough size in localStorage either way.
// Returns null (never throws) when not running natively, or when the user
// cancels the picker/denies permission — both are "nothing captured," not
// error states the caller needs to handle differently.
//
// On the web, do NOT `await` this before falling back to inputRef.click() —
// several mobile browsers revoke "user activation" the instant a click
// handler crosses an await, even one that resolves immediately, and a
// programmatic click() on a file input silently does nothing without it (no
// picker opens, no error — exactly what made "Change cover" look dead).
// Check isNativePlatform() synchronously first and only take the async path
// when it's true; call inputRef.current?.click() straight from the
// synchronous branch otherwise.
export async function captureNativePhoto(options: CapturePhotoOptions = {}): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null
  try {
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.DataUrl,
      source: options.source === 'camera' ? CameraSource.Camera : CameraSource.Prompt,
      quality: Math.round(JPEG_QUALITY * 100),
      width: MAX_WIDTH,
      correctOrientation: true,
    })
    return photo.dataUrl ?? null
  } catch {
    return null
  }
}
