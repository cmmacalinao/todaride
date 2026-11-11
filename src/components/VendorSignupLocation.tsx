import { useEffect, useRef, useState } from 'react'
import { getCurrentGeoPosition, haversineDistanceMeters } from '../lib/geo'
import { resolvePhAddress } from '../lib/customLocation'
import { RealLiveMap, type MapPoint } from './RealLiveMap'
import type { GeoCoords } from '../types'
import type { PhAddressValue } from './PhAddressFields'

// Somewhere to centre the map before the address has been resolved — the
// same fallback VendorLocationPicker and buildMedsDeliveryRide already use,
// so an unpinned store sits where the delivery logic would put it anyway.
const DEFAULT_GPS: GeoCoords = { lat: 15.7940977, lng: 120.9905849 }

// The geocode is a network lookup, and this form must not depend on it: on a
// slow connection, offline, or on the isolated dev server it simply never
// answers. Past this it stops saying "finding" and lets the merchant place
// the pin themselves, which is the better answer anyway.
const GEOCODE_TIMEOUT_MS = 6000

// Where the store actually is, asked at sign-up instead of months later.
//
// A merchant's locationGps is the pickup point every delivery is routed to,
// and the distance every delivery fare is priced on (see
// buildMedsDeliveryRide and the "Starts at" quote in VendorMenuBooking). Up
// to now sign-up only geocoded the typed province/city/barangay, which lands
// somewhere in the right barangay — fine for appearing on a map, wrong by
// enough to misprice a short delivery and to send a rider to the wrong
// corner. The exact pin existed only in VendorLocationPicker, reachable from
// inside the portal after registration, which almost nobody opens.
//
// So the pin is here, already placed on the geocoded guess rather than
// starting empty: a merchant who ignores it is no worse off than before, and
// one who drags it once gives every future rider the real storefront.
export function VendorSignupLocation({
  address,
  gps,
  onChange,
}: {
  address: PhAddressValue
  gps: GeoCoords | null
  onChange: (gps: GeoCoords | null) => void
}) {
  const [geocoding, setGeocoding] = useState(false)
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'locating' | 'error'>('idle')
  // Whether the merchant has moved the pin themselves. Once they have, a
  // later edit to the address must not yank it back to the barangay centre —
  // the typed address is a guess and the pin is an answer.
  const [pinnedByHand, setPinnedByHand] = useState(false)
  // The address the current guess was made from, so re-running only happens
  // when the address actually changed.
  const lastGeocoded = useRef<string | null>(null)

  const addressKey = `${address.province}|${address.city}|${address.barangay}`
  const ready = !!address.province && !!address.city && !!address.barangay

  useEffect(() => {
    if (!ready || pinnedByHand || lastGeocoded.current === addressKey) return
    let cancelled = false
    let settled = false
    lastGeocoded.current = addressKey
    setGeocoding(true)
    void (async () => {
      try {
        const location = await Promise.race([
          resolvePhAddress({
            province: address.province,
            city: address.city,
            barangay: address.barangay,
            addressDetail: address.addressDetail.trim(),
          }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), GEOCODE_TIMEOUT_MS)),
        ])
        if (!cancelled && location?.gps) placeAutomatically(location.gps)
      } catch {
        // A failed lookup just leaves the map empty with its prompt showing;
        // registration never depended on this and still does not.
      } finally {
        settled = true
        // Cleared whether or not this run was cancelled. Guarding it meant a
        // cancelled run left the "finding…" note up forever, because the run
        // that replaced it had already been turned away by the lastGeocoded
        // check below — which is exactly what React's development double-mount
        // does on every visit to this form.
        setGeocoding(false)
      }
    })()
    return () => {
      cancelled = true
      // A run that never finished does not get to keep the claim on this
      // address, or the retry after it would skip the lookup entirely.
      if (!settled) lastGeocoded.current = null
    }
    // onChange is a setState from the parent and stable enough; re-running on
    // its identity would geocode on every keystroke of the address detail.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressKey, ready, pinnedByHand])

  // Where the map was last put by something other than the merchant's own
  // dragging — the geocoded barangay, or their phone's fix. The centre pin
  // reports a position constantly, including the one the map opens on, so
  // without this every mount would count as "they placed it themselves" and
  // the address lookup would never be allowed to move the map again.
  const autoPlaced = useRef<GeoCoords | null>(null)
  // Bumped when we move the map ourselves, to make it fly there.
  const [refit, setRefit] = useState(0)

  function placeAutomatically(next: GeoCoords) {
    autoPlaced.current = next
    setRefit((n) => n + 1)
    onChange(next)
  }

  // The map moves under a fixed pin, so this fires continuously as it is
  // dragged. Anything within a few metres of where we put the map ourselves
  // is that same spot settling, not a choice.
  function handleCenterChange(next: GeoCoords) {
    const from = autoPlaced.current
    if (!from || haversineDistanceMeters(from, next) > 15) setPinnedByHand(true)
    onChange(next)
  }

  // For the owner standing in their own store, which is the truest answer
  // there is and one tap instead of hunting a rooftop.
  async function pinMyGps() {
    setGpsStatus('locating')
    try {
      const here = await getCurrentGeoPosition()
      placeAutomatically(here)
      // Their own fix is a deliberate answer, not a guess to be overwritten
      // by a later edit to the typed address.
      setPinnedByHand(true)
      setGpsStatus('idle')
    } catch {
      setGpsStatus('error')
    }
  }

  // RealLiveMap renders nothing at all with an empty points array, so there
  // is always a point: on the fallback centre until the address resolves. It
  // is what the map frames itself around — the pin the merchant actually
  // aims is the fixed one at the centre, drawn by the map itself.
  const shownGps = gps ?? DEFAULT_GPS
  // No label and no icon on this one: the centre pin is already saying "your
  // store", and a second labelled storefront glyph a few pixels under it
  // read as two different places in a map this small. What is left is a dot
  // marking the exact spot the pin's tip is on.
  const points: MapPoint[] = [{ id: 'store', gps: shownGps, color: '#ea580c', label: '' }]

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="block text-xs font-medium text-slate-500">
          Set your exact location <span className="font-normal text-slate-400">(recommended)</span>
        </label>
        <button
          type="button"
          onClick={pinMyGps}
          disabled={gpsStatus === 'locating'}
          className="rounded-md border border-brand-300 bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-60"
        >
          {gpsStatus === 'locating' ? 'Locating…' : '📍 Use my GPS'}
        </button>
      </div>
      {ready ? (
        <>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            {/* The map is the pointer: the pin stands still in the middle of
                the frame and the merchant slides their own doorway under it.
                A pin small enough to grab is smaller than the thumb grabbing
                it, and the thumb covers the very spot being chosen — moving
                the map instead leaves the target visible the whole time. */}
            <RealLiveMap
              points={points}
              hideLegend
              centerPin
              centerPinColor="#ea580c"
              centerPinLabel="Your store"
              onCenterChange={handleCenterChange}
              // Frame it once, then it is theirs to move; flying only when we
              // put it somewhere ourselves (the address resolving, or GPS).
              fitOnce
              refitSignal={`place:${refit}`}
              singlePointZoom={17}
              height="200px"
            />
          </div>
          <p className="mt-1 text-[11px] leading-snug text-slate-500">
            {geocoding
              ? 'Finding your barangay on the map…'
              : pinnedByHand
                ? '✓ Pinned. This is where riders will come to pick up orders.'
                : gps
                  ? 'Drag the map until the pin sits on your door. Riders are routed to it, and your delivery fare is priced from it — the address alone only gets us to the barangay.'
                  : // The pin is sitting on the fallback centre, which is
                    // almost certainly not their street. Say so, rather than
                    // let a pin that means nothing look like an answer.
                    'We could not place your barangay automatically. Drag the map to your store — until you do, we will use your typed address.'}
          </p>
        </>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-[11px] text-slate-400">
          Pick your province, city and barangay above and the map will open here.
        </p>
      )}
      {gpsStatus === 'error' && (
        <p className="mt-1 text-[11px] text-amber-700">
          Could not read your phone's location. Tap the map to place the pin instead.
        </p>
      )}
    </div>
  )
}
