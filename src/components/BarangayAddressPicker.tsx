import { useEffect, useRef, useState } from 'react'
import { CLSU_LOCATION_GROUPS, PH_PROVINCES, getBarangaysForCity, getCitiesForProvince } from '../mock/data'
import type { PhAddressTags } from '../lib/customLocation'

interface BarangayAddressPickerProps {
  label: string
  defaultProvince: string
  defaultCity: string
  // Pre-fills barangay/street-landmark too — used when the caller remounts
  // this picker (via a changing `key`) to reflect an already-known location,
  // e.g. a Saved Place quick-pick, so the dropdowns don't silently disagree
  // with what "Booking as"/fare/map are actually using.
  defaultBarangay?: string
  defaultAddressDetail?: string
  // Closes the box once the person says the address is right. The picker
  // resolves as they type, so "set" and "settled on" are not the same thing
  // — this is them saying the second one.
  onConfirm?: () => void
  onResolve: (address: PhAddressTags) => Promise<void>
  // Drops the Province and City dropdowns, for callers that already own the
  // city choice above this control (see PassengerPage's From/Where to card).
  // Province/City still come in through defaultProvince/defaultCity — remount
  // via `key` to change them, same as the other defaults.
  hideRegionSelects?: boolean
  // "Use my exact GPS location" — its own control at the top of the picker
  // rather than an entry buried inside the barangay dropdown. Hidden inside
  // the select it read as a barangay you had never heard of, and you had to
  // open the list to discover it existed at all. Out here it appears and
  // disappears with the picker itself, so it is visible exactly while you are
  // answering "where?" and never otherwise.
  // Replaces the GPS row entirely when supplied — same slot, different
  // question.
  topAction?: { label: string; onClick: () => void }
  gpsOption?: {
    onSelect: () => void
    status: 'idle' | 'locating' | 'done' | 'error'
    // What the button says before a fix — "use" reads as a setting you are
    // switching on, "pin" as an action you are taking, and which one fits
    // depends on the screen.
    idleLabel?: string
    // What to say once a fix is in — some screens explain what the fix buys
    // ("driver can find you exactly"), so it is not fixed here.
    doneLabel?: string
    error?: string
  }
}

