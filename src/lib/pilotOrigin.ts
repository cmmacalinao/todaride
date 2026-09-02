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
// Deliberately a lib module rather than a constant exported from
// ShareAppPanel: otpApi and mayaApi need it too, and a lib importing from a
// component to get its API base is the wrong direction.
export const PILOT_ORIGIN = 'https://todasaferide-pilot2.netlify.app'
