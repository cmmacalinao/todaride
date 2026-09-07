import { useState } from 'react'
import { useRides } from '../context/RideContext'
import { resolvePhAddress, type PhAddressTags } from '../lib/customLocation'
import { BarangayAddressPicker } from './BarangayAddressPicker'
import { DeliveryMapPicker } from './DeliveryMapPicker'
import { TrustedRiderSelect } from './VendorTrustedRiders'
import type { MockLocation, Pharmacy } from '../types'

// "Book a TODA SafeRide delivery" — for the order that came by phone, chat
// or across the counter and never touched the app. The vendor fills in what
// the app would have known from a checkout (who, where, what, how much), and
// the same driver dispatch an in-app order gets runs from there (see
// VENDOR_BOOK_DELIVERY). The delivery pin is the same live map a customer
// pins on at checkout, with the store shown for scale.
export function VendorDeliveryBooking({ vendor, onClose }: { vendor: Pharmacy; onClose: () => void }) {
  const { vendorBookDelivery, quoteVendorDeliveryFare } = useRides()
  const [customerName, setCustomerName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [itemsSummary, setItemsSummary] = useState('')
  const [goodsAmount, setGoodsAmount] = useState('')
  const [collection, setCollection] = useState<'cash' | 'paid'>('cash')
  const [preferredDriverId, setPreferredDriverId] = useState<string | null>(null)
  const [deliveryAddress, setDeliveryAddress] = useState<MockLocation | null>(null)
  const [deliveryPinned, setDeliveryPinned] = useState(false)
  // The dropdowns start on the store's own barangay — most deliveries are
  // nearby — and are re-seeded from a map pin, same as the checkout does.
  const [addressSeed, setAddressSeed] = useState<PhAddressTags>({
    province: vendor.province,
    city: vendor.city,
    barangay: '',
    addressDetail: '',
  })
  const [addressSeedKey, setAddressSeedKey] = useState(0)
  const [booked, setBooked] = useState(false)

  async function handleAddressResolve(address: PhAddressTags) {
    setDeliveryAddress(await resolvePhAddress(address))
    setDeliveryPinned(false)
  }

  function handleMapPin(location: MockLocation, guess: PhAddressTags | null) {
    setDeliveryAddress(location)
    setDeliveryPinned(true)
    if (guess) {
      setAddressSeed(guess)
      setAddressSeedKey((k) => k + 1)
    }
  }

  const goods = Math.max(0, Math.round(Number(goodsAmount) || 0))
  // TODA fare to the pinned address plus the admin's booking fee — what
  // the rider collects on top of the goods.
  const fare = deliveryAddress ? quoteVendorDeliveryFare(vendor.id, deliveryAddress) : null
  const fees = (fare?.todaFare ?? 0) + (fare?.bookingFee ?? 0)
  const feeNote = fare ? `₱${fare.todaFare} TODA fare + ₱${fare.bookingFee} booking fee` : 'TODA fare + booking fee (pin the address)'
  const canBook = !!customerName.trim() && !!contactPhone.trim() && !!deliveryAddress

  function handleBook() {
    if (!canBook || !deliveryAddress) return
    vendorBookDelivery({
      pharmacyId: vendor.id,
      customerName,
      contactPhone,
      deliveryAddress,
      itemsSummary,
      goodsAmount: goods,
      collection,
      preferredDriverId,
    })
    setBooked(true)
  }

  if (booked) {
    return (
      <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
        <p className="text-sm font-semibold text-emerald-800">🛺 Driver requested</p>
        <p className="text-xs text-slate-600">
          Track it under <span className="font-semibold">Out for delivery</span> above — you'll see the driver's name, plate and
          position as soon as one accepts.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700"
        >
          Done
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">🛺 Book a TODA SafeRide delivery</h2>
        <button type="button" onClick={onClose} className="text-xs font-medium text-slate-500 hover:text-slate-700">
          ✕ Close
        </button>
      </div>
      <p className="text-xs text-slate-500">
        For an order that came by phone, chat or at the counter — a driver picks it up from your store and brings it to
        the customer, tracked like any app order.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Customer name</label>
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="e.g. Maria"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Contact number</label>
          <input
            type="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="09XX-XXX-XXXX"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">What to deliver</label>
        <input
          value={itemsSummary}
          onChange={(e) => setItemsSummary(e.target.value)}
          placeholder="e.g. 2x Adobong Manok, 1x Rice"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Order amount (₱)</label>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={goodsAmount}
          onChange={(e) => setGoodsAmount(e.target.value)}
          placeholder="0"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setCollection('cash')}
            className={`rounded-lg border py-2 text-xs font-medium transition ${
              collection === 'cash' ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            Customer pays cash on delivery
          </button>
          <button
            type="button"
            onClick={() => setCollection('paid')}
            className={`rounded-lg border py-2 text-xs font-medium transition ${
              collection === 'paid' ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            Already paid to me
          </button>
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          {collection === 'cash'
            ? `The driver pays you ₱${goods} at pickup and collects ₱${goods + fees} from the customer (order + ${feeNote}).`
            : `The driver collects only the ${feeNote} from the customer.`}
        </p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Deliver to</label>
        <DeliveryMapPicker vendor={vendor} deliveryAddress={deliveryAddress} onChange={handleMapPin} />
        <p className="my-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">or pick an address</p>
        <BarangayAddressPicker
          key={addressSeedKey}
          label="Delivery address"
          defaultProvince={addressSeed.province}
          defaultCity={addressSeed.city}
          defaultBarangay={addressSeed.barangay}
          defaultAddressDetail={addressSeed.addressDetail}
          pinned={deliveryPinned}
          onResolve={handleAddressResolve}
        />
      </div>

      <TrustedRiderSelect vendor={vendor} value={preferredDriverId} onChange={setPreferredDriverId} />

      <button
        type="button"
        onClick={handleBook}
        disabled={!canBook}
        className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        🛺 Request a driver now
      </button>
    </div>
  )
}
