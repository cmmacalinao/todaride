import { useState, type ReactNode } from 'react'
import { RealLiveMap, type MapPoint } from './RealLiveMap'
import { DestinationSearch } from './DestinationSearch'
import { formatAddressLine } from '../lib/addressFormat'
import { createCustomLocation, reverseGeocodeToPhAddress, type PhAddressTags } from '../lib/customLocation'
import { DEFAULT_BOOKING_PROVINCE, getCitiesForProvince } from '../mock/data'
import type { GeoCoords, MockLocation, Pharmacy } from '../types'

// Same fallback the vendor's own location picker and buildMedsDeliveryRide
// use for a store that has never pinned itself — so the map opens on the
// same spot the delivery would actually be routed from.
const DEFAULT_STORE_GPS: GeoCoords = { lat: 15.7940977, lng: 120.9905849 }
// Book a Ride's destination green — the centre pin, the flag and the strip.
const DEST_GREEN = '#16a34a'

// The delivery half of a Food Order / PaDeliver Store checkout, set exactly
// the way Book a Ride sets a destination (2026-09-22):
//   - a green "Where to?" search in the map's top row, whose no-match line
//     offers Fill Address Form or Set on Map;
//   - a green centre pin the map slides under, and "🏁 Set Destination here"
//     under the map, with the order button straight below it;
//   - in full screen, Where to (and the address form, when opened) along the
//     top, Set Destination and the order button along the bottom.
// No tap-to-place and no My GPS button, the same as Book a Ride now.
//
// A pin resolves through reverseGeocodeToPhAddress, so the caller gets both a
// readable label for the vendor/driver and a province/city/barangay guess to
// seed its address form with — the same contract PassengerPage's
// onPinDropoff follows.
export function DeliveryMapPicker({
  vendor,
  deliveryAddress,
  onChange,
  city,
  onOpenAddressForm,
  addressForm,
  action,
}: {
  vendor: Pharmacy
  deliveryAddress: MockLocation | null
  onChange: (location: MockLocation, guess: PhAddressTags | null) => void
  // Scopes the Where to search. Defaults to the store's own city: a delivery
  // almost always stays inside it.
  city?: string
  // Fill Address Form, from Where to's no-match line.
  onOpenAddressForm?: () => void
  // The address form while it is open (null otherwise): under Where to in
  // full screen, above the map in the page.
  addressForm?: ReactNode
  // The order button, under Set Destination here — in the page and in full
  // screen alike.
  action?: ReactNode
}) {
  const [status, setStatus] = useState<'idle' | 'locating' | 'error'>('idle')
  const [error, setError] = useState('')
  const [centerGps, setCenterGps] = useState<GeoCoords | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  // The City row above the map, as on Book a Ride: it scopes the Where to
  // search (that city first, then the towns next to it).
  const [cityScope, setCityScope] = useState(city || vendor.city)

  async function placePin(gps: GeoCoords) {
    setStatus('locating')
    setError('')
    try {
      const { label, guess } = await reverseGeocodeToPhAddress(gps)
      const location = createCustomLocation(
        label ?? `Pinned location (${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)})`,
        gps,
        guess ?? undefined,
      )
      onChange(location, guess)
      setStatus('idle')
    } catch {
      setStatus('error')
      setError("Couldn't set that spot — move the map a little and try again.")
    }
  }

  const storeGps = vendor.locationGps ?? DEFAULT_STORE_GPS
  const storeIcon = vendor.businessType === 'pharmacy' || vendor.businessType === 'store' ? 'pharmacy' : 'resto'
  const points: MapPoint[] = [
    { id: 'store', gps: storeGps, color: '#ea580c', label: vendor.name, icon: storeIcon },
    ...(deliveryAddress?.gps
      ? [{ id: 'dropoff', gps: deliveryAddress.gps, color: DEST_GREEN, icon: 'dropoff' as const, label: formatAddressLine(deliveryAddress.label) }]
      : []),
  ]

  // Book a Ride's Where to strip: faded green, a dot, the search inline.
  const whereTo = (
    <div className="relative flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-green-500/40 bg-green-500/15 px-3 py-1.5 shadow-sm">
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-dest-dot" />
      {deliveryAddress && (
        <span className="sr-only">Delivering to {formatAddressLine(deliveryAddress.label)}</span>
      )}
      <DestinationSearch
        city={cityScope}
        near={deliveryAddress?.gps ?? storeGps}
        // A landmark is a named point already — no reverse-geocode round trip.
        onSelect={(place) => onChange(createCustomLocation(place.name, place.gps), null)}
        onOpenAddressForm={onOpenAddressForm}
        // The centre pin is already the way to set it on the map.
        onPinOnMap={() => undefined}
        placeholder={deliveryAddress ? `Where to: ${formatAddressLine(deliveryAddress.label)}` : 'Where to?'}
        className="min-w-0 flex-1"
        resultsClassName="absolute inset-x-0 top-full z-[80] mt-1 max-h-72 overflow-y-auto"
        inputClassName={`map-toolbar-input w-full min-w-0 bg-transparent text-sm font-semibold text-green-900 focus:outline-none ${
          deliveryAddress ? 'placeholder:font-semibold placeholder:text-green-900' : 'placeholder:font-normal placeholder:text-green-800/70'
        }`}
      />
    </div>
  )

  const setDestination = (
    <button
      type="button"
      disabled={!centerGps || status === 'locating'}
      onClick={() => centerGps && void placePin(centerGps)}
      className="mt-1.5 w-full rounded-lg border border-green-500/40 bg-green-500/15 py-1.5 text-xs font-bold text-green-900 transition hover:bg-green-500/25 disabled:opacity-60"
    >
      {status === 'locating' ? '📍 Locating that spot…' : '🏁 Set Destination here'}
    </button>
  )

  const cityRow = (
    <div className="flex items-center gap-2">
      <label htmlFor="delivery-city" className="shrink-0 text-xs font-semibold uppercase tracking-wide text-dest-accent">
        City
      </label>
      <select
        id="delivery-city"
        value={cityScope}
        onChange={(e) => setCityScope(e.target.value)}
        className="compact-input min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
      >
        <option value="">Select city…</option>
        {getCitiesForProvince(DEFAULT_BOOKING_PROVINCE).map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  )

  return (
    <div className="space-y-1">
      {!fullscreen && cityRow}
      {!fullscreen && addressForm}
      <RealLiveMap
        points={points}
        hideLegend
        centerPin
        centerPinColor={DEST_GREEN}
        onCenterChange={setCenterGps}
        // Frame the store and the delivery point once; after that the
        // customer moves the map, not the map the customer.
        fitOnce
        refitSignal={deliveryAddress?.id ?? 'none'}
        height="320px"
        onFullscreenChange={setFullscreen}
        // One Where to at a time: in the toolbar row normally, along the top
        // in full screen (with the address form under it when open).
        overlayTop={fullscreen ? undefined : whereTo}
        overlayTopInline
        fullscreenTop={
          <div className="space-y-1">
            {cityRow}
            <div className="relative flex items-stretch gap-1">{whereTo}</div>
            {addressForm && <div className="mt-1 rounded-lg bg-white/95 p-2 shadow-sm">{addressForm}</div>}
          </div>
        }
        overlayBottom={(isFullscreen) =>
          isFullscreen ? (
            <div className="rounded-xl bg-white/95 p-1.5 pt-0 shadow-lg">
              {setDestination}
              {action && <div className="mt-1.5">{action}</div>}
            </div>
          ) : null
        }
      />
      {!fullscreen && (
        <>
          {setDestination}
          {action && <div className="mt-1.5">{action}</div>}
        </>
      )}
      {status === 'error' && <p className="text-[11px] text-amber-700">{error}</p>}
    </div>
  )
}
