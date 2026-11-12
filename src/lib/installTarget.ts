// Which way this device can keep the app, if any.
//
// Two phones, two different answers, and neither is a preference: an iPhone
// cannot install an APK and never will, and Android's home-screen shortcut is
// redundant once the real app exists. So the question is not "should we offer
// an install" but "which install does this device actually have".
//
// Kept apart from the components that use it so the rules can be tested
// directly. They are user-agent sniffing, which is guesswork by nature —
// iPadOS 13 and later report themselves as a Mac, in-app browsers lie about
// several things — and guesswork that nothing checks tends to rot.
import { isNativeApp } from './platform'

// The build number rides along (2026-09-24): Android and the browser both
// cache a downloaded APK happily, and without this a phone that installed an
// older build could be handed that same file again from its own cache.
export const APK_PATH = `/TODARideMobility.apk?v=${__BUILD_CODE__}`

interface DeviceFacts {
  userAgent: string
  maxTouchPoints: number
  // iOS Safari's own flag for "launched from the Home screen".
  standalone?: boolean
  displayModeStandalone: boolean
  native: boolean
}

function currentDevice(): DeviceFacts {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') {
    return { userAgent: '', maxTouchPoints: 0, displayModeStandalone: false, native: false }
  }
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalone: (navigator as { standalone?: boolean }).standalone,
    displayModeStandalone: window.matchMedia('(display-mode: standalone)').matches,
    native: isNativeApp(),
  }
}

// Already kept, in either sense: launched from the installed APK, or from an
// iOS home-screen shortcut, which runs standalone. Neither has anything left
// to install, and offering it again would be the app failing to notice.
export function alreadyInstalled(device: DeviceFacts = currentDevice()): boolean {
  return device.native || device.standalone === true || device.displayModeStandalone
}

// iPhone and iPad. iPadOS 13 and later identify as a Mac, and the only thing
// separating them from a real Mac in a user agent string is that they answer
// to touch — so the touch count is part of the test rather than a nicety.
export function canAddToHomeScreen(device: DeviceFacts = currentDevice()): boolean {
  if (alreadyInstalled(device)) return false
  if (/iPad|iPhone|iPod/.test(device.userAgent)) return true
  return /Macintosh/.test(device.userAgent) && device.maxTouchPoints > 1
}

export function canUseApk(device: DeviceFacts = currentDevice()): boolean {
  if (alreadyInstalled(device)) return false
  return /Android/i.test(device.userAgent)
}

// An iPad, including the ones that claim to be a Mac. iPadOS 13 and later
// report a Macintosh user agent, and the only thing separating them from a
// real Mac in that string is that they answer to touch.
export function isIpad(device: DeviceFacts = currentDevice()): boolean {
  if (/iPad/.test(device.userAgent)) return true
  return /Macintosh/.test(device.userAgent) && device.maxTouchPoints > 1
}

// Which end of Safari the Share button sits at, which is not the same on
// both devices: the iPhone keeps its toolbar at the bottom of the screen,
// the iPad puts it along the top. Telling an iPad owner to look at the
// bottom sends them hunting in the wrong half of the screen — and the
// install check has always counted iPads, so that was half this audience.
export type SharePlacement = 'bottom' | 'top-right'

export function shareButtonPlacement(device: DeviceFacts = currentDevice()): SharePlacement {
  return isIpad(device) ? 'top-right' : 'bottom'
}

// ── whether to put the iPhone guide in front of somebody ─────────────────
//
// Apple does not let a website install itself. The three taps have to be
// made by hand, which means the only thing this app can do is show them
// clearly and at a moment the person can act on — and then stop asking.
//
// The guide itself has been in the app for a while (see ScanArrivalChoice)
// but only ever appeared for somebody who arrived by scanning a terminal QR
// code. A customer who tapped a merchant's shared link on an iPhone — which
// is most of them — never learned the app could live on their home screen.
// This is the rule that opens it up, with the four reasons not to.
export const INSTALL_GUIDE_DISMISSED_KEY = 'toda-install-guide-dismissed'

export interface InstallGuideContext {
  // iPhone or iPad, and not already running from the home screen.
  canAddToHomeScreen: boolean
  // They have closed it before. Asked once is an offer; asked twice is
  // nagging, and nagging on a booking screen is worse than nagging.
  dismissed: boolean
  // A ride or order this device is in the middle of. Nothing covers the
  // screen while somebody is waiting for a rider — same rule the update
  // sheet follows (see useHasMyOwnTripInFlight).
  tripInFlight: boolean
  // A driver's phone. An iPhone home-screen app gets no background
  // location, so a driver who installed it instead of the real app would
  // lose trip tracking the moment the screen locked. Drivers are pointed at
  // the APK and are never shown this.
  isDriver: boolean
}

export function shouldOfferInstallGuide(context: InstallGuideContext): boolean {
  if (!context.canAddToHomeScreen) return false
  if (context.dismissed) return false
  if (context.tripInFlight) return false
  if (context.isDriver) return false
  return true
}

// Reading the flag is its own function because storage throws in private
// mode on older iOS — the exact browser this feature is for. A phone that
// cannot remember the dismissal is treated as having dismissed it: better a
// passenger who is never offered the guide than one offered it every visit.
export function installGuideDismissed(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): boolean {
  if (!storage) return true
  try {
    return storage.getItem(INSTALL_GUIDE_DISMISSED_KEY) === '1'
  } catch {
    return true
  }
}

export function rememberInstallGuideDismissed(storage: Pick<Storage, 'setItem'> | undefined = safeStorage()): void {
  try {
    storage?.setItem(INSTALL_GUIDE_DISMISSED_KEY, '1')
  } catch {
    // Nothing to do: the guide simply offers itself again next visit, which
    // is the lesser failure.
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

export type { DeviceFacts }
