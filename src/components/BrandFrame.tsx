// The framed brand on the welcome screens (login and "Who are you?"): what
// TODA stands for, spelled out, beside the TODA Ride Mobility mark, inside a
// thin ring — the lockup as it was drawn.
//
// 2026-11-12: the acrostic replaced a single gold line that said the same
// four words in a row. It is public/toda-acrostic.svg, vector, with no
// background of its own — the blue card the artwork was handed over on is
// not reproduced, so this sits on whatever is behind it.
//
// Two layouts, one component. Side by side from `sm` up, which is the lockup
// itself: acrostic, divider, mark. Stacked below that, because at 375px a
// side-by-side version puts the four words at 9px and the mark at the size
// of a thumbnail. The order stays acrostic-then-mark either way.
//
// 2026-09-22: the frame hugs the artwork. logo.png carries transparent
// margins — the artwork is 89% of its width and rows 182-803 of 941 — so the
// image is pulled in by negative margins rather than framed with its empty
// space.
const LOGO_HEIGHT = 120
const ASPECT = 1672 / 941
const TRIM_TOP = Math.round((LOGO_HEIGHT * 182) / 941)
const TRIM_BOTTOM = Math.round((LOGO_HEIGHT * (941 - 804)) / 941)
// Columns 95-1582 of 1672 hold the artwork; the rest is side margin.
const LOGO_WIDTH = LOGO_HEIGHT * ASPECT
const TRIM_LEFT = Math.round((LOGO_WIDTH * 95) / 1672)
const TRIM_RIGHT = Math.round((LOGO_WIDTH * (1672 - 1583)) / 1672)

export function BrandFrame() {
  return (
    <span className="inline-flex w-fit flex-col items-center rounded-2xl border-2 border-white/25 px-4 pb-3 pt-3">
      <span className="flex flex-col items-center gap-2 sm:flex-row sm:gap-4">
        <img
          src="/toda-acrostic.svg"
          alt="TODA — Transport and Opportunity Digital Access"
          className="h-auto w-[196px] shrink-0 sm:w-[210px]"
        />
        {/* The lockup's own divider, on the wide layout only — stacked, the
            two pieces already read as two things. */}
        <span aria-hidden className="hidden w-px self-stretch bg-white/30 sm:block" />
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
      </span>
    </span>
  )
}
