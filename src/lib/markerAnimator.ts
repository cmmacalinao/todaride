import { haversineDistanceMeters } from './geo'
import type { GeoCoords } from '../types'

// Why a tricycle on the map hops, and what to do about it.
//
// A position arrives about once a second and the marker is moved to it. So
// the vehicle is still for a second, jumps twenty metres, and is still again.
// The eye reads that as a stutter rather than as movement, and on a slow or
// jittery feed it reads as the app being broken — which it is not; it only
// looks it.
//
// Three things fix it, and all three are needed:
//
//   Glide. Move between two fixes over the time that actually elapsed
//   between them, rather than teleporting on arrival.
//
//   Lag. Draw where the vehicle was a second ago, not where it is. This
//   sounds backwards and is the whole trick: to glide towards a position you
//   must already have it, so the renderer stays one fix behind and always
//   has somewhere to glide to. A second of staleness is invisible; a stutter
//   is not. Every navigation app does this.
//
//   The road. Between two fixes a vehicle followed the street, not the
//   straight line between them — so on a bend the straight line cuts the
//   corner and the marker drives through a building.
//
// What this module does NOT do is extrapolate. When the buffer runs dry the
// marker holds position. Guessing where a vehicle went, and being wrong, is
// worse than showing it stopped: a passenger watching a driver who has
// actually stopped should see them stopped.

export const RENDER_DELAY_MS = 1000

// How long to keep showing the last known position once the feed dries up.
// Past this the marker simply stays put — it has not moved as far as anyone
// here knows, and inventing motion would be a lie told smoothly.
export const MAX_HOLD_MS = 1500

// Beyond either of these, a glide would be a fiction: the vehicle did not
// travel 200 m smoothly in the gap, and after 10 s of silence we have no idea
// what it did. Jump, and let the jump be visible.
export const TELEPORT_METERS = 200
export const TELEPORT_GAP_MS = 10_000

// A glide shorter than half a second is a flicker; one longer than four
// seconds is a marker still sliding when the next fix has already landed.
export const MIN_ANIMATION_MS = 500
export const MAX_ANIMATION_MS = 4000

export interface TimedFix {
  gps: GeoCoords
  // Milliseconds since epoch, from the fix itself where possible.
  at: number
  headingDegrees?: number | null
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t
}

// Straight-line interpolation between two coordinates.
//
// Longitude is lerped directly rather than great-circle: over the few tens of
// metres between two fixes the difference is far below GPS noise, and the
// exact version costs trigonometry on every frame.
export function interpolateCoords(from: GeoCoords, to: GeoCoords, t: number): GeoCoords {
  const k = clamp01(t)
  return { lat: lerp(from.lat, to.lat, k), lng: lerp(from.lng, to.lng, k) }
}

// Ease in and out, so a glide starts and ends softly instead of snapping into
// motion at a constant speed and stopping dead.
export function easeInOut(t: number): number {
  const k = clamp01(t)
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
}

export function shouldTeleport(args: { from: GeoCoords; to: GeoCoords; gapMs: number }): boolean {
  if (!Number.isFinite(args.gapMs) || args.gapMs > TELEPORT_GAP_MS) return true
  return haversineDistanceMeters(args.from, args.to) > TELEPORT_METERS
}

export function animationDurationMs(gapMs: number): number {
  if (!Number.isFinite(gapMs) || gapMs <= 0) return MIN_ANIMATION_MS
  return Math.min(MAX_ANIMATION_MS, Math.max(MIN_ANIMATION_MS, gapMs))
}

// The shortest way round to a new heading, signed.
//
// Turning from 350° to 10° is twenty degrees right, not three hundred and
// forty left. Without this a vehicle rounding north spins almost all the way
// about, which is the single most obviously wrong thing a map marker can do.
export function shortestTurnDegrees(fromDeg: number, toDeg: number): number {
  const diff = ((toDeg - fromDeg + 540) % 360) - 180
  // -180 and 180 are the same turn; prefer the positive one so a half turn is
  // consistent rather than flipping on rounding.
  return diff === -180 ? 180 : diff
}

export function easeHeading(fromDeg: number, toDeg: number, t: number): number {
  const turned = fromDeg + shortestTurnDegrees(fromDeg, toDeg) * easeInOut(t)
  return ((turned % 360) + 360) % 360
}

// ---------------------------------------------------------------------------
// The delay buffer
// ---------------------------------------------------------------------------

export interface BufferSample {
  gps: GeoCoords
  headingDegrees: number | null
  // True when the buffer had nothing new and this is the last known position
  // held in place rather than a position between two fixes.
  holding: boolean
}

