// The Call/Text choice offered from a footer icon — see DriverFooterNav and
// PassengerPage's own footer, the two places a driver and a rider reach for
// this most: mid-trip, one-handed, without hunting through the page above
// the map for the "Call {name}" button that already lives there.
//
// Two links, not one button that just calls: a driver on the handlebars
// often cannot safely take a voice call but can glance at a text a minute
// later, and there was previously no way to reach them that did not ring
// the phone.
export function ContactSheet({
  name,
  phone,
  onClose,
}: {
  name: string
  phone: string
  onClose: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Contact ${name}`}
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs rounded-2xl bg-white p-4 shadow-xl"
        // Stops a tap on the card itself from bubbling to the backdrop and
        // closing the sheet the same instant it opened.
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-center text-sm font-bold text-navy-900">{name}</p>
        <p className="mt-0.5 text-center text-xs text-slate-500">{phone}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <a
            href={`tel:${phone}`}
            className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <span aria-hidden className="text-xl leading-none">
              📞
            </span>
            Call
          </a>
          <a
            href={`sms:${phone}`}
            className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <span aria-hidden className="text-xl leading-none">
              💬
            </span>
            Text
          </a>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full py-1.5 text-center text-xs font-semibold text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
