// The marker artwork, in one place.
//
// Two map engines draw these now — Leaflet for browsing and picking, MapLibre
// for the heading-up view during a trip — and both build markers out of plain
// HTML. Sharing the markup is the only way the tricycle a passenger sees while
// choosing a pickup is the same tricycle they see while riding in it.

export type MarkerIcon = 'tricycle' | 'pharmacy' | 'resto' | 'terminal' | 'me' | 'pickup' | 'dropoff'

export const EMOJI_MARKER_ICONS: Record<MarkerIcon, string> = {
  tricycle: '🛺',
  terminal: '🚏',
  pharmacy: '💊',
  // A Registered Vendor's storefront (see VendorLocationPicker) — a capsule
  // on a carinderia's pin read as "pharmacy", which is the one thing it isn't.
  resto: '🍽️',
  // The person holding the phone. A figure rather than a plain dot, because
  // this marker sits among tricycles and terminals and has to be read at a
  // glance as "that one is me" while somebody is standing at a rank looking
  // between the screen and the road.
  me: '🧍',
  // The two ends of a trip being booked — the same 📍 and 🏁 the pickup
  // and destination lines above the map start with, so a line and its
  // marker are visibly the same thing rather than a colour to match up.
  pickup: '📍',
  dropoff: '🏁',
}

// Pharmacy pins render at ~75% of the driver/tricycle marker's size — a
// pharmacy is one of several static reference points on a browsing map, not
// the one live thing the eye should be drawn to (the driver's own position
// during tracking), so it doesn't need the same visual weight.
export const EMOJI_MARKER_SIZES: Record<MarkerIcon, { box: number; font: number }> = {
  tricycle: { box: 18, font: 11 },
  terminal: { box: 16, font: 10 },
  pharmacy: { box: 20, font: 11 },
  resto: { box: 20, font: 11 },
  // The largest of them. Everything else on this map is a place or a vehicle
  // being looked for; this is the one point the eye should find first.
  me: { box: 22, font: 13 },
  pickup: { box: 24, font: 14 },
  dropoff: { box: 24, font: 14 },
}

// The tricycle, drawn rather than borrowed from the emoji font.
//
// 🛺 renders in whatever colours the platform decided — green on one phone,
// orange on another — and none of them are ours. Drawn, it wears the logo's
// blue on the logo's gold, so the marker for a TODA tricycle looks like it
// belongs to this app rather than to Unicode. It also renders identically on
// every phone, which an emoji does not.
//
// Deliberately simple: at 18 pixels a silhouette reads and detail does not.
// It faces left, which is what decides where zero degrees points when the
// marker is rotated to a heading — see NAV_TRICYCLE_ART_OFFSET_DEGREES.
export const TRICYCLE_SVG =
  '<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">' +
  // The sidecar: a boxy cab with its own roof, which is the half that says
  // 'tricycle' rather than 'car'.
  '<path d="M2.5 16V9.2a1 1 0 0 1 1-1h6.2a1 1 0 0 1 1 1V16z" fill="#1e3a8a"/>' +
  '<rect x="2" y="7.6" width="9.4" height="1.5" rx="0.7" fill="#1e3a8a"/>' +
  '<rect x="4" y="10" width="5" height="2.6" rx="0.5" fill="#fbbf24"/>' +
  // The motorcycle it is bolted to, kept separate so the two read as two
  // things at a glance.
  '<path d="M13.2 16v-3.2h1.6l1.1-3.2h1.6v1.5h-1.2l-.8 2.4h2.1V16z" fill="#1e3a8a"/>' +
  // Different wheel sizes, the way a real one has them.
  '<circle cx="6.6" cy="17.4" r="2.5" fill="#1e3a8a"/><circle cx="6.6" cy="17.4" r="1" fill="#fbbf24"/>' +
  '<circle cx="17.6" cy="17.4" r="3" fill="#1e3a8a"/><circle cx="17.6" cy="17.4" r="1.2" fill="#fbbf24"/>' +
  '</svg>'

export interface MarkerHtmlOptions {
  color: string
  pulse?: boolean
  icon?: MarkerIcon
  pointId?: string
}

export function markerHtml({ color, pulse, icon, pointId }: MarkerHtmlOptions): string {
  const stamp = pointId ? ` data-point-id="${pointId.replace(/"/g, '&quot;')}"` : ''
  if (icon) {
    const art = icon === 'tricycle' ? TRICYCLE_SVG : EMOJI_MARKER_ICONS[icon]
    const { box, font } = EMOJI_MARKER_SIZES[icon]
    const isTricycle = icon === 'tricycle'
    return `<div${stamp} style="position:relative;width:${box}px;height:${box}px;">
        ${pulse ? `<div style="position:absolute;inset:-5px;border-radius:9999px;background:${color};opacity:0.25;"></div>` : ''}
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border-radius:9999px;background:${isTricycle ? '#fbbf24' : 'white'};border:2px solid ${isTricycle ? '#1e3a8a' : color};box-shadow:0 1px 3px rgba(0,0,0,0.45);font-size:${font}px;line-height:1;padding:${isTricycle ? '2px' : '0'};">${art}</div>
      </div>`
  }
  return `<div${stamp} style="position:relative;width:18px;height:18px;">
      ${pulse ? `<div style="position:absolute;inset:-7px;border-radius:9999px;background:${color};opacity:0.25;"></div>` : ''}
      <div style="position:absolute;inset:0;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.45);"></div>
    </div>`
}

export function markerBoxSize(icon?: MarkerIcon): number {
  return icon ? EMOJI_MARKER_SIZES[icon].box : 18
}
