import { Link, useNavigate } from 'react-router-dom'
import { useRides } from '../context/RideContext'
import { terminalRideIsFree } from '../lib/terminalFee'
import { NearbyTodaAdCard } from '../components/NearbyTodaAdCard'
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
  const { vendorsEnabled, pharmacies } = useRides()
  const pilotBranding = usePilotBranding()
  // Only the Food & Vendor partners switch matters here. Food Order and
  // PaDeliver's Store both check out through VendorMenuBooking and end up
  // as their own 'vendor_order' ride type (see buildMedsDeliveryRide in
  // RideContext.tsx) — genuinely distinct from the freeform Pabili errand
  // now, not borrowed from it, so nothing here depends on Super Admin's
  // Pabili switch at all. PaDeliver's "Book a Delivery" ('padala') was
  // already its own type and stays available regardless of either switch.
  const vendorCatalogsAvailable = vendorsEnabled
  // Every partner a passenger can order from — approved restos and goods
  // stores, the same set Food Order and PaDeliver's Store list — open ones
  // first, then by name. There is no separate "featured" flag yet, so all of
  // them are featured here.
  const stores = vendorCatalogsAvailable
    ? pharmacies
        .filter((p) => (p.businessType === 'resto_food' || p.businessType === 'other_commodity') && p.verificationStatus === 'approved')
        .sort((a, b) => Number(b.isOpen) - Number(a.isOpen) || a.name.localeCompare(b.name))
    : []
  return (
    // Same pattern as the launch and role-chooser screens before it — dark
    // navy, the diagonal weave — so a passenger doesn't land somewhere that
    // suddenly reads as a different, brighter product the moment they sign
    // in. ScanSafeRideBanner already wore this look on its own; this brings
    // the page it sits on into line with it, rather than the other way round.
    <div
      className="relative min-h-[calc(100vh-50px)] overflow-hidden px-4 pb-4 pt-2"
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
          // The generic "TODA Ride Mobility" wordmark was removed (2026-09-21) —
          // the logo already says it; only what TODA stands for stays.
          <p className="whitespace-nowrap text-center text-[17px] text-gold-400">Transport &amp; Opportunity Digital Access</p>
        )}

        {/* No ServiceTabs strip here — this screen's own three tiles below
            already are the "switch service" UI. The pill is for the Food
            Order/PaDeliver Store screens, which have no equivalent tile
            list of their own once you're inside them. */}

        {/* No heading over the tiles. "3 ways to get what you need" and the
            line under it described what a passenger can already see — three
            named tiles — and cost the screen two lines before the first
            thing you can tap. */}

        {/* Book a Ride. Track Your Trip/Safety Feature used to be folded in
            right here, but that put it in front of someone who hasn't
            booked anything yet — it now lives inside the booking page
            itself (see TrackYourTripCard, rendered from PassengerPage),
            where it's actually relevant. */}
        <button
          type="button"
          onClick={() => navigate('/book')}
          className="flex w-full items-center gap-3 rounded-xl border border-gold-400 bg-white p-4 text-left shadow-sm transition hover:bg-gold-50"
        >
          {/* The drawn tricycle, in the logo's green with the app's yellow
              (see TricycleIcon). A crop of the logo file itself was tried
              here first and lost: at 48px the photograph-style mark brings
              the road swoosh and the pin in with the vehicle, and shrinking
              it further to exclude them leaves a tricycle too small to make
              out. A drawing keeps its shape at any size, which is the whole
              reason icons are drawn. */}
          <span className="flex h-12 w-12 shrink-0 items-center justify-center">
            <TricycleIcon className="h-full w-full" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-bold text-slate-900">BOOK A RIDE</span>
            <span className="block text-xs text-slate-700">
              Set where you are and where you are going. We find you the nearest driver.
            </span>
          </span>
          <span aria-hidden className="text-xl text-slate-500">›</span>
        </button>

        {/* Food Order and PaDeliver share one row — two columns, not two
            full-width bands under Book a Ride.
            Book a Ride keeps the whole width above them: it is the service
            this app is for, and these two are the other things it can also
            do. Side by side they are visibly a pair, and both stay on the
            first screen of a phone instead of the second.
            Stacked in their own cards they each read top-to-bottom now —
            icon, name, one line — because a name beside an icon inside half
            a phone's width has no room left for the line that explains it. */}
        <div className={vendorCatalogsAvailable ? 'grid grid-cols-2 items-stretch gap-2' : ''}>
          {/* Food Order — prepared food from a partner resto's own priced
              menu (VendorMenuBooking, resto_food catalog). */}
          {vendorCatalogsAvailable && (
            <button
              type="button"
              onClick={() => navigate('/book', { state: { section: 'food' } })}
              className="flex h-full w-full flex-col items-start gap-1.5 rounded-xl border border-gold-400 bg-white p-3 text-left shadow-sm transition hover:bg-gold-50"
            >
              {/* A photograph of food, from the same catalog the menus draw
                  their dishes from — a real plate of tapsilog rather
                  than the plate-and-cutlery emoji, which on most phones is a
                  grey place setting and looks like a table, not a meal. */}
              <img
                src="/food-photos/141-tapsilog.jpg"
                alt=""
                aria-hidden
                className="h-12 w-12 shrink-0 rounded-lg object-cover"
              />
              <span className="block text-base font-bold text-slate-900">FOOD ORDER</span>
              <span className="block text-xs text-slate-700">
                Cooked meals from a partner resto's own menu — delivered by your driver.
              </span>
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
              so it's offered even when Store isn't — and on its own it takes
              the full width back. */}
          <button
            type="button"
            onClick={() => navigate('/book', { state: { section: 'goods_store' } })}
            className="flex h-full w-full flex-col items-start gap-1.5 rounded-xl border border-gold-400 bg-white p-3 text-left shadow-sm transition hover:bg-gold-50"
          >
            {/* Same treatment as Food Order's — see the note there. */}
            <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center text-3xl leading-none">
              📦
            </span>
            <span className="block text-base font-bold text-slate-900">PaDeliver</span>
            <span className="block text-xs text-slate-700">Goods — from a store's shelf, or straight from you.</span>
          </button>
        </div>

        {/* Featured merchants & stores: one tile each, straight into that
            store's menu (/book?vendor=, which picks Food Order or PaDeliver's
            Store by the store's kind — see PassengerPage). The picture is the
            store's own logo, else its cover photo, else its kind's emoji. */}
        {stores.length > 0 && (
          <section>
            <h2 className="mb-2 mt-1 text-sm font-bold text-white">Featured merchants &amp; stores</h2>
            <div className="grid grid-cols-3 gap-2">
              {stores.map((s) => {
                const picture = s.logoDataUrl || s.coverPhotoDataUrl || s.bannerBackgroundDataUrl || null
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => navigate(`/book?vendor=${encodeURIComponent(s.id)}`)}
                    className="flex flex-col overflow-hidden rounded-xl border border-gold-400 bg-white text-left shadow-sm transition hover:bg-gold-50"
                  >
                    <span className="relative block aspect-square w-full bg-slate-100">
                      {picture ? (
                        <img src={picture} alt="" aria-hidden className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <span aria-hidden className="flex h-full w-full items-center justify-center text-4xl">
                          {s.businessType === 'resto_food' ? '🍽️' : '📦'}
                        </span>
                      )}
                      {!s.isOpen && (
                        <span className="absolute left-1 top-1 rounded bg-slate-900/75 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                          Closed
                        </span>
                      )}
                    </span>
                    <span className="block px-1.5 pb-1.5 pt-1">
                      <span className="line-clamp-2 text-[11px] font-bold leading-tight text-slate-900">{s.name}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-slate-500">{s.city}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )}
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
          <span className="block text-xs text-slate-700">
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
          <li>• One tap to call 911, your family, or local hotlines.</li>
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
            <li>• One tap to call 911, your family, or local hotlines.</li>
          </ul>
        </div>
      </div>
      <p className="bg-gold-400 px-4 py-1.5 text-center text-[11px] font-bold text-navy-900">
        TODA Ride Mobility — Safe Rides for You and Your Family
      </p>
    </section>
  )
}
