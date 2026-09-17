import { describe, expect, it } from 'vitest'
import {
  REUNION_METERS,
  SEPARATION_METERS,
  SEPARATION_STREAK,
  isApart,
  positionAt,
  nextSeparationDecision,
  type SeparationState,
} from '../separation'
import type { GeoCoords } from '../../types'

const HERE: GeoCoords = { lat: 15.7333, lng: 120.9314 }

// Roughly north by `meters`. One degree of latitude is about 111,320 m
// everywhere, so this is accurate enough for thresholds measured in metres.
function north(from: GeoCoords, meters: number): GeoCoords {
  return { lat: from.lat + meters / 111320, lng: from.lng }
}

const fresh: SeparationState = { apartCount: 0, asked: false }

function run(distances: number[], from: SeparationState = fresh) {
  let state = from
  const decisions = distances.map((m) => {
    const d = nextSeparationDecision(HERE, north(HERE, m), state)
    state = { apartCount: d.apartCount, asked: d.asked }
    return d
  })
  return { decisions, state }
}

describe('nextSeparationDecision', () => {
  it('says nothing while the two are together', () => {
    const { decisions } = run([0, 2, 5, 3])
    expect(decisions.every((d) => !d.separated)).toBe(true)
    expect(decisions.every((d) => d.apartCount === 0)).toBe(true)
  })

  // The whole point of the streak. Ten metres is inside ordinary GPS noise, so
  // a single reading past it must not put a dialog on anybody's screen.
  it('does not fire on one reading past the threshold', () => {
    const { decisions } = run([1, 40, 1])
    expect(decisions.map((d) => d.separated)).toEqual([false, false, false])
  })

  it('fires once the readings agree for the whole streak', () => {
    const { decisions } = run(Array(SEPARATION_STREAK).fill(40))
    expect(decisions[decisions.length - 1].separated).toBe(true)
    expect(decisions.slice(0, -1).every((d) => !d.separated)).toBe(true)
  })

  it('asks only once, however far apart they then get', () => {
    const { decisions } = run([40, 40, 40, 60, 200, 900])
    expect(decisions.filter((d) => d.separated)).toHaveLength(1)
  })

  it('forgets the streak the moment they are back together', () => {
    const { decisions } = run([40, 40, 1, 40, 40])
    expect(decisions.every((d) => !d.separated)).toBe(true)
    expect(decisions[decisions.length - 1].apartCount).toBe(2)
  })

  // Between the two thresholds is "cannot tell". Holding the count there is
  // what stops a reading sitting on the line from ratcheting to a prompt.
  it('neither counts nor clears while hovering between the thresholds', () => {
    const between = (REUNION_METERS + SEPARATION_METERS) / 2
    const { decisions } = run([40, between, between, between])
    expect(decisions.every((d) => !d.separated)).toBe(true)
    expect(decisions[decisions.length - 1].apartCount).toBe(1)
  })

  it('treats a missing fix as unknown rather than as parted', () => {
    const state = { apartCount: SEPARATION_STREAK - 1, asked: false }
    expect(nextSeparationDecision(null, HERE, state).separated).toBe(false)
    expect(nextSeparationDecision(HERE, undefined, state).separated).toBe(false)
    expect(nextSeparationDecision(null, HERE, state).metersApart).toBeNull()
  })

  it('reports how far apart they are, for the message that gets shown', () => {
    const d = nextSeparationDecision(HERE, north(HERE, 50), fresh)
    expect(d.metersApart).toBeGreaterThan(45)
    expect(d.metersApart).toBeLessThan(55)
  })
})

describe('positionAt', () => {
  const a = { lat: 15.73, lng: 120.93 }
  const b = { lat: 15.731, lng: 120.93 }
  const history = [
    { at: 1000, gps: a },
    { at: 11000, gps: b },
  ]

  it('picks the kept position nearest the moment asked about', () => {
    expect(positionAt(history, 2000)).toEqual(a)
    expect(positionAt(history, 10500)).toEqual(b)
  })

  it('says nothing when no kept position is close enough in time', () => {
    expect(positionAt(history, 6000)).toBeNull()
    expect(positionAt([], 1000)).toBeNull()
  })
})

describe('isApart', () => {
  it('holds from the streak until they come back together', () => {
    expect(isApart({ apartCount: 2, asked: false })).toBe(false)
    expect(isApart({ apartCount: 3, asked: true })).toBe(true)
    expect(isApart({ apartCount: 0, asked: true })).toBe(false)
  })
})
