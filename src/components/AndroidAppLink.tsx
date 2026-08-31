import { isNativeApp } from '../lib/platform'

// One definition of "can this phone use the APK, and where is it".
//
// The offer started life only on the landing page, which quietly meant only
// signed-out visitors ever saw it — and anyone who has used the pilot before
// arrives already signed in, straight onto their own screen. The person most
// likely to want the app was the one guaranteed not to be offered it.
export const APK_PATH = '/TodaSafeRide.apk'

export function canUseApk(): boolean {
  if (isNativeApp()) return false // already in it
  if (typeof navigator === 'undefined') return false
  return /Android/i.test(navigator.userAgent)
}

// The menu row, so the offer is reachable from any screen in either menu
// rather than only from the bottom of the landing page.
export function AndroidAppMenuRow({ onNavigate }: { onNavigate?: () => void }) {
  if (!canUseApk()) return null
  return (
    <a
      href={APK_PATH}
      download
      onClick={onNavigate}
      className="flex w-full items-center gap-2 rounded-lg border-2 border-gold-400 bg-gold-50 px-3 py-2 text-left transition hover:bg-gold-100"
    >
      <span aria-hidden className="text-lg leading-none">
        🤖
      </span>
      <span className="min-w-0 flex-1 text-xs font-bold text-navy-900">Install the Android app</span>
    </a>
  )
}
