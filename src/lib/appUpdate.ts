import { isNativeApp } from './platform'
import { PILOT_ORIGIN } from './pilotOrigin'

// Whether the installed app is behind the one the website is handing out.
//
// A sideloaded APK has no update channel. Nothing on the phone checks, nothing
// on the phone is told, and the only way a tester found out there was a newer
// build was somebody telling them — after a day spent working out that "the
// change isn't showing" meant an old install. So the app asks for itself.
//
// Two numbers, compared: the versionCode this bundle was compiled with (see
// __BUILD_CODE__ in vite.config), and the one in app-version.json beside the
// APK on the website, written there by scripts/stage-apk.mjs from the same
// build.gradle. Both come from one file, so they cannot disagree about what
// "newer" means — and versionCode is the number Android itself uses to decide
// whether an install is an upgrade, which is why it is the one compared.
//
// Only in the installed app. The website updates itself through the service
// worker; asking a browser to download an APK would be nonsense on an iPhone.

export interface AvailableUpdate {
  versionCode: number
  versionName: string
  // Absolute, so it opens from inside the app's own https://localhost origin.
  apkUrl: string
  // A build that must not be skipped — one where the old app simply does not
  // work any more. The sheet stops being dismissible.
  required: boolean
  notes: string
}

// "Mamaya na" is honoured for a day, and only for the build it was said to:
// a newer one still asks.
const SNOOZE_KEY = 'toda-app-update-snooze'
const SNOOZE_MS = 24 * 60 * 60 * 1000

export function installedBuildCode(): number {
  return typeof __BUILD_CODE__ === 'number' && Number.isFinite(__BUILD_CODE__) ? __BUILD_CODE__ : 0
}

export async function checkForAppUpdate(): Promise<AvailableUpdate | null> {
  if (!isNativeApp()) return null
  const mine = installedBuildCode()
  // A bundle that does not know its own build cannot tell whether it is
  // behind, and a wrong "please update" is worse than a missed one.
  if (!mine) return null
  try {
    // no-store and a nonce, both: this file is the one thing that must never
    // come back from a cache, since a cached answer is by definition the old
    // version saying there is nothing new.
    const res = await fetch(`${PILOT_ORIGIN}/app-version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const body: unknown = await res.json()
    if (!body || typeof body !== 'object') return null
    const j = body as Record<string, unknown>
    const code = Number(j.versionCode)
    const name = typeof j.versionName === 'string' ? j.versionName.trim() : ''
    if (!Number.isFinite(code) || code <= mine || !name) return null
    const apkPath = typeof j.apkUrl === 'string' && j.apkUrl ? j.apkUrl : '/TODARideMobility.apk'
    return {
      versionCode: code,
      versionName: name,
      apkUrl: new URL(apkPath, PILOT_ORIGIN).toString(),
      required: j.required === true,
      notes: typeof j.notes === 'string' ? j.notes.trim() : '',
    }
  } catch {
    // Offline, or the file is not there. Asking again next launch costs
    // nothing; nagging about a network error would.
    return null
  }
}

export function isUpdateSnoozed(code: number): boolean {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY)
    if (!raw) return false
    const s = JSON.parse(raw) as { code?: unknown; until?: unknown }
    return s.code === code && typeof s.until === 'number' && s.until > Date.now()
  } catch {
    return false
  }
}

export function snoozeUpdate(code: number): void {
  try {
    localStorage.setItem(SNOOZE_KEY, JSON.stringify({ code, until: Date.now() + SNOOZE_MS }))
  } catch {
    /* storage refused — the sheet simply asks again next launch */
  }
}
