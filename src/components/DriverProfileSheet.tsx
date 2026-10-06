import { useRides } from '../context/RideContext'
import { DOCUMENT_LABEL } from '../lib/requiredDocuments'
import { buildPublicDriverProfile, mayViewDriverProfile } from '../lib/driverProfile'

// The driver, as the passenger carrying this phone is allowed to see them.
//
// Everything shown here comes from lib/driverProfile, which picks the fields
// rather than filtering them: the sheet cannot show a phone number, an
// address, a licence number, a document photograph, an earnings figure or a
// partner code, because the object it renders does not contain them. See the
// note at the top of that file for why the asymmetry matters.
//
// Access is checked here as well as there. A passenger may open the profile
// of a driver they are riding with or have ridden with; anything else renders
// nothing, so the app never becomes a browsable directory of drivers.
export function DriverProfileSheet({
  driverId,
  passengerId,
  onClose,
}: {
  driverId: string
  passengerId: string | null
  onClose: () => void
}) {
  const { drivers, rides, todaOrganizations, requiredDocuments } = useRides()
  const driver = drivers.find((d) => d.id === driverId)

  if (!driver || !mayViewDriverProfile({ rides, driverId, passengerId })) return null

  const profile = buildPublicDriverProfile({
    driver,
    rides,
    todaName: todaOrganizations.find((o) => o.id === driver.todaOrgId)?.name ?? null,
    configuredRequired: requiredDocuments,
  })

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-slate-900/60 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Driver profile — ${profile.name}`}
      onClick={onClose}
    >
      <div
        // Bottom sheet on a phone, centred card on anything wider. max-h with
        // its own scroll so a driver with five reviews cannot push the close
        // button off a 360px screen.
        className="max-h-[88vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-white sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-3 py-2.5">
          <h2 className="text-sm font-bold text-slate-800">Driver profile</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close driver profile"
            className="rounded-lg px-2 py-1 text-lg leading-none text-slate-400 hover:bg-slate-50"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3 p-3">
          {/* Who. The photo is only ever an Admin-approved one — an
              unreviewed photo would look verified without being checked. */}
          <div className="flex items-center gap-3">
            {profile.photoDataUrl ? (
              <img
                src={profile.photoDataUrl}
                alt={profile.name}
                className="h-16 w-16 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-700">
                {profile.name.charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-base font-bold text-slate-900">{profile.name}</p>
              <p className="text-xs text-slate-600">
                ★ {profile.rating.toFixed(1)}
                {profile.ratingCount > 0 && (
                  <span className="text-slate-400"> ({profile.ratingCount})</span>
                )}
                <span className="text-slate-300"> · </span>
                {profile.completedTrips} trip{profile.completedTrips === 1 ? '' : 's'}
              </p>
              {profile.driverSince && (
                <p className="text-[11px] text-slate-400">Driver since {profile.driverSince}</p>
              )}
            </div>
          </div>

          {/* Which tricycle. The body number comes first because it is what a
              passenger at a terminal actually reads. */}
          <div className="rounded-xl bg-slate-50 p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Tricycle</p>
            {profile.bodyNumber && (
              <p className="text-sm font-bold text-slate-900">Body No. {profile.bodyNumber}</p>
            )}
            {profile.plateNumber && <p className="text-xs text-slate-600">Plate {profile.plateNumber}</p>}
            {profile.vehicleDescription && (
              <p className="mt-0.5 text-xs text-slate-600">{profile.vehicleDescription}</p>
            )}
            {!profile.bodyNumber && !profile.vehicleDescription && (
              <p className="text-xs text-slate-500">
                Walang detalye pa ang driver maliban sa plaka — hanapin ang plate number.
              </p>
            )}
          </div>

          {/* What was checked. Only documents that are required today and on
              file, so the tick means what the platform actually enforces —
              see lib/requiredDocuments. */}
          {profile.checkedDocuments.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Checked by Admin</p>
              <ul className="mt-1 space-y-0.5">
                {profile.checkedDocuments.map((type) => (
                  <li key={type} className="flex items-center gap-1.5 text-xs text-slate-700">
                    <span aria-hidden className="text-brand-600">
                      ✓
                    </span>
                    {DOCUMENT_LABEL[type]}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {profile.todaName && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">TODA</p>
              <p className="text-xs font-medium text-slate-700">{profile.todaName}</p>
              <p className="text-[10px] leading-snug text-slate-400">
                Sila ang sagot sa anumang reklamo tungkol sa driver na ito.
              </p>
            </div>
          )}

          {/* What other passengers said. No names and no dates finer than
              "3 weeks ago" — in a small town, a dated review names the rider
              as surely as a byline would. */}
          {profile.reviews.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Sabi ng ibang pasahero
              </p>
              <ul className="mt-1 space-y-1.5">
                {profile.reviews.map((review, i) => (
                  <li key={i} className="rounded-lg bg-slate-50 p-2">
                    <p className="text-[11px] font-semibold text-amber-600">{'★'.repeat(review.rating)}</p>
                    <p className="mt-0.5 text-xs leading-snug text-slate-700">{review.text}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">{relativeAge(review.at)}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="rounded-lg bg-slate-50 px-2 py-1.5 text-[10px] leading-snug text-slate-500">
            Hindi lumalabas dito ang numero, address, o mga papeles ng driver — para sa pribasiya nila, kagaya ng
            sa iyo.
          </p>
        </div>
      </div>
    </div>
  )
}

// Coarse on purpose. "3 weeks ago" tells a passenger whether the review is
// current; an exact date helps nobody read it and helps anybody who wants to
// work out which ride, and therefore which passenger, wrote it.
function relativeAge(at: string): string {
  const days = Math.floor((Date.now() - Date.parse(at)) / 864e5)
  if (!Number.isFinite(days) || days < 0) return 'Kamakailan'
  if (days === 0) return 'Ngayon'
  if (days === 1) return 'Kahapon'
  if (days < 7) return `${days} araw ang nakalipas`
  if (days < 30) {
    const weeks = Math.floor(days / 7)
    return `${weeks} linggo ang nakalipas`
  }
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} buwan ang nakalipas`
  return 'Mahigit isang taon na'
}
