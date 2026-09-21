// The tricycle picture used across the app — a yellow tricycle with its
// driver, cut out of its white background (public/tricycle-icon.png,
// 2026-09-21; it replaced a drawn green-and-yellow outline). The map
// marker's own copy (TRICYCLE_SVG in mapMarkerHtml.ts) is separate: that
// one is a pin among many pins, and needs the outline to carry.
//
// object-contain keeps the picture's own proportions inside whatever box a
// caller gives it — the image is wider than tall.
export function TricycleIcon({ className }: { className?: string }) {
  return (
    <img
      src="/tricycle-icon.png"
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`object-contain ${className ?? ''}`}
    />
  )
}
