import { useState } from 'react'
import { useRides } from '../context/RideContext'
import { getCurrentGeoPosition } from '../lib/geo'
import { RealLiveMap, type MapPoint } from './RealLiveMap'
import type { GeoCoords, LandmarkCategory, Pharmacy } from '../types'

// A default fallback identical to buildMedsDeliveryRide's own — the driver
// route already treats an unset locationGps this way, so a vendor who has
// never pinned yet sees the same starting point the delivery logic would use
// in their place, not an arbitrary different one.
const DEFAULT_GPS: GeoCoords = { lat: 15.7940977, lng: 120.9905849 }

// Every landmark this component might create/update for a vendor uses this
// id, so re-saving updates the same entry instead of piling up duplicates —
// and so this can tell whether one already exists without keeping its own
// separate flag anywhere.
function vendorLandmarkId(pharmacyId: string) {
  return `landmark-vendor-${pharmacyId}`
}

// Landmark categories are the general "what kind of place is this" set a
// passenger's destination search matches against — no bespoke "pharmacy" or
// "resto" category exists there, so this maps to whichever existing one
// reads closest, the same mapping the OSM seed sweep used for real pharmacy
// chains (see mock/data.ts).
function landmarkCategoryFor(businessType: Pharmacy['businessType']): LandmarkCategory {
  switch (businessType) {
    case 'pharmacy':
      return 'hospital'
    case 'store':
      return 'market'
    default:
      return 'other'
  }
}

// Lets a vendor drop their store's exact pin on the same live map the ride
// feature already uses (see RealLiveMap/LocationMapPicker), reached from
// "View on Map" in their own header (see VendorHeaderCard's onPinLocation).
// This is not cosmetic: locationGps is the actual pickup point a driver is
// routed to for every delivery from this vendor (see buildMedsDeliveryRide in
// RideContext.tsx) — an accurate pin means a driver lands at the real
// storefront instead of wherever the barangay-level address happens to guess.
export function VendorLocationPicker({ pharmacy, onBack }: { pharmacy: Pharmacy; onBack: () => void }) {
  const { landmarks, updatePharmacyLocation, addLandmark, updateLandmark, removeLandmark } = useRides()
  const [gps, setGps] = useState<GeoCoords>(pharmacy.locationGps ?? DEFAULT_GPS)
  const [saved, setSaved] = useState(false)
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'locating' | 'error'>('idle')
  const existingLandmark = landmarks.find((l) => l.id === vendorLandmarkId(pharmacy.id))
  // Defaults to whatever is already true — a vendor who listed themselves
  // last time stays listed on their next visit here without having to
  // re-tick anything, and one who never has starts unticked.
  const [listAsLandmark, setListAsLandmark] = useState(!!existingLandmark)

  function movePin(next: GeoCoords) {
    setGps(next)
    setSaved(false)
  }

  // For the owner standing inside the store: the phone's own fix is the
  // truest answer there is, and one tap beats hunting the right rooftop on
  // the map. Same helper the ride map's "My GPS Location" button uses.
  async function pinMyGps() {
    setGpsStatus('locating')
    try {
      movePin(await getCurrentGeoPosition())
      setGpsStatus('idle')
    } catch {
      setGpsStatus('error')
    }
  }

  function handleSave() {
    updatePharmacyLocation(pharmacy.id, gps)
    // Ticked: create the landmark the first time, or just move/rename it on
    // every later save so it never drifts from the pickup pin above.
    // Unticked (including "was listed, now isn't"): remove it — the same
    // toggle either sets this up or tears it back down.
    const id = vendorLandmarkId(pharmacy.id)
    if (listAsLandmark) {
      const record = {
        name: pharmacy.name,
        aliases: [],
        category: landmarkCategoryFor(pharmacy.businessType),
        city: pharmacy.city,
        gps,
        todaOrgId: null,
      }
      if (existingLandmark) updateLandmark(id, record)
      else addLandmark({ id, ...record })
    } else if (existingLandmark) {
      removeLandmark(id)
    }
    setSaved(true)
  }

  const icon = pharmacy.businessType === 'pharmacy' || pharmacy.businessType === 'store' ? 'pharmacy' : 'resto'
  const points: MapPoint[] = [{ id: 'store', gps, color: '#ea580c', label: pharmacy.name, icon }]

  return (
    <div className="space-y-3 p-4">
      <button
        type="button"
        onClick={onBack}
        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
      >
        ‹ Back
      </button>
      <div>
        <h2 className="text-sm font-semibold text-slate-700">📍 Pin your store's location</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Tap the map or drag the pin to exactly where drivers should pick up orders — this is what actually routes a
          driver to you, not just the address you typed.
        </p>
      </div>
      <RealLiveMap
        points={points}
        onMapClick={movePin}
        draggableIds={['store']}
        onPointDragEnd={(_, next) => movePin(next)}
        height="320px"
        toolbarAction={
          <button
            type="button"
            onClick={() => void pinMyGps()}
            disabled={gpsStatus === 'locating'}
            className="whitespace-nowrap rounded-md border border-brand-300 bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand-700 transition hover:bg-brand-100 disabled:opacity-60"
          >
            {gpsStatus === 'locating' ? '📍 Locating…' : '📍 Pin my GPS location'}
          </button>
        }
      />
      {gpsStatus === 'error' && (
        <p className="text-[11px] text-amber-700">Couldn't read your GPS — allow location access, or tap the map instead.</p>
      )}
      {/* A driver already gets routed to this pin for deliveries — this is
          the separate question of whether a passenger can find the store by
          name at all, the same way they'd search for a market or a school.
          Off by default for a vendor who has never listed themselves, so
          nobody ends up in destination search without having asked to be. */}
      <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={listAsLandmark}
          onChange={(e) => {
            setListAsLandmark(e.target.checked)
            setSaved(false)
          }}
          className="mt-0.5"
        />
        <span>
          <span className="font-semibold text-slate-700">List this store as a searchable landmark</span>
          <br />
          Lets a passenger find "{pharmacy.name}" by name when booking a ride here — not just for delivery pickup.
        </span>
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          className="flex-1 rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700"
        >
          Save location
        </button>
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Done
        </button>
      </div>
      {saved && (
        <p className="text-center text-[11px] font-medium text-emerald-600">
          Saved — drivers will now be routed here{listAsLandmark ? ', and passengers can search for this store by name.' : '.'}
        </p>
      )}
    </div>
  )
}
