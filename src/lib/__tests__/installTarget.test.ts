import {
  describe,
  expect,
  it } from 'vitest'
import { alreadyInstalled,
  canAddToHomeScreen,
  canUseApk,
  type DeviceFacts,
  shouldOfferInstallGuide,
  installGuideDismissed,
  rememberInstallGuideDismissed,
  isIpad,
  shareButtonPlacement,
} from '../installTarget'

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

describe('whether to put the iPhone guide in front of somebody', () => {
  const iphone = {
    canAddToHomeScreen: true,
    dismissed: false,
    tripInFlight: false,
    isDriver: false,
  }

  it('offers it to an iPhone that has not got the app', () => {
    expect(shouldOfferInstallGuide(iphone)).toBe(true)
  })

  it('never offers it on a device that cannot add to a home screen', () => {
    expect(shouldOfferInstallGuide({ ...iphone, canAddToHomeScreen: false })).toBe(false)
  })

  it('asks once, not every visit', () => {
    expect(shouldOfferInstallGuide({ ...iphone, dismissed: true })).toBe(false)
  })

  it('does not cover the screen while a trip is in flight', () => {
    // Somebody waiting for a rider is watching the map, not shopping for an
    // app. Same rule the update sheet follows.
    expect(shouldOfferInstallGuide({ ...iphone, tripInFlight: true })).toBe(false)
  })

  it('never offers it to a driver', () => {
    // An iPhone home-screen app gets no background location, so a driver who
    // took this instead of the real app would lose trip tracking the moment
    // the screen locked.
    expect(shouldOfferInstallGuide({ ...iphone, isDriver: true })).toBe(false)
  })
})

describe('remembering that it was closed', () => {
  function fakeStorage(initial: Record<string, string> = {}) {
    const map = new Map(Object.entries(initial))
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      read: () => Object.fromEntries(map),
    }
  }

  it('is not dismissed before anybody has closed it', () => {
    expect(installGuideDismissed(fakeStorage())).toBe(false)
  })

  it('is dismissed once closed', () => {
    const storage = fakeStorage()
    rememberInstallGuideDismissed(storage)
    expect(installGuideDismissed(storage)).toBe(true)
  })

  it('treats a storage that throws as dismissed, rather than asking forever', () => {
    // Private browsing on older iOS — the exact browser this is for. Never
    // offering beats offering on every single visit.
    const throwing = {
      getItem() {
        throw new Error('denied')
      },
    }
    expect(installGuideDismissed(throwing)).toBe(true)
    expect(installGuideDismissed(undefined)).toBe(true)
  })
})

describe('which end of Safari the Share button is on', () => {
  const iphone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Safari/604.1', maxTouchPoints: 5, displayModeStandalone: false, native: false }
  const ipad = { userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) Safari/604.1', maxTouchPoints: 5, displayModeStandalone: false, native: false }
  // iPadOS 13 and later report themselves as a Mac; touch is what gives it away.
  const ipadPretendingToBeAMac = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', maxTouchPoints: 5, displayModeStandalone: false, native: false }
  const realMac = { ...ipadPretendingToBeAMac, maxTouchPoints: 0 }

  it('is the bottom toolbar on an iPhone', () => {
    expect(shareButtonPlacement(iphone)).toBe('bottom')
    expect(isIpad(iphone)).toBe(false)
  })

  it('is the top of the screen on an iPad', () => {
    // Telling an iPad owner to look at the bottom sends them hunting in the
    // wrong half of the screen, and the install guide counts iPads.
    expect(shareButtonPlacement(ipad)).toBe('top-right')
    expect(shareButtonPlacement(ipadPretendingToBeAMac)).toBe('top-right')
  })

  it('does not mistake a real Mac for an iPad', () => {
    expect(isIpad(realMac)).toBe(false)
  })
})
