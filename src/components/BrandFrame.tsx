// The framed brand on the welcome screens (login and "Who are you?"): the
// TODA Ride Mobility mark, a white rule, and what TODA stands for spelled
// out on the right — the lockup as it was drawn.
//
// The frame is exactly as wide as everything under it: the login fields and
// the Rotary card (2026-11-12, asked for). It used to hug its contents,
// which made it the one element on the screen with its own width, and at
// desktop size it was wider than the column it sits in. Now the box is
// `w-full` and the two pieces inside divide that width between them, so the
// lockup shrinks and grows with the screen rather than setting the layout.
//
// Both pieces are sized by width alone, as a share of the row:
//   - /logo-trimmed.png is logo.png with its transparent margins cropped off
//     (columns 95-1583, rows 182-804 of 1672x941). The original needed
//     negative margins in pixels to pull the empty space in, which pins it to
//     one size; a trimmed file just scales.
//   - /toda-acrostic.svg is vector, with no background of its own — the blue
//     card the artwork was handed over on is not reproduced.
//
// 53/44 because the mark is the wider drawing and the acrostic's four words
// still have to be read: at 320px that leaves them around 10px, the size of
// the gold line this lockup replaced.
export function BrandFrame() {
  return (
    <span className="flex w-full items-center gap-2 rounded-2xl border-2 border-white/25 px-3 py-3 sm:gap-3 sm:px-4">
      <img src="/logo-trimmed.png" alt="TODA Ride Mobility" className="h-auto w-[53%] shrink-0 object-contain" />
      {/* The lockup's divider, in white. self-stretch so it runs the height
          of whichever piece is taller rather than needing a height of its
          own at every size. */}
      <span aria-hidden className="w-px self-stretch bg-white/80" />
      <img
        src="/toda-acrostic.svg"
        alt="TODA — Transport and Opportunity Digital Access"
        className="h-auto w-[44%] shrink-0"
      />
    </span>
  )
}
