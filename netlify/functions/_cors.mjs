// Lets the installed app talk to these functions.
//
// The website calls /api/send-otp on its own origin, so no browser ever asks
// permission. The APK is a different matter: Capacitor serves the bundled
// files from https://localhost (capacitor://localhost on iOS), so every call
// it makes to the pilot domain is cross-origin — and because the body is
// JSON, the browser sends a preflight OPTIONS first and refuses the real
// request unless that preflight is answered.
//
// Only the two Capacitor origins are allowed, and only for these two
// endpoints. Reflecting whatever Origin arrives would let any page on the
// internet spend this account's SMS credits.
const ALLOWED_ORIGINS = new Set(['https://localhost', 'capacitor://localhost', 'http://localhost'])

export function corsHeaders(request) {
  const origin = request.headers.get('origin')
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

// The browser's permission question, asked before the POST it actually wants
// to make. Answering it costs nothing and is not itself the request.
export function preflightResponse(request) {
  if (request.method !== 'OPTIONS') return null
  return new Response(null, { status: 204, headers: corsHeaders(request) })
}
