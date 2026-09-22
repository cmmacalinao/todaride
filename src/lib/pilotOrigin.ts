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
// todaride-pilot2, to match the TODARide Mobility name. It began (2026-09-16)
// as a separate Netlify site proxying everything to the older
// todasaferide-pilot2; since 2026-09-18 it is the site the app is deployed to
// directly, and todasaferide is not used at all. An APK installed before that
// still calls this same address, so nothing had to change here.
//
// Deliberately a lib module rather than a constant exported from
// ShareAppPanel: otpApi and mayaApi need it too, and a lib importing from a
// component to get its API base is the wrong direction.
//
// 2026-09-22: the real domain, todaridemobility.com, is live and serves the
// same Netlify site (checked: same build, same app-version.json), so every
// QR and share link now carries it. An APK installed before this still calls
// todaride-pilot2.netlify.app, which keeps working — it is the same site.
export const PILOT_ORIGIN = 'https://todaridemobility.com'
