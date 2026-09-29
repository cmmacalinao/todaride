import { haversineDistanceMeters } from './geo'
import type { GeoCoords } from '../types'

// Putting the tricycle back on the road it is driving down.
//
// A phone reporting ±24 m is a good fix by phone standards and still wrong by
// the width of several buildings: drawn straight onto the map, the tricycle
// marker sits in the field beside the highway, then in somebody's yard, then
// back on the road. Pilot testing 2026-09-29 — "yung location ng tricycle icon
// lumilihis sa kalsada". Nothing is wrong with the position; it is being drawn
// with a precision it does not have.
//
// The route already says which road the trip is on, so the marker is drawn at
// the nearest point of that line instead of at the raw reading. This is only
// ever a display decision: every calculation that matters — distance left,
// whether the driver has gone off-route, how far apart the two phones are —
// keeps using the real position, because a marker glued to the planned road
// would make straying from it undetectable by definition.

// How far off the line a position can be and still be treated as being on it.
//
// Generous enough to cover an ordinary phone's error (±24 m measured on the
// pilot's driver phone) and a simplified route geometry, and well inside the
// 100 m that counts as off-route — so a tricycle that has actually turned off
// is never dragged back onto a road it left.
export const SNAP_TO_ROAD_METERS = 45

// The point on a two-point segment closest to p, and how far away that is.
function nearestOnSegment(p: GeoCoords, a: GeoCoords, b: GeoCoords): { point: GeoCoords; meters: number } {
  // Longitude degrees shrink toward the poles; at 15°N they are ~3.5% shorter
  // than latitude degrees. Ignoring that skews every distance east-west.
  const latScale = Math.cos((p.lat * Math.PI) / 180)
  const ax = (a.lng - p.lng) * latScale
  const ay = a.lat - p.lat
  const bx = (b.lng - p.lng) * latScale
  const by = b.lat - p.lat

  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return { point: a, meters: haversineDistanceMeters(p, a) }

  let t = -(ax * dx + ay * dy) / lengthSquared
  t = Math.max(0, Math.min(1, t))
  const point: GeoCoords = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }
  return { point, meters: haversineDistanceMeters(p, point) }
}

// Where to draw a vehicle that is meant to be on this route. Returns the
// position unchanged when there is no usable route, or when it is far enough
// off the line that moving it would be a lie rather than a tidy-up.
export function snapToRoad(position: GeoCoords, route: GeoCoords[] | undefined | null): GeoCoords {
  if (!route || route.length < 2) return position
  let best: { point: GeoCoords; meters: number } | null = null
  for (let i = 0; i < route.length - 1; i++) {
    const candidate = nearestOnSegment(position, route[i], route[i + 1])
    if (!best || candidate.meters < best.meters) best = candidate
    if (best.meters === 0) break
  }
  if (!best || best.meters > SNAP_TO_ROAD_METERS) return position
  return best.point
}
