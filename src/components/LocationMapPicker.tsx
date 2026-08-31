import { LocationPermissionRow } from './LocationPermissionRow'
import { useWatchPosition } from '../lib/liveTracking'
import { useRides } from '../context/RideContext'
import { formatAddressLine } from '../lib/addressFormat'
import { useRef, useState, type ReactNode } from 'react'
import { RealLiveMap, type MapPoint } from './RealLiveMap'
import { createCustomLocation, reverseGeocodeToPhAddress, type PhAddressTags } from '../lib/customLocation'
import { getCurrentGeoPosition } from '../lib/geo'
import type { GeoCoords, MockLocation, Terminal } from '../types'

// Lets the passenger drop a pin directly on the map instead of (or in
// addition to) picking province/city/barangay — an alternative input method
// for the same pickup/dropoff state the BarangayAddressPicker below drives.
// A toggle picks which one a tap sets; both pins always show together so
// placing one doesn't lose sight of the other. `target` is controlled by the
// caller (not local state) so the caller can also use it to show only the
// matching BarangayAddressPicker section below, instead of both at once.
// How recent a driver's published position has to be to count as live. The
// driver app publishes every 30 seconds, so three minutes allows a couple of
// missed pushes — a phone in a pocket losing signal at a junction — without
// keeping a marker alive for somebody who has finished for the day.
const LIVE_DRIVER_WINDOW_MS = 3 * 60 * 1000

