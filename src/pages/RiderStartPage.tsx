import { Link, useNavigate } from 'react-router-dom'
import { merchantCategoryTiles } from '../lib/merchantCategories'
import { TODA_MEANING } from '../lib/brand'
import { useRides } from '../context/RideContext'
import { useSession } from '../context/SessionContext'
import { familyLimitsFor } from '../lib/familyLimits'
import { terminalRideIsFree } from '../lib/terminalFee'
import { TricycleIcon } from '../components/TricycleIcon'

// The screen a passenger lands on after signing in. Two ways to get a ride,
// and they are genuinely different journeys rather than two buttons for the
// same thing: booking sends a request out to drivers, scanning records a
// tricycle the passenger is already standing next to. Putting the choice
// first — instead of dropping everyone into the booking form — is what makes
// the terminal path discoverable at all.
export function RiderStartPage() {
  const navigate = useNavigate()
  const { vendorsEnabled, pharmacies, passengers } = useRides()
  const { currentPassengerId } = useSession()
  // A child sees Food Order and PaDeliver only if their parent allows them.
  const me = passengers.find((p) => p.id === currentPassengerId)
  const limits = me ? familyLimitsFor(me, passengers) : null
  // Only the Food & Vendor partners switch matters here. Food Order and
  // PaDeliver's Store both check out through VendorMenuBooking and end up
  // as their own 'vendor_order' ride type (see buildMedsDeliveryRide in
  // RideContext.tsx) — genuinely distinct from the freeform Pabili errand
  // now, not borrowed from it, so nothing here depends on Super Admin's
  // Pabili switch at all. PaDeliver's "Book a Delivery" ('padala') was
  // already its own type and stays available regardless of either switch.
  const vendorCatalogsAvailable = vendorsEnabled && (!limits || limits.food)
  const padeliverAvailable = !limits || limits.padeliver
  // Every partner a passenger can order from — approved restos and goods
  // stores, the same set Food Order and PaDeliver's Store list — open ones
  // first, then by name. There is no separate "featured" flag yet, so all of
  // them are featured here.
  const stores = vendorCatalogsAvailable
    ? pharmacies
        .filter((p) => p.verificationStatus === 'approved')
        .sort((a, b) => Number(b.isOpen) - Number(a.isOpen) || a.name.localeCompare(b.name))
    : []
  // Pharmacies are deliberately not a category here: TODARIDE MEDS is off
  // (medsEnabled defaults false), and a Botika tile that opens a service
  // nobody has turned on is worse than no tile.
  const categoryTiles = merchantCategoryTiles(stores, { includeEmpty: true })
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
        {/* The TODA card was taken off every screen (2026-09-28); what TODA
            stands for stays. */}
        <p className="whitespace-nowrap text-center text-[17px] text-gold-400">{TODA_MEANING}</p>

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
          className="flex w-full items-center gap-3 rounded-xl border border-gold-400 bg-amber-50 p-4 text-left shadow-sm transition hover:bg-amber-100"
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

        {/* Family (2026-09-22): Book a Ride for a family member and follow
            their trip. A subscription later; free for now as an intro promo.
            Not for a member already in someone else's family — they are in the
            plan already, and cannot add members of their own. */}
        {!limits && (
        <button
          type="button"
          onClick={() => navigate('/book/family')}
          className="flex w-full items-center gap-3 rounded-xl border border-gold-400 bg-amber-50 p-3 text-left shadow-sm transition hover:bg-amber-100"
        >
          <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center text-3xl leading-none">
            👨‍👩‍👧
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="text-base font-bold text-slate-900">FAMILY</span>
              <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">1-year free promo</span>
            </span>
            <span className="mt-0.5 block text-sm font-extrabold uppercase leading-tight text-red-700">
              Protect your family. Save ₱6,000.
            </span>
            <span className="mt-0.5 block text-xs text-slate-700">
              Sign up now and get the ₱500/month Family Plan <span className="font-bold">FREE for 1 year</span>.
            </span>
            <span className="block text-xs text-slate-700">Book rides for your loved ones and follow their trip live.</span>
            <span className="mt-1 inline-block rounded-md bg-red-600 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-white">
              Sign up now — while the promo lasts!
            </span>
          </span>
          <span aria-hidden className="text-xl text-slate-500">›</span>
        </button>
        )}

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
              className="flex h-full w-full flex-col items-start gap-1.5 rounded-xl border border-gold-400 bg-amber-50 p-3 text-left shadow-sm transition hover:bg-amber-100"
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
          {padeliverAvailable && (
          <button
            type="button"
            onClick={() => navigate('/book', { state: { section: 'goods_store' } })}
            className="flex h-full w-full flex-col items-start gap-1.5 rounded-xl border border-gold-400 bg-amber-50 p-3 text-left shadow-sm transition hover:bg-amber-100"
          >
            {/* Same treatment as Food Order's — see the note there. */}
            <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center text-3xl leading-none">
              📦
            </span>
            <span className="block text-base font-bold text-slate-900">PaDeliver</span>
            <span className="block text-xs text-slate-700">Goods — from a store's shelf, or straight from you.</span>
          </button>
          )}
        </div>

        {/* What kind of shop, not which shop.
            This was one tile per merchant, which works for eight stores and
            stops working at thirty: a passenger who wants lunch had to read
            every hardware store on the way past, and a new merchant made the
            grid longer rather than the app more useful. Categories are a
            fixed, short list that stays the same size as the pilot grows —
            see lib/merchantCategories for why these particular ones.

            Every category is drawn, including the ones with no merchant
            yet — those are marked Coming soon and cannot be tapped. Two
            reasons. A passenger learns in one glance what this app is for,
            which an app with four tiles does not tell them. And an empty
            tile is a recruiting poster: somebody who sees Tubig greyed out
            and knows a refilling station is exactly how the next merchant
            gets asked.

            They are not tappable, though. A tile that opens an empty list
            is a promise the app cannot keep, and somebody who taps and
            finds nothing learns not to tap anything. Greyed and inert says
            "not yet" without ever lying. */}
        {categoryTiles.length > 0 && (
          <section>
            <h2 className="mb-2 mt-1 text-sm font-bold text-white">Shop by category</h2>
            <div className="grid grid-cols-3 gap-2">
              {categoryTiles.map((c) => {
                const open = c.count > 0
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={!open}
                    aria-label={open ? undefined : `${c.label} — coming soon, no stores yet`}
                    onClick={() =>
                      navigate('/book', {
                        state: {
                          section: c.catalog === 'food' ? 'food_order' : 'goods_store',
                          merchantCategory: c.id,
                        },
                      })
                    }
                    className={`flex flex-col items-center gap-0.5 rounded-xl border px-1.5 py-2.5 text-center transition ${
                      open
                        ? 'border-gold-400 bg-white shadow-sm hover:bg-gold-50'
                        : 'cursor-default border-white/15 bg-white/5'
                    }`}
                  >
                    {/* Drained of colour rather than hidden: the shape of the
                        category still reads, which is the point of showing it. */}
                    <span aria-hidden className={`text-3xl leading-none ${open ? '' : 'opacity-40 grayscale'}`}>
                      {c.emoji}
                    </span>
                    <span
                      className={`mt-0.5 block text-[11px] font-bold leading-tight ${
                        open ? 'text-slate-900' : 'text-white/50'
                      }`}
                    >
                      {c.label}
                    </span>
                    <span className={`block text-[9px] leading-tight ${open ? 'text-slate-500' : 'text-white/30'}`}>
                      {c.sublabel}
                    </span>
                    {/* The count is the honest part: it says how much is
                        actually behind the tile before anybody taps it, and
                        says plainly when the answer is nothing. */}
                    {open ? (
                      <span className="mt-0.5 block text-[9px] font-semibold text-brand-700">
                        {c.count} {c.count === 1 ? 'store' : 'stores'}
                      </span>
                    ) : (
                      <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-wide text-gold-400/70">
                        Coming soon
                      </span>
                    )}
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
