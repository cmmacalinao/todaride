import { describe, it, expect } from 'vitest'
import { parseStoredFailure, shouldWarnDriver, trackingReadiness } from '../driverTrackingReadiness'

const base = { native: true, notifications: 'granted' as const, serviceError: null }

describe('trackingReadiness', () => {
  it('says nothing when the phone is ready', () => {
    const r = trackingReadiness(base)
    expect(r.status).toBe('ok')
    expect(shouldWarnDriver(r)).toBe(false)
  })

  it('says nothing on a phone too old to have the permission', () => {
    // Below Android 13 the notification needs no grant, and checkPermissions
    // has nothing to report. Silence is correct: a banner that shows when
    // everything is fine is one drivers learn to ignore when it is not.
    const r = trackingReadiness({ ...base, notifications: 'unknown' })
    expect(r.status).toBe('ok')
    expect(shouldWarnDriver(r)).toBe(false)
  })

  it('warns, and offers Settings, when notifications are refused', () => {
    const r = trackingReadiness({ ...base, notifications: 'denied' })
    expect(r.status).toBe('blocked')
    expect(r.offerSettings).toBe(true)
    expect(shouldWarnDriver(r)).toBe(true)
  })

  it('tells the driver to expect the prompt rather than sending them to Settings', () => {
    // Nothing is wrong yet — Android simply has not asked. Sending someone
    // to Settings for a permission they are about to be offered is a
    // detour.
    for (const state of ['prompt', 'prompt-with-rationale'] as const) {
      const r = trackingReadiness({ ...base, notifications: state })
      expect(r.status).toBe('will-ask')
      expect(r.offerSettings).toBe(false)
      expect(shouldWarnDriver(r)).toBe(true)
    }
  })

  it('believes the service over the permission check', () => {
    // Background location ("Allow all the time") is a separate switch that
    // Android will not report through checkPermissions, so a phone can read
    // as fully granted and still refuse to start the service. When the two
    // disagree, what actually happened wins.
    const r = trackingReadiness({
      ...base,
      notifications: 'granted',
      serviceError: 'Background location is off for this app.',
    })
    expect(r.status).toBe('blocked')
    expect(r.detail).toContain('Background location is off')
    expect(r.offerSettings).toBe(true)
  })

  it('repeats what the service said rather than guessing at it', () => {
    const r = trackingReadiness({ ...base, serviceError: 'Something specific went wrong' })
    expect(r.detail).toBe('Something specific went wrong')
  })

  it('tells a website driver the truth instead of offering a fix', () => {
    // No permission grant makes a browser tab track in the background, so
    // there is nowhere useful to send them.
    const r = trackingReadiness({ ...base, native: false })
    expect(r.status).toBe('screen-on-only')
    expect(r.offerSettings).toBe(false)
    // Shown, but in the quiet style: nothing is broken and nothing can be
    // granted, yet the driver is still about to lose their passenger when
    // the screen sleeps.
    expect(shouldWarnDriver(r)).toBe(true)
  })

  it('does not let a web page claim it is blocked on a permission', () => {
    // Even with a service error recorded, the web answer is about the
    // platform, not a switch the driver can flip.
    const r = trackingReadiness({ native: false, notifications: 'denied', serviceError: 'boom' })
    expect(r.status).toBe('screen-on-only')
  })
})

describe('parseStoredFailure', () => {
  const NOW = 1_700_000_000_000
  const stored = (message: string, at: number) => JSON.stringify({ message, at })

  it('returns a recent failure', () => {
    expect(parseStoredFailure(stored('Background location is off', NOW - 60_000), NOW)).toBe('Background location is off')
  })

  it('forgets one that is older than the window', () => {
    // A permission fixed yesterday should not still be complained about.
    expect(parseStoredFailure(stored('old', NOW - 13 * 60 * 60 * 1000), NOW)).toBeNull()
  })

  it('has nothing to say when nothing was stored', () => {
    expect(parseStoredFailure(null, NOW)).toBeNull()
  })

  it('ignores a value it cannot read rather than showing nonsense', () => {
    // Someone else's key, or a half-written entry. On a safety screen,
    // saying nothing beats saying rubbish.
    expect(parseStoredFailure('not json', NOW)).toBeNull()
    expect(parseStoredFailure(JSON.stringify({ at: NOW }), NOW)).toBeNull()
    expect(parseStoredFailure(JSON.stringify({ message: 'x' }), NOW)).toBeNull()
    expect(parseStoredFailure(JSON.stringify({ message: '', at: NOW }), NOW)).toBeNull()
  })

  it('does not let a backwards clock make a failure immortal', () => {
    expect(parseStoredFailure(stored('future', NOW + 60_000), NOW)).toBeNull()
  })
})
