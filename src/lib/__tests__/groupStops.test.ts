import { describe, expect, it } from 'vitest'
import { dropOffOrder } from '../groupStops'

describe('dropOffOrder', () => {
  const pickup = { lat: 15.73, lng: 120.93 }

  it('drops the nearest destination first, then the nearest one to that', () => {
    const stops = [
      { key: 'far', gps: { lat: 15.79, lng: 120.99 } }, // ~9 km
      { key: 'near', gps: { lat: 15.735, lng: 120.935 } }, // ~0.8 km
      { key: 'middle', gps: { lat: 15.76, lng: 120.96 } }, // ~4.5 km
    ]
    expect(dropOffOrder(pickup, stops)).toEqual(['near', 'middle', 'far'])
  })

  it('follows the route, not the distance from the pickup', () => {
    // B is closer to the pickup than C, but once at A, C is right next door.
    const stops = [
      { key: 'A', gps: { lat: 15.74, lng: 120.93 } },
      { key: 'B', gps: { lat: 15.72, lng: 120.93 } },
      { key: 'C', gps: { lat: 15.745, lng: 120.93 } },
    ]
    expect(dropOffOrder(pickup, stops)).toEqual(['A', 'C', 'B'])
  })

  it('handles no stops, and no known pickup', () => {
    expect(dropOffOrder(pickup, [])).toEqual([])
    expect(dropOffOrder(null, [{ key: 'only', gps: pickup }])).toEqual(['only'])
  })
})
