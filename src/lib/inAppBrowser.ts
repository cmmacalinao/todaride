// Whether the app is running inside another app's embedded browser —
// Messenger, Facebook, Instagram, TikTok — rather than in Chrome or Safari.
//
// This matters because those browsers routinely refuse geolocation. The
// request either never prompts or is denied without a visible message, so the
// page looks broken in one specific way: everything works except finding
// where you are. Two of our pilot testers hit exactly that, having opened the
// link from a Messenger thread, and nothing on screen could tell them why.
//
// Detection is by user-agent, which is guesswork by nature — these strings
// are set by the host app and change without notice. So it is only ever used
// to offer advice, never to block anything: a false positive costs a line of
// text that does not apply, and a false negative leaves things exactly as
// they were.
const IN_APP_MARKERS = [
  'fban', // Facebook for iOS
  'fbav', // Facebook for Android
  'fb_iab', // Facebook in-app browser
  'messenger',
  'instagram',
  'line/',
  'tiktok',
  'micromessenger', // WeChat
]

export function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent.toLowerCase()
  return IN_APP_MARKERS.some((marker) => ua.includes(marker))
}

// iOS and Android hide the "open this properly" control in different places,
// and telling someone to look in the wrong one is worse than saying nothing.
export function openInBrowserHint(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  const isIos = /iPad|iPhone|iPod/.test(ua)
  return isIos
    ? 'Tap ••• at the bottom right, then "Open in Safari".'
    : 'Tap ⋮ at the top right, then "Open in Chrome" or "Open in browser".'
}
