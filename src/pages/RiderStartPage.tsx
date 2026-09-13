import { useNavigate } from 'react-router-dom'
import { useRides } from '../context/RideContext'
import { terminalRideIsFree } from '../lib/terminalFee'
import { NearbyTodaAdCard } from '../components/NearbyTodaAdCard'
import { PilotBranding } from '../components/PilotBranding'
import { TricycleIcon } from '../components/TricycleIcon'
import { ServiceTabs } from '../components/ServiceTabs'
import { usePilotBranding } from '../lib/usePilotBranding'

// The screen a passenger lands on after signing in. Two ways to get a ride,
// and they are genuinely different journeys rather than two buttons for the
// same thing: booking sends a request out to drivers, scanning records a
// tricycle the passenger is already standing next to. Putting the choice
// first — instead of dropping everyone into the booking form — is what makes
// the terminal path discoverable at all.
export function RiderStartPage() {
  const navigate = useNavigate()
  const { vendorsEnabled } = useRides()
  const pilotBranding = usePilotBranding()
  // Only the Food & Vendor partners switch matters here. This used to also
  // require Pabili, since both Food Order and PaDeliver's Store are reached
  // through the Pabili flow underneath — but they're their own tiles to a
  // passenger, and Super Admin turning errands off silently removed them
  // from this screen. PaDeliver's "Book a Delivery" is unaffected — it's the
  // plain Pabili form itself, not a vendor catalog, so it stays available
  // even with vendorsEnabled off.
  const vendorCatalogsAvailable = vendorsEnabled
  return (
    // Same pattern as the launch and role-chooser screens before it — dark
    // navy, the diagonal weave — so a passenger doesn't land somewhere that
    // suddenly reads as a different, brighter product the moment they sign
    // in. ScanSafeRideBanner already wore this look on its own; this brings
    // the page it sits on into line with it, rather than the other way round.
    <div
      className="relative min-h-[calc(100vh-50px)] overflow-hidden px-4 py-4"
      // Same royal-blue-to-navy diagonal as the landing page and role
      // chooser (see LandingPage.tsx) — one product, lit the same way on
      // every screen a passenger passes through before booking.
      style={{ backgroundImage: 'linear-gradient(135deg, #3e6fe4 0%, #0a1529 60%, #0a1529 100%)' }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: 'repeating-linear-gradient(-45deg, white 0, white 2px, transparent 2px, transparent 18px)',
        }}
      />
      <div className="relative mx-auto max-w-lg space-y-3">
        {/* Same resolution as the launch and role-chooser screens before
            this one — see usePilotBranding. */}
        {pilotBranding.specific ? (
          <NearbyTodaAdCard name={pilotBranding.name} showNearYouTag={pilotBranding.showNearYouTag} />
        ) : (
          <PilotBranding name={pilotBranding.name} />
        )}

        {/* This strip is where a passenger switches between the three
            services — pinned under the app header instead of scrolling away
            with the page, since it's meant to stay reachable no matter how
            far down this list (or the vendor list on Food Order/PaDeliver's
            Store) someone has scrolled. TODA (tricycle rides, this page) is
            the only one with anything to show below it, so it renders as the
            current tab rather than a real button; Food Order and PaDeliver's
            Store jump straight into the Registered Vendor menu flow (see
            PassengerPage.tsx's 'food'/'goods_store' section cases) — hidden
            entirely while Super Admin has vendors switched off, same as
            every other vendor-catalog entry point in the app. */}
        {vendorCatalogsAvailable && (
          <div className="sticky top-[50px] z-10 -mx-4 bg-[#0a1529]/95 px-4 py-2 backdrop-blur-sm">
            <ServiceTabs active="toda" tone="dark" />
          </div>
        )}

        <div>
          <h1 className="text-lg font-bold text-white">3 ways to get what you need</h1>
          <p className="text-xs text-white/50">Pick one — you can always switch.</p>
        </div>

        {/* Book a Ride. Track Your Trip/Safety Feature used to be folded in
            right here, but that put it in front of someone who hasn't
            booked anything yet — it now lives inside the booking page
            itself (see TrackYourTripCard, rendered from PassengerPage),
            where it's actually relevant. */}
        <button
          type="button"
          onClick={() => navigate('/book')}
          className="flex w-full items-center gap-3 rounded-xl border-2 border-gold-400 bg-white/5 p-4 text-left shadow-sm transition hover:bg-white/10"
        >
          {/* A gold backdrop, same as the tricycle's map-marker treatment
              (see mapMarkerHtml.ts) — the icon is drawn navy-on-gold for
              contrast against a map, and this tile's own background is
              dark navy too, so without one it all but disappears into it. */}
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-400 p-1.5">
            <TricycleIcon className="h-full w-full" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-bold text-gold-400">BOOK A RIDE</span>
            <span className="block text-xs text-white/60">
              Set where you are and where you are going. We find you the nearest driver.
            </span>
          </span>
          <span aria-hidden className="text-xl text-white/40">›</span>
        </button>

        {/* Food Order — prepared food from a partner resto's own priced
            menu (VendorMenuBooking, resto_food catalog). Same shape as Book
            a Ride's tile: an icon disc, a title, a one-line explainer. */}
        {vendorCatalogsAvailable && (
          <button
            type="button"
            onClick={() => navigate('/book', { state: { section: 'food' } })}
            className="flex w-full items-center gap-3 rounded-xl border border-white/20 bg-white/5 p-4 text-left shadow-sm transition hover:bg-white/10"
          >
            <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-400 text-xl leading-none">
              🍽️
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-bold text-gold-400">FOOD ORDER</span>
              <span className="block text-xs text-white/60">
                Order cooked meals straight from a partner resto's own menu — delivered by your driver.
              </span>
            </span>
            <span aria-hidden className="text-xl text-white/40">›</span>
          </button>
        )}

        {/* PaDeliver — goods, not people or meals: a marketplace Store
            (priced other_commodity catalog, same VendorMenuBooking flow
            Food Order uses) for the store-to-door case, and Book a Delivery
            (the plain Pabili form) for "I already have the item/errand,
            just bring it" — see PassengerPage's 'goods_store'/
            'goods_delivery' section cases. Book a Delivery doesn't depend
            on any registered vendor, so it's offered even when Store isn't. */}
        <div className="overflow-hidden rounded-xl border border-white/20 bg-white/5 shadow-sm">
          <div className="flex items-center gap-2 border-b border-white/10 p-4 pb-3">
            <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-400 text-xl leading-none">
              📦
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-bold text-gold-400">PADELIVER</span>
              <span className="block text-xs text-white/60">Goods — from a store's shelf, or straight from you.</span>
            </span>
          </div>
          {vendorCatalogsAvailable && (
            <button
              type="button"
              onClick={() => navigate('/book', { state: { section: 'goods_store' } })}
              className={`flex w-full items-center gap-3 p-4 py-3 text-left transition hover:bg-white/10 ${
                vendorCatalogsAvailable ? 'border-b border-white/10' : ''
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-white">🏬 Store</span>
                <span className="block text-xs text-white/60">Browse a partner store's own priced catalog and check out.</span>
              </span>
              <span aria-hidden className="text-xl text-white/30">›</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/book', { state: { section: 'goods_delivery' } })}
            className="flex w-full items-center gap-3 p-4 py-3 text-left transition hover:bg-white/10"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-white">🛺 Book a Delivery</span>
              <span className="block text-xs text-white/60">
                Already have the package? Tell us where to pick it up and where it's going — your driver just
                carries it, nothing to buy.
              </span>
            </span>
            <span aria-hidden className="text-xl text-white/30">›</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// Book a Ride's own safety feature, rendered from inside the booking page
// (PassengerPage) rather than on this chooser — tracking is something you do
// once you're actually trying to get a ride, not a reason to pick one, so it
// belongs in front of someone who has already tapped Book a Ride.
export function TrackYourTripCard() {
  const navigate = useNavigate()
  const { terminalQrFeeWaived, commissionPerRide } = useRides()
  return (
    <div className="overflow-hidden rounded-xl border-2 border-gold-400 bg-navy-900 shadow-sm">
      <div className="px-4 pt-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-white/40">🛡️ Safety feature</p>
      </div>
      {/* Straight to the tracking screen, rather than unfolding a QR
          explainer here. That panel asked the passenger to point a camera
          at a sticker, or type a plate, before anything happened — while
          the screen it now opens does the same job without being asked: it
          lists the tricycles beside them, takes a typed TRC, and records
          the trip by itself once the tricycle pulls out. */}
      <button
        type="button"
        onClick={() => navigate('/book/terminal')}
        className="flex w-full items-center gap-3 p-4 pt-2 text-left transition hover:bg-white/5"
      >
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-400 text-xl leading-none">
          📍
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold text-gold-400">TRACK YOUR TRIP</span>
          <span className="block text-sm font-bold text-white">
            for your <span className="font-extrabold italic text-gold-400">SAFE</span> ride
          </span>
          <span className="block text-xs text-white/60">
            Already at the terminal, already in a tricycle? I-track ang biyahe mo.
          </span>
        </span>
        <span aria-hidden className="text-xl text-white/30">›</span>
      </button>
      <ScanSafeRideBanner feeFree={terminalRideIsFree(terminalQrFeeWaived, commissionPerRide)} variant="attached" />
    </div>
  )
}

// The case for scanning, made where the choice is being made. Its own
// component because the same argument belongs on the booking screen too —
// a passenger who always books is exactly who has not heard it yet.
export function ScanSafeRideBanner({ feeFree, variant = 'card' }: { feeFree: boolean; variant?: 'card' | 'attached' }) {
  // 'attached': the info section under the "Record mo ang Biyahe" tile on
  // the start screen — same quiet card the tile is drawn on, continuing it
  // below a hairline, so the two read as one thing. 'card' is the
  // stand-alone gold-framed version the booking screen still uses.
  if (variant === 'attached') {
    return (
      <div className="border-t border-white/10 px-4 pb-4 pt-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-gold-400">Sakay sa terminal o pumara?</p>
        {feeFree && (
          <p className="mt-1.5 inline-block rounded-md bg-emerald-600/90 px-2 py-0.5 text-[11px] font-bold text-white">
            WALANG APP FEE — no app charge on trips you start at the terminal
          </p>
        )}
        <ul className="mt-2 space-y-0.5 text-[11px] leading-snug text-white/60">
          <li>• Naka-record ang biyahe mo — name and plate of your driver.</li>
          <li>• Your family can see where you are and that you arrived.</li>
          <li>• One SOS reaches your TODA and your emergency contact.</li>
        </ul>
      </div>
    )
  }
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
