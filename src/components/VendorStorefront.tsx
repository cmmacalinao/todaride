import { useEffect, useMemo, useRef, useState } from 'react'
import { getDefaultDishVisual } from '../lib/filipinoDishes'
import { menuBadgeSortRank, menuCategorySortRank } from '../lib/foodCatalog'
import { captureNativePhoto, compressImageFile, isNativePlatform, removeFlatBackground } from '../lib/photo'
import { ShareSheet } from './ShareSheet'
import { ProfilePhotoPicker } from './ProfilePhotoPicker'
import { storeRatingSummary } from './StoreRatingSheet'
import { VendorFeedList, type PostViewer } from './VendorFeed'
import { MENU_ITEM_BADGES, type MedicineProduct, type Pharmacy } from '../types'

// One shared "shape", three audiences: a vendor sees exactly this header +
// menu list when they preview "My Vendor Page" from their own portal (see
// VendorPortalPage.tsx), the same vendor sees it again — swapped to Edit
// mode — while managing their menu (see VendorMenuManager.tsx, which reuses
// VendorHeaderCard/VendorMenuItemCard below), and a customer sees it a third
// time with quantity steppers switched on when they tap into the vendor from
// the Registered Vendor tab (see VendorMenuBooking.tsx). Keeping the header
// and item-card visuals in one place means a vendor editing their menu is
// looking at (almost) the same page a customer will see, not a differently
// laid out admin form.
export const VENDOR_THEME: Record<
  string,
  { gradient: string; icon: string; label: string; solid: string; solidHover: string; soft: string; softText: string }
> = {
  resto_food: {
    gradient: 'from-amber-500 via-orange-500 to-rose-500',
    icon: '🍽️',
    label: 'Resto / Food',
    solid: 'bg-orange-500',
    solidHover: 'hover:bg-orange-600',
    soft: 'bg-orange-100',
    softText: 'text-orange-700',
  },
  other_commodity: {
    gradient: 'from-teal-500 via-cyan-600 to-blue-600',
    icon: '📦',
    label: 'Other Commodity',
    solid: 'bg-cyan-600',
    solidHover: 'hover:bg-cyan-700',
    soft: 'bg-cyan-100',
    softText: 'text-cyan-700',
  },
  pharmacy: {
    gradient: 'from-emerald-500 via-teal-500 to-cyan-600',
    icon: '💊',
    label: 'Pharmacy',
    solid: 'bg-teal-600',
    solidHover: 'hover:bg-teal-700',
    soft: 'bg-teal-100',
    softText: 'text-teal-700',
  },
  store: {
    gradient: 'from-violet-500 via-purple-500 to-fuchsia-600',
    icon: '🏪',
    label: 'Store',
    solid: 'bg-purple-500',
    solidHover: 'hover:bg-purple-600',
    soft: 'bg-purple-100',
    softText: 'text-purple-700',
  },
}

// Preset accent colors a vendor can pick for their own page, overriding the
// businessType-derived gradient/solid/soft above (see resolveVendorAccent).
// Exported so the vendor-portal branding controls (VendorBrandingEditor.tsx)
// can render the same swatches the storefront will actually use.
export const VENDOR_THEME_COLORS: Record<
  string,
  { label: string; gradient: string; swatchClass: string; solid: string; solidHover: string; soft: string; softText: string }
> = {
  orange: {
    label: 'Orange',
    gradient: 'from-amber-500 via-orange-500 to-rose-500',
    swatchClass: 'bg-orange-500',
    solid: 'bg-orange-500',
    solidHover: 'hover:bg-orange-600',
    soft: 'bg-orange-100',
    softText: 'text-orange-700',
  },
  teal: {
    label: 'Teal',
    gradient: 'from-teal-500 via-cyan-600 to-blue-600',
    swatchClass: 'bg-teal-500',
    solid: 'bg-teal-600',
    solidHover: 'hover:bg-teal-700',
    soft: 'bg-teal-100',
    softText: 'text-teal-700',
  },
  purple: {
    label: 'Purple',
    gradient: 'from-violet-500 via-purple-500 to-fuchsia-600',
    swatchClass: 'bg-purple-500',
    solid: 'bg-purple-500',
    solidHover: 'hover:bg-purple-600',
    soft: 'bg-purple-100',
    softText: 'text-purple-700',
  },
  green: {
    label: 'Green',
    gradient: 'from-emerald-500 via-teal-500 to-cyan-600',
    swatchClass: 'bg-emerald-500',
    solid: 'bg-emerald-500',
    solidHover: 'hover:bg-emerald-600',
    soft: 'bg-emerald-100',
    softText: 'text-emerald-700',
  },
  red: {
    label: 'Red',
    gradient: 'from-rose-500 via-red-500 to-orange-600',
    swatchClass: 'bg-red-500',
    solid: 'bg-red-500',
    solidHover: 'hover:bg-red-600',
    soft: 'bg-red-100',
    softText: 'text-red-700',
  },
  blue: {
    label: 'Blue',
    gradient: 'from-blue-500 via-indigo-600 to-violet-600',
    swatchClass: 'bg-blue-500',
    solid: 'bg-blue-500',
    solidHover: 'hover:bg-blue-600',
    soft: 'bg-blue-100',
    softText: 'text-blue-700',
  },
  pink: {
    label: 'Pink',
    gradient: 'from-pink-400 via-rose-500 to-fuchsia-600',
    swatchClass: 'bg-pink-500',
    solid: 'bg-pink-500',
    solidHover: 'hover:bg-pink-600',
    soft: 'bg-pink-100',
    softText: 'text-pink-700',
  },
  gold: {
    label: 'Gold',
    gradient: 'from-yellow-400 via-amber-500 to-orange-600',
    swatchClass: 'bg-amber-400',
    solid: 'bg-amber-500',
    solidHover: 'hover:bg-amber-600',
    soft: 'bg-amber-100',
    softText: 'text-amber-800',
  },
  indigo: {
    label: 'Indigo',
    gradient: 'from-indigo-500 via-indigo-700 to-slate-900',
    swatchClass: 'bg-indigo-600',
    solid: 'bg-indigo-600',
    solidHover: 'hover:bg-indigo-700',
    soft: 'bg-indigo-100',
    softText: 'text-indigo-700',
  },
  lime: {
    label: 'Lime',
    gradient: 'from-lime-400 via-green-500 to-emerald-600',
    swatchClass: 'bg-lime-500',
    solid: 'bg-lime-600',
    solidHover: 'hover:bg-lime-700',
    soft: 'bg-lime-100',
    softText: 'text-lime-800',
  },
  brown: {
    label: 'Brown',
    gradient: 'from-amber-700 via-orange-900 to-stone-900',
    swatchClass: 'bg-amber-800',
    solid: 'bg-amber-800',
    solidHover: 'hover:bg-amber-900',
    soft: 'bg-orange-100',
    softText: 'text-amber-900',
  },
  charcoal: {
    label: 'Charcoal',
    gradient: 'from-slate-600 via-slate-800 to-black',
    swatchClass: 'bg-slate-700',
    solid: 'bg-slate-800',
    solidHover: 'hover:bg-slate-900',
    soft: 'bg-slate-200',
    softText: 'text-slate-800',
  },
}

