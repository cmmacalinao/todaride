import { useEffect } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useRides } from '../context/RideContext'
import { useSession } from '../context/SessionContext'
import { terminalRideIsFree } from '../lib/terminalFee'

// Where the QR inside a tricycle lands.
//
// Two audiences arrive here and they need opposite things. Someone who
// already has the app and is signed in should not be reading a page at all —
// they are sitting in the tricycle and want to book, so they are sent
// straight to their home screen with this driver already chosen. Someone
// scanning it for the first time has no account and no app; for them this IS
// the page, and it has to explain what they just scanned before asking them
// to install anything.
export function TerminalScanPage() {
  // Mounted two ways: as a route for someone already signed in, and directly
  // by AppShell for someone who is not — the QR's whole audience. There are
  // no route params on that second path, so the id is read off the URL as a
  // fallback rather than the page claiming not to know the code.
  const { driverId: paramDriverId } = useParams<{ driverId: string }>()
  const location = useLocation()
  const driverId = paramDriverId ?? location.pathname.split('/').filter(Boolean).pop() ?? null
  const navigate = useNavigate()
  const { drivers, todaOrganizations, terminals, setRequestedDriver, terminalQrFeeWaived, commissionPerRide } =
    useRides()
  const feeFree = terminalRideIsFree(terminalQrFeeWaived, commissionPerRide)
  const { currentPassengerId, authedAccount } = useSession()

  const driver = drivers.find((d) => d.id === driverId) ?? null
  const org = driver?.todaOrgId ? todaOrganizations.find((o) => o.id === driver.todaOrgId) : null
  const terminal = driver?.homeTerminalId ? terminals.find((t) => t.id === driver.homeTerminalId) : null
  // "Has the app" in a PWA means signed in on a device that already holds an
  // account — that is the thing that decides whether there is a home screen
  // to send them to.
  const signedIn = !!authedAccount && !!currentPassengerId

  useEffect(() => {
    if (!signedIn || !driver || !currentPassengerId) return
    // The scan IS the choice of driver — they are already in his tricycle.
    setRequestedDriver(currentPassengerId, driver.id)
    navigate('/book', { replace: true, state: { section: 'ride', terminalBoarding: true } })
  }, [signedIn, driver, currentPassengerId, setRequestedDriver, navigate])

  if (!driver) {
    return (
      <div className="mx-auto max-w-sm px-4 py-10 text-center">
        <p className="text-4xl">🛺</p>
        <h1 className="mt-2 text-lg font-bold text-slate-800">We don&apos;t recognise this code</h1>
        <p className="mt-1 text-sm text-slate-500">
          It may be from an older sticker. Ask the driver for their plate number, or book the usual way.
        </p>
        <Link
          to="/book"
          className="mt-4 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Open TODA SafeRide
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-sm space-y-3 px-4 py-8">
      <div className="rounded-xl border-2 border-gold-400 bg-gold-50 p-4 text-center">
        <p className="text-3xl">🛺</p>
        <h1 className="mt-1 text-lg font-bold text-navy-900">Record mo ang Biyahe</h1>
        <p className="text-xs font-semibold text-slate-600">for your safe ride</p>
        <p className="mt-0.5 text-sm font-semibold text-slate-700">
          {driver.name} · {driver.plateNumber}
        </p>
        <p className="text-xs text-slate-600">{terminal?.name ?? org?.name ?? 'TODA SafeRide'}</p>
        {/* The reason a passenger at the terminal would bother scanning at
            all, said before anything is asked of them. */}
        {feeFree && (
          <p className="mt-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-emerald-800">
            ✓ No app fee on this ride — you got in at the terminal.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
        <p className="font-semibold text-slate-800">Ride safer, with a record</p>
        <ul className="mt-1.5 space-y-1 text-xs text-slate-600">
          <li>• Your trip is logged with the driver&apos;s name and plate.</li>
          <li>• Family can follow the trip and see you arrive.</li>
          <li>• One SOS button reaches your TODA and your emergency contact.</li>
        </ul>
        <Link
          to="/welcome"
          className="mt-3 block rounded-lg bg-brand-600 py-2.5 text-center text-sm font-bold text-white hover:bg-brand-700"
        >
          Get the app — it&apos;s free
        </Link>
        <Link
          to="/book"
          className="mt-1.5 block rounded-lg border border-slate-300 py-2 text-center text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          I already have an account — sign in
        </Link>
        <p className="mt-2 text-center text-[10px] text-slate-400">
          Installing is not required to ride. The driver takes you either way.
        </p>
      </div>
    </div>
  )
}
