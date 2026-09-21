import { useState } from 'react'
import { reverseGeocodeToPhAddress } from '../lib/customLocation'
import { useRides } from '../context/RideContext'
import {
  CLSU_MAIN_GATE_LOCATION,
  DEFAULT_BOOKING_ADDRESS_DETAIL,
  DEFAULT_BOOKING_BARANGAY,
  DEFAULT_BOOKING_CITY,
  DEFAULT_BOOKING_PROVINCE,
  MOCK_LOCATIONS,
  PAYMENT_METHODS,
  estimateFareBreakdown,
  estimateSpecialPickupBreakdown,
  getCitiesForProvince,
  getPriorityTodaOrgId,
  getTerminalGps,
} from '../mock/data'
import { getCurrentGeoPosition } from '../lib/geo'
import { resolveNearbyPublicMarket, resolvePhAddress, type PhAddressTags } from '../lib/customLocation'
import { makeGuestPassengerId } from './GuestRiderFields'
import { BarangayAddressPicker } from './BarangayAddressPicker'
import { LocationMapPicker } from './LocationMapPicker'
import { MedsBooking } from './MedsBooking'
import type { GeoCoords, MockLocation, PaymentMethod, ServiceType } from '../types'

// A known rider's identity + address — present when booking for the
// account holder themselves or one of their linked children. Absent (rider
// undefined) means a guest: someone with no account, whose name/phone are
// captured directly in this form instead.
export interface KnownRider {
  id: string
  name: string
  isStudent: boolean
  isPwdSenior: boolean
  province: string
  city: string
  barangay: string
  addressDetail: string
}

