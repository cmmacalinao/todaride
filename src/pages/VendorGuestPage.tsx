import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { vendorForSlug } from '../lib/vendorSlug'
import { useRides } from '../context/RideContext'
import { VendorStorefront } from '../components/VendorStorefront'
import { rememberReturnTo } from '../lib/returnTo'
import { ReportStoreLink } from '../components/ReportStoreLink'

// Where a shared vendor link lands somebody who is not signed in. The whole
// storefront is open to read — banner, menu, prices, ratings, the map — the
// way a Facebook page is; only ordering needs an account. The nudge to
// register sits at the bottom and remembers this vendor, so that once they
// have signed up (or signed in) they come straight back here with the cart
// open rather than to the generic home screen. See takeReturnTo in App.tsx.
export function VendorGuestPage() {
  // Two ways in: the store's own address (/alingnena) and the original
  // /vendor-page/<id>. The old one keeps working for good — it is printed
  // on things, and a link that stops answering is worse than an ugly one.
  const { pharmacyId, slug } = useParams<{ pharmacyId?: string; slug?: string }>()
  const [searchParams] = useSearchParams()
  // A shared post's link — the page opens on that post, and after signing
  // up they come back to it too.
  const focusPostId = searchParams.get('post')
  const navigate = useNavigate()
  const { pharmacies, medicineProducts, vendorsEnabled } = useRides()
  const found = slug
    ? // A slug only ever resolves to an approved store: a public page is the
      // platform vouching for it, and nobody has checked an unapproved one.
      vendorForSlug(pharmacies, slug)
    : pharmacies.find((p) => p.id === pharmacyId) ?? null
  // Hidden by Admin (see SET_VENDOR_PAGE_HIDDEN). The store keeps trading;
  // only this page stops answering, and it says so plainly rather than
  // pretending the store never existed.
  const hidden = !!found?.pageHidden
  const pharmacy = found && !hidden ? found : null

  if (!pharmacy) {
    return (
      <div className="mx-auto max-w-lg space-y-3 px-4 py-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-3xl" aria-hidden>
            🏪
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-800">
            {hidden ? 'This store page is not available' : 'We could not find that store'}
          </p>
          <p className="mt-1 text-sm leading-snug text-slate-500">
            {hidden
              ? 'The page has been taken down while we look into it. The store may still be trading — try searching for it in the app.'
              : slug
                ? `Nothing is listed at /${slug}. Check the spelling, or search for the store in the app.`
                : 'That vendor page is no longer available.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Open TODA Ride Mobility
        </button>
      </div>
    )
  }

  const items = medicineProducts.filter((p) => p.pharmacyId === pharmacy.id)
  const orderPath = `/book?vendor=${encodeURIComponent(pharmacy.id)}${focusPostId ? `&post=${encodeURIComponent(focusPostId)}` : ''}`

  function goRegister() {
    rememberReturnTo(orderPath)
    navigate('/welcome')
  }

  return (
    // pb-28 keeps the last menu item clear of the sticky order bar below.
    <div className="mx-auto max-w-lg space-y-3 px-4 pb-28 pt-4">
      <VendorStorefront pharmacy={pharmacy} items={items} focusPostId={focusPostId} />

      {/* A page anybody can open needs a way for a stranger to say "this is
          not right" — a store long closed, somebody else's photos, a name
          pretending to be a business it is not. No account asked for:
          requiring a login to report an impersonation means most of them
          never get reported. */}
      <ReportStoreLink pharmacy={pharmacy} />

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
                Free account, takes a minute. Cooked fresh and delivered by a TODA Ride Mobility rider — you approve the final
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
