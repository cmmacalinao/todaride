import { useEffect, useRef, useState } from 'react'
import { useRides } from '../context/RideContext'
import { DocumentUploadField } from './DocumentUploadField'
import { captureNativePhoto, compressImageFile, isNativePlatform } from '../lib/photo'
import { matchesNameQuery } from '../lib/fuzzyName'
import { downloadMenuSpreadsheet, parseMenuSpreadsheet, type ParsedSpreadsheetRow } from '../lib/menuSpreadsheet'
import {
  FOOD_CATALOG,
  FOOD_CATALOG_CATEGORIES,
  menuBadgeSortRank,
  menuCategorySortRank,
  type FoodCatalogItem,
} from '../lib/foodCatalog'
import { MenuBoardCropper, type ExtractedCrop } from './MenuBoardCropper'
import { VendorHeaderCard, VendorMenuItemCard, resolveVendorAccent } from './VendorStorefront'
import { VendorLocationPicker } from './VendorLocationPicker'
import { MENU_ITEM_BADGES, type MedicineProduct, type MenuItemBadge, type Pharmacy } from '../types'

// Registered Vendor's own menu management — the products section a resto/
// commodity vendor sees in their portal, in place of AddProductForm's
// pharmacy-shaped fields (generic name, OTC/Rx/Restricted), which don't fit
// a dish. `category` (MedicineCategory) is still set on every item this
// writes — always 'otc' — purely because MedicineProduct requires it; the
// vendor never sees or edits it. menuCategory/photoDataUrl/description/badge
// are what actually organize and illustrate a vendor's own menu.
//
// Reuses VendorHeaderCard/VendorMenuItemCard from VendorStorefront.tsx so
// this editing screen looks like (almost) the same page a customer sees —
// same banner, same item-card layout — just with Edit/Remove/stock controls
// where a customer would see an Add button.
export function VendorMenuManager({ pharmacy, products }: { pharmacy: Pharmacy; products: MedicineProduct[] }) {
  const {
    addMedicineProduct,
    updateMedicineProduct,
    removeMedicineProduct,
    reorderMedicineProducts,
    toggleMedicineProductStock,
    toggleMedicineProductVisibility,
    setMedicineProductStockCount,
    updateVendorBranding,
  } = useRides()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [photoPickerId, setPhotoPickerId] = useState<string | null>(null)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  // A removed item stays out of view immediately, but the actual delete (see
  // handleConfirmRemove) is delayed so Undo has something to cancel.
  const [pendingRemoval, setPendingRemoval] = useState<{ product: MedicineProduct; timeoutId: ReturnType<typeof setTimeout> } | null>(
    null,
  )
  const [bulkToolsOpen, setBulkToolsOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState('all')
  const [showLocationPicker, setShowLocationPicker] = useState(false)
  // Drag-to-reorder (All Menu only — see the sort above). dragOrder holds the
  // live-reordered id list while a drag is in progress so the list visually
  // follows the pointer; null the rest of the time, when shownProducts'
  // own sort is what's on screen.
  const [dragOrder, setDragOrder] = useState<string[] | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())

  const accent = resolveVendorAccent(pharmacy)
  // Pending-removal item excluded here so it disappears from the list the
  // instant "Remove" is confirmed, even though it's still really in
  // `products` until the Undo window closes.
  const visibleProducts = pendingRemoval ? products.filter((p) => p.id !== pendingRemoval.product.id) : products
  const categories = Array.from(new Set(visibleProducts.map((p) => p.menuCategory?.trim()).filter((c): c is string => !!c)))
  const editingProduct = products.find((p) => p.id === editingId) ?? null
  const shownProducts = (
    activeCategory === 'all'
      ? visibleProducts
      : visibleProducts.filter((p) => (p.menuCategory?.trim() || 'Menu') === activeCategory)
  )
    .slice()
    .sort((a, b) => {
      // A dragged-into-place item (see the drag handle below) always wins —
      // sortIndex is only ever set by that drag, all at once for the whole
      // All Menu list, so items missing it (never dragged, or added after
      // the last drag) fall through to the automatic badge/category/name
      // order and land after every manually-arranged one.
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

  // While dragging, show dragOrder's arrangement instead of shownProducts'
  // own sort — otherwise the row would snap back to its sorted position on
  // every pointer move instead of following the drag.
  const displayedProducts = dragOrder
    ? (dragOrder.map((id) => shownProducts.find((p) => p.id === id)).filter((p): p is MedicineProduct => !!p))
    : shownProducts

  function handleDragHandlePointerDown(e: React.PointerEvent, productId: string) {
    if (activeCategory !== 'all') return
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDraggingId(productId)
    setDragOrder(shownProducts.map((p) => p.id))
  }

  function handleDragHandlePointerMove(e: React.PointerEvent) {
    if (!draggingId) return
    setDragOrder((current) => {
      if (!current) return current
      const fromIndex = current.indexOf(draggingId)
      if (fromIndex === -1) return current
      let toIndex = fromIndex
      for (let i = 0; i < current.length; i++) {
        const el = rowRefs.current.get(current[i])
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
          toIndex = i
          break
        }
      }
      if (toIndex === fromIndex) return current
      const next = current.slice()
      next.splice(fromIndex, 1)
      next.splice(toIndex, 0, draggingId)
      return next
    })
  }

  function handleDragHandlePointerUp() {
    if (draggingId && dragOrder) reorderMedicineProducts(dragOrder)
    setDraggingId(null)
    setDragOrder(null)
  }

  function setBranding(
    patch: Partial<{
      coverPhotoDataUrl: string | null
      coverPhotoPosition: { x: number; y: number; scale?: number } | null
      logoDataUrl: string | null
      themeColor: string | null
      tagline: string | null
    }>,
  ) {
    updateVendorBranding({
      pharmacyId: pharmacy.id,
      coverPhotoDataUrl: pharmacy.coverPhotoDataUrl ?? null,
      coverPhotoPosition: pharmacy.coverPhotoPosition ?? null,
      logoDataUrl: pharmacy.logoDataUrl ?? null,
      themeColor: pharmacy.themeColor ?? null,
      tagline: pharmacy.tagline ?? null,
      ...patch,
    })
  }

  function handleAdd(fields: MenuItemFields) {
    addMedicineProduct({
      pharmacyId: pharmacy.id,
      name: fields.name,
      genericName: null,
      category: 'otc',
      price: fields.price,
      menuCategory: fields.menuCategory,
      photoDataUrl: fields.photoDataUrl,
      description: fields.description,
      badge: fields.badge,
      stockCount: fields.stockCount ?? null,
    })
  }

  function handleUpdate(productId: string, fields: MenuItemFields) {
    const existing = products.find((p) => p.id === productId)
    if (!existing) return
    updateMedicineProduct({
      productId,
      name: fields.name,
      genericName: existing.genericName,
      category: existing.category,
      price: fields.price,
      menuCategory: fields.menuCategory,
      photoDataUrl: fields.photoDataUrl,
      description: fields.description,
      badge: fields.badge,
      // The edit form no longer carries a stock field — today's count is set
      // from the row's own pill (see StockPill) — so an edit must not wipe it.
      stockCount: fields.stockCount === undefined ? (existing.stockCount ?? null) : fields.stockCount,
    })
    setEditingId(null)
  }

  // Removing doesn't take effect immediately — the item just leaves the
  // visible list (see visibleProducts below) while a short window to Undo
  // stays open. Only once that window closes does it actually get dispatched
  // to removeMedicineProduct, which is the point of no return this used to
  // warn about ("This can't be undone") before Undo existed.
  function handleConfirmRemove(product: MedicineProduct) {
    setConfirmRemoveId(null)
    if (editingId === product.id) setEditingId(null)
    const timeoutId = setTimeout(() => {
      removeMedicineProduct(product.id)
      setPendingRemoval((current) => (current?.product.id === product.id ? null : current))
    }, 5000)
    setPendingRemoval((current) => {
      if (current) clearTimeout(current.timeoutId)
      return { product, timeoutId }
    })
  }

  function handleUndoRemove() {
    if (!pendingRemoval) return
    clearTimeout(pendingRemoval.timeoutId)
    setPendingRemoval(null)
  }

  function handlePhotoSelect(product: MedicineProduct, photoDataUrl: string) {
    updateMedicineProduct({
      productId: product.id,
      name: product.name,
      genericName: product.genericName,
      category: product.category,
      price: product.price,
      menuCategory: product.menuCategory ?? null,
      photoDataUrl,
      description: product.description ?? null,
      badge: product.badge ?? null,
      stockCount: product.stockCount ?? null,
    })
    setPhotoPickerId(null)
  }

  if (showLocationPicker) {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <VendorLocationPicker pharmacy={pharmacy} onBack={() => setShowLocationPicker(false)} />
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <VendorHeaderCard
        pharmacy={pharmacy}
        itemCount={visibleProducts.length}
        accent={accent}
        onLogoUpload={(dataUrl) => setBranding({ logoDataUrl: dataUrl })}
        onCoverUpload={(dataUrl) => setBranding({ coverPhotoDataUrl: dataUrl })}
        onPinLocation={() => setShowLocationPicker(true)}
        onCoverPositionChange={(position) => setBranding({ coverPhotoPosition: position })}
      />

      <div className="space-y-3 px-4 pb-4">
        {categories.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto border-t border-slate-100 pt-3">
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
                {c}
              </button>
            ))}
          </div>
        )}

        {pendingRemoval && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <span className="truncate">Removed "{pendingRemoval.product.name}".</span>
            <button
              type="button"
              onClick={handleUndoRemove}
              className="shrink-0 font-semibold text-amber-900 underline hover:no-underline"
            >
              Undo
            </button>
          </div>
        )}

        <div className={`space-y-2 ${categories.length === 0 ? 'border-t border-slate-100 pt-3' : ''}`}>
          {displayedProducts.length === 0 && (
            <p className="text-sm text-slate-400">
              {visibleProducts.length === 0 ? 'No menu items yet — add your first one below.' : 'Nothing in this category yet.'}
            </p>
          )}
          {activeCategory === 'all' && displayedProducts.length > 1 && (
            <p className="text-[11px] text-slate-400">Drag ⠿ to arrange your menu the way you want customers to see it.</p>
          )}
          {displayedProducts.map((product) => {
            if (editingId === product.id) {
              return (
                <div key={product.id} className="rounded-lg border border-brand-200 bg-brand-50 p-2.5">
                  <MenuItemForm
                    categories={categories}
                    initial={product}
                    submitLabel="Save changes"
                    onSubmit={(fields) => handleUpdate(product.id, fields)}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              )
            }
            if (photoPickerId === product.id) {
              return (
                <PhotoPicker
                  key={product.id}
                  product={product}
                  onSelect={(dataUrl) => handlePhotoSelect(product, dataUrl)}
                  onCancel={() => setPhotoPickerId(null)}
                />
              )
            }
            if (confirmRemoveId === product.id) {
              return (
                <div key={product.id} className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5">
                  <p className="min-w-0 flex-1 text-xs text-amber-800">
                    Remove "{product.name}" from your menu? You'll get a few seconds to undo it after.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleConfirmRemove(product)}
                    className="shrink-0 rounded-lg bg-amber-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRemoveId(null)}
                    className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              )
            }
            return (
              <div
                key={product.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(product.id, el)
                  else rowRefs.current.delete(product.id)
                }}
                className={`flex items-start gap-1 ${draggingId === product.id ? 'opacity-60' : ''}`}
              >
                {activeCategory === 'all' && (
                  <button
                    type="button"
                    onPointerDown={(e) => handleDragHandlePointerDown(e, product.id)}
                    onPointerMove={handleDragHandlePointerMove}
                    onPointerUp={handleDragHandlePointerUp}
                    onPointerCancel={handleDragHandlePointerUp}
                    title="Drag to reorder"
                    aria-label={`Drag to reorder ${product.name}`}
                    className="mt-2.5 shrink-0 cursor-grab touch-none px-0.5 text-base leading-none text-slate-300 hover:text-slate-500 active:cursor-grabbing"
                  >
                    ⠿
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <VendorMenuItemCard
                    item={product}
                    accent={accent}
                    dimmed={!product.inStock}
                    onChangePhotoClick={() => {
                      setEditingId(null)
                      setPhotoPickerId(product.id)
                    }}
                    right={
                      <>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setPhotoPickerId(null)
                              setEditingId(product.id)
                            }}
                            className="rounded-full px-2 py-0.5 text-[11px] font-medium text-brand-700 hover:bg-brand-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRemoveId(product.id)}
                            className="rounded-full px-2 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-50"
                          >
                            Remove
                          </button>
                        </div>
                        <ServingsField
                          product={product}
                          onSetStockCount={(count) => setMedicineProductStockCount(product.id, count)}
                        />
                        <label className="flex items-center gap-1 text-[11px] text-slate-500">
                          <input
                            type="checkbox"
                            checked={product.inStock}
                            onChange={() => toggleMedicineProductStock(product.id)}
                            className="h-3 w-3 accent-brand-600"
                          />
                          {product.inStock ? 'Available' : 'Sold out'}
                        </label>
                        <label className="flex items-center gap-1 text-[11px] text-slate-500">
                          <input
                            type="checkbox"
                            checked={product.visible !== false}
                            onChange={() => toggleMedicineProductVisibility(product.id)}
                            className="h-3 w-3 accent-brand-600"
                          />
                          Show on store
                        </label>
                      </>
                    }
                  />
                </div>
              </div>
            )
          })}
        </div>

        {!editingProduct && (
          <div className="space-y-1.5 border-t border-slate-100 pt-3">
            <p className="text-xs font-medium text-slate-500">Add a dish / item</p>
            <MenuItemForm categories={categories} onSubmit={handleAdd} />
          </div>
        )}

        <div className="border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => setBulkToolsOpen((v) => !v)}
            className="flex w-full items-center justify-between text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            <span>⚡ Bulk add tools</span>
            <span>{bulkToolsOpen ? '▲' : '▼'}</span>
          </button>
          {bulkToolsOpen && (
            <div className="mt-2 space-y-3">
              <CommonDishesTool onAdd={handleAdd} />
              <SpreadsheetTool pharmacy={pharmacy} products={products} defaultCategory={categories[0] ?? null} onAdd={handleAdd} />
              <PasteMenuTextTool defaultCategory={categories[0] ?? null} onAdd={handleAdd} />
              <BulkPhotoMatchTool products={products} />
              <MenuBoardCropTool defaultCategory={categories[0] ?? null} onAdd={handleAdd} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Today's servings, editable right on every menu row — the number changes
// all day as orders are accepted (see VENDOR_ACCEPT_MENU_ORDER's auto-deduct
// in RideContext.tsx), so it has to be correctable in place, not behind the
// full Edit form. Blank = unlimited (untracked); 0 = sold out for today.
// This is the only place a count is set now that the Add/Edit form no longer
// asks for one.
function ServingsField({
  product,
  onSetStockCount,
}: {
  product: MedicineProduct
  onSetStockCount: (count: number | null) => void
}) {
  const tracked = product.stockCount != null
  const [draft, setDraft] = useState(tracked ? String(product.stockCount) : '')
  const [focused, setFocused] = useState(false)

  // Follow the store while the field isn't being typed in — an accepted
  // order deducts a serving underneath this row and the number must move.
  useEffect(() => {
    if (!focused) setDraft(tracked ? String(product.stockCount) : '')
  }, [product.stockCount, tracked, focused])

  function commit() {
    if (draft.trim() === '') {
      onSetStockCount(null)
      return
    }
    const parsed = Math.max(0, Math.floor(Number(draft)))
    onSetStockCount(Number.isFinite(parsed) ? parsed : 0)
  }

  const soldOut = tracked && product.stockCount! <= 0
  return (
    <label className="flex items-center gap-1 text-[11px] text-slate-500" title="Today's servings — leave blank for unlimited">
      <span className={soldOut ? 'font-medium text-amber-700' : ''}>{soldOut ? 'Sold out' : 'Available'}</span>
      <input
        type="number"
        min={0}
        value={draft}
        placeholder="∞"
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          commit()
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          commit()
          e.currentTarget.blur()
        }}
        className="w-12 rounded-md border border-slate-300 px-1 py-0.5 text-center text-[11px] font-semibold text-slate-700"
      />
      <span>servings</span>
    </label>
  )
}