export interface VendorAccent {
  gradient: string
  solid: string
  solidHover: string
  soft: string
  softText: string
  icon: string
  label: string
}

// A vendor's chosen themeColor (if any) overrides only the color classes —
// the icon/label always come from businessType, since those describe what
// kind of vendor this is, not what color they picked.
export function resolveVendorAccent(pharmacy: Pharmacy): VendorAccent {
  const theme = VENDOR_THEME[pharmacy.businessType] ?? VENDOR_THEME.store
  const override = pharmacy.themeColor ? VENDOR_THEME_COLORS[pharmacy.themeColor] : null
  return {
    gradient: override?.gradient ?? theme.gradient,
    solid: override?.solid ?? theme.solid,
    solidHover: override?.solidHover ?? theme.solidHover,
    soft: override?.soft ?? theme.soft,
    softText: override?.softText ?? theme.softText,
    icon: theme.icon,
    label: theme.label,
  }
}

const CATEGORY_ICONS: [string, string][] = [
  ['ulam', '🍚'],
  ['rice', '🍚'],
  ['soup', '🍲'],
  ['sinigang', '🍲'],
  ['side', '🥬'],
  ['drink', '🥤'],
  ['dessert', '🍮'],
  ['snack', '🥟'],
]

function categoryIcon(category: string): string {
  const lower = category.toLowerCase()
  return CATEGORY_ICONS.find(([needle]) => lower.includes(needle))?.[1] ?? '🍴'
}

// The banner + avatar + tagline + address/phone/map block — everything
// above the menu itself. Shared verbatim between the read/order storefront
// below and VendorMenuManager's edit screen, so a vendor editing their menu
// sees the same header a customer will.

// The default banner art — forks, a chef's hat, a splash and two wave
// ribbons — for a vendor with no cover photo yet. Drawn as an SVG rather
// than shipped as a picture so it takes on whatever accent the vendor
// picked (see VENDOR_THEME_COLORS): the shapes are only darker and lighter
// tints of the gradient already painted underneath, so an orange resto and
// a teal one get the same artwork in their own colour, and it stays crisp
// at any width.
//
// Fit: the composition lives in a wide 600×160 frame with the icons in the
// left third and the waves running the full width. It is anchored to the
// LEFT edge and scaled to the banner's height (`xMinYMid slice`), so on a
// header narrower than that frame it is the empty right-hand side that gets
// cropped — the hat and forks are always whole, and the ribbons always reach
// both edges. A centred crop was cutting the hat off the top.
export function VendorBannerArt() {
  const ink = 'rgba(120, 20, 0, 0.22)'
  return (
    <svg
      aria-hidden
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 600 160"
      preserveAspectRatio="xMinYMid slice"
    >
      {/* Soft light sweeps, like the sheen on the reference. */}
      <path d="M-20 44 C 120 -12, 300 78, 620 8 L 620 -10 L -20 -10 Z" fill="rgba(255,255,255,0.10)" />
      <path d="M260 160 C 380 118, 480 92, 620 44 L 620 160 Z" fill="rgba(255,255,255,0.08)" />
      {/* Wave ribbons across the bottom third, edge to edge. */}
      <path
        d="M-20 118 C 90 88, 180 142, 300 118 S 500 78, 620 100 L 620 112 C 500 94, 400 132, 300 130 S 90 104, -20 130 Z"
        fill="rgba(255,255,255,0.32)"
      />
      <path
        d="M-20 136 C 100 110, 200 152, 330 130 S 520 96, 620 118 L 620 128 C 520 108, 430 144, 330 142 S 100 126, -20 148 Z"
        fill="rgba(255,255,255,0.16)"
      />
      {/* Left fork, tilted. */}
      <g transform="translate(44 62) rotate(-14) scale(0.8)" fill={ink}>
        <rect x="-3" y="-30" width="6" height="34" rx="3" />
        <rect x="6" y="-32" width="6" height="36" rx="3" />
        <rect x="15" y="-30" width="6" height="34" rx="3" />
        <rect x="-3" y="0" width="24" height="14" rx="5" />
        <rect x="6" y="10" width="7" height="60" rx="3.5" />
      </g>
      {/* Splash — two drops and a dot. */}
      <g transform="translate(6 10) scale(0.85)" fill={ink}>
        <path d="M62 48 c 6 -12, 14 -10, 12 2 c -1 8, -6 12, -10 14 c -2 -4, -4 -10, -2 -16 z" />
        <path d="M80 66 c -1 -10, 8 -14, 12 -6 c 2 5, -2 12, -8 16 c -3 -3, -4 -6, -4 -10 z" />
        <circle cx="54" cy="84" r="3.5" />
      </g>
      {/* Chef's hat, outlined. */}
      <g transform="translate(122 46) rotate(-18) scale(0.85)" fill="none" stroke={ink} strokeWidth="5" strokeLinejoin="round">
        <path d="M-16 10 a 10 10 0 1 1 8 -16 a 12 12 0 1 1 20 4 a 9 9 0 1 1 4 14 v 6 h -36 z" />
        <path d="M-20 22 h 40 v 8 h -40 z" />
      </g>
      {/* Right fork, tilted the other way. */}
      <g transform="translate(196 44) rotate(22) scale(0.8)" fill={ink}>
        <rect x="-3" y="-30" width="6" height="34" rx="3" />
        <rect x="6" y="-32" width="6" height="36" rx="3" />
        <rect x="15" y="-30" width="6" height="34" rx="3" />
        <rect x="-3" y="0" width="24" height="14" rx="5" />
        <rect x="6" y="10" width="7" height="60" rx="3.5" />
      </g>
    </svg>
  )
}