// Pickup/destination entry for booking: cascading Province → City →
// Barangay dropdowns (pre-filled from the rider's home address, but still
// changeable) plus a free-text field for the street/house number and
// nearby landmark. Auto-resolves to a real geocoded point once a barangay is
// picked, and re-resolves (debounced) as the landmark text settles.
export function BarangayAddressPicker({
  label,
  defaultProvince,
  defaultCity,
  defaultBarangay = '',
  defaultAddressDetail = '',
  onConfirm,
  onResolve,
  hideRegionSelects = false,
  gpsOption,
  topAction,
}: BarangayAddressPickerProps) {
  const [province, setProvince] = useState(defaultProvince)
  const [city, setCity] = useState(defaultCity)
  const [barangay, setBarangay] = useState(defaultBarangay)
  const [addressDetail, setAddressDetail] = useState(defaultAddressDetail)
  // CLSU's "place on campus" dropdown picks a named landmark/building, which
  // is often too coarse on its own (e.g. which room, which side, a nearer
  // landmark) — this is the extra free-text detail that combines with it
  // rather than replacing it. Kept separate from addressDetail (the actual
  // resolved value the dropdown owns) so both survive independently.
  const [campusExtra, setCampusExtra] = useState('')
  // Which field the person still has to answer, set only when they press
  // Confirm — nothing goes red while they are still working down the form.
  const [missing, setMissing] = useState<'barangay' | 'detail' | null>(null)
  const [status, setStatus] = useState<'idle' | 'locating' | 'done' | 'error'>(defaultBarangay ? 'done' : 'idle')
  // A pre-filled barangay means this mount was seeded from a location that's
  // already resolved (a Saved Place quick-pick, or a map-tap/GPS guess) —
  // skip resolving again while the fields still match exactly what they were
  // seeded with, so we don't re-geocode and overwrite an already-correct
  // location (a re-geocode of the address text is less precise than the
  // exact tapped/GPS point it would replace). Compared against a snapshot
  // taken once at mount, not a one-shot "consumed" flag — a ref that gets
  // mutated inside the effect body doesn't survive React 18 StrictMode's
  // double-invoked effects in dev (mount→cleanup→mount again reuses the same
  // ref object, so the first invocation's mutation leaks into the second,
  // wrongly making it think a real edit happened and firing an unwanted
  // resolve ~600ms after mount). A snapshot that's never mutated gives both
  // invocations the same answer.
  const initialValues = useRef({ province: defaultProvince, city: defaultCity, barangay: defaultBarangay, addressDetail: defaultAddressDetail, campusExtra: '' })

  const cities = province ? getCitiesForProvince(province) : []
  const barangays = province && city ? getBarangaysForCity(province, city) : []

  useEffect(() => {
    if (!barangay) {
      setStatus('idle')
      return
    }
    const seed = initialValues.current
    if (
      province === seed.province &&
      city === seed.city &&
      barangay === seed.barangay &&
      addressDetail === seed.addressDetail &&
      campusExtra === seed.campusExtra
    ) {
      setStatus('done')
      return
    }
    let cancelled = false
    setStatus('locating')
    const combinedAddressDetail =
      barangay === 'CLSU' && campusExtra.trim()
        ? `${addressDetail.trim()}${addressDetail.trim() ? ' — ' : ''}${campusExtra.trim()}`
        : addressDetail.trim()
    const timeout = setTimeout(() => {
      onResolve({ province, city, barangay, addressDetail: combinedAddressDetail })
        .then(() => {
          if (!cancelled) setStatus('done')
        })
        .catch(() => {
          if (!cancelled) setStatus('error')
        })
    }, 600)
    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
    // Re-resolve on any of these changing — onResolve is a stable callback
    // from the parent, not a dependency of the address itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [province, city, barangay, addressDetail, campusExtra])

  return (
    <div className="space-y-1.5">
      {/* First thing in the picker, above even the field label: the fastest
          answer to "where?" should not be the one you have to go looking
          for. */}
      {topAction && (
        <>
          <button
            type="button"
            onClick={topAction.onClick}
            className="w-full rounded-lg border border-brand-300 bg-brand-50 py-2 text-xs font-semibold text-brand-700 transition hover:bg-brand-100"
          >
            {topAction.label}
          </button>
          <p className="text-center text-[10px] uppercase tracking-wide text-slate-400">or pick an address</p>
        </>
      )}
      {!topAction && gpsOption && (
        <>
          <button
            type="button"
            onClick={gpsOption.onSelect}
            disabled={gpsOption.status === 'locating'}
            className={`w-full rounded-lg border py-2 text-xs font-medium transition ${
              gpsOption.status === 'done'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                : 'border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {gpsOption.status === 'locating' && 'Locating…'}
            {gpsOption.status === 'done' && (gpsOption.doneLabel ?? '✓ Exact GPS location captured')}
            {(gpsOption.status === 'idle' || gpsOption.status === 'error') &&
              (gpsOption.idleLabel ?? '📍 Use my exact GPS location')}
          </button>
          {gpsOption.status === 'error' && gpsOption.error && (
            <p className="text-[11px] text-amber-700">{gpsOption.error}</p>
          )}
          <p className="text-center text-[10px] uppercase tracking-wide text-slate-400">or pick an address</p>
        </>
      )}
      <label className="block text-xs font-medium text-slate-500">{label}</label>
      <select
        value={province}
        onChange={(e) => {
          setProvince(e.target.value)
          setCity('')
          setBarangay('')
        }}
        className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm ${hideRegionSelects ? 'hidden' : ''}`}
      >
        <option value="">Select province</option>
        {PH_PROVINCES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <div className={hideRegionSelects ? '' : 'grid grid-cols-2 gap-2'}>
        <select
          value={city}
          onChange={(e) => {
            setCity(e.target.value)
            setBarangay('')
          }}
          disabled={!province}
          className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 ${
            hideRegionSelects ? 'hidden' : ''
          }`}
        >
          <option value="">Select city</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={barangay}
          onChange={(e) => {
            setBarangay(e.target.value)
            setAddressDetail('')
            setCampusExtra('')
            setMissing(null)
          }}
          disabled={!city}
          className={`w-full rounded-lg border px-3 py-2 text-sm disabled:bg-slate-50 ${
            missing === 'barangay' ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-300' : 'border-slate-300'
          }`}
        >
          <option value="">Select barangay</option>
          {barangays.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>
      {barangay === 'CLSU' ? (
        <>
          <select
            value={addressDetail}
            onChange={(e) => {
              setAddressDetail(e.target.value)
              setMissing(null)
            }}
            className={`w-full rounded-lg border px-3 py-2 text-sm ${
              missing === 'detail' ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-300' : 'border-slate-300'
            }`}
          >
            <option value="">Select a place on campus</option>
            {CLSU_LOCATION_GROUPS.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.places.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <input
            value={campusExtra}
            onChange={(e) => setCampusExtra(e.target.value)}
            placeholder="Detailed address — room, floor, or nearby landmark (optional)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </>
      ) : (
        <input
          value={addressDetail}
          onChange={(e) => {
            setAddressDetail(e.target.value)
            setMissing(null)
          }}
          placeholder="Street / house no., nearby landmark"
          className={`w-full rounded-lg border px-3 py-2 text-sm ${
            missing === 'detail' ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-300' : 'border-slate-300'
          }`}
        />
      )}
      {status === 'locating' && <p className="text-[11px] text-slate-400">📍 Locating…</p>}
      {status === 'done' && (
        <div className="flex items-center gap-2">
          {onConfirm && (
            <button
              type="button"
              onClick={() => {
                if (!barangay) {
                  setMissing('barangay')
                  return
                }
                if (!addressDetail.trim()) {
                  setMissing('detail')
                  return
                }
                setMissing(null)
                onConfirm()
              }}
              className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-700"
            >
              ✓ Confirm Address
            </button>
          )}
          <p className="text-[11px] text-emerald-600">✓ Location set</p>
        </div>
      )}
      {missing && (
        <p className="text-[11px] font-medium text-amber-700">
          {missing === 'barangay'
            ? 'Pick the barangay before confirming.'
            : barangay === 'CLSU'
              ? 'Pick the place on campus before confirming.'
              : 'Add the street, house no. or a nearby landmark before confirming.'}
        </p>
      )}
      {status === 'error' && (
        <p className="text-[11px] text-amber-700">Couldn't locate that address — try a nearby landmark.</p>
      )}
    </div>
  )
}
