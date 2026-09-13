// How this app is put together, kept inside the app itself.
//
// Written for whoever inherits this: a developer joining, an LGU or investor
// asking what they are looking at, or Celeste six months from now. The
// counts are read from the source rather than estimated, so they are worth
// re-checking when the code moves under them.
//
// It lives in Super Admin because it describes the whole system rather than
// any one TODA's operation, and because the thing it is most useful for —
// deciding what to build before real money moves through the app — is a
// Super Admin decision.

const FACTS = [
  { metric: '6,690', label: 'lines in the reducer that decides everything' },
  { metric: '146', label: 'action types it responds to' },
  { metric: '23', label: 'page components across eight roles' },
  { metric: '3', label: 'server functions, all of them SMS' },
]

const STACK: [string, string, string][] = [
  ['Web app', 'React 18 · TypeScript · Vite 5', 'Deployed to todasaferide.com on Netlify'],
  ['Android app', 'Capacitor 8', 'Wraps the same web build and bundles its own copy — a site deploy does not reach it'],
  ['State', 'React reducer', 'One context, 146 actions, the source of truth'],
  ['Database', 'Supabase Postgres', 'One app_state blob plus five hot tables'],
  ['Sync', 'Realtime + polling', 'Websocket, 12-second poll, foreground refetch'],
  ['Maps', 'Leaflet + OpenStreetMap', 'Raster tiles — cannot rotate or tilt'],
  ['Routing', 'OSRM, Google when keyed', 'Returns a path, distance and duration; no turn-by-turn steps'],
  ['SMS', 'Semaphore', 'Sender TodaRide; one credit per message'],
  ['Offline', 'Service worker', 'Precache with auto-update; ?fresh forces a stale phone current'],
]

const BENDS: [string, string][] = [
  [
    'The shared blob',
    'app_state is one row every device reads and writes. Concurrency past a handful of active phones is contention on a single JSON document.',
  ],
  [
    'Client-side money',
    'Fares computed on the phone are fares a modified phone can set. Harmless while app fees are waived; not harmless afterwards.',
  ],
  [
    'An untested reducer',
    'The 6,690-line state machine has no direct test coverage — the test files cover the pure libraries around it, not the rules inside it.',
  ],
  [
    'Location as app state',
    'Driver positions publish every 30 seconds into the same store as everything else, which is why a tricycle moves in hops rather than smoothly.',
  ],
]

function Figure({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <figure className="m-0 overflow-x-auto rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="min-w-[560px]">
        {children}
        <figcaption className="mt-3 border-t border-slate-100 pt-2.5 text-[11px] leading-relaxed text-slate-500">
          {caption}
        </figcaption>
      </div>
    </figure>
  )
}

