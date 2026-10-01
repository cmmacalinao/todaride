import { describe, expect, it } from 'vitest'
import {
  ROUTE_CHANGE_REASONS,
  ROUTE_CHANGE_START,
  nextRouteChangeDecision,
  routeChangeReasonLabel,
} from '../routeChange'
import type { GeoCoords } from '../../types'

const PICKUP: GeoCoords = { lat: 15.7333, lng: 120.9314 }
// Roughly north by `meters`. One degree of latitude is about 111,320 m.
const north = (meters: number): GeoCoords => ({ lat: PICKUP.lat + meters / 111320, lng: PICKUP.lng })

function run(distancesFromPickup: number[], farOffRoute = false) {
  let state = ROUTE_CHANGE_START
  return distancesFromPickup.map((m) => {
    const d = nextRouteChangeDecision(state, { vehicle: north(m), pickup: PICKUP, farOffRoute })
    state = { furthestFromPickup: d.furthestFromPickup, asked: d.asked }
    return d.ask
  })
}

describe('nextRouteChangeDecision', () => {
  it('says nothing on a trip driving steadily away', () => {
    expect(run([50, 300, 800, 1500, 3000]).some(Boolean)).toBe(false)
  })

  it('asks when the tricycle turns back toward the pickup', () => {
    // Out to 1 km, then back — a reversal, not a detour.
    const asks = run([100, 600, 1000, 700])
    expect(asks).toEqual([false, false, false, true])
  })

  it('ignores a wobble near the pickup at the start of a trip', () => {
    // Circling the block before setting off: never far enough out for coming
    // back to mean anything.
    expect(run([50, 300, 120, 80, 200]).some(Boolean)).toBe(false)
  })

  it('does not ask twice', () => {
    const asks = run([100, 600, 1000, 700, 500, 300])
    expect(asks.filter(Boolean)).toHaveLength(1)
  })

  it('asks when the trip is far off its planned road, without any reversal', () => {
    expect(run([100, 600], true)[0]).toBe(true)
  })

  it('needs a real return, not a few metres of GPS wander', () => {
    // 1000 m out, then 950: inside the margin, so nothing is claimed.
    expect(run([100, 600, 1000, 950]).some(Boolean)).toBe(false)
  })
})

describe('routeChangeReasonLabel', () => {
  it('reads back a reason with its icon', () => {
    expect(routeChangeReasonLabel('closed')).toBe('🚧 Road closed')
  })

  it('is null for nothing, and for anything it does not know', () => {
    expect(routeChangeReasonLabel(null)).toBeNull()
    expect(routeChangeReasonLabel('made-up')).toBeNull()
  })

  it('offers reasons a driver can tap without reading twice', () => {
    expect(ROUTE_CHANGE_REASONS.length).toBeLessThanOrEqual(6)
    expect(ROUTE_CHANGE_REASONS.every((r) => r.label.length <= 16)).toBe(true)
  })
})