interface MenuItemFields {
  name: string
  price: number
  menuCategory: string | null
  photoDataUrl: string | null
  description: string | null
  badge: MenuItemBadge | null
  // How many servings are available today — omitted by the bulk-add tools
  // (CommonDishesTool, SpreadsheetTool, etc.), which have no notion of a
  // day's stock count; only MenuItemForm's own field sets this.
  stockCount?: number | null
}

function MenuItemForm({
  categories,
  initial,
  submitLabel = '+ Add item',
  onSubmit,
  onCancel,
}: {
  categories: string[]
  initial?: MedicineProduct
  submitLabel?: string
  onSubmit: (fields: MenuItemFields) => void
  onCancel?: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [price, setPrice] = useState(initial ? String(initial.price) : '')
  const [menuCategory, setMenuCategory] = useState(initial?.menuCategory ?? '')
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(initial?.photoDataUrl ?? null)
  const [description, setDescription] = useState(initial?.description ?? '')
  const [badge, setBadge] = useState<MenuItemBadge | null>(initial?.badge ?? null)
  const [error, setError] = useState('')
  // A native <input list=/<datalist> looked right on desktop Chrome but its
  // popup position is entirely up to the browser/OS — inside the Android
  // WebView this app actually ships in (see Capacitor config), that popup
  // routinely renders far from the field instead of under it. Built our own
  // dropdown below instead, so it's positioned (and closed) by our own CSS.
  const [showCategoryMenu, setShowCategoryMenu] = useState(false)
  const categoryMatches = categories.filter((c) => c.toLowerCase().includes(menuCategory.trim().toLowerCase()))

  // Live photo suggestions from TodaSafeRide's own food catalog as the
  // vendor types the dish name — picking one fills the photo (and the
  // description/category too, if still blank) without a separate step.
  const nameQuery = name.trim().toLowerCase()
  const suggestions =
    nameQuery.length < 2
      ? []
      : FOOD_CATALOG.filter(
          (item) => item.name.toLowerCase().includes(nameQuery) || matchesNameQuery(item.name, nameQuery),
        ).slice(0, 8)

  function applySuggestion(item: FoodCatalogItem) {
    if (item.photoUrl) setPhotoDataUrl(item.photoUrl)
    if (!description.trim()) setDescription(item.description)
    if (!menuCategory.trim()) {
      const category = FOOD_CATALOG_CATEGORIES.find((c) => c.code === item.categoryCode)
      if (category) setMenuCategory(category.name)
    }
  }

  // Picking a dish straight from the name dropdown (as opposed to the photo
  // strip below it, which only borrows a photo/category for whatever the
  // vendor is already typing) replaces the typed name with the catalog's own
  // spelling too — the vendor asked to type a few letters and select the
  // actual dish, not just its picture.
  const [showNameMenu, setShowNameMenu] = useState(false)
  function selectSuggestion(item: FoodCatalogItem) {
    setName(item.name)
    applySuggestion(item)
    setShowNameMenu(false)
  }

  // The photo strip's own upload tile — always its first option, so a dish
  // with no catalog match (or a vendor who just wants their own photo) never
  // has to scroll down to the separate "Photo (optional)" field below to get
  // a photo onto the item. Same native-prompt-then-file-input pattern as
  // DocumentUploadField.tsx, duplicated in miniature for this row's own tile
  // shape rather than reusing that component's row layout.
  const photoUploadInputRef = useRef<HTMLInputElement>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  function handlePhotoUploadTap() {
    if (!isNativePlatform()) {
      photoUploadInputRef.current?.click()
      return
    }
    setUploadingPhoto(true)
    void (async () => {
      try {
        const native = await captureNativePhoto({ source: 'prompt' })
        if (native) {
          setPhotoDataUrl(native)
          return
        }
        photoUploadInputRef.current?.click()
      } finally {
        setUploadingPhoto(false)
      }
    })()
  }

  async function handlePhotoUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadingPhoto(true)
    try {
      setPhotoDataUrl(await compressImageFile(file))
    } finally {
      setUploadingPhoto(false)
    }
  }

  function handleSubmit() {
    const priceNum = Number(price)
    if (!name.trim() || !Number.isFinite(priceNum) || priceNum <= 0) {
      setError('Enter an item name and a price greater than 0.')
      return
    }
    onSubmit({
      name: name.trim(),
      price: priceNum,
      menuCategory: menuCategory.trim() || null,
      photoDataUrl,
      description: description.trim() || null,
      badge,
    })
    if (!initial) {
      setName('')
      setPrice('')
      setMenuCategory('')
      setPhotoDataUrl(null)
      setDescription('')
      setBadge(null)
    }
    setError('')
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={() => setShowNameMenu(true)}
          onBlur={() => setTimeout(() => setShowNameMenu(false), 120)}
          placeholder="Item name (e.g. Chicken Adobo)"
          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
        />
        {showNameMenu && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-md">
            {suggestions.map((item) => (
              <button
                key={item.code}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectSuggestion(item)}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-slate-600 hover:bg-slate-50"
              >
                {item.photoUrl && (
                  <img src={item.photoUrl} alt="" loading="lazy" className="h-7 w-7 shrink-0 rounded object-cover" />
                )}
                <span className="truncate">{item.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        <input
          ref={photoUploadInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePhotoUploadFile}
        />
        <button
          type="button"
          onClick={handlePhotoUploadTap}
          disabled={uploadingPhoto}
          className="flex w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-slate-300 bg-slate-50 py-2.5 text-slate-500 hover:bg-slate-100 disabled:opacity-60"
          title="Upload your own photo"
        >
          <span className="text-base">{uploadingPhoto ? '…' : '📷'}</span>
          <span className="text-[8px] font-medium">Upload</span>
        </button>
        {suggestions.map((item) => (
          <button
            key={item.code}
            type="button"
            onClick={() => applySuggestion(item)}
            className={`w-14 shrink-0 overflow-hidden rounded-lg border text-left ${
              photoDataUrl === item.photoUrl ? 'border-brand-400 bg-brand-50' : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}
            title={`Use ${item.name}'s photo`}
          >
            {item.photoUrl && <img src={item.photoUrl} alt={item.name} loading="lazy" className="h-10 w-14 object-cover" />}
            <p className="truncate px-1 py-0.5 text-[8px] text-slate-500">{item.name}</p>
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <input
            value={menuCategory}
            onChange={(e) => setMenuCategory(e.target.value)}
            onFocus={() => setShowCategoryMenu(true)}
            onBlur={() => setTimeout(() => setShowCategoryMenu(false), 120)}
            placeholder="Category (e.g. Ulam, Drinks)"
            className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
          />
          {showCategoryMenu && categoryMatches.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-md">
              {categoryMatches.map((c) => (
                <button
                  key={c}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setMenuCategory(c)
                    setShowCategoryMenu(false)
                  }}
                  className="block w-full truncate px-2.5 py-1.5 text-left text-xs text-slate-600 hover:bg-slate-50"
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
        <input
          type="number"
          min={0}
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Price ₱"
          className="w-24 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
        />
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Short description shown to customers (optional)"
        rows={2}
        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
      />
      <div>
        <p className="mb-1 text-[11px] font-medium text-slate-500">Highlight badge (optional)</p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.entries(MENU_ITEM_BADGES) as [MenuItemBadge, (typeof MENU_ITEM_BADGES)[MenuItemBadge]][]).map(([key, b]) => (
            <button
              key={key}
              type="button"
              onClick={() => setBadge((prev) => (prev === key ? null : key))}
              className={`rounded-full px-2 py-1 text-[11px] font-medium transition ${
                badge === key ? b.className : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {b.icon} {b.label}
            </button>
          ))}
        </div>
      </div>
      <DocumentUploadField
        label="Photo (optional)"
        dataUrl={photoDataUrl}
        onUpload={setPhotoDataUrl}
        onRemove={() => setPhotoDataUrl(null)}
      />
      {error && <p className="text-[11px] font-medium text-amber-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          className="flex-1 rounded-lg border border-brand-300 bg-white py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
        >
          {submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}

// Lets a vendor swap one item's photo without opening the full edit form —
// reached via the small camera badge VendorMenuItemCard shows on its photo
// (see onChangePhotoClick). Offers two ways in: a real photo of their own
// (same upload pipeline as everywhere else), or a matching photo from
// TodaSafeRide's own 200-dish catalog (see lib/foodCatalog.ts) when their
// dish is a common one already in it — search defaults to the item's own
// name so an exact/near match usually shows up first.
function PhotoPicker({
  product,
  onSelect,
  onCancel,
}: {
  product: MedicineProduct
  onSelect: (dataUrl: string) => void
  onCancel: () => void
}) {
  const [query, setQuery] = useState(product.name)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const needle = query.trim().toLowerCase()
  const matches = FOOD_CATALOG.filter(
    (item) =>
      !needle ||
      item.name.toLowerCase().includes(needle) ||
      item.tags.some((t) => t.includes(needle)) ||
      matchesNameQuery(item.name, needle),
  ).slice(0, 24)

  function handleUploadTap() {
    if (!isNativePlatform()) {
      inputRef.current?.click()
      return
    }
    setBusy(true)
    void (async () => {
      try {
        const native = await captureNativePhoto({ source: 'prompt' })
        if (native) {
          onSelect(native)
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
      onSelect(await compressImageFile(file))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-1.5 rounded-lg border border-brand-200 bg-brand-50 p-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-600">Change photo for "{product.name}"</p>
        <button type="button" onClick={onCancel} className="text-[11px] font-medium text-slate-500 hover:text-slate-700">
          Cancel
        </button>
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search our food photos…"
        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
      />
      <div className="grid max-h-48 grid-cols-4 gap-1.5 overflow-y-auto">
        {matches.map((item) => (
          <button
            key={item.code}
            type="button"
            onClick={() => item.photoUrl && onSelect(item.photoUrl)}
            className="overflow-hidden rounded-lg border border-slate-200 bg-white text-left hover:bg-slate-50"
          >
            {item.photoUrl && <img src={item.photoUrl} alt={item.name} loading="lazy" className="h-12 w-full object-cover" />}
            <p className="truncate px-1 py-0.5 text-[9px] text-slate-500">{item.name}</p>
          </button>
        ))}
        {matches.length === 0 && (
          <p className="col-span-4 text-[11px] text-slate-400">No match in our food photos — upload your own below.</p>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <button
        type="button"
        onClick={handleUploadTap}
        disabled={busy}
        className="w-full rounded-lg border border-slate-300 bg-white py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
      >
        {busy ? 'Uploading…' : '📤 Upload your own photo instead'}
      </button>
    </div>
  )
}

// Paste a menu copied from a Facebook post/caption (or typed by hand) and
// have it auto-split into name + price rows, instead of typing each dish
// into the form above one at a time. Deliberately a plain heuristic, not a
// real parser: it takes the last peso amount on each line as the price and
// whatever's left as the name, which covers the common "Dish name - 120" /
// "Dish name ₱120" shapes without needing a server or an AI call.
function parseMenuText(text: string): { raw: string; name: string; price: number | null }[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((raw) => {
      const stripped = raw.replace(/^[-•*]+\s*/, '').replace(/^\d+[.)]\s*/, '')
      const priceMatches = [...stripped.matchAll(/(?:₱|php\s*)?\s*(\d{1,5}(?:\.\d{1,2})?)(?:\s*(?:php|pesos?))?/gi)]
      const last = priceMatches[priceMatches.length - 1]
      if (!last || last.index === undefined) {
        return { raw, name: stripped, price: null }
      }
      const price = parseFloat(last[1])
      const name = (stripped.slice(0, last.index) + stripped.slice(last.index + last[0].length))
        .replace(/[-–—.:@]+$/, '')
        .replace(/^[-–—.:@]+/, '')
        .trim()
      return { raw, name: name || stripped, price }
    })
}

interface StagedDish {
  id: string
  item: FoodCatalogItem
  price: string
}

// Pick from TodaSafeRide's own 200-dish Filipino food catalog (see
// lib/foodCatalog.ts — its own photos, shipped with the app) instead of
// typing each one from scratch — tap a dish to stage it, set its price,
// then add them all. Adds with the catalog's own photo and description
// pre-filled (both still editable afterward), so a vendor picking from here
// gets a fully-formed menu item, not just a bare name.
function CommonDishesTool({ onAdd }: { onAdd: (fields: MenuItemFields) => void }) {
  const [query, setQuery] = useState('')
  const [categoryCode, setCategoryCode] = useState('all')
  const [staged, setStaged] = useState<StagedDish[]>([])

  const needle = query.trim().toLowerCase()
  const shown = FOOD_CATALOG.filter((item) => {
    if (categoryCode !== 'all' && item.categoryCode !== categoryCode) return false
    if (!needle) return true
    return item.name.toLowerCase().includes(needle) || item.tags.some((t) => t.includes(needle))
  })

  function stageDish(item: FoodCatalogItem) {
    if (staged.some((s) => s.item.code === item.code)) return
    setStaged((prev) => [...prev, { id: `dish-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, item, price: '' }])
  }

  function updatePrice(id: string, price: string) {
    setStaged((prev) => prev.map((s) => (s.id === id ? { ...s, price } : s)))
  }

  function removeStaged(id: string) {
    setStaged((prev) => prev.filter((s) => s.id !== id))
  }

  function handleAddAll() {
    for (const s of staged) {
      const priceNum = Number(s.price)
      if (!Number.isFinite(priceNum) || priceNum <= 0) continue
      const category = FOOD_CATALOG_CATEGORIES.find((c) => c.code === s.item.categoryCode)
      onAdd({
        name: s.item.name,
        price: priceNum,
        menuCategory: category?.name ?? null,
        photoDataUrl: s.item.photoUrl,
        description: s.item.description,
        badge: null,
      })
    }
    setStaged([])
  }

  return (
    <div className="rounded-lg border border-slate-200 p-2.5">
      <p className="mb-1.5 text-xs font-medium text-slate-600">🇵🇭 Common Filipino dishes (200)</p>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search e.g. adobo, halo-halo, pancit…"
        className="mb-1.5 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
      />
      <div className="mb-1.5 flex gap-1 overflow-x-auto pb-0.5">
        <button
          type="button"
          onClick={() => setCategoryCode('all')}
          className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-medium ${
            categoryCode === 'all' ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-slate-600'
          }`}
        >
          All
        </button>
        {FOOD_CATALOG_CATEGORIES.map((c) => (
          <button
            key={c.code}
            type="button"
            onClick={() => setCategoryCode(c.code)}
            className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-medium ${
              categoryCode === c.code ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-slate-600'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div className="grid max-h-64 grid-cols-3 gap-1.5 overflow-y-auto">
        {shown.map((item) => {
          const alreadyStaged = staged.some((s) => s.item.code === item.code)
          return (
            <button
              key={item.code}
              type="button"
              onClick={() => stageDish(item)}
              disabled={alreadyStaged}
              className={`overflow-hidden rounded-lg border text-left transition ${
                alreadyStaged ? 'border-brand-300 bg-brand-50' : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              {item.photoUrl && (
                <img src={item.photoUrl} alt={item.name} loading="lazy" className="h-14 w-full object-cover" />
              )}
              <p className="truncate px-1.5 py-1 text-[10px] font-medium text-slate-600">{item.name}</p>
            </button>
          )
        })}
        {shown.length === 0 && <p className="col-span-3 text-[11px] text-slate-400">No dish matches "{query.trim()}".</p>}
      </div>

      {staged.length > 0 && (
        <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2">
          {staged.map((s) => (
            <div key={s.id} className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white p-1.5">
              {s.item.photoUrl ? (
                <img src={s.item.photoUrl} alt={s.item.name} className="h-8 w-8 shrink-0 rounded-md object-cover" />
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-base">🍽️</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-medium text-slate-700">{s.item.name}</p>
                <p className="text-[10px] text-slate-400">{s.item.subcategory}</p>
              </div>
              <input
                type="number"
                value={s.price}
                onChange={(e) => updatePrice(s.id, e.target.value)}
                placeholder="₱ price"
                className="w-20 rounded-md border border-slate-200 px-1.5 py-1 text-right text-[11px]"
              />
              <button type="button" onClick={() => removeStaged(s.id)} className="text-[11px] font-medium text-amber-700">
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={handleAddAll}
            disabled={staged.every((s) => !Number(s.price) || Number(s.price) <= 0)}
            className="w-full rounded-lg bg-brand-600 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Add all to menu
          </button>
        </div>
      )}
    </div>
  )
}

interface MenuFileRow extends ParsedSpreadsheetRow {
  id: string
}

// Import/export the menu as a real spreadsheet file (.csv or .xlsx) — lets a
// vendor build or bulk-edit their menu in Excel/Google Sheets instead of
// typing every dish into the app, and download it as a backup or to hand to
// someone else. "Download menu" doubles as a template: with an empty menu it
// still comes back with the right header row to fill in and re-upload.
function SpreadsheetTool({
  pharmacy,
  products,
  defaultCategory,
  onAdd,
}: {
  pharmacy: Pharmacy
  products: MedicineProduct[]
  defaultCategory: string | null
  onAdd: (fields: MenuItemFields) => void
}) {
  const [rows, setRows] = useState<MenuFileRow[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const parsed = await parseMenuSpreadsheet(file)
      if (parsed.length === 0) {
        setError("Couldn't find any rows with a name in that file — check it has a Name column.")
        return
      }
      setRows(
        parsed.map((row, i) => ({
          ...row,
          id: `sheet-${Date.now()}-${i}`,
          category: row.category ?? defaultCategory,
        })),
      )
    } catch {
      setError('Could not read that file — make sure it is a .csv, .xls, or .xlsx spreadsheet.')
    } finally {
      setBusy(false)
    }
  }

  function updateRow(id: string, fields: Partial<{ name: string; price: number | null; category: string | null }>) {
    setRows((prev) => (prev ? prev.map((r) => (r.id === id ? { ...r, ...fields } : r)) : prev))
  }

  function removeRow(id: string) {
    setRows((prev) => (prev ? prev.filter((r) => r.id !== id) : prev))
  }

  function handleAddAll() {
    if (!rows) return
    for (const row of rows) {
      if (!row.name.trim() || row.price === null || row.price <= 0) continue
      onAdd({
        name: row.name.trim(),
        price: row.price,
        menuCategory: row.category?.trim() || null,
        photoDataUrl: null,
        description: null,
        badge: null,
      })
    }
    setRows(null)
  }

  return (
    <div className="rounded-lg border border-slate-200 p-2.5">
      <p className="mb-1.5 text-xs font-medium text-slate-600">📊 Spreadsheet (CSV / Excel)</p>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => downloadMenuSpreadsheet(products, pharmacy.name, 'csv')}
          className="flex-1 rounded-lg border border-slate-300 bg-white py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
        >
          ⬇ Download .csv
        </button>
        <button
          type="button"
          onClick={() => downloadMenuSpreadsheet(products, pharmacy.name, 'xlsx')}
          className="flex-1 rounded-lg border border-slate-300 bg-white py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
        >
          ⬇ Download .xlsx
        </button>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        {products.length === 0
          ? 'Menu is empty — download gets you a template with the right columns.'
          : 'Edit it and upload the file back in to bulk-update your menu.'}
      </p>

      {!rows ? (
        <div className="mt-2">
          <label className="flex w-full cursor-pointer items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">
            {busy ? 'Reading file…' : '⬆ Upload a .csv or .xlsx file'}
            <input type="file" accept=".csv,.xls,.xlsx,.ods" className="hidden" onChange={handleFile} disabled={busy} />
          </label>
          {error && <p className="mt-1.5 text-[11px] font-medium text-amber-700">{error}</p>}
        </div>
      ) : (
        <div className="mt-2 space-y-1.5">
          <p className="text-[11px] text-slate-500">Review before adding — fix anything that didn't parse right.</p>
          <div className="space-y-1">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white p-1.5">
                <input
                  value={row.name}
                  onChange={(e) => updateRow(row.id, { name: e.target.value })}
                  className="min-w-0 flex-1 rounded-md border border-slate-200 px-1.5 py-1 text-[11px]"
                />
                <input
                  value={row.category ?? ''}
                  onChange={(e) => updateRow(row.id, { category: e.target.value })}
                  placeholder="Category"
                  className="w-20 rounded-md border border-slate-200 px-1.5 py-1 text-[11px]"
                />
                <input
                  type="number"
                  value={row.price ?? ''}
                  onChange={(e) => updateRow(row.id, { price: e.target.value ? Number(e.target.value) : null })}
                  placeholder="₱"
                  className="w-16 rounded-md border border-slate-200 px-1.5 py-1 text-right text-[11px]"
                />
                <button type="button" onClick={() => removeRow(row.id)} className="text-[11px] font-medium text-amber-700">
                  ×
                </button>
              </div>
            ))}
            {rows.length === 0 && <p className="text-[11px] text-slate-400">Nothing left to add.</p>}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAddAll}
              disabled={rows.every((r) => !r.name.trim() || r.price === null || r.price <= 0)}
              className="flex-1 rounded-lg bg-brand-600 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Add all to menu
            </button>
            <button
              type="button"
              onClick={() => setRows(null)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function PasteMenuTextTool({
  defaultCategory,
  onAdd,
}: {
  defaultCategory: string | null
  onAdd: (fields: MenuItemFields) => void
}) {
  const [text, setText] = useState('')
  const [category, setCategory] = useState(defaultCategory ?? '')
  const [rows, setRows] = useState<{ raw: string; name: string; price: number | null }[] | null>(null)

  function handleParse() {
    setRows(parseMenuText(text))
  }

  function updateRow(i: number, fields: Partial<{ name: string; price: number | null }>) {
    setRows((prev) => (prev ? prev.map((r, idx) => (idx === i ? { ...r, ...fields } : r)) : prev))
  }

  function removeRow(i: number) {
    setRows((prev) => (prev ? prev.filter((_, idx) => idx !== i) : prev))
  }

  function handleAddAll() {
    if (!rows) return
    for (const row of rows) {
      if (!row.name.trim() || row.price === null || row.price <= 0) continue
      onAdd({
        name: row.name.trim(),
        price: row.price,
        menuCategory: category.trim() || null,
        photoDataUrl: null,
        description: null,
        badge: null,
      })
    }
    setRows(null)
    setText('')
  }

  return (
    <div className="rounded-lg border border-slate-200 p-2.5">
      <p className="mb-1.5 text-xs font-medium text-slate-600">📋 Paste a menu (from Facebook, a caption, anywhere)</p>
      {!rows ? (
        <div className="space-y-1.5">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'e.g.\nChicken Adobo - 120\nBeef Kaldereta ₱150\nIced Tea 30'}
            rows={4}
            className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
          />
          <button
            type="button"
            onClick={handleParse}
            disabled={!text.trim()}
            className="w-full rounded-lg border border-brand-300 bg-white py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Parse into items
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category to apply to all (optional)"
            className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
          />
          <div className="space-y-1">
            {rows.map((row, i) => (
              <div key={i} className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white p-1.5">
                <input
                  value={row.name}
                  onChange={(e) => updateRow(i, { name: e.target.value })}
                  className="min-w-0 flex-1 rounded-md border border-slate-200 px-1.5 py-1 text-[11px]"
                />
                <input
                  type="number"
                  value={row.price ?? ''}
                  onChange={(e) => updateRow(i, { price: e.target.value ? Number(e.target.value) : null })}
                  placeholder="₱"
                  className="w-16 rounded-md border border-slate-200 px-1.5 py-1 text-right text-[11px]"
                />
                <button type="button" onClick={() => removeRow(i)} className="text-[11px] font-medium text-amber-700">
                  ×
                </button>
              </div>
            ))}
            {rows.length === 0 && <p className="text-[11px] text-slate-400">Nothing left to add.</p>}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAddAll}
              disabled={rows.every((r) => !r.name.trim() || r.price === null || r.price <= 0)}
              className="flex-1 rounded-lg bg-brand-600 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Add all to menu
            </button>
            <button
              type="button"
              onClick={() => setRows(null)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Upload several dish photos at once and have each one matched to an
// existing menu item by its filename (e.g. "chicken-adobo.jpg" matches
// "Chicken Adobo") instead of opening each item to attach a photo one at a
// time. A photo whose filename doesn't clearly match anything is left for
// the vendor to assign by hand rather than guessed at.
function BulkPhotoMatchTool({ products }: { products: MedicineProduct[] }) {
  const { updateMedicineProduct } = useRides()
  const [pending, setPending] = useState<{ id: string; fileName: string; dataUrl: string; matchedProductId: string | null }[]>([])
  const [busy, setBusy] = useState(false)

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    setBusy(true)
    try {
      const results = await Promise.all(
        files.map(async (file) => {
          const dataUrl = await compressImageFile(file)
          const candidateName = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()
          const match = products.find((p) => matchesNameQuery(p.name, candidateName))
          return {
            id: `bulk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            fileName: file.name,
            dataUrl,
            matchedProductId: match?.id ?? null,
          }
        }),
      )
      setPending((prev) => [...prev, ...results])
    } finally {
      setBusy(false)
    }
  }

  function setAssignment(id: string, productId: string | null) {
    setPending((prev) => prev.map((p) => (p.id === id ? { ...p, matchedProductId: productId } : p)))
  }

  function applyOne(row: { id: string; dataUrl: string; matchedProductId: string | null }) {
    const product = products.find((p) => p.id === row.matchedProductId)
    if (!product) return
    updateMedicineProduct({
      productId: product.id,
      name: product.name,
      genericName: product.genericName,
      category: product.category,
      price: product.price,
      menuCategory: product.menuCategory ?? null,
      photoDataUrl: row.dataUrl,
      description: product.description ?? null,
      badge: product.badge ?? null,
      stockCount: product.stockCount ?? null,
    })
    setPending((prev) => prev.filter((p) => p.id !== row.id))
  }

  function applyAllMatched() {
    for (const row of pending) {
      if (row.matchedProductId) applyOne(row)
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 p-2.5">
      <p className="mb-1.5 text-xs font-medium text-slate-600">🖼️ Bulk photo upload — matched to your menu by filename</p>
      <input type="file" accept="image/*" multiple onChange={handleFiles} disabled={busy} className="w-full text-[11px]" />
      {pending.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {pending.map((row) => (
            <div key={row.id} className="flex items-center gap-2 rounded-md border border-slate-200 bg-white p-1.5">
              <img src={row.dataUrl} alt={row.fileName} className="h-10 w-10 shrink-0 rounded-md object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] text-slate-500">{row.fileName}</p>
                <select
                  value={row.matchedProductId ?? ''}
                  onChange={(e) => setAssignment(row.id, e.target.value || null)}
                  className="mt-0.5 w-full rounded-md border border-slate-200 px-1.5 py-1 text-[11px]"
                >
                  <option value="">— Assign to a menu item —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => applyOne(row)}
                disabled={!row.matchedProductId}
                className="shrink-0 rounded-md border border-brand-300 px-2 py-1 text-[11px] font-medium text-brand-700 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Use
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={applyAllMatched}
            disabled={!pending.some((p) => p.matchedProductId)}
            className="w-full rounded-lg bg-brand-600 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Apply all matched photos
          </button>
        </div>
      )}
    </div>
  )
}

// Cut several dish photos out of one photo of the whole menu board, then
// add each crop as a new menu item (name + price typed per crop — there's
// no filename to match a name from here, unlike the bulk-upload tool above).
function MenuBoardCropTool({
  defaultCategory,
  onAdd,
}: {
  defaultCategory: string | null
  onAdd: (fields: MenuItemFields) => void
}) {
  const [crops, setCrops] = useState<(ExtractedCrop & { name: string; price: string; menuCategory: string })[]>([])

  function handleExtracted(extracted: ExtractedCrop[]) {
    setCrops((prev) => [...prev, ...extracted.map((c) => ({ ...c, name: '', price: '', menuCategory: defaultCategory ?? '' }))])
  }

  function updateCrop(id: string, fields: Partial<{ name: string; price: string; menuCategory: string }>) {
    setCrops((prev) => prev.map((c) => (c.id === id ? { ...c, ...fields } : c)))
  }

  function addCrop(crop: { id: string; dataUrl: string; name: string; price: string; menuCategory: string }) {
    const priceNum = Number(crop.price)
    if (!crop.name.trim() || !Number.isFinite(priceNum) || priceNum <= 0) return
    onAdd({
      name: crop.name.trim(),
      price: priceNum,
      menuCategory: crop.menuCategory.trim() || null,
      photoDataUrl: crop.dataUrl,
      description: null,
      badge: null,
    })
    setCrops((prev) => prev.filter((c) => c.id !== crop.id))
  }

  return (
    <div className="rounded-lg border border-slate-200 p-2.5">
      <p className="mb-1.5 text-xs font-medium text-slate-600">✂️ One menu-board photo → several dish photos</p>
      <MenuBoardCropper onExtracted={handleExtracted} />
      {crops.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {crops.map((crop) => (
            <div key={crop.id} className="flex items-center gap-2 rounded-md border border-slate-200 bg-white p-1.5">
              <img src={crop.dataUrl} alt="Cropped dish" className="h-11 w-11 shrink-0 rounded-md object-cover" />
              <div className="min-w-0 flex-1 space-y-1">
                <input
                  value={crop.name}
                  onChange={(e) => updateCrop(crop.id, { name: e.target.value })}
                  placeholder="Item name"
                  className="w-full rounded-md border border-slate-200 px-1.5 py-1 text-[11px]"
                />
                <div className="flex gap-1">
                  <input
                    value={crop.menuCategory}
                    onChange={(e) => updateCrop(crop.id, { menuCategory: e.target.value })}
                    placeholder="Category"
                    className="min-w-0 flex-1 rounded-md border border-slate-200 px-1.5 py-1 text-[11px]"
                  />
                  <input
                    type="number"
                    value={crop.price}
                    onChange={(e) => updateCrop(crop.id, { price: e.target.value })}
                    placeholder="₱"
                    className="w-16 rounded-md border border-slate-200 px-1.5 py-1 text-right text-[11px]"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => addCrop(crop)}
                className="shrink-0 self-start rounded-md border border-brand-300 px-2 py-1 text-[11px] font-medium text-brand-700 hover:bg-brand-50"
              >
                Add
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
