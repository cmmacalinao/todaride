// Drawn rather than borrowed from the emoji font — 🛵 is a two-wheeled
// scooter on most platforms, not the three-wheeled tricycle this app is
// named for, and it renders in whatever colours the platform picked rather
// than the app's own blue-on-gold. Same artwork as the map marker's tricycle
// (see TRICYCLE_SVG in mapMarkerHtml.ts) — kept as a second, plain React
// copy here because that one is built as an HTML string for Leaflet/MapLibre
// markers, not something a JSX tree can render directly.
export function TricycleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      {/* The sidecar: a boxy cab with its own roof, which is the half that
          says "tricycle" rather than "motorcycle". */}
      <path d="M2.5 16V9.2a1 1 0 0 1 1-1h6.2a1 1 0 0 1 1 1V16z" fill="#1e3a8a" />
      <rect x="2" y="7.6" width="9.4" height="1.5" rx="0.7" fill="#1e3a8a" />
      <rect x="4" y="10" width="5" height="2.6" rx="0.5" fill="#fbbf24" />
      {/* The motorcycle it is bolted to, kept separate so the two read as
          two things at a glance. */}
      <path d="M13.2 16v-3.2h1.6l1.1-3.2h1.6v1.5h-1.2l-.8 2.4h2.1V16z" fill="#1e3a8a" />
      {/* Different wheel sizes, the way a real one has them. */}
      <circle cx="6.6" cy="17.4" r="2.5" fill="#1e3a8a" />
      <circle cx="6.6" cy="17.4" r="1" fill="#fbbf24" />
      <circle cx="17.6" cy="17.4" r="3" fill="#1e3a8a" />
      <circle cx="17.6" cy="17.4" r="1.2" fill="#fbbf24" />
    </svg>
  )
}
