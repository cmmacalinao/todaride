import { describe, expect, it } from 'vitest'
import { SNAP_TO_ROAD_METERS, snapToRoad } from '../snapToRoad'
import { haversineDistanceMeters } from '../geo'

// A stretch of Maharlika Highway, roughly the pilot's route.
const ROAD: { lat: number; lng: number }[] = [
  { lat: 15.7400, lng: 120.9400 },
  { lat: 15.7450, lng: 120.9430 },
  { lat: 15.7500, lng: 120.9460 },
]

describe('snapToRoad', () => {
  it('puts a fix that landed beside the road back onto it', () => {
    // ~20 m off the line: an ordinary phone's error, not a turn.
    const off = { lat: 15.74505, lng: 120.94318 }
    const snapped = snapToRoad(off, ROAD)
    expect(snapped).not.toEqual(off)
    expect(haversineDistanceMeters(snapped, off)).toBeLessThan(SNAP_TO_ROAD_METERS)
  })

  it('leaves a vehicle that has genuinely left the road where it is', () => {
    // ~700 m away — a real detour. Dragging this back would hide the very
    // thing off-route detection exists to notice.
    const away = { lat: 15.7450, lng: 120.9500 }
    expect(snapToRoad(away, ROAD)).toEqual(away)
  })

  it('returns the position unchanged when there is no route', () => {
    const p = { lat: 15.7450, lng: 120.9430 }
    expect(snapToRoad(p, null)).toEqual(p)
    expect(snapToRoad(p, [])).toEqual(p)
    expect(snapToRoad(p, [ROAD[0]])).toEqual(p)
  })

  it('leaves a position already on the line alone', () => {
    const onIt = ROAD[1]
    const snapped = snapToRoad(onIt, ROAD)
    expect(haversineDistanceMeters(snapped, onIt)).toBeLessThan(1)
  })
})
