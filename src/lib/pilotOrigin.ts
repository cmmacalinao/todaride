// The one address the pilot is reachable at.
//
// TEMPORARY: this should be https://todasaferide.com, and was until
// 2026-09-01, when the registrar suspended the domain for an unverified
// registrant email (ICANN's 15-day rule — the domain was registered
// 2026-08-17 and held exactly 15 days later). While suspended it resolves to
// 127.0.0.1, so every link built from it is dead: share QRs go nowhere, and
// the installed APK — which cannot use a relative /api path, see otpApi —
// loses OTP signup, password recovery and Maya payments outright.
//
// Pointing at the Netlify address keeps the pilot usable meanwhile. Once the
// registrant email is verified and the domain resolves again, change this one
// line back; nothing else needs touching.
//
// todaride-pilot2 (2026-09-16), not the older todasaferide-pilot2, to match
// the TODARide Mobility name. For now it is a separate Netlify site that
// proxies everything to todasaferide-pilot2, so APKs installed before this
// change — which still call the old address — keep working until they update.
//
// Deliberately a lib module rather than a constant exported from
// ShareAppPanel: otpApi and mayaApi need it too, and a lib importing from a
// component to get its API base is the wrong direction.
export const PILOT_ORIGIN = 'https://todaride-pilot2.netlify.app'
