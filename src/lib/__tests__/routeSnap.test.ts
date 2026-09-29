import { describe, expect, it } from 'vitest'
import { ROUTE_SNAP_DEGREES, snapForRouting } from '../routing'
import { haversineDistanceMeters } from '../geo'

// Why this exists: a re-route starts its new route from a live GPS reading,
// which is a different number every single time. Every re-route was therefore
// a cache miss and a fresh request to a public routing server that refuses
// requests when it is busy — and a refused request used to mean no blue line
// for the rest of the trip. Snapping to a grid is what makes straying twice
// near the same corner ask once.
describe('snapForRouting', () => {
  it('collapses a stream of readings into a handful of routing endpoints', () => {
    // Thirty fixes creeping along the road to CLSU, a couple of metres apart
    // — a minute of a tricycle in traffic. A grid cannot promise that any
    // given pair lands in the same square (two readings either side of a
    // boundary never will), and the point was never that. The point is how
    // many distinct endpoints thirty readings can ask a routing server for.
    const readings = Array.from({ length: 30 }, (_, i) => ({
      lat: 15.73412 + i * 0.00002,
      lng: 120.93781 + i * 0.00002,
    }))
    const keys = new Set(readings.map((r) => `${snapForRouting(r).lat},${snapForRouting(r).lng}`))
    // Comfortably fewer than half. Not a tighter number than that: readings
    // moving diagonally cross the lat and lng boundaries at different moments,
    // so the exact count depends on the line they walk, and pinning it would
    // be a test of this fixture rather than of the rule.
    expect(keys.size).toBeLessThan(readings.length / 2)
    // Unsnapped, every one of them is its own cache key and its own request.
    expect(new Set(readings.map((r) => `${r.lat},${r.lng}`)).size).toBe(30)
  })

  it('keeps the snapped point close enough to be the same place on the road', () => {
    const real = { lat: 15.734127, lng: 120.937816 }
    const snapped = snapForRouting(real)
    // Well inside the 100 m that counts as off-route, so snapping can never
    // be what makes a trip look like it has strayed.
    expect(haversineDistanceMeters(real, snapped)).toBeLessThan(30)
  })

  it('still separates positions further apart than the grid', () => {
    const here = snapForRouting({ lat: 15.734, lng: 120.9378 })
    const away = snapForRouting({ lat: 15.734 + ROUTE_SNAP_DEGREES * 4, lng: 120.9378 })
    expect(away).not.toEqual(here)
  })

  it('rounds to a stable number, so the cache key is a plain string', () => {
    // Float arithmetic on a grid of 0.00025 produces 15.734250000000001
    // without the rounding, and that is a different cache key from
    // 15.73425 for two readings that snapped to the same square.
    const snapped = snapForRouting({ lat: 15.7342501, lng: 120.9378 })
    expect(String(snapped.lat)).toBe('15.73425')
  })
})
