import { useState } from 'react'
import { RealLiveMap, type MapPoint } from './RealLiveMap'
import { DestinationSearch } from './DestinationSearch'
import { formatAddressLine } from '../lib/addressFormat'
import { createCustomLocation, reverseGeocodeToPhAddress, type PhAddressTags } from '../lib/customLocation'
import { getCurrentGeoPosition } from '../lib/geo'
import { STREET_PIN_NOTE, streetLinesFor } from '../lib/streetPaths'
import { useRides } from '../context/RideContext'
import type { GeoCoords, MockLocation, Pharmacy } from '../types'

// Same fallback the vendor's own location picker and buildMedsDeliveryRide
// use for a store that has never pinned itself — so the map opens on the
// same spot the delivery would actually be routed from.
const DEFAULT_STORE_GPS: GeoCoords = { lat: 15.7940977, lng: 120.9905849 }

// The delivery-location half of a Food Express checkout, on the same live map
// the ride booking uses (see LocationMapPicker/RealLiveMap). Two pins: the
// vendor's store, fixed, so the customer can see how far the food travels;
// and "Deliver to", which a tap places and a drag corrects. The GPS button
// sits beside Legend exactly as it does on the vendor's own pin screen
// (VendorLocationPicker) — one map, one set of controls, whichever side of
// the order you are on.
//
// A pin resolves through reverseGeocodeToPhAddress so the caller gets both a
// readable label for the vendor/driver and a province/city/barangay guess to
// seed the dropdown form beneath it — the same contract PassengerPage's
// onPinDropoff follows.
export function DeliveryMapPicker({
  vendor,
  deliveryAddress,
  onChange,
  city,
}: {
  vendor: Pharmacy
  deliveryAddress: MockLocation | null
  onChange: (location: MockLocation, guess: PhAddressTags | null) => void
  // Scopes the Find Barangay box on the map's button row — the same box
  // Book a Ride has beside Legend, so a customer can jump the pin to their
  // barangay and then drag it the last few metres. Defaults to the store's
  // own city: the delivery almost always stays inside it.
  city?: string
}) {
  const [status, setStatus] = useState<'idle' | 'locating' | 'error'>('idle')
  const { landmarks } = useRides()
  const streetLines = streetLinesFor(deliveryAddress, landmarks)
  const [error, setError] = useState('')

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
      setError("Couldn't place that pin — try tapping again.")
    }
  }

  async function pinMyGps() {
    setStatus('locating')
    setError('')
    try {
      await placePin(await getCurrentGeoPosition())
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Could not get your location.')
    }
  }

  const storeGps = vendor.locationGps ?? DEFAULT_STORE_GPS
  const storeIcon = vendor.businessType === 'pharmacy' || vendor.businessType === 'store' ? 'pharmacy' : 'resto'
  const points: MapPoint[] = [
    { id: 'store', gps: storeGps, color: '#ea580c', label: vendor.name, icon: storeIcon },
    ...(deliveryAddress?.gps
      ? [{ id: 'dropoff', gps: deliveryAddress.gps, color: '#e11d48', label: `Deliver to — ${formatAddressLine(deliveryAddress.label)}` }]
      : []),
  ]

  return (
    <div className="space-y-1">
      <div className="rounded-lg bg-slate-50 px-2 py-1 text-[11px] leading-tight">
        <p className="truncate text-[#ea580c]">🍽️ {vendor.name}</p>
        <p className={`truncate ${deliveryAddress ? 'font-semibold text-dest-accent' : 'text-slate-400'}`}>
          🏁 {deliveryAddress ? formatAddressLine(deliveryAddress.label) : 'Deliver to — tap the map to pin it'}
        </p>
      </div>
      {streetLines && (
        <p className="rounded-md border border-green-300 bg-green-50 px-2 py-1 text-[11px] font-medium text-green-800">
          🛣️ {STREET_PIN_NOTE}
        </p>
      )}
      <RealLiveMap
        points={points}
        streetLines={streetLines ?? undefined}
        frameLines={streetLines ?? undefined}
        onMapClick={(gps) => void placePin(gps)}
        draggableIds={deliveryAddress?.gps ? ['dropoff'] : []}
        onPointDragEnd={(_, gps) => void placePin(gps)}
        // Re-frame on every new pin so a fix that lands off-screen (the GPS
        // button, a barangay picked in the form below) is brought into view.
        refitSignal={deliveryAddress?.id ?? 'none'}
        height="260px"
        toolbarAction={
          <>
            <DestinationSearch
              city={city || vendor.city}
              near={deliveryAddress?.gps ?? storeGps}
              // A barangay is a named point already — no reverse-geocode
              // round trip; the pin lands on it and the customer drags it
              // to the exact gate.
              onSelect={(place) => onChange(createCustomLocation(place.name, place.gps), null)}
              barangayOnly
              noMatchNote="Search for barangay and move the pin (dot) to the desired location."
              placeholder="🔍 Find Barangay"
              className="relative z-[80] w-36 sm:w-44"
              resultsClassName="absolute left-0 top-full mt-1 w-72 max-h-64 overflow-y-auto"
              inputClassName="w-full rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-600 placeholder:font-normal"
            />
            <button
              type="button"
              onClick={() => void pinMyGps()}
              disabled={status === 'locating'}
              className="whitespace-nowrap rounded-md border border-brand-300 bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand-700 transition hover:bg-brand-100 disabled:opacity-60"
            >
              {status === 'locating' ? '📍 Locating…' : '📍 My GPS'}
            </button>
          </>
        }
      />
      <p className="text-center text-[11px] text-slate-500">
        Tap the map or drag the <span className="font-semibold text-dest-accent">🏁 pin</span> to where the food should be delivered.
      </p>
      {status === 'locating' && <p className="text-[11px] text-slate-400">📍 Locating that spot…</p>}
      {status === 'error' && <p className="text-[11px] text-amber-700">{error}</p>}
    </div>
  )
}
