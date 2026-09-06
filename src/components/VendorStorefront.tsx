import { useEffect, useMemo, useRef, useState } from 'react'
import { getDefaultDishVisual } from '../lib/filipinoDishes'
import { captureNativePhoto, compressImageFile } from '../lib/photo'
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
export function VendorHeaderCard({
  pharmacy,
  itemCount,
  accent,
  onLogoUpload,
  onCoverUpload,
}: {
  pharmacy: Pharmacy
  itemCount: number
  accent: VendorAccent
  // Present only on the vendor's own edit screen (see VendorMenuManager.tsx)
  // — turns the avatar/banner into tap-to-upload targets. Absent everywhere
  // else (customer ordering, the vendor's own read-only Preview tab), so
  // neither ever shows an upload affordance a customer could tap.
  onLogoUpload?: (dataUrl: string) => void
  onCoverUpload?: (dataUrl: string) => void
}) {
  const [favorited, setFavorited] = useState(false)
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied'>('idle')
  const logoInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)

  // Same native-prompt-then-file-input pattern as DocumentUploadField.tsx —
  // duplicated in miniature here rather than imported, since this component
  // is otherwise pure presentation and the two targets (round avatar, wide
  // banner) don't share that field's row layout.
  async function handleUploadTap(
    inputRef: React.RefObject<HTMLInputElement | null>,
    setBusy: (busy: boolean) => void,
    onUpload: (dataUrl: string) => void,
  ) {
    setBusy(true)
    try {
      const native = await captureNativePhoto({ source: 'prompt' })
      if (native) {
        onUpload(native)
        return
      }
      inputRef.current?.click()
    } finally {
      setBusy(false)
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>, onUpload: (dataUrl: string) => void, setBusy: (busy: boolean) => void) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      onUpload(await compressImageFile(file))
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

  async function handleShare() {
    const url = `${window.location.origin}/vendor-page/${pharmacy.id}`
    const nav = navigator as Navigator & { share?: (data: { title: string; url: string }) => Promise<void> }
    if (nav.share) {
      try {
        await nav.share({ title: pharmacy.name, url })
        return
      } catch {
        // User cancelled the native share sheet — fall through to nothing.
        return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setShareStatus('copied')
      setTimeout(() => setShareStatus('idle'), 1500)
    } catch {
      // Clipboard blocked — nothing more we can do without a share sheet.
    }
  }

  const mapQuery = encodeURIComponent(`${pharmacy.addressDetail}, ${pharmacy.barangay}, ${pharmacy.city}`)
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`

  return (
    <div>
      <div
        className={`relative h-32 bg-gradient-to-br ${accent.gradient}`}
        style={
          pharmacy.coverPhotoDataUrl
            ? { backgroundImage: `url(${pharmacy.coverPhotoDataUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : undefined
        }
      >
        {/* Cover photo (when set) sits under a dark scrim so the name/badge
            text drawn on top stays legible over any photo's own colors —
            without the scrim, a bright photo could wash the white text out
            entirely. The diagonal stripe pattern is the "no photo" look
            only, so it's skipped once a cover photo takes over. */}
        {pharmacy.coverPhotoDataUrl ? (
          <div aria-hidden className="absolute inset-0 bg-black/25" />
        ) : (
          <div
            aria-hidden
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: 'repeating-linear-gradient(-45deg, white 0, white 2px, transparent 2px, transparent 14px)',
            }}
          />
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
              onClick={() => handleUploadTap(coverInputRef, setUploadingCover, onCoverUpload)}
              disabled={uploadingCover}
              aria-label={pharmacy.coverPhotoDataUrl ? 'Replace cover photo' : 'Upload cover photo'}
              className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-white disabled:opacity-60"
            >
              {uploadingCover ? '…' : '📷 Change cover'}
            </button>
          </>
        )}

        <div className="absolute right-3 top-3 flex flex-col items-end gap-1.5">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm ${
              pharmacy.isOpen ? 'bg-white/90 text-emerald-700' : 'bg-white/80 text-slate-500'
            }`}
          >
            {pharmacy.isOpen ? '🟢 Open now' : '⚪ Closed'}
          </span>
          <div className="flex items-center gap-1.5">
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
              onClick={handleShare}
              aria-label="Share this vendor page"
              title="Share"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-sm shadow-sm hover:bg-white"
            >
              {shareStatus === 'copied' ? '✓' : '🔗'}
            </button>
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

      <div className="relative px-4 pb-3">
        {/* `relative` here (even with no z-index of its own) puts this block
            in the same "positioned" paint layer as the banner above — which
            also has `relative`, for its own stripe overlay. Without it, the
            banner (positioned) paints over this block (plain/static) despite
            coming first in the markup, silently swallowing the top of
            whatever the negative margin below pulls up to overlap it. */}
        <div className="-mt-[104px] flex items-end gap-3">
          <div className="relative h-20 w-20 shrink-0">
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
        <div className="mt-8 flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5 text-xs text-slate-500">
            <p>
              📍 {pharmacy.addressDetail}, {pharmacy.barangay}, {pharmacy.city}
            </p>
            {pharmacy.contactPhone && <p>☎ {pharmacy.contactPhone}</p>}
            <p>
              {accent.icon} {itemCount} item{itemCount === 1 ? '' : 's'} on the menu
            </p>
          </div>
          <a
            href={mapUrl}
            target="_blank"
            rel="noreferrer"
            className="relative flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
            title="View on Map"
          >
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
              View on Map
            </span>
          </a>
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
        <p className="truncate text-sm font-semibold text-slate-800">{item.name}</p>
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
      <div
        className={`relative h-16 bg-gradient-to-br ${accent.gradient}`}
        style={
          pharmacy.coverPhotoDataUrl
            ? { backgroundImage: `url(${pharmacy.coverPhotoDataUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : undefined
        }
      >
        {pharmacy.coverPhotoDataUrl ? (
          <div aria-hidden className="absolute inset-0 bg-black/20" />
        ) : (
          <div
            aria-hidden
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: 'repeating-linear-gradient(-45deg, white 0, white 2px, transparent 2px, transparent 14px)',
            }}
          />
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
}: {
  pharmacy: Pharmacy
  items: MedicineProduct[]
  // Both present = customer ordering view (qty steppers + checkout bar
  // show). Both absent = the vendor's own read-only preview of their public
  // page.
  cart?: Record<string, number>
  onQtyChange?: (productId: string, qty: number) => void
  onCheckout?: () => void
}) {
  const accent = resolveVendorAccent(pharmacy)
  const interactive = !!cart && !!onQtyChange
  const [activeCategory, setActiveCategory] = useState('all')
  const [search, setSearch] = useState('')

  const categories = useMemo(
    () => Array.from(new Set(items.map((i) => i.menuCategory?.trim()).filter((c): c is string => !!c))),
    [items],
  )

  const query = search.trim().toLowerCase()
  const shownItems = items.filter((item) => {
    if (activeCategory !== 'all' && (item.menuCategory?.trim() || 'Menu') !== activeCategory) return false
    if (query && !item.name.toLowerCase().includes(query) && !(item.description ?? '').toLowerCase().includes(query)) return false
    return true
  })

  const cartCount = cart ? Object.values(cart).reduce((sum, qty) => sum + qty, 0) : 0
  const cartTotal = cart ? items.reduce((sum, item) => sum + (cart[item.id] ?? 0) * item.price, 0) : 0

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <VendorHeaderCard pharmacy={pharmacy} itemCount={items.length} accent={accent} />

      {categories.length > 0 && (
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