export function ArchitectureOverview() {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-navy-900">How TODA Ride Mobility is put together</h2>
        <p className="mt-1 max-w-prose text-xs leading-relaxed text-slate-600">
          A React app where the phone, not the server, decides what a ride costs and who gets it. That
          single fact explains most of the system's strengths and every one of its limits.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {FACTS.map((f) => (
          <div key={f.label} className="rounded-lg border border-slate-200 bg-white p-2.5">
            <span className="block text-xl font-bold tabular-nums text-brand-700">{f.metric}</span>
            <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{f.label}</span>
          </div>
        ))}
      </div>

      <Figure caption="A ride request never leaves the phone as a question — it leaves as an answer. The fare and the chosen driver are computed in the reducer, and Supabase records the result.">
        <svg
          viewBox="0 0 720 400"
          role="img"
          aria-label="A booking flows from the screen into the RideContext reducer on the phone, which computes the fare and dispatch order, then writes the result to Supabase, which pushes the change to other devices."
          className="block h-auto w-full"
        >
          <defs>
            <marker id="arch-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#475569" />
            </marker>
          </defs>

          <rect x="20" y="16" width="400" height="304" rx="10" fill="none" stroke="#94a3b8" strokeDasharray="5 4" />
          <text x="34" y="38" fontSize="11" fill="#64748b" fontFamily="ui-monospace, monospace">THE PHONE</text>

          <rect x="48" y="56" width="150" height="46" rx="6" fill="#f8fafc" stroke="#cbd5e1" />
          <text x="123" y="77" textAnchor="middle" fontSize="13" fontWeight="600" fill="#0f172a">Book a ride</text>
          <text x="123" y="92" textAnchor="middle" fontSize="11" fill="#64748b">PassengerPage</text>

          <rect x="48" y="146" width="344" height="80" rx="8" fill="#fef3c7" stroke="#d97706" strokeWidth="2" />
          <text x="64" y="172" fontSize="14" fontWeight="700" fill="#0f172a">RideContext reducer</text>
          <text x="64" y="192" fontSize="12" fill="#334155">estimateFare() · resolveTariff() · dispatch order</text>
          <text x="64" y="211" fontSize="11" fontWeight="600" fill="#b45309" fontFamily="ui-monospace, monospace">the fare is decided here</text>

          <rect x="48" y="256" width="150" height="44" rx="6" fill="#f8fafc" stroke="#cbd5e1" />
          <text x="123" y="283" textAnchor="middle" fontSize="12" fill="#0f172a" fontFamily="ui-monospace, monospace">persistence.ts</text>

          <rect x="500" y="146" width="196" height="154" rx="8" fill="#e0e7ff" stroke="#1e3a8a" strokeWidth="1.5" />
          <text x="598" y="176" textAnchor="middle" fontSize="14" fontWeight="600" fill="#0f172a">Supabase</text>
          <text x="598" y="199" textAnchor="middle" fontSize="11" fill="#334155" fontFamily="ui-monospace, monospace">app_state (jsonb blob)</text>
          <text x="598" y="219" textAnchor="middle" fontSize="11" fill="#334155" fontFamily="ui-monospace, monospace">ride · driver · passenger</text>
          <text x="598" y="237" textAnchor="middle" fontSize="11" fill="#334155" fontFamily="ui-monospace, monospace">parent · sos_alert</text>
          <text x="598" y="266" textAnchor="middle" fontSize="11.5" fill="#475569">storage and message bus</text>
          <text x="598" y="283" textAnchor="middle" fontSize="11.5" fill="#475569">— no rules of its own</text>

          <line x1="123" y1="102" x2="123" y2="140" stroke="#475569" markerEnd="url(#arch-ar)" />
          <text x="133" y="126" fontSize="10.5" fill="#475569" fontFamily="ui-monospace, monospace">dispatch(REQUEST_RIDE)</text>

          <line x1="123" y1="226" x2="123" y2="250" stroke="#475569" markerEnd="url(#arch-ar)" />
          <text x="133" y="244" fontSize="10.5" fill="#475569" fontFamily="ui-monospace, monospace">new state</text>

          <line x1="198" y1="278" x2="494" y2="278" stroke="#475569" markerEnd="url(#arch-ar)" />
          <text x="346" y="271" textAnchor="middle" fontSize="10.5" fill="#475569" fontFamily="ui-monospace, monospace">upsert</text>

          <path d="M 500 176 L 440 176 L 440 118 L 200 118" fill="none" stroke="#475569" markerEnd="url(#arch-ar)" />
          <text x="330" y="112" textAnchor="middle" fontSize="10.5" fill="#475569" fontFamily="ui-monospace, monospace">realtime push back</text>

          <rect x="500" y="336" width="196" height="46" rx="6" fill="#f8fafc" stroke="#cbd5e1" />
          <text x="598" y="356" textAnchor="middle" fontSize="12.5" fontWeight="600" fill="#0f172a">Every other phone</text>
          <text x="598" y="372" textAnchor="middle" fontSize="11" fill="#64748b">driver · parent · admin</text>
          <line x1="598" y1="300" x2="598" y2="330" stroke="#475569" markerEnd="url(#arch-ar)" />
        </svg>
      </Figure>

      <Figure caption="The websocket is the fast path; the poll covers a dropped socket; the wake refetch covers a phone asleep in a pocket. Three mechanisms exist because a passenger waiting at a terminal cannot tell “no driver yet” from “the connection died”.">
        <svg
          viewBox="0 0 720 300"
          role="img"
          aria-label="Three paths keep devices in step: a realtime websocket push, a twelve-second poll while the screen is visible, and a refetch when the app returns to the foreground."
          className="block h-auto w-full"
        >
          <defs>
            <marker id="arch-ar2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#475569" />
            </marker>
          </defs>

          <rect x="20" y="106" width="150" height="70" rx="8" fill="#f8fafc" stroke="#cbd5e1" />
          <text x="95" y="136" textAnchor="middle" fontSize="13" fontWeight="600" fill="#0f172a">Passenger phone</text>
          <text x="95" y="154" textAnchor="middle" fontSize="11" fill="#64748b">books a ride</text>

          <rect x="285" y="106" width="150" height="70" rx="8" fill="#e0e7ff" stroke="#1e3a8a" strokeWidth="1.5" />
          <text x="360" y="140" textAnchor="middle" fontSize="13" fontWeight="600" fill="#0f172a">Supabase</text>
          <text x="360" y="158" textAnchor="middle" fontSize="11" fill="#334155">Postgres + realtime</text>

          <rect x="550" y="106" width="150" height="70" rx="8" fill="#f8fafc" stroke="#cbd5e1" />
          <text x="625" y="136" textAnchor="middle" fontSize="13" fontWeight="600" fill="#0f172a">Driver phone</text>
          <text x="625" y="154" textAnchor="middle" fontSize="11" fill="#64748b">sees the request</text>

          <line x1="170" y1="141" x2="279" y2="141" stroke="#475569" markerEnd="url(#arch-ar2)" />
          <line x1="435" y1="141" x2="544" y2="141" stroke="#475569" markerEnd="url(#arch-ar2)" />

          <path d="M 435 120 C 480 60, 520 60, 560 112" fill="none" stroke="#d97706" strokeWidth="2" markerEnd="url(#arch-ar2)" />
          <text x="497" y="56" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#b45309" fontFamily="ui-monospace, monospace">1 · postgres_changes push</text>
          <text x="497" y="42" textAnchor="middle" fontSize="10.5" fill="#64748b">≈1s, when the socket holds</text>

          <path d="M 560 176 C 520 224, 480 224, 437 172" fill="none" stroke="#475569" markerEnd="url(#arch-ar2)" />
          <text x="497" y="243" textAnchor="middle" fontSize="10.5" fill="#475569" fontFamily="ui-monospace, monospace">2 · poll every 12s while visible</text>

          <path d="M 625 200 L 625 262 L 360 262 L 360 186" fill="none" stroke="#94a3b8" strokeDasharray="5 4" markerEnd="url(#arch-ar2)" />
          <text x="492" y="278" textAnchor="middle" fontSize="10.5" fill="#64748b" fontFamily="ui-monospace, monospace">3 · refetch on returning to the foreground</text>
        </svg>
      </Figure>

      <Figure caption="The asymmetry is the point. Everything gold is a rule a modified client could change. For a pilot charging no app fee, where TODA officers know every driver by name, that is an acceptable trade.">
        <svg
          viewBox="0 0 720 306"
          role="img"
          aria-label="Nearly all business logic sits on the client: fares, dispatch, trip lifecycle, tariffs, queueing. The server holds only three functions, all for sending and verifying SMS codes."
          className="block h-auto w-full"
        >
          <line x1="360" y1="20" x2="360" y2="286" stroke="#94a3b8" strokeDasharray="6 5" />
          <text x="348" y="36" textAnchor="end" fontSize="11" fill="#64748b" fontFamily="ui-monospace, monospace">CLIENT</text>
          <text x="372" y="36" fontSize="11" fill="#64748b" fontFamily="ui-monospace, monospace">SERVER</text>

          <rect x="20" y="52" width="316" height="34" rx="5" fill="#fef3c7" stroke="#d97706" />
          <text x="36" y="74" fontSize="13" fontWeight="600" fill="#0f172a">Fare calculation</text>
          <text x="320" y="74" textAnchor="end" fontSize="10.5" fill="#b45309" fontFamily="ui-monospace, monospace">estimateFare()</text>

          <rect x="20" y="94" width="316" height="34" rx="5" fill="#fef3c7" stroke="#d97706" />
          <text x="36" y="116" fontSize="13" fontWeight="600" fill="#0f172a">Dispatch order</text>
          <text x="320" y="116" textAnchor="end" fontSize="10.5" fill="#b45309" fontFamily="ui-monospace, monospace">orderByDispatchDistance()</text>

          <rect x="20" y="136" width="316" height="30" rx="5" fill="#f8fafc" stroke="#cbd5e1" />
          <text x="36" y="156" fontSize="12.5" fill="#0f172a">Trip lifecycle · 146 actions</text>

          <rect x="20" y="174" width="316" height="30" rx="5" fill="#f8fafc" stroke="#cbd5e1" />
          <text x="36" y="194" fontSize="12.5" fill="#0f172a">Per-city and per-TODA taripa</text>

          <rect x="20" y="212" width="316" height="30" rx="5" fill="#f8fafc" stroke="#cbd5e1" />
          <text x="36" y="232" fontSize="12.5" fill="#0f172a">Queueing, boarding detection, SOS</text>

          <rect x="20" y="250" width="316" height="30" rx="5" fill="#f8fafc" stroke="#cbd5e1" />
          <text x="36" y="270" fontSize="12.5" fill="#0f172a">Account records and roles</text>

          <rect x="384" y="52" width="316" height="76" rx="5" fill="#e0e7ff" stroke="#1e3a8a" strokeWidth="1.5" />
          <text x="400" y="76" fontSize="13" fontWeight="600" fill="#0f172a">Netlify functions</text>
          <text x="400" y="97" fontSize="11" fill="#334155" fontFamily="ui-monospace, monospace">send-otp.mjs · verify-otp.mjs</text>
          <text x="400" y="116" fontSize="11.5" fill="#475569">holds the Semaphore key. Nothing else.</text>

          <rect x="384" y="146" width="316" height="134" rx="5" fill="none" stroke="#cbd5e1" strokeDasharray="5 4" />
          <text x="542" y="206" textAnchor="middle" fontSize="13" fill="#94a3b8">empty</text>
          <text x="542" y="228" textAnchor="middle" fontSize="11.5" fill="#94a3b8">no fare, dispatch or trip logic</text>
        </svg>
      </Figure>

      <div className="rounded-lg border-l-[3px] border-rose-500 bg-rose-50 px-3.5 py-2.5">
        <p className="text-xs font-bold text-navy-900">The one thing to fix before real money moves</p>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
          Move fare calculation and dispatch selection into server functions. It is not a rewrite — the
          rules, the UI and the domain model all survive, and only where they execute changes. Everything
          else on the scaling list can wait for traffic that justifies it.
        </p>
      </div>

      <div>
        <h3 className="mb-1.5 text-xs font-bold text-navy-900">What runs where</h3>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-[11px]">
            <tbody>
              {STACK.map(([piece, tech, note], i) => (
                <tr key={piece} className={i > 0 ? 'border-t border-slate-100' : ''}>
                  <td className="whitespace-nowrap px-3 py-2 font-semibold text-navy-900">{piece}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">{tech}</td>
                  <td className="px-3 py-2 leading-snug text-slate-500">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="mb-1.5 text-xs font-bold text-navy-900">Where it will bend first</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {BENDS.map(([title, body]) => (
            <div key={title} className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold text-navy-900">{title}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{body}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-slate-400">
        Counts were read from the source rather than estimated, and will drift as the code changes.
      </p>
    </section>
  )
}