export function LocationMapPicker({
  pickup,
  dropoff,
  target,
  onTargetChange,
  onPinPickup,
  onPinDropoff,
  pickupLabel = 'Pickup',
  dropoffLabel = 'Destination',
  refitSignal,
  hasDropoff = true,
  hasPickup = true,
  leadingAction,
  underMapAction,
  // Rendered directly beneath the Pickup / Destination tabs, so an
  // address form opens under the tab that asks for it rather than in a
  // strip somewhere else on the page.
  belowTabs,
  showGpsFor,
  terminals = [],
  extraPoints = [],
}: {
  pickup: MockLocation
  dropoff: MockLocation
  target: 'pickup' | 'dropoff'
  onTargetChange: (target: 'pickup' | 'dropoff') => void
  // `guess` carries the tapped point's Province/City/Barangay (and
  // best-effort street detail) when it resolved to somewhere in our own
  // address tree — null when it didn't (outside every province this app
  // knows about, or the reverse-geocode itself failed). Callers use it to
  // seed the BarangayAddressPicker's dropdowns to match, same as picking a
  // Saved Place already does.
  onPinPickup: (location: MockLocation, guess: PhAddressTags | null) => void
  onPinDropoff: (location: MockLocation, guess: PhAddressTags | null) => void
  // Changes whenever the passenger picks a city, a pickup or a destination —
  // moments the map must re-frame on even if they had dragged it somewhere
  // else first. Panning to look around should not cost you the automatic
  // framing for every choice you make afterwards.
  refitSignal?: string
  belowTabs?: ReactNode
  // False while the passenger has not said where they are going. The pin is
  // withheld rather than drawn somewhere provisional: a marker on the map is
  // read as a decision, and this one has not been made yet.
  hasDropoff?: boolean
  // Same as hasDropoff: the pickup object always holds something, so only
  // the caller knows whether the passenger actually chose it.
  hasPickup?: boolean
  // Terminals to draw alongside the two pins — where tricycles wait. Shown,
  // never selectable: tapping the map still moves whichever pin is armed.
  terminals?: Terminal[]
  // Rendered directly under the map, filling the row's width to the left
  // of underMapAction. The booking form's submit lives here so the action
  // sits with the map it is confirming, immediately after the pin the
  // passenger just placed rather than above it.
  leadingAction?: ReactNode
  // Sits to the right of the submit in that same under-map row — for the one
  // control that belongs with the booking action rather than in the form
  // below it: how many people are riding.
  underMapAction?: ReactNode
  // Which end the "My GPS location" button fills, and therefore when it is
  // shown at all: a ride wants it on the Pickup tab (you are standing at the
  // pickup), an errand on the Deliver-to tab (you are standing where it
  // should be brought). Omit it and no button appears.
  showGpsFor?: 'pickup' | 'dropoff'

  // Ride booking calls these "Pickup"/"Destination"; a Pabili/Buy Medicine
  // errand calls them "Buy near to"/"Deliver to" instead — same map, same
  // pickup/dropoff state, just different words for what each pin means.
  pickupLabel?: string
  dropoffLabel?: string
  // Extra markers alongside pickup/dropoff/terminals — used by Group Ride to
  // show every rider's own destination on this same map at once, not just
  // whichever one is currently being pinned.
  extraPoints?: MapPoint[]
}) {
  const [status, setStatus] = useState<'idle' | 'locating' | 'error'>('idle')
  const containerRef = useRef<HTMLDivElement>(null)
  // The shortened lines in the row are for reading at a glance; this opens
  // the full postal chain for the times someone needs to check the exact
  // spot — a sitio, a house number, the province — that shortening removed.
  const [showFullAddress, setShowFullAddress] = useState(false)

  // Switching Pickup/Destination scrolls this whole picker (toggle, GPS
  // button, map) to the top of the screen — the passenger just told us
  // which pin they're about to place, so the thing they need to see (and
  // tap) should be the thing in front of them, not still off past whatever
  // they'd scrolled down to.
  // Switching ends changes which pin a tap moves. It does not move the
  // page: this used to scroll the whole picker to the top of the screen,
  // which yanked the map out from under whoever had just reached for a tab
  // — and on Track my trip, where the map is being read rather than
  // answered, that is the last thing it should do.
  function selectTarget(next: 'pickup' | 'dropoff') {
    onTargetChange(next)
  }

  async function placePin(gps: GeoCoords) {
    setStatus('locating')
    try {
      const { label, guess } = await reverseGeocodeToPhAddress(gps)
      const location = createCustomLocation(label ?? `Pinned location (${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)})`, gps, guess ?? undefined)
      if (target === 'pickup') onPinPickup(location, guess)
      else onPinDropoff(location, guess)
      setStatus('idle')
    } catch {
      setStatus('error')
    }
  }

  async function useMyGpsHere() {
    setStatus('locating')
    try {
      const coords = await getCurrentGeoPosition()
      await placePin(coords)
    } catch {
      setStatus('error')
    }
  }

  // Where the phone says it is, right now, following as the person moves.
  //
  // Distinct from the FROM pin, which is a decision somebody made and must
  // stay where they put it. This is not a decision — it is the map answering
  // "which of these dots is me", which is the question actually being asked
  // when somebody stands at a terminal looking for their tricycle. Blue and
  // pulsing, the way every map has taught people to read "you".
  const { position: myPosition } = useWatchPosition(true)

  // Every tricycle that is actually out there, moving.
  //
  // Drivers publish their position every 30 seconds while signed in, so this
  // is a live picture rather than a roster — which is the difference between
  // "there are twelve tricycles in this TODA" and "that one is two streets
  // away". It is the question somebody standing at a rank is asking.
  //
  // Only recent readings are drawn. A position with no timestamp, or one
  // older than the window below, is from a driver who has since closed the
  // app or gone home — and a marker for a tricycle that is not there sends
  // somebody walking toward nothing. Better to show fewer and mean them.
  const { drivers } = useRides()
  const liveTricycles = drivers.filter((d) => {
    if (!d.online || !d.lastKnownGps || !d.lastKnownGpsAt) return false
    return Date.now() - new Date(d.lastKnownGpsAt).getTime() < LIVE_DRIVER_WINDOW_MS
  })

  const points: MapPoint[] = [
    ...liveTricycles.map((d) => ({
      id: `live-driver-${d.id}`,
      gps: d.lastKnownGps!,
      color: '#1d4ed8',
      label: `${d.name} — ${d.plateNumber}`,
      icon: 'tricycle' as const,
      pulse: true,
    })),
    ...(myPosition
      ? [
          {
            id: 'me',
            gps: myPosition,
            color: '#2563eb',
            label: 'You are here',
            pulse: true,
            icon: 'me' as const,
          },
        ]
      : []),
    ...(pickup.gps ? [{ id: 'pickup', gps: pickup.gps, color: '#0d9488', label: `${pickupLabel} — ${formatAddressLine(pickup.label)}` }] : []),
    ...(hasDropoff && dropoff.gps
      ? [{ id: 'dropoff', gps: dropoff.gps, color: '#e11d48', label: `${dropoffLabel} — ${formatAddressLine(dropoff.label)}` }]
      : []),
    ...extraPoints,
    ...terminals
      .filter((t) => t.gps)
      .map((t) => ({
        id: `terminal-${t.id}`,
        gps: t.gps!,
        color: '#1d4ed8',
        label: `${t.id} — ${t.name}`,
        icon: 'terminal' as const,
      })),
  ]

  return (
    // scroll-mt-24 keeps the toggle row clear of the sticky header
    // (~81px tall) when selectTarget scrolls this into view — without it,
    // scrollIntoView's default 'start' alignment tucks the top of this
    // section directly under the header, hiding the very controls the
    // passenger just asked to see.
    <div ref={containerRef} className="scroll-mt-24 space-y-1">
      <div className="flex items-center justify-end gap-2">
        {/* Fills the half of this row the tabs were already leaving empty,
            and sits beside the very tabs that choose which of the two a tap
            will move.

            It confirms the tap actually filled Pickup/Destination — the
            province/city/barangay form above doesn't reflect a map pin (it
            has no structured address for a freeform tap), so without this the
            passenger has no visible sign anything happened until they notice
            the marker move.

            Colour is identity here, matching the tabs beside it and the pins
            below: the green line is always the pickup, red is always the
            destination. Weight, not colour, marks which one you are editing.
            The words "Pickup"/"Destination" are dropped for the same reason —
            the tabs immediately to the right already say them, and at this
            width they were costing the end of the address itself. Tapping
            opens the full, unshortened address for both ends. */}
        <button
          type="button"
          onClick={() => setShowFullAddress(true)}
          title="Tap to see the complete address"
          className="min-w-0 flex-1 space-y-0.5 rounded-lg bg-slate-50 px-2 py-1 text-left text-[11px] leading-tight transition hover:bg-slate-100 active:bg-slate-200"
        >
          <span className={`block truncate text-pickup-accent ${target === 'pickup' ? 'font-semibold' : 'font-normal'}`}>📍 {hasPickup ? formatAddressLine(pickup.label) : <span className="text-slate-400">not set yet</span>}</span>
          <span className={`block truncate text-dest-accent ${target === 'dropoff' ? 'font-semibold' : 'font-normal'}`}>🏁 {hasDropoff ? formatAddressLine(dropoff.label) : <span className="text-slate-400">not set yet</span>}</span>
        </button>
        <div className="flex shrink-0 gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => selectTarget('pickup')}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
              // Both tabs stay in their pin's colour at all times — the colour
              // is identity (which pin am I moving), not selection. Selection
              // is the ring, so an unselected tab still tells you Pickup is
              // its colour. Themeable (see theme.css) — teal in most themes,
              // but a monochrome concept can move it onto the brand colour.
              target === 'pickup'
                ? 'bg-pickup-accent text-white shadow-sm ring-2 ring-pickup-accent ring-offset-1'
                : 'bg-pickup-accent/85 text-white'
            }`}
          >
            {pickupLabel}
          </button>
          <button
            type="button"
            onClick={() => selectTarget('dropoff')}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
              // dest-accent, not the reserved `danger` red — an SOS has to
              // stay the only thing wearing that colour. Themeable (see
              // theme.css) unlike the fixed pin colour on the map itself.
              target === 'dropoff'
                ? 'bg-dest-accent text-white shadow-sm ring-2 ring-dest-accent ring-offset-1'
                : 'bg-dest-accent/85 text-white'
            }`}
          >
            {dropoffLabel}
          </button>
        </div>
      </div>
      {belowTabs}
      {/* Above the GPS button, because it governs it: this wakes location and
          reports what the browser decided; that one fills an address with it. */}
      <LocationPermissionRow />
      {showGpsFor === target && (
        <button
          type="button"
          onClick={() => void useMyGpsHere()}
          disabled={status === 'locating'}
          className="w-full rounded-lg border border-brand-300 bg-brand-50 py-1.5 text-[11px] font-semibold text-brand-700 transition hover:bg-brand-100 disabled:opacity-60"
        >
          {status === 'locating' ? '📍 Locating…' : `📍 My GPS Location — set ${target === 'pickup' ? pickupLabel : dropoffLabel}`}
        </button>
      )}
      {/* Sits between the toggle and the map because that is the order the
         instruction applies in: pick which pin you are moving, then tap. It
         names the selected end so it is obvious which marker a tap will move. */}
      <p className="text-center text-[11px] text-slate-500">
        Tap the map to Pin location —{' '}
        <span className={target === 'pickup' ? 'font-semibold text-pickup-accent' : 'font-semibold text-dest-accent'}>
          {target === 'pickup' ? pickupLabel : dropoffLabel}
        </span>
      </p>
      <RealLiveMap points={points} onMapClick={placePin} hideLegend refitSignal={refitSignal} />
      {/* Under the map: book on the left, how many are riding on the right. */}
      {(leadingAction || underMapAction) && (
        <div className="flex items-center gap-2">
          {leadingAction && <div className="min-w-0 flex-1">{leadingAction}</div>}
          {underMapAction && <div className="shrink-0">{underMapAction}</div>}
        </div>
      )}
      {showFullAddress && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Complete address"
          onClick={() => setShowFullAddress(false)}
        >
          {/* Tapping the backdrop closes it; the card itself must not, or a
              passenger trying to select the text to copy would dismiss it. */}
          <div
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-2 text-xs font-bold text-slate-800">Complete address</p>
            <div className="space-y-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#0f766e]">📍 {pickupLabel}</p>
                <p className="text-xs leading-snug text-slate-700">{pickup.label}</p>
              </div>
              <div className="border-t border-slate-100 pt-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#be123c]">🏁 {dropoffLabel}</p>
                <p className="text-xs leading-snug text-slate-700">
                  {hasDropoff ? dropoff.label : <span className="text-slate-400">not set yet</span>}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowFullAddress(false)}
              className="mt-3 w-full rounded-lg bg-slate-100 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
            >
              Close
            </button>
          </div>
        </div>
      )}
      {status === 'locating' && (
        <p className="text-[11px] text-slate-400">📍 Locating that spot…</p>
      )}
      {status === 'error' && (
        <p className="text-[11px] text-amber-700">Couldn't place that pin — try tapping again.</p>
      )}
    </div>
  )
}
