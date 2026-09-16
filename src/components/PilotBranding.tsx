// The masthead naming which TODA this screen is for — "Roseville TODA",
// or just "TODA" for the app's own generic identity (see usePilotBranding).
// Split on the *last word*, not literally the word "TODA": that word gets
// the gold badge the wordmark's own yellow "TODA" wears, everything ahead of
// it stays plain white text. A single-word name (including the bare generic
// "TODA") has nothing to put ahead of the badge, so it badges alone — same
// component, same split rule, no special-casing the generic case.
// hideSubtitle: for a screen that places "Transport & Opportunity Digital
// Access" itself — the Welcome page puts it under its tagline instead.
export function PilotBranding({ name, compact, hideSubtitle }: { name: string; compact?: boolean; hideSubtitle?: boolean }) {
  const words = name.trim().split(/\s+/)
  const org = words[words.length - 1]
  const prefix = words.length > 1 ? words.slice(0, -1).join(' ') : ''

  return (
    // The outer flex centers the block as a whole in the card; the inner
    // div is un-stretched (shrinks to the name row's own width) so
    // the line under it — centered within that same narrow box — lands under
    // the name/badge row rather than the card, even while the block itself
    // sits centered.
    <div className="flex justify-center">
      <div>
        <p
          className={`flex flex-wrap items-center font-extrabold leading-none text-white ${
            compact ? 'gap-1 text-[17px]' : 'gap-1.5 text-2xl'
          }`}
        >
          {prefix}
          {/* A relative nudge, not padding — the badge's padding is already
              symmetric, but this font's glyphs sit slightly high within
              their own line box, which read as the badge itself sitting a
              touch high next to the plain text beside it. */}
          <span
            className={`relative top-px rounded-lg bg-gold-400 text-navy-900 ${compact ? 'px-1.5 py-px' : 'px-2 py-0.5'}`}
          >
            {org}
          </span>
        </p>
        {!hideSubtitle && (
          <p
            className={`mt-1 whitespace-nowrap text-center text-gold-400 ${compact ? 'text-[9px]' : 'text-xs'}`}
          >
            Transport &amp; Opportunity Digital Access
          </p>
        )}
      </div>
    </div>
  )
}
