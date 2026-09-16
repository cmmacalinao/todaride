import { haversineDistanceMeters, minutesToCover } from './geo'
import type { GeoCoords } from '../types'

// Past this, a driver and a pickup are far enough apart to stop and ask — the
// passenger once a driver has accepted, the driver before accepting. Three
// kilometres is roughly ten minutes on a tricycle: long enough that somebody
// could reasonably prefer a nearer driver, or that a driver tapped Accept on
// the wrong card.
export const VERY_FAR_DRIVER_METERS = 3000

// How far apart, and how long to close the gap — or null when not far enough
// to ask about, or when either end is unknown. A road route is used when
// there is one; otherwise straight-line distance at tricycle speed.
export function farDriverGap(
  from: GeoCoords | null,
  to: GeoCoords | null,
  road: { meters: number; seconds: number } | null = null,
): { meters: number; minutes: number } | null {
  if (!from || !to) return null
  const meters = road ? road.meters : haversineDistanceMeters(from, to)
  if (meters <= VERY_FAR_DRIVER_METERS) return null
  const minutes = road ? Math.max(1, Math.round(road.seconds / 60)) : minutesToCover(meters)
  return { meters, minutes }
}
