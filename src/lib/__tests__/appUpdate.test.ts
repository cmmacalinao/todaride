import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkForAppUpdate, installedBuildCode, isUpdateSnoozed, snoozeUpdate } from '../appUpdate'
import { PILOT_ORIGIN } from '../pilotOrigin'

// How the installed app decides whether to say "may bagong bersyon".
//
// The only number that matters is versionCode — the one Android itself reads
// to decide whether an install is an upgrade — compared between the build
// this bundle was compiled with and the one the website is handing out.

// Whether we are inside the APK. Flipped per test; the real check reads the
// Capacitor bridge, which does not exist here.
let native = true
vi.mock('../platform', () => ({ isNativeApp: () => native }))

// What the website answers. Each test sets it.
type Answer = { ok?: boolean; body?: unknown; throws?: boolean }
let answer: Answer = {}
const calls: { url: string; init?: RequestInit }[] = []

function fakeFetch(url: string, init?: RequestInit): Promise<Response> {
  calls.push({ url, init })
  if (answer.throws) return Promise.reject(new Error('offline'))
  return Promise.resolve({
    ok: answer.ok ?? true,
    json: () => Promise.resolve(answer.body),
  } as Response)
}

// A localStorage for node: the real one is absent here, and the snooze code
// treats a missing one as "never snoozed" — which is correct on a phone that
// refuses storage, but would make these tests pass for the wrong reason.
function fakeStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  }
}

// The build this bundle was compiled with, as the test sees it. vite's define
// writes the real versionCode in at transform time, so it is whatever
// build.gradle says today; the tests read it rather than assume it.
const mine = installedBuildCode()

beforeEach(() => {
  native = true
  answer = {}
  calls.length = 0
  vi.stubGlobal('fetch', fakeFetch)
  vi.stubGlobal('localStorage', fakeStorage())
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('deciding whether a newer APK exists', () => {
  it('knows which build it is', () => {
    // If this is 0 the check would never ask, silently. Worth failing loudly.
    expect(mine).toBeGreaterThan(0)
  })

  it('offers the update when the website has a higher versionCode', async () => {
    answer = { body: { versionCode: mine + 1, versionName: '5B.9', apkUrl: '/TodaSafeRide.apk', notes: '  Map fixes  ' } }
    const u = await checkForAppUpdate()
    expect(u).not.toBeNull()
    expect(u?.versionCode).toBe(mine + 1)
    expect(u?.versionName).toBe('5B.9')
    expect(u?.required).toBe(false)
    expect(u?.notes).toBe('Map fixes')
  })

  it('resolves the download against the pilot origin, never the app\'s own', async () => {
    // Inside the APK "own origin" is https://localhost, which serves nothing.
    answer = { body: { versionCode: mine + 1, versionName: '5B.9', apkUrl: '/TodaSafeRide.apk' } }
    const u = await checkForAppUpdate()
    expect(u?.apkUrl).toBe(`${PILOT_ORIGIN}/TodaSafeRide.apk`)
  })

  it('falls back to the standard APK path when none is given', async () => {
    answer = { body: { versionCode: mine + 1, versionName: '5B.9' } }
    expect((await checkForAppUpdate())?.apkUrl).toBe(`${PILOT_ORIGIN}/TodaSafeRide.apk`)
  })

  it('says nothing when the phone is already on the current build', async () => {
    answer = { body: { versionCode: mine, versionName: '5B.6' } }
    expect(await checkForAppUpdate()).toBeNull()
  })

  it('never offers a downgrade', async () => {
    // A stale app-version.json — a deploy that went out without the APK —
    // must not send a newer phone backwards.
    answer = { body: { versionCode: mine - 1, versionName: '5B.5' } }
    expect(await checkForAppUpdate()).toBeNull()
  })

  it('carries the required flag through', async () => {
    answer = { body: { versionCode: mine + 1, versionName: '5B.9', required: true } }
    expect((await checkForAppUpdate())?.required).toBe(true)
  })

  it('treats anything but a literal true as not required', async () => {
    answer = { body: { versionCode: mine + 1, versionName: '5B.9', required: 'yes' } }
    expect((await checkForAppUpdate())?.required).toBe(false)
  })

  it('stays quiet on a website it cannot understand', async () => {
    for (const body of [null, 'text', {}, { versionCode: 'nine', versionName: '5B.9' }, { versionCode: mine + 1 }]) {
      answer = { body }
      expect(await checkForAppUpdate()).toBeNull()
    }
  })

  it('stays quiet when the website errors or the phone is offline', async () => {
    answer = { ok: false, body: { versionCode: mine + 1, versionName: '5B.9' } }
    expect(await checkForAppUpdate()).toBeNull()
    answer = { throws: true }
    expect(await checkForAppUpdate()).toBeNull()
  })

  it('does not ask at all from a browser', async () => {
    // The website updates itself through the service worker, and an APK is
    // meaningless on an iPhone.
    native = false
    answer = { body: { versionCode: mine + 1, versionName: '5B.9' } }
    expect(await checkForAppUpdate()).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it('refuses a cached answer', async () => {
    // A cached copy of this file is, by definition, the old version saying
    // there is nothing new. Belt and braces: a no-store request and a nonce.
    answer = { body: { versionCode: mine, versionName: '5B.6' } }
    await checkForAppUpdate()
    expect(calls).toHaveLength(1)
    expect(calls[0].url.startsWith(`${PILOT_ORIGIN}/app-version.json?t=`)).toBe(true)
    expect(calls[0].init?.cache).toBe('no-store')
  })
})

describe('"mamaya na"', () => {
  it('is honoured for the build it was said to', () => {
    expect(isUpdateSnoozed(12)).toBe(false)
    snoozeUpdate(12)
    expect(isUpdateSnoozed(12)).toBe(true)
  })

  it('does not silence a newer build', () => {
    snoozeUpdate(12)
    expect(isUpdateSnoozed(13)).toBe(false)
  })

  it('wears off after a day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-03T08:00:00Z'))
    snoozeUpdate(12)
    vi.setSystemTime(new Date('2026-09-04T07:59:00Z'))
    expect(isUpdateSnoozed(12)).toBe(true)
    vi.setSystemTime(new Date('2026-09-04T08:01:00Z'))
    expect(isUpdateSnoozed(12)).toBe(false)
  })

  it('survives a phone that refuses storage', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(() => snoozeUpdate(12)).not.toThrow()
    expect(isUpdateSnoozed(12)).toBe(false)
  })
})
