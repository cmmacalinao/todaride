// The framed logo on the welcome screens (login and "Who are you?"): the
// TODA Ride Mobility mark with what TODA stands for under it, inside a thin
// white ring.
//
// 2026-09-22: the tagline is exactly as wide as the logo's artwork, and the
// frame hugs the two. logo.png carries transparent margins — the artwork is
// 89% of its width and rows 182-803 of 941 — so the image is pulled in by
// negative margins top and bottom rather than framed with its empty space.
// At 120px tall the artwork is ~190px wide, which puts the one-line tagline at
// 11px; a smaller logo would push the tagline below a readable size.
const LOGO_HEIGHT = 120
const ASPECT = 1672 / 941
const ART_WIDTH = Math.round(LOGO_HEIGHT * ASPECT * 0.89)
const TRIM_TOP = Math.round((LOGO_HEIGHT * 182) / 941)
const TRIM_BOTTOM = Math.round((LOGO_HEIGHT * (941 - 804)) / 941)
// Columns 95-1582 of 1672 hold the artwork; the rest is side margin.
const LOGO_WIDTH = LOGO_HEIGHT * ASPECT
const TRIM_LEFT = Math.round((LOGO_WIDTH * 95) / 1672)
const TRIM_RIGHT = Math.round((LOGO_WIDTH * (1672 - 1583)) / 1672)
// The tagline's width per pixel of font size, measured in the app's font.
const TAGLINE_WIDTH_PER_PX = 293.1 / 17

export function BrandFrame() {
  return (
    <span className="inline-flex w-fit flex-col items-center rounded-2xl border-2 border-white/25 px-4 pb-2.5 pt-3">
      <img
        src="/logo.png"
        alt="TODA Ride Mobility"
        className="w-auto max-w-none object-contain"
        style={{
          height: LOGO_HEIGHT,
          marginTop: -TRIM_TOP,
          marginBottom: -TRIM_BOTTOM,
          marginLeft: -TRIM_LEFT,
          marginRight: -TRIM_RIGHT,
        }}
      />
      <span
        className="mt-1.5 block whitespace-nowrap text-center leading-tight text-gold-400"
        style={{ fontSize: `${(ART_WIDTH / TAGLINE_WIDTH_PER_PX).toFixed(2)}px` }}
      >
        Transport &amp; Opportunity Digital Access
      </span>
    </span>
  )
}
