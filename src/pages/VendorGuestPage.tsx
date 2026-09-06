import { useNavigate, useParams } from 'react-router-dom'
import { useRides } from '../context/RideContext'
import { VendorStorefront } from '../components/VendorStorefront'
import { rememberReturnTo } from '../lib/returnTo'

// Where a shared vendor link lands somebody who is not signed in. The whole
// storefront is open to read — banner, menu, prices, ratings, the map — the
// way a Facebook page is; only ordering needs an account. The nudge to
// register sits at the bottom and remembers this vendor, so that once they
// have signed up (or signed in) they come straight back here with the cart
// open rather than to the generic home screen. See takeReturnTo in App.tsx.
export function VendorGuestPage() {
  const { pharmacyId } = useParams<{ pharmacyId: string }>()
  const navigate = useNavigate()
  const { pharmacies, medicineProducts, vendorsEnabled } = useRides()
  const pharmacy = pharmacies.find((p) => p.id === pharmacyId)

  if (!pharmacy) {
    return (
      <div className="mx-auto max-w-lg space-y-3 px-4 py-6">
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          That vendor page is no longer available.
        </p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Open TODA SafeRide
        </button>
      </div>
    )
  }

  const items = medicineProducts.filter((p) => p.pharmacyId === pharmacy.id)
  const orderPath = `/book?vendor=${encodeURIComponent(pharmacy.id)}`

  function goRegister() {
    rememberReturnTo(orderPath)
    navigate('/welcome')
  }

  return (
    // pb-28 keeps the last menu item clear of the sticky order bar below.
    <div className="mx-auto max-w-lg space-y-3 px-4 pb-28 pt-4">
      <VendorStorefront pharmacy={pharmacy} items={items} />

      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-2px_10px_rgba(15,23,42,0.08)] backdrop-blur"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
      >
        <div className="mx-auto max-w-lg">
          {vendorsEnabled ? (
            <>
              <button
                type="button"
                onClick={goRegister}
                className="w-full rounded-xl bg-brand-600 py-3 text-sm font-bold text-white shadow-sm hover:bg-brand-700"
              >
                🛵 Order from {pharmacy.name} — register or log in
              </button>
              <p className="mt-1.5 text-center text-[11px] text-slate-500">
                Free account, takes a minute. Cooked fresh and delivered by a TODA SafeRide rider — you approve the final
                bill before anything is prepared.
              </p>
            </>
          ) : (
            <p className="text-center text-xs text-slate-500">Ordering is paused for now — check back soon.</p>
          )}
        </div>
      </div>
    </div>
  )
}
