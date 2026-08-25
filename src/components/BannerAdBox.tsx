import { useRides } from '../context/RideContext'

// House-banner box for the passenger home screen. Sized by its caller, which
// gives it the space left below the booking card up to a ceiling — the
// artwork then scales down to fit that box rather than the box growing to the
// artwork. It
// arranges however many slots Super Admin has actually filled — one banner
// gets the whole box, two split it, four make a 2x2. A partly-filled set is
// the normal case, not an edge case, so nothing here assumes four.
export function BannerAdBox({ className = '' }: { className?: string }) {
  const { bannerAds } = useRides()
  const filled = bannerAds.filter((ad): ad is NonNullable<typeof ad> => !!ad && !!ad.imageUrl)

  if (filled.length === 0) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center ${className}`}
      >
        <p className="text-[11px] text-slate-400">
          Ad space — add banners in Super Admin → Banner ads
        </p>
      </div>
    )
  }

  // One column for a single banner or three (so the odd one is not orphaned
  // in a half-width cell); two columns for two or four.
  const cols = filled.length === 2 || filled.length === 4 ? 'grid-cols-2' : 'grid-cols-1'

  return (
    <div className={`grid min-h-0 gap-2 overflow-hidden ${cols} ${className}`}>
      {filled.map((ad) => (
        <figure key={ad.id} className="relative min-h-0 overflow-hidden rounded-xl bg-white shadow-sm">
          {/* object-contain, not cover: a banner is artwork with type on it,
              and cropping it to fill a cell is how you lose half a wordmark. */}
          <img src={ad.imageUrl} alt={ad.caption} className="absolute inset-0 h-full w-full object-contain" />
          {ad.caption && <figcaption className="sr-only">{ad.caption}</figcaption>}
        </figure>
      ))}
    </div>
  )
}
