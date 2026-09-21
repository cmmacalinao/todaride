import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useRides } from '../context/RideContext'
import { PAYMENT_METHODS } from '../mock/data'
import { BarangayAddressPicker } from '../components/BarangayAddressPicker'
import { RealLiveMap, type MapPoint } from '../components/RealLiveMap'
import { resolvePhAddress, createCustomLocation, type PhAddressTags } from '../lib/customLocation'
import { getCurrentGeoPosition } from '../lib/geo'
import { reverseGeocode } from '../lib/geocode'
import type { MockLocation, PaymentMethod } from '../types'

const TIP_PRESETS = [0, 20, 50, 100]

// The dedicated booking screen for a medicine order the pharmacy has already
// confirmed and set aside. It is a page of its own rather than another fold
// inside MedsBooking because by this point the order is finished business —
// what is left is a ride, and a ride is booked with a ride's own questions
// (where exactly, paying how, tipping what) rather than a single "book it"
// button that answers all three silently.
//
// Everything starts pre-filled from choices already made: pickup is the
// pharmacy holding the medicine (fixed — that is where the box physically
// is), drop-off is the address the order was placed with, payment is how the
// order was paid. Everything but the pickup is still changeable.
export function MedsRideBookingPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const navigate = useNavigate()
  const { medsOrders, pharmacies, bookOwnMedsRide } = useRides()

  const order = medsOrders.find((o) => o.id === orderId)
  const pharmacy = order ? pharmacies.find((p) => p.id === order.pharmacyId) : undefined

  // The address the order was placed with is the default, and stays the
  // default until the customer resolves a different one.
  const [dropoff, setDropoff] = useState<MockLocation | null>(order?.deliveryAddress ?? null)
  const [editingDropoff, setEditingDropoff] = useState(false)
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'locating' | 'done' | 'error'>('idle')
  const [gpsError, setGpsError] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(order?.paymentMethod ?? 'cash')
  const [tip, setTip] = useState(0)
  const [customTip, setCustomTip] = useState('')

  async function handleResolve(address: PhAddressTags) {
    const location = await resolvePhAddress(address)
    setDropoff(location)
  }

  async function handleGps() {
    setGpsStatus('locating')
    setGpsError('')
    try {
      const gps = await getCurrentGeoPosition()
      const label = (await reverseGeocode(gps)) ?? `Pinned location (${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)})`
      setDropoff(createCustomLocation(label, gps))
      setGpsStatus('done')
    } catch (err) {
      setGpsStatus('error')
      setGpsError(err instanceof Error ? err.message : 'Could not get your location.')
    }
  }

  if (!order || !pharmacy) {
    return (
      <div className="mx-auto max-w-md space-y-3 p-4">
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          That order is no longer available.
        </p>
        <button
          type="button"
          onClick={() => navigate('/book')}
          className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Back to Book a Ride
        </button>
      </div>
    )
  }

  // An order that already has its ride has nothing left to book — send them
  // back rather than let a second dispatch be attempted against a reducer
  // that would silently refuse it.
  if (order.status !== 'ready_for_pickup') {
    return (
      <div className="mx-auto max-w-md space-y-3 p-4">
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          This order is not waiting for a ride — it is{' '}
          {order.status === 'dispatched' ? 'already on its way.' : `at "${order.status.replace(/_/g, ' ')}".`}
        </p>
        <button
          type="button"
          onClick={() => navigate('/book')}
          className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Back to Book a Ride
        </button>
      </div>
    )
  }

  // Cash means nothing was pre-paid online: the driver fronts the medicine at
  // the counter and is reimbursed the whole total on delivery. Any other
  // method means the pharmacy already has its money and only the delivery and
  // service fees are still owed.
  const medicineDue = order.paymentMethod === 'cash' ? order.subtotal : 0
  const fare = medicineDue + order.deliveryFee + order.serviceFee
  const points: MapPoint[] = [
    {
      id: pharmacy.id,
      gps: pharmacy.locationGps ?? { lat: 15.7940977, lng: 120.9905849 },
      color: '#0f766e',
      label: pharmacy.name,
      icon: 'pharmacy',
    },
  ]
  if (dropoff) {
    points.push({ id: 'meds-dropoff', gps: dropoff.gps, color: '#b45309', label: dropoff.label })
  }

  function handleBook() {
    if (!order || !dropoff) return
    bookOwnMedsRide(order.id, {
      // Only sent when it actually differs, so an untouched form dispatches
      // exactly the ride the old one-tap button did.
      dropoff: dropoff.id === order.deliveryAddress.id ? undefined : dropoff,
      paymentMethod,
      tip,
    })
    navigate('/book')
  }

  return (
    <div className="mx-auto max-w-md space-y-3 p-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/book')}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          ‹ Back
        </button>
        <h1 className="text-base font-semibold text-slate-800">Book a Ride</h1>
      </div>

      <section className="space-y-1.5 rounded-xl border border-brand-200 bg-brand-50 p-3">
        <p className="text-xs font-semibold text-brand-800">Your order is ready for pickup</p>
        <p className="text-xs text-slate-600">{order.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}</p>
      </section>

      <section className="space-y-1 rounded-xl border border-slate-200 bg-white p-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Pick up from</p>
        <p className="text-sm font-semibold text-slate-800">💊 {pharmacy.name}</p>
        <p className="text-xs text-slate-500">
          {pharmacy.addressDetail}, {pharmacy.barangay}, {pharmacy.city}
        </p>
        <p className="text-[11px] text-slate-400">Fixed — this is where your medicine is waiting.</p>
      </section>

      <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Deliver to</p>
          <button
            type="button"
            onClick={() => setEditingDropoff((v) => !v)}
            className="text-[11px] font-semibold text-brand-700 hover:underline"
          >
            {editingDropoff ? 'Done' : 'Change'}
          </button>
        </div>
        <p className="text-sm font-medium text-slate-700">📍 {dropoff?.label ?? 'No address set'}</p>
        {dropoff && (
          <p className="text-xs text-slate-500">
            {dropoff.barangay}, {dropoff.city}
          </p>
        )}
        {!editingDropoff && (
          <p className="text-[11px] text-slate-400">
            The address you ordered to. Tap Change to send it somewhere else.
          </p>
        )}
        {editingDropoff && (
          <BarangayAddressPicker
            label="Delivery address"
            defaultProvince={order.deliveryAddress.province}
            defaultCity={order.deliveryAddress.city}
            defaultBarangay={order.deliveryAddress.barangay}
            defaultAddressDetail={order.deliveryAddress.label}
            onResolve={handleResolve}
            gpsOption={{
              onSelect: handleGps,
              status: gpsStatus,
              idleLabel: '📍 Pin my exact GPS location',
              doneLabel: '✓ Using your exact GPS location',
              error: gpsError,
            }}
          />
        )}
      </section>

      <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Pay your driver with</p>
        <div className="grid grid-cols-3 gap-2">
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
        <p className="text-[11px] text-slate-400">
          {medicineDue > 0
            ? 'Your driver pays the pharmacy for the medicine, and you settle the full amount with them on arrival.'
            : 'The medicine is already paid — this covers the delivery and service fee only.'}
        </p>
      </section>

      <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Tip your driver (optional)</p>
        <div className="grid grid-cols-4 gap-2">
          {TIP_PRESETS.map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => {
                setTip(amount)
                setCustomTip('')
              }}
              className={`rounded-lg border py-2 text-xs font-medium transition ${
                tip === amount && !customTip
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {amount === 0 ? 'None' : `₱${amount}`}
            </button>
          ))}
        </div>
        <input
          value={customTip}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9]/g, '')
            setCustomTip(raw)
            setTip(Number(raw) || 0)
          }}
          inputMode="numeric"
          placeholder="Or type another amount"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </section>

      <section className="space-y-1 rounded-xl border border-slate-200 bg-white p-3 text-xs">
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">What you pay the driver</p>
        {medicineDue > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Medicine (driver fronts this)</span>
            <span className="text-slate-700">₱{medicineDue}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Delivery fee</span>
          <span className="text-slate-700">₱{order.deliveryFee}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Service fee</span>
          <span className="text-slate-700">₱{order.serviceFee}</span>
        </div>
        {tip > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Tip</span>
            <span className="text-slate-700">₱{tip}</span>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-slate-200 pt-1 text-sm font-semibold text-slate-800">
          <span>Total</span>
          <span>₱{fare + tip}</span>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-3">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">Route</p>
        <RealLiveMap points={points} routeLine={points.length === 2 ? points.map((p) => p.gps) : undefined} />
      </section>

      <button
        type="button"
        onClick={handleBook}
        disabled={!dropoff}
        className="w-full rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        🛺 Book a Ride
      </button>
    </div>
  )
}
