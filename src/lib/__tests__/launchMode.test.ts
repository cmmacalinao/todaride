import { describe, it, expect } from 'vitest'
import { launchModeLeavesNoDrivers, showsPrototypeBadge, visibleDrivers } from '../launchMode'

const SEEDS = new Set(['drv-uts-01', 'drv-uts-02', 'drv-uts-03'])
const seed = (id: string) => ({ id })
const real = { id: 'drv-real-edward' }

describe('visibleDrivers', () => {
  it('changes nothing while launch mode is off', () => {
    // Every demo and every test depends on the prototype behaving exactly as
    // it always has.
    const all = [seed('drv-uts-01'), real]
    expect(visibleDrivers(all, SEEDS, false)).toEqual(all)
  })

  it('hides the seeded drivers in launch mode', () => {
    const out = visibleDrivers([seed('drv-uts-01'), seed('drv-uts-02'), real], SEEDS, true)
    expect(out).toEqual([real])
  })

  it('keeps a real driver whose id merely looks seeded', () => {
    const lookalike = { id: 'drv-uts-99' }
    expect(visibleDrivers([lookalike], SEEDS, true)).toEqual([lookalike])
  })

  it('does not mutate the list it was given', () => {
    const all = [seed('drv-uts-01'), real]
    visibleDrivers(all, SEEDS, true)
    expect(all).toHaveLength(2)
  })
})

describe('showsPrototypeBadge', () => {
  it('hides the badge in launch mode and shows it otherwise', () => {
    expect(showsPrototypeBadge(true)).toBe(false)
    expect(showsPrototypeBadge(false)).toBe(true)
  })
})

describe('launchModeLeavesNoDrivers', () => {
  // The one thing this switch must never do quietly: hide every driver, so a
  // real passenger gets silence and nobody can see why.
  it('warns when hiding the seeds leaves nobody', () => {
    expect(launchModeLeavesNoDrivers([seed('drv-uts-01'), seed('drv-uts-02')], SEEDS, true)).toBe(true)
  })

  it('is quiet when a real driver remains', () => {
    expect(launchModeLeavesNoDrivers([seed('drv-uts-01'), real], SEEDS, true)).toBe(false)
  })

  it('is quiet while launch mode is off', () => {
    expect(launchModeLeavesNoDrivers([seed('drv-uts-01')], SEEDS, false)).toBe(false)
  })

  it('does not warn about an empty roster, which is a different problem', () => {
    expect(launchModeLeavesNoDrivers([], SEEDS, true)).toBe(false)
  })
})
