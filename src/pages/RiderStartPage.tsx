import { Link, useNavigate } from 'react-router-dom'
import { useRides } from '../context/RideContext'
import { terminalRideIsFree } from '../lib/terminalFee'
import { NearbyTodaAdCard } from '../components/NearbyTodaAdCard'
import { PilotBranding } from '../components/PilotBranding'
import { TricycleIcon } from '../components/TricycleIcon'
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
  // Only the Food & Vendor partners switch matters here. Food Order and
  // PaDeliver's Store both check out through VendorMenuBooking and end up
  // as their own 'vendor_order' ride type (see buildMedsDeliveryRide in
  // RideContext.tsx) — genuinely distinct from the freeform Pabili errand
  // now, not borrowed from it, so nothing here depends on Super Admin's
  // Pabili switch at all. PaDeliver's "Book a Delivery" ('padala') was
  // already its own type and stays available regardless of either switch.
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
        {/* Same "‹ Go back" the role chooser uses, to the same place —
            RiderStartPage is reached by picking Passenger there and signing
            in, so that's the step back from here. */}
        <Link
          to="/welcome"
          className="inline-block rounded-lg border border-white/25 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
        >
          ‹ Go back
        </Link>
        {/* Same resolution as the launch and role-chooser screens before
            this one — see usePilotBranding. */}
        {pilotBranding.specific ? (
          <NearbyTodaAdCard name={pilotBranding.name} showNearYouTag={pilotBranding.showNearYouTag} />
        ) : (
          <PilotBranding name={pilotBranding.name} />
        )}

        {/* No ServiceTabs strip here — this screen's own three tiles below
            already are the "switch service" UI. The pill is for the Food
            Order/PaDeliver Store screens, which have no equivalent tile
            list of their own once you're inside them. */}

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
            Food Order uses, ending as its own 'vendor_order' ride) for the
            store-to-door case, and Book a Delivery (its own 'padala' type —
            no vendor catalog, no shopping list, just pickup -> dropoff) for
            "I already have the item, just bring it" — see PassengerPage's
            'goods_store'/'goods_delivery' section cases. Neither depends on
            Pabili's freeform errand feature or its Super Admin switch;
            Book a Delivery doesn't depend on any registered vendor either,
            so it's offered even when Store isn't. */}
        <div className="overflow-hidden rounded-xl border border-white/20 bg-white/5 shadow-sm">
          <button
            type="button"
            onClick={() => navigate('/book', { state: { section: 'goods_store' } })}
            className="flex w-full items-center gap-2 border-b border-white/10 p-4 pb-3 text-left transition hover:bg-white/10"
          >
            <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-400 text-xl leading-none">
              📦
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-bold text-gold-400">PaDeliver</span>
              <span className="block text-xs text-white/60">Goods — from a store's shelf, or straight from you.</span>
            </span>
            <span aria-hidden className="text-xl text-white/40">›</span>
          </button>
          <div className={`flex items-start gap-3 py-3 pl-14 pr-4 ${vendorCatalogsAvailable ? 'border-b border-white/10' : ''}`}>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-white">🛺 Book a Delivery</span>
              <span className="block text-xs text-white/60">
                Already have the package? Tell us where to pick it up and where it's going — your driver just
                carries it, nothing to buy.
              </span>
            </span>
          </div>
          {vendorCatalogsAvailable && (
            <div className="flex items-start gap-3 py-3 pl-14 pr-4">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-white">🏬 Store Partners</span>
                <span className="block text-xs text-white/60">Browse a partner store's own priced catalog and check out.</span>
              </span>
            </div>
          )}
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
        TODA Ride Mobility — Safe Rides for You and Your Family
      </p>
    </section>
  )
}
