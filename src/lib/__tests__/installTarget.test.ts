import { describe, expect, it } from 'vitest'
import { alreadyInstalled, canAddToHomeScreen, canUseApk, type DeviceFacts } from '../installTarget'

const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36'
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPADOS =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const MAC = IPADOS
const WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'

function device(overrides: Partial<DeviceFacts> = {}): DeviceFacts {
  return {
    userAgent: '',
    maxTouchPoints: 0,
    displayModeStandalone: false,
    native: false,
    ...overrides,
  }
}

describe('which install this device can take', () => {
  it('offers the APK to Android and nothing else', () => {
    expect(canUseApk(device({ userAgent: ANDROID }))).toBe(true)
    expect(canUseApk(device({ userAgent: IPHONE }))).toBe(false)
    expect(canUseApk(device({ userAgent: WINDOWS }))).toBe(false)
  })

  it('offers Add to Home Screen to iPhone, not to Android', () => {
    expect(canAddToHomeScreen(device({ userAgent: IPHONE }))).toBe(true)
    expect(canAddToHomeScreen(device({ userAgent: ANDROID }))).toBe(false)
  })

  // The case that makes this worth testing rather than eyeballing: an iPad
  // and a Mac send the same user agent, and only the touch count separates
  // them. Get this wrong and either every iPad is told nothing, or every Mac
  // is walked through a Share sheet it does not have.
  it('tells an iPad apart from a Mac by touch', () => {
    expect(canAddToHomeScreen(device({ userAgent: IPADOS, maxTouchPoints: 5 }))).toBe(true)
    expect(canAddToHomeScreen(device({ userAgent: MAC, maxTouchPoints: 0 }))).toBe(false)
  })

  it('offers nothing on a desktop browser', () => {
    const win = device({ userAgent: WINDOWS })
    expect(canUseApk(win)).toBe(false)
    expect(canAddToHomeScreen(win)).toBe(false)
  })

  it('offers nothing once the app is already kept', () => {
    // Inside the APK.
    expect(canUseApk(device({ userAgent: ANDROID, native: true }))).toBe(false)
    // Launched from an iOS home-screen shortcut, by either signal.
    expect(canAddToHomeScreen(device({ userAgent: IPHONE, standalone: true }))).toBe(false)
    expect(canAddToHomeScreen(device({ userAgent: IPHONE, displayModeStandalone: true }))).toBe(false)
    expect(alreadyInstalled(device({ native: true }))).toBe(true)
  })

  it('offers nothing when there is no device to read', () => {
    expect(canUseApk(device())).toBe(false)
    expect(canAddToHomeScreen(device())).toBe(false)
  })
})
