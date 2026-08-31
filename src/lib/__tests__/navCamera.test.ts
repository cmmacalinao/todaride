import { describe, expect, it } from 'vitest'
import {
  BEARING_DEADBAND_DEGREES,
  BEARING_SMOOTHING,
  MIN_ROTATE_SPEED_MPS,
  NAV_PITCH_DEGREES,
  nextNavCamera,
  normalizeDegrees,
  shortestTurn,
} from '../navCamera'

// Runs a list of (heading, speed) readings through the camera the way the
// component does, so a whole stretch of road can be asserted on rather than
// one tick at a time.
function run(readings: { heading: number | null; speedMps: number | null }[], enabled = true) {
  let bearing: number | null = null
  return readings.map((r) => {
    const state = nextNavCamera({ ...r, previousBearing: bearing, enabled })
    bearing = state.headingUp ? state.bearing : null
    return state
  })
}

describe('shortestTurn', () => {
  it('takes the short way round north', () => {
    expect(shortestTurn(350, 10)).toBe(20)
    expect(shortestTurn(10, 350)).toBe(-20)
  })

  it('never returns more than half a circle', () => {
    for (let from = 0; from < 360; from += 17) {
      for (let to = 0; to < 360; to += 23) {
        expect(Math.abs(shortestTurn(from, to))).toBeLessThanOrEqual(180)
      }
    }
  })

  it('normalizes negative and over-wound inputs', () => {
    expect(normalizeDegrees(-90)).toBe(270)
    expect(normalizeDegrees(450)).toBe(90)
  })
})

describe('nextNavCamera', () => {
  it('sits flat and north-up when heading-up is switched off', () => {
    const state = nextNavCamera({ heading: 120, speedMps: 8, previousBearing: 40, enabled: false })
    expect(state).toEqual({ bearing: 0, pitch: 0, headingUp: false })
  })

  it('stays flat until the first usable fix', () => {
    const state = nextNavCamera({ heading: null, speedMps: null, previousBearing: null, enabled: true })
    expect(state.headingUp).toBe(false)
    expect(state.pitch).toBe(0)
  })

  it('jumps straight to the first usable heading instead of easing from north', () => {
    const state = nextNavCamera({ heading: 200, speedMps: 6, previousBearing: null, enabled: true })
    expect(state.bearing).toBe(200)
    expect(state.pitch).toBe(NAV_PITCH_DEGREES)
    expect(state.headingUp).toBe(true)
  })

  // The reason MIN_ROTATE_SPEED_MPS exists: a phone held still reports a
  // heading that wanders the full circle, and a map that follows it is
  // unusable. Waiting at a rank must not spin the map.
  it('holds the bearing while stopped, however wildly the heading swings', () => {
    const parked = [10, 300, 95, 180, 42, 260].map((heading) => ({ heading, speedMps: 0.2 }))
    const states = run([{ heading: 90, speedMps: 7 }, ...parked])
    expect(states[0].bearing).toBe(90)
    states.slice(1).forEach((s) => {
      expect(s.bearing).toBe(90)
      expect(s.headingUp).toBe(true)
    })
  })

  it('treats exactly the threshold speed as moving', () => {
    const state = nextNavCamera({
      heading: 45,
      speedMps: MIN_ROTATE_SPEED_MPS,
      previousBearing: 45,
      enabled: true,
    })
    expect(state.headingUp).toBe(true)
  })

  it('holds rather than snapping north when the device stops reporting a heading', () => {
    const states = run([
      { heading: 270, speedMps: 9 },
      { heading: null, speedMps: 9 },
      { heading: null, speedMps: 9 },
    ])
    expect(states.map((s) => s.bearing)).toEqual([270, 270, 270])
  })

  it('ignores wobble smaller than the deadband', () => {
    const states = run([
      { heading: 100, speedMps: 8 },
      { heading: 102, speedMps: 8 },
      { heading: 98, speedMps: 8 },
    ])
    expect(states.map((s) => s.bearing)).toEqual([100, 100, 100])
  })

  it('eases into a corner instead of snapping through it', () => {
    const states = run([
      { heading: 0, speedMps: 8 },
      { heading: 90, speedMps: 8 },
      { heading: 90, speedMps: 8 },
      { heading: 90, speedMps: 8 },
    ])
    expect(states[1].bearing).toBeCloseTo(90 * BEARING_SMOOTHING, 5)
    // Monotonic, and closing on the target rather than overshooting past it.
    expect(states[2].bearing).toBeGreaterThan(states[1].bearing)
    expect(states[3].bearing).toBeGreaterThan(states[2].bearing)
    states.forEach((s) => expect(s.bearing).toBeLessThanOrEqual(90))
  })

  // It closes to within the deadband and then stops, which is the intended
  // resting state: a permanent offset of up to three degrees is invisible on
  // a phone, and chasing it would mean redrawing the map forever.
  it('closes on a steady heading within a few seconds and then holds', () => {
    const straight = Array.from({ length: 12 }, () => ({ heading: 90, speedMps: 8 }))
    const states = run([{ heading: 0, speedMps: 8 }, ...straight])
    const settled = states.slice(-4).map((s) => s.bearing)
    settled.forEach((b) => expect(Math.abs(shortestTurn(b, 90))).toBeLessThan(BEARING_DEADBAND_DEGREES))
    expect(new Set(settled).size).toBe(1)
  })

  // A turn from 350° to 10° is 20° to the right. Interpolating on the raw
  // numbers instead sends the camera 340° the other way — the map spinning
  // almost a full circle for a slight bend is the classic version of this bug.
  it('turns the short way through north', () => {
    const state = nextNavCamera({ heading: 10, speedMps: 8, previousBearing: 350, enabled: true })
    expect(state.bearing).toBeCloseTo(normalizeDegrees(350 + 20 * BEARING_SMOOTHING), 5)
    expect(state.bearing).toBeGreaterThan(350)
  })

  it('keeps the bearing inside one turn of the compass', () => {
    let bearing: number | null = null
    for (let i = 0; i < 400; i++) {
      const state = nextNavCamera({
        heading: (i * 37) % 360,
        speedMps: 8,
        previousBearing: bearing,
        enabled: true,
      })
      bearing = state.bearing
      expect(state.bearing).toBeGreaterThanOrEqual(0)
      expect(state.bearing).toBeLessThan(360)
    }
  })
})