// Where to draw the vehicle at a given moment, from the fixes received so far.
//
// `renderAt` is normally now - RENDER_DELAY_MS. Returns null when there is
// nothing to draw at all.
export function samplePositionAt(
  buffer: TimedFix[],
  renderAt: number,
  // The ride route, when there is one. Between two fixes the vehicle followed
  // the street, so interpolating straight through cuts the corner.
  route?: GeoCoords[] | null,
): BufferSample | null {
  if (buffer.length === 0) return null
  const sorted = [...buffer].sort((a, b) => a.at - b.at)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]

  // Asking for a time before anything was recorded: show the oldest fix
  // rather than nothing, so a marker appears immediately on the first fix
  // instead of a second later.
  if (renderAt <= first.at) {
    return { gps: first.gps, headingDegrees: first.headingDegrees ?? null, holding: true }
  }

  // Past the newest fix. Hold the last known position — never extrapolate.
  if (renderAt >= last.at) {
    return { gps: last.gps, headingDegrees: last.headingDegrees ?? null, holding: true }
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (renderAt < a.at || renderAt > b.at) continue
    const span = b.at - a.at
    const t = span <= 0 ? 1 : (renderAt - a.at) / span
    // A gap this large was not travelled smoothly; show the fix we are
    // leaving rather than sliding across the hole.
    if (shouldTeleport({ from: a.gps, to: b.gps, gapMs: span })) {
      return { gps: t < 1 ? a.gps : b.gps, headingDegrees: (t < 1 ? a : b).headingDegrees ?? null, holding: true }
    }
    const eased = easeInOut(t)
    return {
      gps: interpolateAlongRoute(route, a.gps, b.gps, eased),
      headingDegrees:
        a.headingDegrees != null && b.headingDegrees != null
          ? easeHeading(a.headingDegrees, b.headingDegrees, t)
          : (b.headingDegrees ?? a.headingDegrees ?? null),
      holding: false,
    }
  }
  return { gps: last.gps, headingDegrees: last.headingDegrees ?? null, holding: true }
}

// Drop fixes nobody will need again: anything older than the one currently
// being drawn from, plus a little slack.
export function pruneBuffer(buffer: TimedFix[], renderAt: number): TimedFix[] {
  const cutoff = renderAt - RENDER_DELAY_MS - MAX_HOLD_MS
  const kept = buffer.filter((f) => f.at >= cutoff)
  // Never drop everything — a stale fix still beats no marker.
  return kept.length > 0 ? kept : buffer.slice(-1)
}

// ---------------------------------------------------------------------------
// Following the road
// ---------------------------------------------------------------------------

// Where along a route the vehicle is, a fraction of the way from one fix to
// the next.
//
// Between two fixes a vehicle followed the street. Interpolating straight
// through cuts every corner, and on a bend that puts the marker through a
// building — the one place a smooth animation looks worse than a hop, because
// a hop is at least honestly on the road at both ends.
//
// Falls back to the straight line when the route cannot explain the movement:
// no route, the points are not on it, or they run backwards along it. A wrong
// road is worse than no road.
export function interpolateAlongRoute(
  route: GeoCoords[] | null | undefined,
  from: GeoCoords,
  to: GeoCoords,
  t: number,
): GeoCoords {
  const k = clamp01(t)
  if (!route || route.length < 2) return interpolateCoords(from, to, k)

  const startIdx = nearestIndex(route, from)
  const endIdx = nearestIndex(route, to)
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return interpolateCoords(from, to, k)
  }

  // Walk the polyline between the two, by distance rather than by vertex
  // count — vertices bunch up on bends, so stepping by index would speed the
  // vehicle up through corners.
  const slice = [from, ...route.slice(startIdx + 1, endIdx + 1), to]
  const legs: number[] = []
  let total = 0
  for (let i = 0; i < slice.length - 1; i++) {
    const d = haversineDistanceMeters(slice[i], slice[i + 1])
    legs.push(d)
    total += d
  }
  if (total <= 0) return interpolateCoords(from, to, k)

  let travelled = total * k
  for (let i = 0; i < legs.length; i++) {
    if (travelled <= legs[i] || i === legs.length - 1) {
      const within = legs[i] <= 0 ? 1 : clamp01(travelled / legs[i])
      return interpolateCoords(slice[i], slice[i + 1], within)
    }
    travelled -= legs[i]
  }
  return to
}

function nearestIndex(route: GeoCoords[], point: GeoCoords): number {
  let best = -1
  let bestDistance = Infinity
  for (let i = 0; i < route.length; i++) {
    const d = haversineDistanceMeters(route[i], point)
    if (d < bestDistance) {
      bestDistance = d
      best = i
    }
  }
  // Too far from the line to be on it. Better to admit the route does not
  // describe this movement than to drag the marker onto a road it is not on.
  return bestDistance <= TELEPORT_METERS ? best : -1
}

// ---------------------------------------------------------------------------
// Whether to animate at all
// ---------------------------------------------------------------------------

// Somebody who has asked their device for less motion gets the old behaviour:
// the marker moves straight to each fix. Smoothness is a nicety; the setting
// is an accessibility request, and for some people it is the difference
// between using the map and feeling ill.
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
