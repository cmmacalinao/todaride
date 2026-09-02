// The masthead naming which TODA this screen is for — "Roseville TODA",
// or just "TODA" for the app's own generic identity (see usePilotBranding).
// Split on the *last word*, not literally the word "TODA": that word gets
// the gold badge the wordmark's own yellow "TODA" wears, everything ahead of
// it stays plain white text. A single-word name (including the bare generic
// "TODA") has nothing to put ahead of the badge, so it badges alone — same
// component, same split rule, no special-casing the generic case.
export function PilotBranding({ name, compact }: { name: string; compact?: boolean }) {
  const words = name.trim().split(/\s+/)
  const org = words[words.length - 1]
  const prefix = words.length > 1 ? words.slice(0, -1).join(' ') : ''

  return (
    // The outer flex centers the block as a whole in the card; the inner
    // div is un-stretched (shrinks to the name row's own width) so
    // "Booking App" — right-aligned within that same narrow box — lands
    // under the badge's right edge rather than the card's, even while the
    // block itself sits centered.
    <div className="flex justify-center">
      <div>
        <p
          className={`flex flex-wrap items-center font-extrabold leading-none text-white ${
            compact ? 'gap-1 text-[17px]' : 'gap-2 text-3xl'
          }`}
        >
          {prefix}
          <span className={`rounded-lg bg-gold-400 text-navy-900 ${compact ? 'px-1.5 py-px' : 'px-2.5 py-0.5'}`}>
            {org}
          </span>
        </p>
        <p
          className={`mt-0.5 text-right font-bold uppercase tracking-[0.25em] text-white/50 ${
            compact ? 'text-[8px]' : 'text-xs'
          }`}
        >
          Booking App
        </p>
      </div>
    </div>
  )
}