export function VendorHeaderCard({
  pharmacy,
  itemCount,
  accent,
  onLogoUpload,
  onCoverUpload,
  onPinLocation,
  onCoverPositionChange,
  onRate,
}: {
  pharmacy: Pharmacy
  itemCount: number
  accent: VendorAccent
  // Present on the customer's ordering view only — opens "Rate this store"
  // (see StoreRatingSheet). The rating line itself shows everywhere.
  onRate?: () => void
  // Present only on the vendor's own edit screen (see VendorMenuManager.tsx)
  // — turns the avatar/banner into tap-to-upload targets. Absent everywhere
  // else (customer ordering, the vendor's own read-only Preview tab), so
  // neither ever shows an upload affordance a customer could tap.
  onLogoUpload?: (dataUrl: string) => void
  onCoverUpload?: (dataUrl: string) => void
  // Present only on the vendor's own edit screen — swaps the "View on Map"
  // tile from a plain link-out to Google Maps into a button that opens
  // VendorLocationPicker, so the owner can actually pin the spot drivers get
  // routed to instead of only looking at wherever the typed address guesses.
  onPinLocation?: () => void
  // Present only on the vendor's own edit screen — lets them drag the profile
  // photo inside its frame to choose which part shows. Reported as CSS
  // object-position percentages (50/50 = centred) and saved on the pharmacy
  // (coverPhotoPosition), so a customer sees the same framing.
  onCoverPositionChange?: (position: { x: number; y: number; scale?: number }) => void
}) {
  const [favorited, setFavorited] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  // "📷 Profile Photo" opens a chooser (upload, or one of the seed dishes)
  // rather than the file picker straight away — see ProfilePhotoPicker.
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false)

  // Drag-to-reframe for the profile photo. The live position is local state
  // so the photo follows the finger without a store round-trip per pixel;
  // the saved value is committed once on release. Dragging right shows more
  // of the photo's LEFT side (the picture moves with the finger), which is
  // why the percentage moves against the delta.
  // Where the photo sits: x/y are its CENTRE as a percentage of the banner,
  // scale is its height relative to the banner's (1 = as tall as the header,
  // the whole picture shown, never cropped). A free transform rather than
  // object-position: panning a crop inside a fixed box gave the picture only
  // as much travel as the box had slack, which read as an invisible fence
  // when dragging a shrunken photo around.
  const savedPosition = { x: 75, y: 50, ...(pharmacy.coverPhotoPosition ?? {}) }
  const photoScale = savedPosition.scale ?? 1
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null)

  // Zoom in steps about the photo's own centre, so it grows and shrinks in
  // place. 0.25 is a small badge; 3 is plenty before it pixelates.
  function changeScale(delta: number) {
    const next = Math.round(Math.max(0.25, Math.min(3, photoScale + delta)) * 100) / 100
    onCoverPositionChange?.({ x: savedPosition.x, y: savedPosition.y, scale: next })
  }
  const dragStart = useRef<{ pointerX: number; pointerY: number; x: number; y: number; w: number; h: number } | null>(null)
  // The last position the pointer reached, kept outside React state so the
  // release handler commits it even when the move and the release land in
  // the same frame (a quick flick) before a re-render has caught up.
  const latestDrag = useRef<{ x: number; y: number } | null>(null)
  const photoPosition = dragPosition ?? savedPosition

  function handlePhotoPointerDown(e: React.PointerEvent<HTMLImageElement>) {
    if (!onCoverPositionChange) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    // Measure the banner (the frame), not the picture: the picture's own box
    // is whatever size the zoom made it, and the position is a share of the
    // banner.
    const rect = (e.currentTarget.parentElement ?? e.currentTarget).getBoundingClientRect()
    dragStart.current = { pointerX: e.clientX, pointerY: e.clientY, x: savedPosition.x, y: savedPosition.y, w: rect.width, h: rect.height }
    latestDrag.current = savedPosition
    setDragPosition(savedPosition)
  }

  function handlePhotoPointerMove(e: React.PointerEvent<HTMLImageElement>) {
    const start = dragStart.current
    if (!start) return
    // The picture travels with the finger. Its centre may reach the banner's
    // edges (so half of it can hang off), but not go past them — a photo
    // dragged fully out of view would be impossible to grab back.
    const clamp = (n: number) => Math.max(0, Math.min(100, n))
    const next = {
      x: clamp(start.x + ((e.clientX - start.pointerX) / start.w) * 100),
      y: clamp(start.y + ((e.clientY - start.pointerY) / start.h) * 100),
    }
    latestDrag.current = next
    setDragPosition(next)
  }

  function handlePhotoPointerUp() {
    if (!dragStart.current) return
    dragStart.current = null
    const final = latestDrag.current
    latestDrag.current = null
    if (final) onCoverPositionChange?.({ x: Math.round(final.x), y: Math.round(final.y), scale: photoScale })
    setDragPosition(null)
  }

  // Same native-prompt-then-file-input pattern as DocumentUploadField.tsx —
  // duplicated in miniature here rather than imported, since this component
  // is otherwise pure presentation and the two targets (round avatar, wide
  // banner) don't share that field's row layout. The web branch clicks the
  // input synchronously — awaiting anything first (even captureNativePhoto,
  // which resolves immediately when not native) makes some mobile browsers
  // silently refuse to open the picker at all, which is exactly what made
  // "Change cover"/"Replace logo" look like dead buttons on the web.
  function handleUploadTap(
    inputRef: React.RefObject<HTMLInputElement | null>,
    setBusy: (busy: boolean) => void,
    onUpload: (dataUrl: string) => void,
  ) {
    if (!isNativePlatform()) {
      inputRef.current?.click()
      return
    }
    setBusy(true)
    void (async () => {
      try {
        const native = await captureNativePhoto({ source: 'prompt' })
        if (native) {
          onUpload(await removeFlatBackground(native, { onlyIfFlat: true }))
          return
        }
        inputRef.current?.click()
      } finally {
        setBusy(false)
      }
    })()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>, onUpload: (dataUrl: string) => void, setBusy: (busy: boolean) => void) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      // Vendor artwork (profile photo, logo) gets its flat backdrop cleared
      // automatically — a dish on white, a logo on a card — and is cropped
      // and re-encoded smaller in the process. onlyIfFlat leaves a real
      // scene alone; the ✂ button is there for a deliberate pass.
      onUpload(await removeFlatBackground(await compressImageFile(file), { onlyIfFlat: true }))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    try {
      setFavorited(localStorage.getItem(`toda-vendor-fav-${pharmacy.id}`) === '1')
    } catch {
      // Private-browsing/blocked storage — favoriting just won't persist.
    }
  }, [pharmacy.id])

  function toggleFavorite() {
    setFavorited((prev) => {
      const next = !prev
      try {
        localStorage.setItem(`toda-vendor-fav-${pharmacy.id}`, next ? '1' : '0')
      } catch {
        // Ignore — purely cosmetic, no functional dependency on persistence.
      }
      return next
    })
  }

  // The public page a share points at. Opened in ShareSheet rather than
  // handed straight to navigator.share: that sheet doesn't exist on most
  // desktop browsers, and even on a phone an explicit Facebook/Messenger row
  // is what a vendor here reaches for, not "the OS thing".
  const shareUrl = `${window.location.origin}/vendor-page/${pharmacy.id}`

  const mapQuery = encodeURIComponent(`${pharmacy.addressDetail}, ${pharmacy.barangay}, ${pharmacy.city}`)
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`

  return (
    <div>
      <div className={`relative h-32 overflow-hidden bg-gradient-to-br ${accent.gradient}`}>
        {/* The themed banner art is always the background now; a vendor's
            profile photo is a picture ON it, not a replacement for it —
            scaled to the header's height and seated on the right, with its
            left edge feathered into the gradient so the name/tagline area
            stays clean. Capped at ~55% of the width so a landscape shot
            can't crowd the text; object-cover trims the excess. */}
        <VendorBannerArt />
        {pharmacy.coverPhotoDataUrl && (
          <>
            {/* A fixed frame rather than the photo's own width: object-cover
                then always has something to crop, so dragging (edit mode)
                always moves the picture — a square photo in an auto-width
                box would fit exactly and have nowhere to go. */}
            {/* The frame is the whole header: with the zoom (which goes
                below 100%) the vendor shrinks the picture and drags it to
                wherever they want it, rather than being held to one side.
                The frame clips; the img inside it pans (object-position)
                and zooms (transform) — scaling the img directly let a zoomed
                picture grow past its box. */}
            <div aria-hidden className="absolute inset-0 overflow-hidden">
              <img
                src={pharmacy.coverPhotoDataUrl}
                alt=""
                draggable={false}
                onPointerDown={handlePhotoPointerDown}
                onPointerMove={handlePhotoPointerMove}
                onPointerUp={handlePhotoPointerUp}
                onPointerCancel={handlePhotoPointerUp}
                // max-w-none: the preflight's img { max-width: 100% } would
                // otherwise cap a wide photo at the banner's width and
                // squash it once zoomed past that.
                className={`absolute w-auto max-w-none select-none ${
                  onCoverPositionChange ? 'cursor-grab touch-none active:cursor-grabbing' : ''
                }`}
                style={{
                  left: `${photoPosition.x}%`,
                  top: `${photoPosition.y}%`,
                  height: `${photoScale * 100}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              />
            </div>
            {onCoverPositionChange && !dragPosition && (
              <>
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 px-1.5 py-0.5 text-[9px] font-medium text-white">
                  ↔ drag to adjust
                </span>
                {/* Zoom sits at the photo's bottom-left corner, clear of the
                    Profile Photo button on the right and the name text to
                    its left. */}
                <div className="absolute bottom-2 left-[50%] flex items-center gap-0.5 rounded-full bg-black/45 px-1 py-0.5 text-white shadow-sm">
                  <button
                    type="button"
                    onClick={() => changeScale(-0.25)}
                    disabled={photoScale <= 0.25}
                    aria-label="Zoom out profile photo"
                    className="h-5 w-5 rounded-full text-sm font-bold leading-none hover:bg-white/20 disabled:opacity-40"
                  >
                    −
                  </button>
                  <span className="min-w-[2rem] text-center text-[9px] font-semibold tabular-nums">{Math.round(photoScale * 100)}%</span>
                  <button
                    type="button"
                    onClick={() => changeScale(0.25)}
                    disabled={photoScale >= 3}
                    aria-label="Zoom in profile photo"
                    className="h-5 w-5 rounded-full text-sm font-bold leading-none hover:bg-white/20 disabled:opacity-40"
                  >
                    +
                  </button>
                  {onCoverUpload && (
                    <>
                      <span aria-hidden className="mx-0.5 h-3.5 w-px bg-white/30" />
                      <button
                        type="button"
                        disabled={uploadingCover}
                        onClick={() => {
                          if (!pharmacy.coverPhotoDataUrl) return
                          setUploadingCover(true)
                          void removeFlatBackground(pharmacy.coverPhotoDataUrl)
                            .then((png) => onCoverUpload(png))
                            .catch(() => {
                              // Couldn't decode it — leave the photo as it is.
                            })
                            .finally(() => setUploadingCover(false))
                        }}
                        title="Make the plain background around the photo transparent"
                        className="rounded-full px-1.5 text-[9px] font-semibold hover:bg-white/20 disabled:opacity-40"
                      >
                        {uploadingCover ? '…' : '✂ Remove BG'}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {onCoverUpload && (
          <>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFileChange(e, onCoverUpload, setUploadingCover)}
            />
            <button
              type="button"
              onClick={() => setPhotoPickerOpen(true)}
              disabled={uploadingCover}
              aria-label={pharmacy.coverPhotoDataUrl ? 'Replace profile photo' : 'Upload profile photo'}
              className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-white disabled:opacity-60"
            >
              {uploadingCover ? '…' : '📷 Profile Photo'}
            </button>
            {photoPickerOpen && (
              <ProfilePhotoPicker
                // The upload tile clicks the hidden input synchronously
                // from its own tap (see handleUploadTap) — the chooser closes
                // first so the browser's file dialog isn't behind it.
                onUpload={() => handleUploadTap(coverInputRef, setUploadingCover, onCoverUpload)}
                onPick={onCoverUpload}
                onClose={() => setPhotoPickerOpen(false)}
              />
            )}
          </>
        )}

        {/* pointer-events-none on the stack, auto on its pills: the stack's
            box is wider and taller than the pills it holds, and that empty
            space sits right over the profile photo — it was catching the
            start of a drag meant for the picture underneath. */}
        <div className="pointer-events-none absolute right-3 top-3 flex flex-col items-end gap-1.5">
          <span
            className={`pointer-events-auto rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm ${
              pharmacy.isOpen ? 'bg-white/90 text-emerald-700' : 'bg-white/80 text-slate-500'
            }`}
          >
            {pharmacy.isOpen ? '🟢 Open now' : '⚪ Closed'}
          </span>
          <div className="pointer-events-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleFavorite}
              aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
              title={favorited ? 'Remove from favorites' : 'Add to favorites'}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-sm shadow-sm hover:bg-white"
            >
              {favorited ? '❤️' : '🤍'}
            </button>
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              aria-label="Share this vendor page"
              title="Share to Facebook, Messenger and more"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-sm text-slate-700 shadow-sm hover:bg-white"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
                <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L7.04 9.81C6.5 9.31 5.79 9 5 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z" />
              </svg>
            </button>
            {shareOpen && <ShareSheet title={pharmacy.name} url={shareUrl} onClose={() => setShareOpen(false)} />}
          </div>
        </div>

        {/* Name/tagline/badge live on the banner itself, pinned past the
            avatar's own width (avatar spans 16px-96px from the left edge —
            see its w-20 box and the px-4 container below — so pl-32 leaves
            a real gap instead of butting straight up against it) and short
            of the Open-now/heart/share stack's corner. pointer-events-none
            because this box spans the full banner (inset-0) even though the
            visible text sits only in the upper-middle — without it, the
            empty lower-right part of this box would swallow clicks meant
            for the "Change cover" badge sitting underneath it. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-center gap-1 py-3 pl-32 pr-24">
          <h2 className="truncate text-lg font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">{pharmacy.name}</h2>
          {pharmacy.tagline && (
            <p className="truncate text-xs italic text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">{pharmacy.tagline}</p>
          )}
          <span
            className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm ${accent.soft} ${accent.softText}`}
          >
            {accent.icon} {accent.label}
          </span>
        </div>
      </div>

      {/* pointer-events-none on the whole block, not just the avatar row: the
          row's negative margin collapses through this padding-top-less
          parent, so the parent's own box is what actually overlaps the
          banner and was swallowing taps on the heart/share/Change cover
          buttons. The two things inside it that need taps opt back in. */}
      <div className="pointer-events-none relative px-4 pb-3">
        {/* `relative` here (even with no z-index of its own) puts this block
            in the same "positioned" paint layer as the banner above — which
            also has `relative`, for its own stripe overlay. Without it, the
            banner (positioned) paints over this block (plain/static) despite
            coming first in the markup, silently swallowing the top of
            whatever the negative margin below pulls up to overlap it. */}
        {/* pointer-events-none: this row's negative margin pulls it up over
            the lower 104px of the banner at full width, and as a later
            positioned sibling it sits on top — so its empty right-hand
            stretch was silently swallowing taps meant for the heart, share
            and Change cover buttons underneath. Only the avatar itself
            takes pointer events back. */}
        <div className="pointer-events-none -mt-[104px] flex items-end gap-3">
          <div className="pointer-events-auto relative h-20 w-20 shrink-0">
            {/* A real uploaded logo carries its own background/shape (the
                seed logo, for instance, is already a white circle) — the
                card's own white border/background/shadow was doubling up on
                top of that, showing as a visible white square behind a
                round logo. Only the emoji fallback (nothing uploaded yet)
                still needs that framing, or it would float bare on the
                gradient. */}
            <div
              className={`flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl text-4xl ${
                pharmacy.logoDataUrl ? '' : 'border-4 border-white bg-white shadow-md'
              }`}
            >
              {pharmacy.logoDataUrl ? (
                <img src={pharmacy.logoDataUrl} alt={`${pharmacy.name} logo`} className="h-full w-full object-cover" />
              ) : (
                accent.icon
              )}
            </div>
            {onLogoUpload && (
              <>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFileChange(e, onLogoUpload, setUploadingLogo)}
                />
                <button
                  type="button"
                  onClick={() => handleUploadTap(logoInputRef, setUploadingLogo, onLogoUpload)}
                  disabled={uploadingLogo}
                  aria-label={pharmacy.logoDataUrl ? 'Replace logo' : 'Upload logo'}
                  className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-xs shadow-sm hover:bg-white disabled:opacity-60"
                >
                  {uploadingLogo ? '…' : '📷'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* mt-8, not mt-4: the avatar row above ends at 104px (banner height
            128px minus its own 104px negative margin, plus its 80px
            height), so anything less than a 24px gap here still starts
            before the banner's own bottom edge — this address/map row was
            overlapping the banner's tail end and its diagonal stripe
            pattern showed through the text. */}
        <div className="pointer-events-auto mt-8 flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5 text-xs text-slate-500">
            <p>
              📍 {pharmacy.addressDetail}, {pharmacy.barangay}, {pharmacy.city}
            </p>
            {pharmacy.contactPhone && <p>☎ {pharmacy.contactPhone}</p>}
            <p>
              {accent.icon} {itemCount} item{itemCount === 1 ? '' : 's'} on the menu
            </p>
            {(() => {
              const { average, count } = storeRatingSummary(pharmacy)
              return (
                <p className="flex flex-wrap items-center gap-x-2">
                  <span>
                    {count > 0 ? (
                      <>
                        <span className="text-amber-500">★</span> <span className="font-semibold text-slate-700">{average.toFixed(1)}</span>{' '}
                        ({count} {count === 1 ? 'rating' : 'ratings'})
                      </>
                    ) : (
                      <>
                        <span className="text-slate-300">★</span> No ratings yet
                      </>
                    )}
                  </span>
                  {onRate && (
                    <button type="button" onClick={onRate} className="font-semibold text-brand-700 hover:underline">
                      Rate this store
                    </button>
                  )}
                </p>
              )
            })()}
          </div>
          {(() => {
            const tileContent = (
              <>
                <div
                  aria-hidden
                  className="absolute inset-0 opacity-60"
                  style={{
                    backgroundImage:
                      'linear-gradient(#cbd5e1 1px, transparent 1px), linear-gradient(90deg, #cbd5e1 1px, transparent 1px)',
                    backgroundSize: '10px 10px',
                  }}
                />
                <span className="relative text-lg">📍</span>
                <span className="absolute bottom-0.5 left-0 right-0 truncate bg-white/90 px-1 text-center text-[8px] font-semibold text-slate-600">
                  {onPinLocation ? 'Pin location' : 'My location'}
                </span>
              </>
            )
            const tileClass =
              'relative flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100'
            return onPinLocation ? (
              <button type="button" onClick={onPinLocation} className={tileClass} title="Pin your store's location">
                {tileContent}
              </button>
            ) : (
              <a href={mapUrl} target="_blank" rel="noreferrer" className={tileClass} title="My location — open in Maps">
                {tileContent}
              </a>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

// One menu item's card — shared between the read/order storefront and
// VendorMenuManager's edit list. `right` is whatever action belongs on the
// trailing edge: an Add/qty-stepper for a customer, a stock pill for a
// read-only preview, or Edit/Remove buttons while a vendor manages their menu.
export function VendorMenuItemCard({
  item,
  accent,
  right,
  dimmed,
  onChangePhotoClick,
}: {
  item: MedicineProduct
  accent: Pick<VendorAccent, 'soft' | 'softText'>
  right: React.ReactNode
  dimmed?: boolean
  // Present only while a vendor manages their own menu (see
  // VendorMenuManager.tsx) — shows a small camera badge on the photo that
  // opens a picker (search the food catalog, or upload your own). Absent
  // for a customer/read-only view, which never needs to change a photo.
  onChangePhotoClick?: () => void
}) {
  const defaultVisual = getDefaultDishVisual(item.name)
  const badge = item.badge ? MENU_ITEM_BADGES[item.badge] : null

  return (
    <div className={`flex gap-3 rounded-xl border p-2.5 ${dimmed ? 'border-slate-100 opacity-60' : 'border-slate-200'}`}>
      <div className="relative h-16 w-16 shrink-0">
        {item.photoDataUrl ? (
          <img src={item.photoDataUrl} alt={item.name} className="h-16 w-16 rounded-lg object-cover" />
        ) : (
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-lg text-2xl ${defaultVisual?.bg ?? 'bg-slate-100'}`}
          >
            {defaultVisual?.emoji ?? '🍽️'}
          </div>
        )}
        {onChangePhotoClick && (
          <button
            type="button"
            onClick={onChangePhotoClick}
            aria-label={item.photoDataUrl ? `Change photo for ${item.name}` : `Add photo for ${item.name}`}
            className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-[11px] shadow-sm hover:bg-white"
          >
            📷
          </button>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {/* Wraps to a second line rather than truncating — "Adobong Manok"
            was showing as "Ado…" beside the row's controls on a phone. */}
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-800">{item.name}</p>
        <p className={`text-sm font-bold ${accent.softText}`}>₱{item.price}</p>
        {item.description && <p className="mt-0.5 truncate text-[11px] text-slate-500">{item.description}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {badge && (
            <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${badge.className}`}>
              {badge.icon} {badge.label}
            </span>
          )}
          {item.menuCategory?.trim() && (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
              {item.menuCategory.trim()}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end justify-between gap-1.5">{right}</div>
    </div>
  )
}

// A vendor's card on the food-ordering landing screen (see
// One vendor as a single strip in the customer's list — on its own banner.
// The strip IS the store's banner (theme gradient, banner art, the profile
// photo seated on the right exactly as the vendor framed it on their page),
// with one line of text over it: logo, name, rating, menu size, open dot.
// Still one line per store, so a phone shows a whole row of carinderias,
// but each one looks like its own page rather than a generic list entry.
export function VendorListRow({
  pharmacy,
  itemCount,
  onSelect,
}: {
  pharmacy: Pharmacy
  itemCount: number
  onSelect: () => void
}) {
  const accent = resolveVendorAccent(pharmacy)
  const { average, count } = storeRatingSummary(pharmacy)
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative flex h-14 w-full items-center gap-2.5 overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br ${accent.gradient} px-2.5 text-left shadow-sm transition hover:brightness-105`}
    >
      <VendorBannerArt />
      {pharmacy.coverPhotoDataUrl && (
        <span aria-hidden className="absolute inset-0 overflow-hidden">
          <img
            src={pharmacy.coverPhotoDataUrl}
            alt=""
            className="absolute w-auto max-w-none"
            style={{
              left: `${pharmacy.coverPhotoPosition?.x ?? 75}%`,
              top: `${pharmacy.coverPhotoPosition?.y ?? 50}%`,
              height: `${(pharmacy.coverPhotoPosition?.scale ?? 1) * 100}%`,
              transform: 'translate(-50%, -50%)',
            }}
          />
        </span>
      )}
      {/* A dark sweep from the left keeps the name legible over any photo;
          it fades out before the picture on the right. */}
      <span aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/30 to-transparent" />
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-white bg-white text-lg shadow-md">
        {pharmacy.logoDataUrl ? (
          <img src={pharmacy.logoDataUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden>{accent.icon}</span>
        )}
      </span>
      {/* Everything on one line: the name takes what is left after the
          rating, menu size and open dot, and is the only thing that is
          ever cut short. */}
      <span className="relative min-w-0 flex-1 truncate text-sm font-extrabold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]">
        {pharmacy.name}
      </span>
      <span className="relative shrink-0 rounded-full bg-black/40 px-2 py-0.5 text-[11px] font-semibold text-white">
        {count > 0 && (
          <>
            <span className="text-amber-300">★</span> {average.toFixed(1)} ·{' '}
          </>
        )}
        {itemCount} item{itemCount === 1 ? '' : 's'}
      </span>
      <span
        aria-label={pharmacy.isOpen ? 'Open now' : 'Closed'}
        title={pharmacy.isOpen ? 'Open now' : 'Closed'}
        className={`relative h-2.5 w-2.5 shrink-0 rounded-full border border-white ${pharmacy.isOpen ? 'bg-emerald-400' : 'bg-slate-300'}`}
      />
      <span aria-hidden className="relative shrink-0 text-white/80">
        ›
      </span>
    </button>
  )
}

// VendorMenuBooking.tsx's browse step) — a condensed version of
// VendorHeaderCard's own banner/avatar treatment, so a vendor that has
// customized their cover photo/logo/theme shows up looking like their own
// page, not a generic list row.
export function VendorFeatureCard({
  pharmacy,
  itemCount,
  onSelect,
}: {
  pharmacy: Pharmacy
  itemCount: number
  onSelect: () => void
}) {
  const accent = resolveVendorAccent(pharmacy)
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className={`relative h-16 overflow-hidden bg-gradient-to-br ${accent.gradient}`}>
        {/* Same treatment as VendorHeaderCard: themed art underneath, the
            profile photo height-fitted on the right. */}
        <VendorBannerArt />
        {pharmacy.coverPhotoDataUrl && (
          <div aria-hidden className="absolute inset-0 overflow-hidden">
            <img
              src={pharmacy.coverPhotoDataUrl}
              alt=""
              className="absolute w-auto max-w-none"
              style={{
                left: `${pharmacy.coverPhotoPosition?.x ?? 75}%`,
                top: `${pharmacy.coverPhotoPosition?.y ?? 50}%`,
                height: `${(pharmacy.coverPhotoPosition?.scale ?? 1) * 100}%`,
                transform: 'translate(-50%, -50%)',
              }}
            />
          </div>
        )}
        <span
          className={`absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold shadow-sm ${
            pharmacy.isOpen ? 'bg-white/90 text-emerald-700' : 'bg-white/80 text-slate-500'
          }`}
        >
          {pharmacy.isOpen ? '🟢 Open' : '⚪ Closed'}
        </span>
      </div>
      <div className="relative px-3 pb-3">
        <div className="-mt-7 flex items-end">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border-[3px] border-white bg-white text-2xl shadow-md">
            {pharmacy.logoDataUrl ? (
              <img src={pharmacy.logoDataUrl} alt={`${pharmacy.name} logo`} className="h-full w-full object-cover" />
            ) : (
              accent.icon
            )}
          </div>
        </div>
        <p className="mt-1.5 truncate text-sm font-bold text-slate-800">{pharmacy.name}</p>
        {pharmacy.tagline ? (
          <p className="truncate text-[10px] italic text-slate-400">{pharmacy.tagline}</p>
        ) : (
          <p className="truncate text-[10px] text-slate-400">
            📍 {pharmacy.barangay}, {pharmacy.city}
          </p>
        )}
        <div className="mt-1 flex items-center gap-1">
          <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${accent.soft} ${accent.softText}`}>
            {accent.icon} {accent.label}
          </span>
          <span className="text-[9px] text-slate-400">
            {itemCount} item{itemCount === 1 ? '' : 's'}
          </span>
          {(() => {
            const { average, count } = storeRatingSummary(pharmacy)
            return count > 0 ? (
              <span className="text-[9px] text-slate-500">
                <span className="text-amber-500">★</span> {average.toFixed(1)}
              </span>
            ) : null
          })()}
        </div>
      </div>
    </button>
  )
}

export function VendorStorefront({
  pharmacy,
  items,
  cart,
  onQtyChange,
  onCheckout,
  onRate,
  viewer,
}: {
  pharmacy: Pharmacy
  items: MedicineProduct[]
  // Both present = customer ordering view (qty steppers + checkout bar
  // show). Both absent = the vendor's own read-only preview of their public
  // page.
  cart?: Record<string, number>
  onQtyChange?: (productId: string, qty: number) => void
  onCheckout?: () => void
  // Customer ordering view only — see VendorHeaderCard.
  onRate?: () => void
  // Who is reading the Feed tab — see PostViewer in VendorFeed.
  viewer?: PostViewer | null
}) {
  const accent = resolveVendorAccent(pharmacy)
  const interactive = !!cart && !!onQtyChange
  const [activeCategory, setActiveCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'menu' | 'feed'>('menu')
  const postCount = pharmacy.posts?.length ?? 0
  const cardRef = useRef<HTMLDivElement>(null)

  // A tap on a post's photo or featured dish is "I want that": switch to
  // the menu, put the dish (if the post named one) in the cart, and scroll
  // back up to the tabs so the menu is what they are looking at.
  function openMenuFromPost(productId: string | null) {
    if (productId && interactive) {
      const item = items.find((i) => i.id === productId)
      if (item && item.inStock && item.visible !== false) onQtyChange!(productId, (cart![productId] ?? 0) + 1)
    }
    setView('menu')
    cardRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  // Built from the items a customer can actually see — a category whose
  // every item is hidden (see `visible`) would otherwise leave an empty tab
  // behind, promising a "Drinks" section with nothing in it.
  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          items
            .filter((i) => i.visible !== false)
            .map((i) => i.menuCategory?.trim())
            .filter((c): c is string => !!c),
        ),
      ),
    [items],
  )

  const query = search.trim().toLowerCase()
  const shownItems = items
    .filter((item) => {
      // A vendor can uncheck "Show on store" without deleting the item (see
      // VendorMenuManager.tsx) — this component is always the customer/
      // preview-facing view (the vendor's own editable list uses
      // VendorMenuItemCard directly, not this), so a hidden item never
      // renders here.
      if (item.visible === false) return false
      if (activeCategory !== 'all' && (item.menuCategory?.trim() || 'Menu') !== activeCategory) return false
      if (query && !item.name.toLowerCase().includes(query) && !(item.description ?? '').toLowerCase().includes(query)) return false
      return true
    })
    .sort((a, b) => {
      // Same ordering a vendor sees while managing their own menu (see
      // VendorMenuManager.tsx's shownProducts) — a customer browsing "All
      // Menu" should see the same arrangement the vendor arranged/prioritized,
      // not a plain A-Z list that ignores their drag order and badges.
      if (activeCategory === 'all') {
        const aIdx = a.sortIndex ?? Infinity
        const bIdx = b.sortIndex ?? Infinity
        if (aIdx !== bIdx) return aIdx - bIdx
      }
      const badgeDiff = menuBadgeSortRank(a.badge) - menuBadgeSortRank(b.badge)
      if (badgeDiff !== 0) return badgeDiff
      if (activeCategory === 'all') {
        const rankDiff = menuCategorySortRank(a.menuCategory?.trim() || 'Menu') - menuCategorySortRank(b.menuCategory?.trim() || 'Menu')
        if (rankDiff !== 0) return rankDiff
      }
      return a.name.localeCompare(b.name)
    })

  const cartCount = cart ? Object.values(cart).reduce((sum, qty) => sum + qty, 0) : 0
  const cartTotal = cart ? items.reduce((sum, item) => sum + (cart[item.id] ?? 0) * item.price, 0) : 0

  return (
    <div ref={cardRef} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <VendorHeaderCard
        pharmacy={pharmacy}
        itemCount={items.filter((i) => i.visible !== false).length}
        accent={accent}
        onRate={onRate}
      />

      {/* Menu | Feed, the way a page has tabs under its banner. The feed is
          the vendor's own posts — promos, today's special, a dish to show
          off — and reads the same for a customer, a visitor and the vendor. */}
      <div className="flex border-t border-slate-100">
        {(['menu', 'feed'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`flex-1 py-2.5 text-center text-xs font-bold uppercase tracking-wide transition ${
              view === v ? `border-b-2 ${accent.softText} border-current` : 'border-b-2 border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            {v === 'menu' ? '🍽️ Menu' : `📣 Feed${postCount > 0 ? ` (${postCount})` : ''}`}
          </button>
        ))}
      </div>

      {view === 'feed' && (
        <div className="border-t border-slate-100 bg-slate-50 p-3">
          <VendorFeedList
            pharmacy={pharmacy}
            items={items}
            accent={accent}
            onAdd={interactive ? (productId) => onQtyChange!(productId, (cart![productId] ?? 0) + 1) : undefined}
            onOpenMenu={openMenuFromPost}
            viewer={viewer}
          />
        </div>
      )}

      {view === 'menu' && categories.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto border-t border-slate-100 px-3 py-2.5">
          <button
            type="button"
            onClick={() => setActiveCategory('all')}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              activeCategory === 'all' ? `${accent.solid} text-white` : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            ▦ All Menu
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setActiveCategory(c)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                activeCategory === c ? `${accent.solid} text-white` : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {categoryIcon(c)} {c}
            </button>
          ))}
        </div>
      )}

      {view === 'menu' && (
      <div className={`space-y-2.5 p-3 ${categories.length === 0 ? 'border-t border-slate-100' : ''}`}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-800">Menu</h3>
        </div>
        {items.length > 3 && (
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search menu…"
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
          />
        )}

        {items.length === 0 && <p className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-400">No menu items yet.</p>}
        {items.length > 0 && shownItems.length === 0 && (
          <p className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-400">No dish matches your search.</p>
        )}

        <div className="space-y-2">
          {shownItems.map((item) => (
            <VendorMenuItemCard
              key={item.id}
              item={item}
              accent={accent}
              dimmed={!item.inStock}
              right={
                interactive && item.inStock ? (
                  cart![item.id] ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onQtyChange!(item.id, (cart![item.id] ?? 0) - 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 text-sm font-semibold text-slate-600"
                      >
                        −
                      </button>
                      <span className="w-5 text-center text-sm font-medium text-slate-700">{cart![item.id]}</span>
                      <button
                        type="button"
                        onClick={() => onQtyChange!(item.id, (cart![item.id] ?? 0) + 1)}
                        className={`flex h-7 w-7 items-center justify-center rounded-md text-sm font-semibold text-white ${accent.solid} ${accent.solidHover}`}
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onQtyChange!(item.id, 1)}
                      className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-white ${accent.solid} ${accent.solidHover}`}
                    >
                      + Add
                    </button>
                  )
                ) : (
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      item.inStock ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {item.inStock ? 'In stock' : 'Out of stock'}
                  </span>
                )
              }
            />
          ))}
        </div>
      </div>
      )}

      {interactive && cartCount > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <span className="text-lg">🛒</span>
            <div>
              <p className="font-semibold">View Cart</p>
              <p className="text-[11px] text-slate-500">
                {cartCount} item{cartCount === 1 ? '' : 's'} · ₱{cartTotal}
              </p>
            </div>
          </div>
          {onCheckout && (
            <button
              type="button"
              onClick={onCheckout}
              className={`flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-semibold text-white ${accent.solid} ${accent.solidHover}`}
            >
              Proceed to Checkout →
            </button>
          )}
        </div>
      )}
    </div>
  )
}
