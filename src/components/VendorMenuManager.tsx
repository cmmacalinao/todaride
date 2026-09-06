import { useRef, useState } from 'react'
import { useRides } from '../context/RideContext'
import { DocumentUploadField } from './DocumentUploadField'
import { captureNativePhoto, compressImageFile } from '../lib/photo'
import { matchesNameQuery } from '../lib/fuzzyName'
import { downloadMenuSpreadsheet, parseMenuSpreadsheet, type ParsedSpreadsheetRow } from '../lib/menuSpreadsheet'
import { FOOD_CATALOG, FOOD_CATALOG_CATEGORIES, type FoodCatalogItem } from '../lib/foodCatalog'
import { MenuBoardCropper, type ExtractedCrop } from './MenuBoardCropper'
import { VendorHeaderCard, VendorMenuItemCard, resolveVendorAccent } from './VendorStorefront'
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
  const { addMedicineProduct, updateMedicineProduct, removeMedicineProduct, toggleMedicineProductStock, updateVendorBranding } =
    useRides()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [photoPickerId, setPhotoPickerId] = useState<string | null>(null)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [bulkToolsOpen, setBulkToolsOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState('all')

  const accent = resolveVendorAccent(pharmacy)
  const categories = Array.from(new Set(products.map((p) => p.menuCategory?.trim()).filter((c): c is string => !!c)))
  const editingProduct = products.find((p) => p.id === editingId) ?? null
  const shownProducts =
    activeCategory === 'all' ? products : products.filter((p) => (p.menuCategory?.trim() || 'Menu') === activeCategory)

  function setBranding(patch: Partial<{ coverPhotoDataUrl: string | null; logoDataUrl: string | null; themeColor: string | null; tagline: string | null }>) {
    updateVendorBranding({
      pharmacyId: pharmacy.id,
      coverPhotoDataUrl: pharmacy.coverPhotoDataUrl ?? null,
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
    })
    setEditingId(null)
  }

  function handleConfirmRemove(product: MedicineProduct) {
    removeMedicineProduct(product.id)
    setConfirmRemoveId(null)
    if (editingId === product.id) setEditingId(null)
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
    })
    setPhotoPickerId(null)
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <VendorHeaderCard
        pharmacy={pharmacy}
        itemCount={products.length}
        accent={accent}
        onLogoUpload={(dataUrl) => setBranding({ logoDataUrl: dataUrl })}
        onCoverUpload={(dataUrl) => setBranding({ coverPhotoDataUrl: dataUrl })}
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

        <div className={`space-y-2 ${categories.length === 0 ? 'border-t border-slate-100 pt-3' : ''}`}>
          {shownProducts.length === 0 && (
            <p className="text-sm text-slate-400">
              {products.length === 0 ? 'No menu items yet — add your first one below.' : 'Nothing in this category yet.'}
            </p>
          )}
          {shownProducts.map((product) => {
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
                    Remove "{product.name}" from your menu? This can't be undone.
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
              <VendorMenuItemCard
                key={product.id}
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
                    <button
                      type="button"
                      onClick={() => toggleMedicineProductStock(product.id)}
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        product.inStock ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {product.inStock ? 'In stock' : 'Out of stock'}
                    </button>
                  </>
                }
              />
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

interface MenuItemFields {
  name: string
  price: number
  menuCategory: string | null
  photoDataUrl: string | null
  description: string | null
  badge: MenuItemBadge | null
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
  const datalistId = 'vendor-menu-categories'

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
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Item name (e.g. Chicken Adobo)"
        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
      />
      {suggestions.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
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
      )}
      <div className="flex gap-1.5">
        <input
          list={datalistId}
          value={menuCategory}
          onChange={(e) => setMenuCategory(e.target.value)}
          placeholder="Category (e.g. Ulam, Drinks)"
          className="flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
        />
        <datalist id={datalistId}>
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
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
      <DocumentUploadField label="Photo (optional)" dataUrl={photoDataUrl} onUpload={setPhotoDataUrl} />
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

  async function handleUploadTap() {
    setBusy(true)
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
