import { useState } from 'react'
import { useRides } from '../context/RideContext'
import { VENDOR_REPORT_REASONS, type Pharmacy, type VendorReportReason } from '../types'

// "Report this store", on the page itself.
//
// The public page is the one surface of this app a complete stranger can
// reach, and the only one where the platform is vouching for somebody else's
// business by name and photograph. That needs a way for a passer-by to say
// this is wrong — the store closed months ago, the photos are somebody
// else's, the name is pretending to be a business it is not.
//
// Nobody is asked to sign in first. Requiring an account to report an
// impersonation means almost nobody reports one, and the cost of a junk
// report is an admin reading one line.
//
// A quiet link rather than a button: it should be findable by somebody
// looking for it, not an accusation sitting over a legitimate store's menu.
export function ReportStoreLink({ pharmacy }: { pharmacy: Pharmacy }) {
  const { reportVendorPage } = useRides()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<VendorReportReason>('closed')
  const [detail, setDetail] = useState('')
  const [sent, setSent] = useState(false)

  if (sent) {
    return (
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-center text-[11px] leading-snug text-slate-500">
        Salamat — naipadala na sa Admin ang report mo. Titingnan nila ito.
      </p>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-auto block text-[11px] text-slate-400 underline decoration-slate-300 hover:text-slate-600"
      >
        ⚑ Report this store
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-sm font-semibold text-slate-800">Report {pharmacy.name}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
        Tell Admin what is wrong with this page. It goes to a person, not a robot.
      </p>

      <div className="mt-2 space-y-1">
        {VENDOR_REPORT_REASONS.map((r) => (
          <label key={r.value} className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="radio"
              name="report-reason"
              checked={reason === r.value}
              onChange={() => setReason(r.value)}
              className="h-3.5 w-3.5 accent-brand-600"
            />
            {r.label}
          </label>
        ))}
      </div>

      <textarea
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        rows={2}
        maxLength={300}
        placeholder="Anything else Admin should know (optional)"
        className="mt-2 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
      />

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => {
            reportVendorPage({ pharmacyId: pharmacy.id, reason, detail: detail.trim() || null })
            setSent(true)
          }}
          className="flex-1 rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700"
        >
          Send report
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
