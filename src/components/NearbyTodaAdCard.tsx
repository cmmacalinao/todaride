import { PilotBranding } from './PilotBranding'

// Wraps PilotBranding in an ad-like frame — a bordered, tinted card with a
// small "Near you" tag — for the two cases where a *specific* TODA is being
// named (GPS-detected, or Super Admin's manual override): naming an actual
// org reads as promoting it, so it gets promoted-looking treatment. The
// app's own generic name (see usePilotBranding's fallback tier) renders
// PilotBranding plainly instead, with no card — the app naming itself isn't
// an ad for anything.
//
// Deliberately its own small component rather than a slot in the existing
// BannerAdManager/bannerAds system: those ads are static, admin-authored
// content with their own rotation and slot limits, while this one is
// computed fresh from GPS on every visit and has no content to author.
export function NearbyTodaAdCard({ name, showNearYouTag }: { name: string; showNearYouTag: boolean }) {
  return (
    <div className="mt-4 w-full rounded-2xl border-2 border-gold-400/60 bg-white/10 px-4 py-1 backdrop-blur-sm">
      {/* Blank, not just a hidden element, when this name isn't a proximity
          guess at all — a recognized driver's own device (see
          usePilotBranding) names a fixed TODA, and "near you" would simply
          be the wrong claim for it. */}
      {showNearYouTag && (
        <div className="flex justify-start">
          <span className="inline-flex items-center gap-px rounded-full bg-gold-400 px-1 py-0 text-[4px] font-extrabold uppercase tracking-wide text-navy-900">
            📍 Near you
          </span>
        </div>
      )}
      <div className="mt-0.5">
        <PilotBranding name={name} compact />
      </div>
    </div>
  )
}
