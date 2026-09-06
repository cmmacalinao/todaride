import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useRides } from '../context/RideContext'
import { VendorStorefront } from '../components/VendorStorefront'
import { VendorBrandingEditor } from '../components/VendorBrandingEditor'

// The vendor's own page, on its own route — reached from "🏪 My Vendor Page"
// in the portal (see PharmacyPortalPage.tsx) instead of an inline
// preview-and-collapse section, so it's a real page a vendor can revisit,
// bookmark, or eventually share, not just a fold in the middle of their
// order/menu management screen. Renders the exact same VendorStorefront a
// customer sees from the Registered Vendor tab (see VendorMenuBooking.tsx)
// — no cart/onQtyChange passed here, so it stays the read-only preview.
// The Preview/Customize tab bar lives here rather than in the portal so a
// vendor can flip straight from editing their cover photo/logo/theme color
// to seeing the exact result, on the exact page a customer lands on.
export function VendorPublicPage() {
  const { pharmacyId } = useParams<{ pharmacyId: string }>()
  const navigate = useNavigate()
  const { pharmacies, medicineProducts } = useRides()
  const [tab, setTab] = useState<'preview' | 'customize'>('preview')

  const pharmacy = pharmacies.find((p) => p.id === pharmacyId)

  if (!pharmacy) {
    return (
      <div className="mx-auto max-w-lg space-y-3 px-4 py-6">
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          That vendor page is no longer available.
        </p>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          ‹ Back
        </button>
      </div>
    )
  }

  const items = medicineProducts.filter((p) => p.pharmacyId === pharmacy.id)

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 py-6">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
      >
        ‹ Back to portal
      </button>

      <div className="flex gap-1.5 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setTab('preview')}
          className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
            tab === 'preview' ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          👁️ Preview
        </button>
        <button
          type="button"
          onClick={() => setTab('customize')}
          className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
            tab === 'customize' ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          🎨 Customize
        </button>
      </div>

      {tab === 'customize' ? (
        <VendorBrandingEditor pharmacy={pharmacy} />
      ) : (
        <>
          <p className="text-xs text-slate-500">
            This is exactly what a customer sees and orders from when they tap into your vendor page.
          </p>
          <VendorStorefront pharmacy={pharmacy} items={items} />
        </>
      )}
    </div>
  )
}
