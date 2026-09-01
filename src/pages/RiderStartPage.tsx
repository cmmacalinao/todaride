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
  const { terminalQrFeeWaived, commissionPerRide } = useRides()
  return (
    // Same pattern as the launch and role-chooser screens before it — dark
    // navy, the diagonal weave — so a passenger doesn't land somewhere that
    // suddenly reads as a different, brighter product the moment they sign
    // in. ScanSafeRideBanner already wore this look on its own; this brings
    // the page it sits on into line with it, rather than the other way round.
    <div className="relative min-h-[calc(100vh-50px)] overflow-hidden bg-navy-950 px-4 py-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: 'repeating-linear-gradient(-45deg, white 0, white 2px, transparent 2px, transparent 18px)',
        }}
      />
      <div className="relative mx-auto max-w-lg space-y-3">
        <div>
          <h1 className="text-lg font-bold text-white">How are you riding today?</h1>
          <p className="text-xs text-white/50">Pick one — you can always switch.</p>
        </div>

        <button
          type="button"
          onClick={() => navigate('/book')}
          className="flex w-full items-center gap-3 rounded-xl border-2 border-gold-400 bg-white/5 p-4 text-left shadow-sm transition hover:bg-white/10"
        >
          <span aria-hidden className="text-3xl">🛵</span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-bold text-gold-400">Book a Ride</span>
            <span className="block text-xs text-white/60">
              Set where you are and where you are going. We find you the nearest driver.
            </span>
          </span>
          <span aria-hidden className="text-xl text-white/40">›</span>
        </button>

        {/* Straight to the tracking screen, rather than unfolding a QR
            explainer here. That panel asked the passenger to point a camera
            at a sticker, or type a plate, before anything happened — while
            the screen it now opens does the same job without being asked:
            it lists the tricycles beside them, takes a typed TRC, and
            records the trip by itself once the tricycle pulls out. */}
        <button
          type="button"
          onClick={() => navigate('/book/terminal')}
          className="flex w-full items-center gap-3 rounded-xl border border-white/20 bg-white/5 p-4 text-left shadow-sm transition hover:bg-white/10"
        >
          <span aria-hidden className="text-3xl">⬛</span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-bold text-white">Record mo ang Biyahe</span>
            <span className="block text-[11px] font-semibold text-white/40">for your safe ride</span>
            <span className="block text-xs text-white/60">
              Already at the terminal, already in a tricycle? I-track ang biyahe mo.
            </span>
          </span>
          <span aria-hidden className="text-xl text-white/30">›</span>
        </button>

        <ScanSafeRideBanner feeFree={terminalRideIsFree(terminalQrFeeWaived, commissionPerRide)} />
      </div>
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
