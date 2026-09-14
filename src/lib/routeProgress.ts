import type { GeoCoords } from '../types'
import { haversineDistanceMeters } from './geo'

// Where along a drawn route the vehicle currently is, so the map can show
// the part already driven differently from the part still ahead.
//
// The vehicle's GPS is projected onto the nearest route segment (a flat
// local approximation — routes here are a few km at most, so a metre-scale
// error is irrelevant). If it sits further than maxSnapMeters from the
// route — a detour, a GPS jump, a stale route — there is no honest split
// and the caller draws the whole route as before.
export function splitRouteAtProgress(
  route: GeoCoords[],
  at: GeoCoords,
  maxSnapMeters = 150,
): { passed: GeoCoords[]; remaining: GeoCoords[] } | null {
  if (route.length < 2) return null
  const kx = Math.cos((at.lat * Math.PI) / 180)
  let best: { i: number; t: number; point: GeoCoords; d2: number } | null = null
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i]
    const b = route[i + 1]
    const ax = (a.lng - at.lng) * kx
    const ay = a.lat - at.lat
    const bx = (b.lng - at.lng) * kx
    const by = b.lat - at.lat
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2))
    const px = ax + t * dx
    const py = ay + t * dy
    const d2 = px * px + py * py
    if (!best || d2 < best.d2) {
      best = { i, t, d2, point: { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) } }
    }
  }
  if (!best) return null
  if (haversineDistanceMeters(at, best.point) > maxSnapMeters) return null
  const passed = [...route.slice(0, best.i + 1), best.point]
  const remaining = [best.point, ...route.slice(best.i + 1)]
  return { passed, remaining }
}
