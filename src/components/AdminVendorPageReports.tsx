import { useState } from 'react'
import { useRides } from '../context/RideContext'
import { publicVendorUrl } from '../lib/vendorSlug'
import { VENDOR_REPORT_REASONS } from '../types'

// What the public has said about store pages, and the switch to take one
// down.
//
// Hiding, not deleting. A page taken down over a report that turns out to be
// a competitor being unpleasant has to come back whole — and the store is
// still trading either way: its orders, menu and portal are untouched, only
// the public page and its link preview stop answering. Admin can see it is
// hidden, the store can see it is hidden, and the reason is recorded.
export function AdminVendorPageReports() {
  const { vendorPageReports, pharmacies, resolveVendorPageReport, setVendorPageHidden, publicBaseUrl } = useRides()
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({})
  const open = (vendorPageReports ?? []).filter((r) => !r.resolvedAt)
  const hiddenStores = pharmacies.filter((p) => p.pageHidden)
  const origin = publicBaseUrl || 'https://todaridemobility.com'

  const reasonLabel = (value: string) =>
    VENDOR_REPORT_REASONS.find((r) => r.value === value)?.label ?? value

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3">
      <h2 className="text-sm font-bold text-slate-800">
        ⚑ Reported store pages{open.length > 0 && ` (${open.length})`}
      </h2>
      <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
        Sent by anyone who opened a store's public page. Hiding a page takes it off the web and stops its link
        preview; the store keeps trading and can be restored at any time.
      </p>

      {open.length === 0 ? (
        <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-500">Nothing reported.</p>
      ) : (
        <div className="mt-2 space-y-2">
          {open.map((report) => {
            const store = pharmacies.find((p) => p.id === report.pharmacyId)
            return (
              <div key={report.id} className="rounded-lg border border-slate-200 p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">{report.pharmacyName}</p>
                    <p className="text-[11px] text-amber-700">{reasonLabel(report.reason)}</p>
                  </div>
                  <span className="shrink-0 text-[10px] text-slate-400">
                    {new Date(report.at).toLocaleDateString()}
                  </span>
                </div>
                {report.detail && (
                  <p className="mt-1 rounded bg-slate-50 p-1.5 text-[11px] leading-snug text-slate-600">
                    {report.detail}
                  </p>
                )}
                {store?.slug && (
                  <a
                    href={publicVendorUrl(origin, store.slug, store.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block truncate text-[11px] text-sky-600 underline"
                  >
                    {publicVendorUrl(origin, store.slug, store.id)}
                  </a>
                )}

                {store && !store.pageHidden && (
                  <input
                    value={reasonDrafts[report.id] ?? ''}
                    onChange={(e) => setReasonDrafts((prev) => ({ ...prev, [report.id]: e.target.value }))}
                    placeholder="Why you are hiding it (shown in the log)"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-[11px]"
                  />
                )}

                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {store && !store.pageHidden && (
                    <button
                      type="button"
                      onClick={() =>
                        setVendorPageHidden({
                          pharmacyId: store.id,
                          hidden: true,
                          reason: (reasonDrafts[report.id] ?? '').trim() || null,
                          actorName: 'Admin',
                        })
                      }
                      className="rounded-lg border border-red-300 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100"
                    >
                      Hide this page
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => resolveVendorPageReport(report.id, 'Admin')}
                    className="rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                  >
                    {store?.pageHidden ? 'Done' : 'No action needed'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {hiddenStores.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Hidden pages</p>
          <div className="mt-1 space-y-1.5">
            {hiddenStores.map((store) => (
              <div key={store.id} className="flex items-center gap-2 rounded-lg bg-slate-50 p-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-700">{store.name}</p>
                  {store.pageHiddenReason && (
                    <p className="truncate text-[10px] text-slate-500">{store.pageHiddenReason}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setVendorPageHidden({
                      pharmacyId: store.id,
                      hidden: false,
                      reason: null,
                      actorName: 'Admin',
                    })
                  }
                  className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
