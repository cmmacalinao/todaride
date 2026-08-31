import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarangayAddressPicker } from '../components/BarangayAddressPicker'
import { LocationMapPicker } from '../components/LocationMapPicker'
import { TerminalBoardingPanel } from '../components/TerminalBoardingPanel'
import { useRides } from '../context/RideContext'
import { resolvePhAddress, type PhAddressTags } from '../lib/customLocation'
import { formatKm } from '../lib/geo'
import { useRoute } from '../lib/routing'
import {
  CLSU_MAIN_GATE_LOCATION,
  DEFAULT_BOOKING_CITY,
  DEFAULT_BOOKING_PROVINCE,
  DEFAULT_DROPOFF_LOCATION,
  MOCK_LOCATIONS,
} from '../mock/data'
import type { MockLocation } from '../types'

// Sakay sa Terminal — recording a tricycle you are already sitting in.
//
// This used to be a branch inside PassengerPage, sharing that page's pickup,
// destination, picker seed and single map instance. Sharing was the cheap way
// to build it and the expensive way to own it: every booking rule had to be
// asked "except on Track my trip?", and the answer was usually yes. The map
// re-framed on choices this screen does not make, the destination form had to
// be threaded through a prop meant for booking, and the pickup half of the
// form had to be suppressed rather than simply absent.
//
// Its own page keeps its own smaller state, and the differences stop being
// exceptions. There is no pickup here — the app takes the start from the
// phone the moment a trip records itself, so a box asking for it would invite
// somebody to answer a question about to be answered better.
export function TrackMyTripPage() {
  const navigate = useNavigate()
  const { terminals } = useRides()

  // Locations pinned or typed on this screen only. Booking keeps its own;
  // neither needs to see the other's, and not sharing them is what stops a
  // destination set here turning up in a booking form later.
  const [customLocations, setCustomLocations] = useState<MockLocation[]>([])
  const [dropoffId, setDropoffId] = useState(DEFAULT_DROPOFF_LOCATION.id)
  const [dropoffChosen, setDropoffChosen] = useState(false)
  const [destOpen, setDestOpen] = useState(false)
  const [mapTarget, setMapTarget] = useState<'pickup' | 'dropoff'>('dropoff')
  const [pickerSeed, setPickerSeed] = useState({
    key: 0,
    province: '',
    city: '',
    barangay: '',
    addressDetail: '',
  })

  const allLocations = [...MOCK_LOCATIONS, ...customLocations]
  const dropoff = allLocations.find((l) => l.id === dropoffId) ?? DEFAULT_DROPOFF_LOCATION
  // The map wants two ends. Only one is a question here, so the other is the
  // gate — drawn as scenery, never as a claim about where the passenger is.
  const pickup = CLSU_MAIN_GATE_LOCATION

  const plannedRoute = useRoute(dropoffChosen ? pickup.gps : null, dropoffChosen ? dropoff.gps : null)

  async function handleResolve(address: PhAddressTags) {
    setDropoffChosen(true)
    const location = await resolvePhAddress(address)
    setCustomLocations((prev) => [...prev, location])
    setDropoffId(location.id)
  }

  // No Group Ride branch, and no pickup branch. Both existed only because
  // this lived on the booking page.
  function handlePin(location: MockLocation, guess: PhAddressTags | null) {
    setDropoffChosen(true)
    setCustomLocations((prev) => [...prev, location])
    setDropoffId(location.id)
    if (guess) {
      setPickerSeed((prev) => ({
        key: prev.key + 1,
        province: guess.province,
        city: guess.city,
        barangay: guess.barangay,
        addressDetail: guess.addressDetail ?? '',
      }))
    }
  }

  function useSavedPlace(place: MockLocation) {
    setDropoffChosen(true)
    setDropoffId(place.id)
    setDestOpen(false)
  }

  // Folded until the Destination tab is chosen, gone again once the address
  // is confirmed. The tab is the question; the boxes are the answer, and they
  // belong together rather than as a strip elsewhere on the page.
  const destinationForm = destOpen && mapTarget === 'dropoff' && (
    <div className="space-y-2 rounded-lg bg-slate-50/70 p-2">
      <div className="-mx-1 flex flex-nowrap gap-1 overflow-x-auto px-1 pb-0.5">
        {MOCK_LOCATIONS.slice(0, 6).map((place: MockLocation) => (
          <button
            key={place.id}
            type="button"
            onClick={() => useSavedPlace(place)}
            className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
              dropoffChosen && dropoff.id === place.id
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {place.label}
          </button>
        ))}
      </div>
      <BarangayAddressPicker
        key={`track-to-${pickerSeed.key}`}
        label=""
        hideRegionSelects
        // The destination may be in another town — this is a trip already
        // under way, not one being planned from home.
        showCitySelect
        defaultProvince={pickerSeed.province || DEFAULT_BOOKING_PROVINCE}
        defaultCity={pickerSeed.city || DEFAULT_BOOKING_CITY}
        defaultBarangay={pickerSeed.barangay}
        defaultAddressDetail={pickerSeed.addressDetail}
        onResolve={handleResolve}
        onConfirm={() => setDestOpen(false)}
        pinned={!!dropoff.gps && dropoffChosen}
      />
    </div>
  )

  const map = (
    <div className="scroll-mt-24">
      <LocationMapPicker
        pickup={pickup}
        dropoff={dropoff}
        target={mapTarget}
        onTargetChange={(next) => {
          setMapTarget(next)
          setDestOpen(next === 'dropoff' ? mapTarget !== 'dropoff' || !destOpen : false)
        }}
        onPinPickup={handlePin}
        onPinDropoff={handlePin}
        pickupLabel="FROM"
        dropoffLabel="Destination"
        belowTabs={destinationForm}
        // Fixed on purpose. Here the map is being read, not answered: the
        // passenger is looking for which tricycle is beside them, and a view
        // that jumps to re-frame takes the map out from under them mid-glance.
        refitSignal="track"
        hasDropoff={dropoffChosen}
        hasPickup={false}
        terminals={terminals}
      />
    </div>
  )

  return (
    <div className="mx-auto flex min-h-[calc(100vh-70px)] max-w-lg flex-col space-y-2 px-4 pb-[72px] pt-1">
      <button
        type="button"
        onClick={() => navigate('/book')}
        className="flex items-center gap-1.5 self-start rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
      >
        <span aria-hidden className="text-sm leading-none">
          ‹
        </span>
        Bumalik sa booking
      </button>

      {/* How far it is, once there is a destination to measure to.

          A passenger recording a ride they flagged down has no quoted fare
          and no booking screen to read one off — the distance is what tells
          them whether the number the driver says at the end is in the right
          range. Road distance where a route resolves, which is the distance
          actually travelled rather than the straight line through the fields
          beside it.

          Silent until a destination is set: there is nothing honest to say
          before that. */}
      {dropoffChosen && plannedRoute && (
        <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-xs text-slate-600 shadow-sm">
          🛣️ <span className="font-semibold text-slate-800">{formatKm(plannedRoute.distanceMeters)}</span>{' '}
          papunta sa destination mo
          <span className="text-slate-400">
            {' '}
            · mga {Math.max(1, Math.round(plannedRoute.durationSeconds / 60))} min
          </span>
        </p>
      )}

      <TerminalBoardingPanel onClose={() => navigate('/book')} mapSlot={map} />
    </div>
  )
}