// Ride + Pabili booking, trimmed down from PassengerPage's own full form
// (no saved-places quick-picks or favorite-driver select — those are
// personalization tied to a real, self-managed Passenger profile) — used by
// ParentPage for booking on behalf of a child, themselves, or a guest with
// no account at all.
export function QuickBookingForm({
  title,
  rider,
  guestDefaultProvince,
  guestDefaultCity,
  bookedByParentId,
  favoriteDriverId,
  onSetFavoriteDriver,
  initialServiceType,
}: {
  title: string
  rider?: KnownRider
  guestDefaultProvince?: string
  guestDefaultCity?: string
  bookedByParentId: string | null
  // Only present when the rider is a real account (self or a linked child)
  // with somewhere to persist the preference — absent for a guest booking,
  // which has no account to remember it on.
  favoriteDriverId?: string | null
  onSetFavoriteDriver?: (driverId: string | null) => void
  // Lets a caller (ParentPage.tsx, deep-linking from the hamburger drawer)
  // land this form on Ride/Pabili/Medicine directly — read once on mount
  // only, same as every other seed-only default in this component; the
  // caller bumps a `key` to force a fresh mount when it changes.
  initialServiceType?: ServiceType
}) {
  const { tariffSettings, todaOrganizations, drivers, requestRide, medsEnabled } = useRides()
  const isGuest = !rider
  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  // Stable for the component's lifetime (not regenerated per render) — MEDS
  // orders need a customerId that stays the same across the whole
  // pharmacy→catalog→cart flow, same as a guest ride's id is only minted
  // once at actual submit time.
  const [guestCustomerId] = useState(() => makeGuestPassengerId())
  const [customLocations, setCustomLocations] = useState<MockLocation[]>([])
  const [pickupId, setPickupId] = useState(CLSU_MAIN_GATE_LOCATION.id)
  const [dropoffId, setDropoffId] = useState(MOCK_LOCATIONS[3].id)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [passengerCount, setPassengerCount] = useState(1)
  const [pickupGps, setPickupGps] = useState<GeoCoords | null>(null)
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'locating' | 'done' | 'error'>('idle')
  const [gpsError, setGpsError] = useState('')
  // Fixed for the life of the form: there is no service switch any more
  // (Pabili is not offered on any screen at all — see PassengerPage.tsx —
  // and Buy Medicine only when Super Admin has it on), so the type is
  // whatever the caller opened the form with — a plain ride unless told.
  const serviceType: ServiceType = (() => {
    if (initialServiceType === 'buy_medicine' && !medsEnabled) return 'ride'
    return initialServiceType ?? 'ride'
  })()
  const [specialPickupRequested, setSpecialPickupRequested] = useState(false)
  const [pickupPickerSeed, setPickupPickerSeed] = useState({ key: 0, province: '', city: '', barangay: '', addressDetail: '' })
  const [dropoffPickerSeed, setDropoffPickerSeed] = useState({ key: 0, province: '', city: '', barangay: '', addressDetail: '' })
  const [submitted, setSubmitted] = useState(false)
  // Which of Pickup/Destination the map picker's toggle is on — also
  // controls which address form shows below the map, so only one is on
  // screen at a time instead of both stacked.
  const [mapTarget, setMapTarget] = useState<'pickup' | 'dropoff'>('pickup')

  const allLocations = [...MOCK_LOCATIONS, ...customLocations].filter(
    (loc, i, arr) => arr.findIndex((l) => l.id === loc.id) === i,
  )
  const pickup = allLocations.find((l) => l.id === pickupId)!
  const dropoff = allLocations.find((l) => l.id === dropoffId)!
  const isBuyMedicine = serviceType === 'buy_medicine'
  const fareBreakdown = estimateFareBreakdown(pickup, dropoff, tariffSettings, {
    isStudent: rider?.isStudent ?? false,
    isPwdSenior: rider?.isPwdSenior ?? false,
    passengerCount,
  })
  const oneWayFare = fareBreakdown.total
  const priorityTodaOrg = todaOrganizations.find((o) => o.id === getPriorityTodaOrgId(pickup))
  const terminalGps = getTerminalGps(priorityTodaOrg)
  const specialPickupBreakdown = estimateSpecialPickupBreakdown(terminalGps, pickupGps, tariffSettings)
  const specialPickupFee = specialPickupRequested ? specialPickupBreakdown.fee : 0
  const totalFare = oneWayFare + specialPickupFee
  const fareExtraKmFeePortionOneWay = Math.round(fareBreakdown.extraKmFee)
  const fareExtraKmFeePortion = fareExtraKmFeePortionOneWay
  const fareStandardRatePortion = oneWayFare - fareExtraKmFeePortionOneWay
  const fareExtraKmDisplay = fareBreakdown.extraKm

  const pickupLabel = 'Pickup'
  const dropoffLabel = 'Destination'

  const effectiveName = rider?.name ?? guestName.trim()
  const effectiveCustomerId = rider?.id ?? guestCustomerId
  const canSubmit = pickupId !== dropoffId && effectiveName.length > 0

  function handlePickupQuickPick(location: MockLocation) {
    setPickupId(location.id)
    setPickupGps(null)
    setGpsStatus('idle')
    setGpsError('')
    setSpecialPickupRequested(false)
    setPickupPickerSeed((prev) => ({
      key: prev.key + 1,
      province: location.province,
      city: location.city,
      barangay: location.barangay,
      addressDetail: '',
    }))
  }

  // Quick "jump to this city" for Ride/Pabili — see the identical helper in
  // PassengerPage.tsx for the full rationale. Jumps pickup ("Buy near to"
  // for an errand) to a resolved point in the chosen city; destination/
  // "Deliver to" is left alone since that's a free choice.
  async function handlePickupCityQuickPick(newCity: string) {
    const point = await resolveNearbyPublicMarket(newCity, DEFAULT_BOOKING_PROVINCE)
    setCustomLocations((prev) => [...prev, point])
    handlePickupQuickPick(point)
  }

  async function handlePickupResolve(address: PhAddressTags) {
    const location = await resolvePhAddress(address)
    setCustomLocations((prev) => [...prev, location])
    setPickupId(location.id)
    setPickupGps(null)
    setGpsStatus('idle')
    setGpsError('')
    setSpecialPickupRequested(false)
  }

  async function handleDropoffResolve(address: PhAddressTags) {
    const location = await resolvePhAddress(address)
    setCustomLocations((prev) => [...prev, location])
    setDropoffId(location.id)
  }

  // From LocationMapPicker — a map tap resolves to a MockLocation plus,
  // when the tapped point falls inside our own address tree, a `guess` at
  // its Province/City/Barangay (see reverseGeocodeToPhAddress). Registers
  // the point either way; only seeds the BarangayAddressPicker dropdowns
  // (same remount-to-reseed mechanism the quick-picks use) when a guess
  // actually resolved.
  function handlePinPickup(location: MockLocation, guess: PhAddressTags | null) {
    setCustomLocations((prev) => [...prev, location])
    setPickupId(location.id)
    setPickupGps(null)
    setGpsStatus('idle')
    setGpsError('')
    setSpecialPickupRequested(false)
    if (guess) {
      setPickupPickerSeed((prev) => ({
        key: prev.key + 1,
        province: guess.province,
        city: guess.city,
        barangay: guess.barangay,
        addressDetail: guess.addressDetail,
      }))
    }
  }

  function handlePinDropoff(location: MockLocation, guess: PhAddressTags | null) {
    setCustomLocations((prev) => [...prev, location])
    setDropoffId(location.id)
    if (guess) {
      setDropoffPickerSeed((prev) => ({
        key: prev.key + 1,
        province: guess.province,
        city: guess.city,
        barangay: guess.barangay,
        addressDetail: guess.addressDetail,
      }))
    }
  }

  async function handleUseMyGps() {
    setGpsStatus('locating')
    setGpsError('')
    try {
      const coords = await getCurrentGeoPosition()
      setPickupGps(coords)
      setGpsStatus('done')
      // A fix answers "which barangay?" too, so the dropdown is filled
      // from it rather than left on whatever it defaulted to. Without
      // this the pin and the address below it could disagree, and the
      // passenger was asked to name a place the phone had just named.
      const { guess } = await reverseGeocodeToPhAddress(coords)
      if (guess) {
        setPickupPickerSeed((prev) => ({
          key: prev.key + 1,
          province: guess.province,
          city: guess.city,
          barangay: guess.barangay,
          addressDetail: guess.addressDetail,
        }))
      }
    } catch (err) {
      setGpsStatus('error')
      setGpsError(err instanceof Error ? err.message : 'Could not get your location.')
    }
  }

  function handleRequest() {
    if (!canSubmit) return
    requestRide({
      passengerId: rider?.id ?? makeGuestPassengerId(),
      passengerName: effectiveName,
      passengerPhone: isGuest ? guestPhone.trim() || null : null,
      pickup,
      dropoff,
      paymentMethod,
      isStudentRide: rider?.isStudent ?? false,
      isPwdSeniorRide: rider?.isPwdSenior ?? false,
      pickupGps,
      passengerCount,
      serviceType,
      pabiliItems: null,
      tip: 0,
      bookedByParentId,
      specialPickupRequested: specialPickupRequested && pickupGps !== null,
    })
    setSubmitted(true)
    setPassengerCount(1)
    setGuestName('')
    setGuestPhone('')
    setSpecialPickupRequested(false)
  }

  if (submitted) {
    return (
      <section className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-center">
        <p className="text-sm font-semibold text-brand-800">Request sent</p>
        <p className="mt-1 text-xs text-slate-600">Waiting for a nearby driver to accept.</p>
        <button
          onClick={() => setSubmitted(false)}
          className="mt-3 rounded-lg border border-brand-300 bg-white px-4 py-2 text-xs font-medium text-brand-700 hover:bg-brand-50"
        >
          Book another
        </button>
      </section>
    )
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      </div>
      {/* No service switch: Pabili is not offered on any screen (see
          PassengerPage.tsx), and Buy Medicine only shows when Super Admin
          has it on — see MedsBooking below. */}
      {isGuest && (
        <div className="grid grid-cols-2 gap-2">
          <input
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="Their name"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={guestPhone}
            onChange={(e) => setGuestPhone(e.target.value)}
            placeholder="Their mobile number"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      )}

      {isBuyMedicine ? (
        <MedsBooking
          customerId={effectiveCustomerId}
          customerName={effectiveName || 'them'}
          defaultProvince={DEFAULT_BOOKING_PROVINCE}
          defaultCity={DEFAULT_BOOKING_CITY}
          defaultBarangay={DEFAULT_BOOKING_BARANGAY}
          defaultAddressDetail={DEFAULT_BOOKING_ADDRESS_DETAIL}
        />
      ) : (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Jump to city (pickup)</label>
            <select
              value={pickupPickerSeed.city || pickup.city || DEFAULT_BOOKING_CITY}
              onChange={(e) => handlePickupCityQuickPick(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {getCitiesForProvince(DEFAULT_BOOKING_PROVINCE).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <LocationMapPicker
            pickup={pickup}
            dropoff={dropoff}
            target={mapTarget}
            onTargetChange={setMapTarget}
            onPinPickup={handlePinPickup}
            onPinDropoff={handlePinDropoff}
            pickupLabel={pickupLabel}
            dropoffLabel={dropoffLabel}
          />

          {/* Mirrors the map picker's own Pickup/Destination toggle right above
              the address form itself, so switching which one you're editing
              doesn't require scrolling back up to the map. */}
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setMapTarget('pickup')}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${
                mapTarget === 'pickup' ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-500'
              }`}
            >
              {pickupLabel}
            </button>
            <button
              type="button"
              onClick={() => setMapTarget('dropoff')}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${
                mapTarget === 'dropoff' ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-500'
              }`}
            >
              {dropoffLabel}
            </button>
          </div>

          {/* Only the address form matching the map picker's active tab shows
              at a time — switching tabs above swaps which one appears here
              instead of always stacking both. */}
          {mapTarget === 'pickup' && (
            <div>
              <BarangayAddressPicker
                key={pickupPickerSeed.key}
                label={pickupLabel}
                defaultProvince={pickupPickerSeed.province || DEFAULT_BOOKING_PROVINCE}
                defaultCity={pickupPickerSeed.city || DEFAULT_BOOKING_CITY}
                defaultBarangay={pickupPickerSeed.barangay || DEFAULT_BOOKING_BARANGAY}
                defaultAddressDetail={pickupPickerSeed.addressDetail}
                onResolve={handlePickupResolve}
                gpsOption={{ onSelect: handleUseMyGps, status: gpsStatus, error: gpsError }}
              />
              {/* The button itself now lives at the top of the picker
                  above; what stays here is the consequence of a fix —
                  the terminal-detour offer, which only makes sense once
                  there is a point to measure the detour from. */}
              {gpsStatus === 'done' && terminalGps && (
                <label className="mt-1.5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={specialPickupRequested}
                    onChange={(e) => setSpecialPickupRequested(e.target.checked)}
                    className="mt-0.5"
                  />
                  {/* The explanatory notes are gone — the distance and
                      the escalation rule were four lines of small print
                      on a checkbox. What stays is the money, because a
                      box that quietly adds a fee is not one anybody
                      should have to read the small print to notice. */}
                  <span>
                    <span className="font-medium text-amber-800">Special request — Terminal is far, pick up here</span>
                    {specialPickupBreakdown.fee > 0 && (
                      <>
                        <br />
                        <span className="text-amber-700">adds ₱{specialPickupBreakdown.fee}</span>
                      </>
                    )}
                  </span>
                </label>
              )}
            </div>
          )}

          {mapTarget === 'dropoff' && (
            <div>
              <BarangayAddressPicker
                key={dropoffPickerSeed.key}
                label={dropoffLabel}
                defaultProvince={dropoffPickerSeed.province || rider?.province || guestDefaultProvince || ''}
                defaultCity={dropoffPickerSeed.city || rider?.city || guestDefaultCity || ''}
                defaultBarangay={dropoffPickerSeed.barangay}
                defaultAddressDetail={dropoffPickerSeed.addressDetail}
                onResolve={handleDropoffResolve}
              />
            </div>
          )}

          <button
            onClick={handleRequest}
            disabled={!canSubmit}
            className="w-full rounded-lg bg-gold-400 py-2.5 text-sm font-bold text-navy-900 transition hover:bg-gold-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            {`Book a Ride for ${effectiveName || 'them'}`}
          </button>

          <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Passengers riding (up to 4)</label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPassengerCount((n) => Math.max(1, n - 1))}
                  className="h-8 w-8 rounded-lg border border-slate-300 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  −
                </button>
                <span className="text-sm font-medium text-slate-700">{passengerCount}</span>
                <button
                  type="button"
                  onClick={() => setPassengerCount((n) => Math.min(4, n + 1))}
                  className="h-8 w-8 rounded-lg border border-slate-300 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  +
                </button>
              </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Payment method</label>
            <div className="grid grid-cols-4 gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentMethod(m.id)}
                  className={`rounded-lg border py-2 text-xs font-medium transition ${
                    paymentMethod === m.id
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <p className="pb-0.5 text-[11px] font-medium text-slate-400">Estimated cost breakdown</p>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Standard rate (covers {tariffSettings.standardKmCovered} km)</span>
              <span>₱{fareStandardRatePortion}</span>
            </div>
            {fareExtraKmFeePortion > 0 && (
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>
                  Extra distance ({fareExtraKmDisplay.toFixed(1)} km beyond the {tariffSettings.standardKmCovered} km
                  covered)
                </span>
                <span>₱{fareExtraKmFeePortion}</span>
              </div>
            )}
            {specialPickupFee > 0 && (
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Special pickup — Terminal detour ({specialPickupBreakdown.extraKm.toFixed(1)} km)</span>
                <span>₱{specialPickupFee}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-slate-200 pt-1 font-semibold text-slate-800">
              <span>Estimated fare</span>
              <span>₱{totalFare}</span>
            </div>
          </div>

          {onSetFavoriteDriver && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Favorite driver (optional)</label>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={favoriteDriverId ?? ''}
                onChange={(e) => onSetFavoriteDriver(e.target.value || null)}
              >
                <option value="">No favorite — normal terminal Pila order</option>
                {drivers
                  .filter((d) => d.verificationStatus === 'approved' && d.accessStatus === 'active')
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} · {d.plateNumber}
                    </option>
                  ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-400">
                If set, this driver is offered the next ride first, ahead of the normal Pila.
              </p>
            </div>
          )}

          <button
            onClick={handleRequest}
            disabled={!canSubmit}
            className="w-full rounded-lg bg-gold-400 py-2.5 text-sm font-bold text-navy-900 transition hover:bg-gold-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            {`Book a Ride for ${effectiveName || 'them'}`}
          </button>
        </>
      )}
    </section>
  )
}
