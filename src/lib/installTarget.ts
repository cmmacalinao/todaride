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

export const APK_PATH = '/TodaSafeRide.apk'

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

export type { DeviceFacts }
