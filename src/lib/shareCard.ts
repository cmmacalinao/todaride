// A post photo as a share card — the whole picture, fitted to the shape
// Facebook and the others show a link preview in.
//
// A preview card is 1.91:1 (1200×630); a phone photo or a poster is not.
// Handed the photo as-is, the crawler crops it to the card and the top and
// bottom go — a poster's title, a dish at the edge. This draws the photo
// whole ("contain") onto a card of the right shape, over a blurred, dimmed
// copy of itself so the bars are not blank, the way Facebook itself fills
// a portrait picture. Drawn on the vendor's device when the post is made
// (see VendorFeedComposer) and stored on the post (sharePhotoDataUrl) for
// the edge function to serve. 960×504 JPEG at 0.72 is ~40–60 KB.
const W = 960
const H = 504

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

export async function renderShareCard(photoDataUrl: string): Promise<string | null> {
  if (typeof document === 'undefined') return null
  const photo = await loadImage(photoDataUrl)
  if (!photo || photo.naturalWidth === 0) return null
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const pw = photo.naturalWidth
  const ph = photo.naturalHeight
  // Already the card's shape (within a hair): serve it whole, no bars.
  const cardRatio = W / H
  const ratio = pw / ph

  // Backdrop: the photo scaled to cover, blurred and dimmed.
  const coverScale = Math.max(W / pw, H / ph)
  const cw = pw * coverScale
  const ch = ph * coverScale
  ctx.save()
  ctx.filter = 'blur(28px) brightness(0.6)'
  ctx.drawImage(photo, (W - cw) / 2 - 40, (H - ch) / 2 - 40, cw + 80, ch + 80)
  ctx.restore()

  // The photo itself, whole, centred.
  const fitScale = Math.abs(ratio - cardRatio) < 0.03 ? Math.max(W / pw, H / ph) : Math.min(W / pw, H / ph)
  const fw = pw * fitScale
  const fh = ph * fitScale
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = 24
  ctx.drawImage(photo, (W - fw) / 2, (H - fh) / 2, fw, fh)
  ctx.restore()

  return canvas.toDataURL('image/jpeg', 0.72)
}
