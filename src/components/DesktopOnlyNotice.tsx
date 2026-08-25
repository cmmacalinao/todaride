import { usePublicOrigin } from '../context/RideContext'
import { useSession } from '../context/SessionContext'
import { desktopOnlyMessage } from '../lib/platform'

// The dead end for an Admin or Super Admin session inside the installed app.
//
// Reachable only if one somehow exists — the login form turns those two tiers
// away before a session is ever created (see UnifiedAuth), so this is the
// backstop for the leftovers: a session saved by an older build of the APK,
// or a `?as=` pinned one. It logs out rather than bouncing, because the
// account itself is the thing that does not belong on this device.
export function DesktopOnlyNotice() {
  const { logOut } = useSession()
  const { origin, shareable } = usePublicOrigin()

  return (
    <div className="mx-auto max-w-sm space-y-3 px-5 py-10">
      <section className="space-y-3 rounded-xl border border-gold-400/60 bg-gold-50 p-4 text-center shadow-sm">
        <h1 className="text-sm font-bold text-navy-900">💻 This account works on desktop</h1>
        <p className="text-xs leading-relaxed text-slate-600">{desktopOnlyMessage(shareable ? origin : undefined)}</p>
        <p className="text-xs leading-relaxed text-slate-500">
          The app on this phone is for passengers, drivers, TODA officers and partner shops.
        </p>
      </section>

      <button
        type="button"
        onClick={logOut}
        className="w-full rounded-full bg-brand-600 py-3.5 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-brand-700"
      >
        Back to login
      </button>
    </div>
  )
}
