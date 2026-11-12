// The framed brand on the welcome screens (login and "Who are you?"): the
// TODA Ride Mobility mark, a white rule, and what TODA stands for spelled
// out on the right — the lockup as it was drawn.
//
// 2026-11-12: the acrostic replaced a single gold line that said the same
// four words in a row. It is public/toda-acrostic.svg, vector, with no
// background of its own — the blue card the artwork was handed over on is
// not reproduced, so this sits on whatever is behind it.
//
// Side by side at every width, phones included. It was stacked below `sm`
// for a few minutes on the reasoning that the words would be too small; at
// 375px they come out at about 11px, which is exactly the size the gold line
// they replaced was set at, and the lockup is a lockup. Both pieces shrink
// together instead.
//
// 2026-09-22: the frame hugs the artwork. logo.png carries transparent
// margins — the artwork is 89% of its width and rows 182-803 of 941 — so the
// image is pulled in by negative margins rather than framed with its empty
// space. Those margins are in pixels and so have to be worked out per size,
// which is why the mark is rendered twice and one of the two is hidden: a
// percentage margin would resolve against the wrong box, and a transform
// would leave the ring hugging a space the artwork no longer fills.
const ASPECT = 1672 / 941

function markStyle(height: number) {
  const width = height * ASPECT
  return {
    height,
    marginTop: -Math.round((height * 182) / 941),
    marginBottom: -Math.round((height * (941 - 804)) / 941),
    // Columns 95-1582 of 1672 hold the artwork; the rest is side margin.
    marginLeft: -Math.round((width * 95) / 1672),
    marginRight: -Math.round((width * (1672 - 1583)) / 1672),
  }
}

export function BrandFrame() {
  return (
    <span className="inline-flex w-fit flex-col items-center rounded-2xl border-2 border-white/25 px-3 py-2.5 sm:px-4 sm:py-3">
      <span className="flex flex-row items-center gap-2 sm:gap-4">
        <img
          src="/logo.png"
          alt="TODA Ride Mobility"
          className="w-auto max-w-none object-contain sm:hidden"
          style={markStyle(82)}
        />
        <img
          src="/logo.png"
          alt=""
          aria-hidden
          className="hidden w-auto max-w-none object-contain sm:block"
          style={markStyle(120)}
        />
        {/* The lockup's divider, in white. */}
        <span aria-hidden className="w-px self-stretch bg-white/80" />
        <img
          src="/toda-acrostic.svg"
          alt="TODA — Transport and Opportunity Digital Access"
          className="h-auto w-[148px] shrink-0 sm:w-[210px]"
        />
      </span>
    </span>
  )
}
