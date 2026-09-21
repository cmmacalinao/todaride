import { haversineDistanceMeters } from './geo'
import type { GeoCoords } from '../types'

// The order a Group Ride's riders get off in: from the pickup, the nearest
// destination first, then the nearest one to that, and so on.
//
// Not the shortest possible tour — that is a travelling-salesman problem, and
// a tricycle with four riders does not need it solved. Nearest-next is what a
// driver does by eye anyway ("drop the one closest first"), it is the same
// answer every time for the same stops, and it is the order the numbers on
// the map should follow so that 1, 2, 3 reads as the actual route.
export function dropOffOrder<T extends { key: string; gps: GeoCoords }>(start: GeoCoords | null, stops: T[]): string[] {
  const remaining = [...stops]
  const order: string[] = []
  let here = start ?? remaining[0]?.gps ?? null
  while (remaining.length > 0 && here) {
    let best = 0
    let bestDistance = Infinity
    remaining.forEach((stop, i) => {
      const d = haversineDistanceMeters(here!, stop.gps)
      if (d < bestDistance) {
        bestDistance = d
        best = i
      }
    })
    const [next] = remaining.splice(best, 1)
    order.push(next.key)
    here = next.gps
  }
  return order
}
