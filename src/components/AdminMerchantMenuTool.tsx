import { useState } from 'react'
import { useRides } from '../context/RideContext'
import { SpreadsheetTool, type MenuItemFields } from './VendorMenuManager'
import { BUSINESS_TYPE_LABELS } from '../types'

// A merchant who can barely fill in their own menu is exactly the one who
// never will — this is admin doing it for them instead of just telling them
// how. Reuses the vendor portal's own Spreadsheet tool (same download/
// upload, same parser) so nothing new has to be learned or maintained: admin
// downloads the merchant's current menu (or an empty template) as a CSV,
// fills it in — on a call with the merchant, from a photo of their menu
// board, however — and uploads it back here. It lands in the same
// medicineProducts list the merchant's own portal reads, so it's already
// there the next time they log in, and their own Menu tab's Spreadsheet
// tool still works exactly as before if they'd rather do it themselves.
export function AdminMerchantMenuTool() {
  const { pharmacies, medicineProducts, addMedicineProduct } = useRides()
  const [selectedId, setSelectedId] = useState('')
  const [justAdded, setJustAdded] = useState(0)

  const selected = pharmacies.find((p) => p.id === selectedId) ?? null
  const menu = selected ? medicineProducts.filter((p) => p.pharmacyId === selected.id) : []
  const categories = Array.from(new Set(menu.map((p) => p.menuCategory).filter((c): c is string => !!c)))

  function handleAdd(fields: MenuItemFields) {
    if (!selected) return
    addMedicineProduct({
      pharmacyId: selected.id,
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
    setJustAdded((n) => n + 1)
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-slate-700">🏪 Build a merchant's menu for them</h2>
        <p className="mt-1 text-xs text-slate-500">
          Pick a store, then download its menu as a spreadsheet (or an empty template if it has none yet), fill it in,
          and upload it back — the same tool the merchant's own portal uses, so it still shows up there and they can
          keep editing it themselves too.
        </p>
      </div>

      <select
        value={selectedId}
        onChange={(e) => {
          setSelectedId(e.target.value)
          setJustAdded(0)
        }}
        className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs"
      >
        <option value="">Select a merchant…</option>
        {pharmacies.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} — {BUSINESS_TYPE_LABELS[p.businessType]}
          </option>
        ))}
      </select>

      {selected && (
        <>
          <p className="text-[11px] text-slate-500">
            {menu.length === 0
              ? `${selected.name} has no menu items yet.`
              : `${selected.name} currently has ${menu.length} item${menu.length === 1 ? '' : 's'}.`}
            {justAdded > 0 && (
              <span className="ml-1 font-medium text-emerald-600">
                ✓ Added {justAdded} item{justAdded === 1 ? '' : 's'} this session.
              </span>
            )}
          </p>
          <SpreadsheetTool
            key={selected.id}
            pharmacy={selected}
            products={menu}
            defaultCategory={categories[0] ?? null}
            onAdd={handleAdd}
          />
        </>
      )}
    </section>
  )
}
