import { Capacitor } from '@capacitor/core'
import type { AuthedAccountRole } from '../context/SessionContext'

// True inside the wrapped native app (the APK / the iOS build), false in any
// browser — including a phone browser. The distinction that matters here is
// "which package is this", not "how big is the screen": a Super Admin on a
// laptop is welcome, and the same person opening the same page on their
// phone's browser is their own business. What we ship in the APK is a
// separate decision, and this is how it is asked.
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

// Roles the installed app deliberately does not serve.
//
// The APK is for the people out on the road — passengers, parents, drivers,
// TODA officers at the terminal, and the pharmacy/vendor partners filling
// orders. App Admin and Super Admin are not that: they are dense tables,
// live fleet maps, accounting runs and the service switches that affect
// every user at once — desktop work, done sitting down. Operator and
// Franchise admins are NOT here on purpose; they are business owners
// checking earnings and their own fleet, which is a phone job.
//
// This is a product boundary, not a security one. The code for those screens
// still ships inside the bundle; what changes is that the installed app will
// not sign you into them. If they ever need to be genuinely absent from the
// APK, that is a build-time split, not this list.
export const DESKTOP_ONLY_ROLES: AuthedAccountRole[] = ['admin', 'super_admin']

export function isDesktopOnlyRole(role: AuthedAccountRole): boolean {
  return DESKTOP_ONLY_ROLES.includes(role)
}

// The one sentence every blocked entry point says. Kept here so the wording
// stays identical whether someone is turned away at the login form, at the
// Super Admin re-authentication step, or by the route guard — three
// different screens, one explanation.
export function desktopOnlyMessage(origin?: string): string {
  const where = origin ? `Open ${origin} on a computer` : 'Open the web app on a computer'
  return `Admin and Super Admin work on desktop, not in the installed app. ${where} to sign in.`
}
