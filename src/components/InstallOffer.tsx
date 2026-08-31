import { APK_PATH, canUseApk } from '../lib/installTarget'

// The rules themselves live in lib/installTarget, where they can be tested
// without a browser. This file is only what they look like.
export { APK_PATH, canAddToHomeScreen, canUseApk, alreadyInstalled } from '../lib/installTarget'
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
