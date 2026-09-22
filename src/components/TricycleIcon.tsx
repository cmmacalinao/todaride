// The tricycle picture used across the app — a yellow tricycle with its
// driver, cut out of its white background (2026-09-21; it replaced a drawn
// green-and-yellow outline). Every place this shows is thumbnail-sized (48px
// at most), so it loads the 6.5 KB 118×65 thumbnail, sharp at 2× on a phone;
// public/tricycle-icon.png (235×130, 40 KB) is kept for anywhere larger. The map
// marker's own copy (TRICYCLE_SVG in mapMarkerHtml.ts) is separate: that
// one is a pin among many pins, and needs the outline to carry.
//
// object-contain keeps the picture's own proportions inside whatever box a
// caller gives it — the image is wider than tall.
export function TricycleIcon({ className }: { className?: string }) {
  return (
    <img
      src="/tricycle-thumb.png"
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`object-contain ${className ?? ''}`}
    />
  )
}
