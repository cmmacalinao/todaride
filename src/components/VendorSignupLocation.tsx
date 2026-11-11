import { useEffect, useRef, useState } from 'react'
import { getCurrentGeoPosition } from '../lib/geo'
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
        if (!cancelled && location?.gps) onChange(location.gps)
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

  function movePin(next: GeoCoords) {
    setPinnedByHand(true)
    onChange(next)
  }

  // For the owner standing in their own store, which is the truest answer
  // there is and one tap instead of hunting a rooftop.
  async function pinMyGps() {
    setGpsStatus('locating')
    try {
      movePin(await getCurrentGeoPosition())
      setGpsStatus('idle')
    } catch {
      setGpsStatus('error')
    }
  }

  // RealLiveMap renders nothing at all with an empty points array, so the pin
  // always exists — on the fallback centre until the address resolves. A map
  // that appears the moment you have picked a barangay, with a pin to drag,
  // is the whole prompt; an empty space where a map should be teaches nobody
  // that there is anything to do here.
  const shownGps = gps ?? DEFAULT_GPS
  const points: MapPoint[] = [{ id: 'store', gps: shownGps, color: '#ea580c', label: 'Your store', icon: 'resto' }]

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
            <RealLiveMap
              points={points}
              onMapClick={movePin}
              draggableIds={['store']}
              onPointDragEnd={(_, next) => movePin(next)}
              height="180px"
            />
          </div>
          <p className="mt-1 text-[11px] leading-snug text-slate-500">
            {geocoding
              ? 'Finding your barangay on the map…'
              : pinnedByHand
                ? '✓ Pinned. This is where riders will come to pick up orders.'
                : gps
                  ? 'Tap the map or drag the pin to your door. Riders are routed here, and your delivery fare is priced from it — the address alone only gets us to the barangay.'
                  : // The pin is sitting on the fallback centre, which is
                    // almost certainly not their street. Say so, rather than
                    // let a pin that means nothing look like an answer.
                    'We could not place your barangay automatically. Tap the map where your store is — until you do, we will use your typed address.'}
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
