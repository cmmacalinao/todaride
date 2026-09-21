// Drawn rather than borrowed from the emoji font — 🛵 is a two-wheeled
// scooter on most platforms, not the three-wheeled tricycle this app is
// named for, and it renders in whatever colours the platform picked rather
// than the app's own.
//
// The logo's green with the app's yellow (2026-09-19): the tricycle in the
// TODA Ride Mobility mark is green, and this is the same vehicle, so it is
// the same green — the yellow stays on the cab window and the wheel hubs,
// where it reads as a highlight rather than a second colour competing with
// the first. The map marker's copy (TRICYCLE_SVG in mapMarkerHtml.ts) keeps
// its navy-on-gold: that one is a pin on a map full of other pins, and it is
// the outline against the map that has to carry, not the brand.
const GREEN = '#22a447'
const YELLOW = '#fbbf24'

export function TricycleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      {/* The sidecar: a boxy cab with its own roof, which is the half that
          says "tricycle" rather than "motorcycle". */}
      <path d="M2.5 16V9.2a1 1 0 0 1 1-1h6.2a1 1 0 0 1 1 1V16z" fill={GREEN} />
      <rect x="2" y="7.6" width="9.4" height="1.5" rx="0.7" fill={GREEN} />
      <rect x="4" y="10" width="5" height="2.6" rx="0.5" fill={YELLOW} />
      {/* The motorcycle it is bolted to, kept separate so the two read as
          two things at a glance. */}
      <path d="M13.2 16v-3.2h1.6l1.1-3.2h1.6v1.5h-1.2l-.8 2.4h2.1V16z" fill={GREEN} />
      {/* Different wheel sizes, the way a real one has them. */}
      <circle cx="6.6" cy="17.4" r="2.5" fill={GREEN} />
      <circle cx="6.6" cy="17.4" r="1" fill={YELLOW} />
      <circle cx="17.6" cy="17.4" r="3" fill={GREEN} />
      <circle cx="17.6" cy="17.4" r="1.2" fill={YELLOW} />
    </svg>
  )
}
