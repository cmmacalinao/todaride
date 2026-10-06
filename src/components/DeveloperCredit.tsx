import { useRides } from '../context/RideContext'
import { DEVELOPER_CREDIT } from '../lib/brand'

// Who operates the app, shown only when Super Admin has switched it on.
//
// Off by default and rendering nothing at all when off — not an empty
// element with a margin, which would leave a gap somebody later tries to
// explain. The company is still named in the Family Plan terms and the
// privacy text whatever this says: a privacy notice has to identify the
// personal information controller, and that is not a branding decision.
export function DeveloperCredit({ className = QUIET }: { className?: string }) {
  const { showDeveloperCredit } = useRides()
  if (!showDeveloperCredit) return null
  return <p className={className}>{DEVELOPER_CREDIT}</p>
}

const QUIET = 'mt-3 text-center text-[11px] leading-snug text-slate-400'
