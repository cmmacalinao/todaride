import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRides } from '../context/RideContext'
import { terminalRideIsFree } from '../lib/terminalFee'

// The screen a passenger lands on after signing in. Two ways to get a ride,
// and they are genuinely different journeys rather than two buttons for the
// same thing: booking sends a request out to drivers, scanning records a
// tricycle the passenger is already standing next to. Putting the choice
// first — instead of dropping everyone into the booking form — is what makes
// the terminal path discoverable at all.
export function RiderStartPage() {
  const navigate = useNavigate()
  const { drivers, terminalQrFeeWaived, commissionPerRide } = useRides()
  const [showPlate, setShowPlate] = useState(false)
  const [plate, setPlate] = useState('')
  const [plateError, setPlateError] = useState<string | null>(null)

  function findByPlate() {
    // Plates get typed every which way — "UTS-2001", "uts 2001", "2001" — so
    // both sides are stripped to alphanumerics before comparing. Punctuation
    // should not decide whether someone finds the tricycle they are sitting in.
    const bare = plate.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!bare) return
    const match = drivers.find(
      (d) =>
        d.accessStatus === 'active' &&
        d.verificationStatus === 'approved' &&
        d.plateNumber.toLowerCase().replace(/[^a-z0-9]/g, '').includes(bare),
    )
    if (!match) {
      setPlateError('No tricycle with that plate. Check the number painted on the side, or just book a ride.')
      return
    }
    navigate(`/scan/${match.id}`)
  }

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 py-4">
      <div>
        <h1 className="text-lg font-bold text-slate-800">How are you riding today?</h1>
        <p className="text-xs text-slate-500">Pick one — you can always switch.</p>
      </div>

      <button
        type="button"
        onClick={() => navigate('/book')}
        className="flex w-full items-center gap-3 rounded-xl border-2 border-brand-600 bg-brand-600 p-4 text-left shadow-sm transition hover:bg-brand-700"
      >
        <span aria-hidden className="text-3xl">🛵</span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold text-white">Book a Ride</span>
          <span className="block text-xs text-white/80">
            Set where you are and where you are going. We find you the nearest driver.
          </span>
        </span>
        <span aria-hidden className="text-xl text-white/70">›</span>
      </button>

      <button
        type="button"
        onClick={() => setShowPlate((v) => !v)}
        className="flex w-full items-center gap-3 rounded-xl border-2 border-gold-400 bg-gold-50 p-4 text-left shadow-sm transition hover:bg-gold-100"
      >
        <span aria-hidden className="text-3xl">⬛</span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold text-navy-900">Record mo ang Biyahe</span>
          <span className="block text-[11px] font-semibold text-slate-500">for your safe ride</span>
          <span className="block text-xs text-slate-600">
            Already at the terminal, already in a tricycle? Scan the sticker inside it.
          </span>
        </span>
        <span aria-hidden className="text-xl text-slate-400">{showPlate ? '⌄' : '›'}</span>
      </button>

      {showPlate && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          {/* The QR is a normal link, so the phone's own camera opens it — the
              app never needs camera permission for this. The plate box is the
              fallback for a torn sticker or a camera that will not focus. */}
          <p className="text-xs font-semibold text-slate-700">Point your phone camera at the sticker</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Open your camera and hold it over the QR inside the tricycle. It opens this app on your driver&apos;s
            trip — no typing.
          </p>
          <p className="mb-1 mt-2.5 text-[11px] font-semibold text-slate-600">Sticker missing? Type the plate number</p>
          <div className="flex gap-1.5">
            <input
              value={plate}
              onChange={(e) => {
                setPlate(e.target.value)
                setPlateError(null)
              }}
              placeholder="e.g. UTS-2001"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-2 text-sm"
            />
            <button
              type="button"
              onClick={findByPlate}
              disabled={!plate.trim()}
              className="shrink-0 rounded-lg bg-navy-900 px-3 py-2 text-xs font-semibold text-white hover:bg-navy-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
            >
              Find
            </button>
          </div>
          {plateError && <p className="mt-1.5 text-[11px] font-medium text-amber-700">{plateError}</p>}
        </div>
      )}

      <ScanSafeRideBanner feeFree={terminalRideIsFree(terminalQrFeeWaived, commissionPerRide)} />
    </div>
  )
}

// The case for scanning, made where the choice is being made. Its own
// component because the same argument belongs on the booking screen too —
// a passenger who always books is exactly who has not heard it yet.
export function ScanSafeRideBanner({ feeFree }: { feeFree: boolean }) {
  return (
    <section className="overflow-hidden rounded-xl border-2 border-gold-400 bg-navy-900 shadow-sm">
      <div className="flex items-start gap-3 p-4">
        <span aria-hidden className="text-3xl leading-none">🛺</span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gold-400">Sakay sa terminal o pumara?</p>
          <p className="text-base font-extrabold leading-tight text-white">Record mo ang Biyahe</p>
          <p className="text-[11px] font-semibold text-blue-100">for your safe ride</p>
          {feeFree && (
            <p className="mt-1.5 inline-block rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white">
              WALANG APP FEE — no app charge on trips you start at the terminal
            </p>
          )}
          <ul className="mt-2 space-y-0.5 text-[11px] leading-snug text-blue-100">
            <li>• Naka-record ang biyahe mo — name and plate of your driver.</li>
            <li>• Your family can see where you are and that you arrived.</li>
            <li>• One SOS reaches your TODA and your emergency contact.</li>
          </ul>
        </div>
      </div>
      <p className="bg-gold-400 px-4 py-1.5 text-center text-[11px] font-bold text-navy-900">
        TODA SafeRide — Safe Rides for You and Your Family
      </p>
    </section>
  )
}
