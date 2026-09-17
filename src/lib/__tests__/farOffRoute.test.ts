import { describe, expect, it } from 'vitest'
import { FAR_OFF_ROUTE_START, MOVING_AWAY_MS, nextFarOffRouteDecision } from '../reroute'

// When a detour is worth asking the passenger about.
describe('nextFarOffRouteDecision', () => {
  it('leaves an everyday detour alone', () => {
    const d = nextFarOffRouteDecision(FAR_OFF_ROUTE_START, { metersOffPlanned: 150, metersToDestination: 900, now: 0 })
    expect(d.ask).toBe(false)
  })

  it('asks once the trip is far from the planned road', () => {
    const d = nextFarOffRouteDecision(FAR_OFF_ROUTE_START, { metersOffPlanned: 620, metersToDestination: 900, now: 0 })
    expect(d.ask).toBe(true)
    expect(d.reason).toBe('far')
  })

  it('asks only once per trip', () => {
    const first = nextFarOffRouteDecision(FAR_OFF_ROUTE_START, { metersOffPlanned: 620, metersToDestination: 900, now: 0 })
    const again = nextFarOffRouteDecision(first, { metersOffPlanned: 900, metersToDestination: 1200, now: 5000 })
    expect(again.ask).toBe(false)
  })

  it('asks when the trip keeps getting further from the destination for minutes', () => {
    let s = nextFarOffRouteDecision(FAR_OFF_ROUTE_START, { metersOffPlanned: 100, metersToDestination: 800, now: 0 })
    s = nextFarOffRouteDecision(s, { metersOffPlanned: 120, metersToDestination: 1000, now: MOVING_AWAY_MS - 1000 })
    expect(s.ask).toBe(false)
    s = nextFarOffRouteDecision(s, { metersOffPlanned: 130, metersToDestination: 1100, now: MOVING_AWAY_MS + 1000 })
    expect(s.ask).toBe(true)
    expect(s.reason).toBe('away')
  })

  it('does not count waiting in traffic as moving away', () => {
    let s = nextFarOffRouteDecision(FAR_OFF_ROUTE_START, { metersOffPlanned: 0, metersToDestination: 800, now: 0 })
    s = nextFarOffRouteDecision(s, { metersOffPlanned: 0, metersToDestination: 810, now: MOVING_AWAY_MS * 3 })
    expect(s.ask).toBe(false)
  })
})
