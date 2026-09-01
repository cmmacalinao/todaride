import { LocationPermissionRow } from './LocationPermissionRow'
import { BottomSheet, type SheetSnap } from './BottomSheet'
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
  sheetNote,
  mapFooter,
  underMapAction,
  // Rendered directly beneath the Pickup / Destination tabs, so an
  // address form opens under the tab that asks for it rather than in a
  // strip somewhere else on the page.
  belowTabs,
  // Map-first: the map fills a tall area and everything else rides over it in
  // a sheet that drags up and down. See BottomSheet.
  mapFirst = false,
  // Rendered at the top of that sheet, above the picker's own controls — the
  // From/Destination address card, on the booking screen.
  sheetHeader,
  // Lets the caller drive how open the sheet is — opening an address form
  // inside it is no use if the sheet is too short to show it.
  sheetSnap,
  onSheetSnapChange,
  // Take a pin off the map again. Absent on screens where the two ends are
  // not the reader's to change.
  onClearPickup,
  onClearDropoff,
  // Shares the Live-location row rather than taking a line of its own.
  // A function so the caller can build it after this component's props are
  // read — it is defined further down the page than the map is.
  permissionRowAction,
  showGpsFor,
  terminals = [],
  extraPoints = [],
}: {
  mapFirst?: boolean
  sheetHeader?: () => ReactNode
  sheetSnap?: SheetSnap
  onSheetSnapChange?: (snap: SheetSnap) => void
  onClearPickup?: () => void
  onClearDropoff?: () => void
  permissionRowAction?: () => ReactNode
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
  // Rides at the top of the sheet, above the booking controls. Whatever a
  // caller would otherwise keep under the map — the times, the fare — is off
  // screen the moment the map is full screen, and those are exactly the
  // numbers somebody studying the map is deciding on.
  sheetNote?: ReactNode
  // Drawn across the bottom of the map at all times. For a strip that has to
  // stay readable while the map is being watched — "Recording", and the way
  // to stop it — beside the map is not good enough: it scrolls away, and it
  // is gone entirely once the map is full screen.
  mapFooter?: ReactNode
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
  // Where the sheet sits in map-first layout. Starts half open: enough to
  // show From and Destination without hiding the map they refer to.
  const [internalSheetSnap, setInternalSheetSnap] = useState<SheetSnap>('half')
  const effectiveSnap = sheetSnap ?? internalSheetSnap
  const changeSnap = onSheetSnapChange ?? setInternalSheetSnap

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

  // `end` defaults to whichever pin is armed, which is what a tap on the map
  // means. A drag passes its own end instead: picking a marker up already
  // says which one it is, whatever the toggle happens to be set to.
  async function placePin(gps: GeoCoords, end: 'pickup' | 'dropoff' = target) {
    setStatus('locating')
    try {
      const { label, guess } = await reverseGeocodeToPhAddress(gps)
      const location = createCustomLocation(label ?? `Pinned location (${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)})`, gps, guess ?? undefined)
      if (end === 'pickup') onPinPickup(location, guess)
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

  // What the two pins currently say, in one tappable block.
  //
  // It confirms a tap actually landed: the province/city/barangay form has no
  // structured address for a freeform map tap, so without this there is no
  // visible sign anything happened until the marker is noticed moving. Colour
  // is identity — green is always the pickup, red always the destination —
  // and weight marks which one a tap will move. Tapping opens the full,
  // unshortened address for both ends.
  // One row per pin: the address, and a way to take it off the map again.
  // The ✕ only appears once there is something to clear — an empty row with a
  // delete button beside it invites the question of what it would delete.
  const summaryRow = (
    end: 'pickup' | 'dropoff',
    icon: string,
    isSet: boolean,
    label: string,
    onClear?: () => void,
  ) => (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setShowFullAddress(true)}
        title="Tap to see the complete address"
        className={`min-w-0 flex-1 truncate text-left ${
          end === 'pickup' ? 'text-pickup-accent' : 'text-dest-accent'
        } ${target === end ? 'font-semibold' : 'font-normal'}`}
      >
        {icon} {isSet ? formatAddressLine(label) : <span className="text-slate-400">not set yet</span>}
      </button>
      {isSet && onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Clear the ${end === 'pickup' ? 'pickup' : 'destination'}`}
          title="Remove this pin"
          className="shrink-0 rounded px-1 text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700"
        >
          ✕
        </button>
      )}
    </div>
  )

  const summary = (
    <div
      className={`space-y-0.5 rounded-lg px-2 py-1 text-[11px] leading-tight transition ${
        mapFirst
          ? 'w-full bg-white/60 backdrop-blur-sm hover:bg-white/85'
          : 'min-w-0 flex-1 bg-slate-50 hover:bg-slate-100'
      }`}
    >
      {summaryRow('pickup', '📍', hasPickup, pickup.label, onClearPickup)}
      {summaryRow('dropoff', '🏁', hasDropoff, dropoff.label, onClearDropoff)}
    </div>
  )

  // Everything that is not the map. In the stacked layout it sits above and
  // below the map as it always has; in map-first it all moves into the sheet.
  const controls = (
    <>
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
        {/* In map-first this floats over the top of the map instead — see
            summary below. It is a caption for the two pins, and it belongs
            against the pins rather than in a panel that can be dragged shut
            over them. */}
        {!mapFirst && summary}
        {/* Hidden on the booking screen. There is one pin to place there —
            the destination — so a pair of tabs choosing between two ends is
            a control with nothing to choose. Every other screen that shares
            this picker still shows them. */}
        {!mapFirst && (
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
        )}
      </div>
      {belowTabs}
      {/* Above the GPS button, because it governs it: this wakes location and
          reports what the browser decided; that one fills an address with it. */}
      <LocationPermissionRow trailing={permissionRowAction?.()} />
      {!mapFirst && showGpsFor === target && (
        <button
          type="button"
          onClick={() => void useMyGpsHere()}
          disabled={status === 'locating'}
          className="w-full rounded-lg border border-brand-300 bg-brand-50 py-1.5 text-[11px] font-semibold text-brand-700 transition hover:bg-brand-100 disabled:opacity-60"
        >
          {status === 'locating' ? '📍 Locating…' : `📍 My GPS Location — set ${target === 'pickup' ? pickupLabel : dropoffLabel}`}
        </button>
      )}
      {/* Named the armed end so a tap was unambiguous. On the booking screen
         the two Set-on-Map buttons say which end they arm at the moment of
         arming it, so this repeated an answer already given - and the GPS
         button with it, which the pickup now takes from the phone anyway. */}
      {!mapFirst && (
        <p className="text-center text-[11px] text-slate-500">
          Tap the map to Pin location -{' '}
          <span className={target === 'pickup' ? 'font-semibold text-pickup-accent' : 'font-semibold text-dest-accent'}>
            {target === 'pickup' ? pickupLabel : dropoffLabel}
          </span>
        </p>
      )}
      {sheetNote}
      {/* Book on the left, how many are riding on the right. */}
      {(leadingAction || underMapAction) && (
        <div className="flex items-center gap-2">
          {leadingAction && <div className="min-w-0 flex-1">{leadingAction}</div>}
          {underMapAction && <div className="shrink-0">{underMapAction}</div>}
        </div>
      )}
    </>
  )

  // Whether the map has taken the whole phone. The sheet follows it there —
  // see the wrapper below.
  const [mapFullscreen, setMapFullscreen] = useState(false)

  // centerOn: a pinch means "closer to me". Without it the map zooms about
  // whatever the frame happened to be centred on, and the person doing the
  // pinching slides off the edge.
  const map = (
    <RealLiveMap
      points={points}
      onMapClick={(gps) => void placePin(gps)}
      hideLegend
      refitSignal={refitSignal}
      centerOn={myPosition}
      fill={mapFirst}
      onFullscreenChange={setMapFullscreen}
      // Drawn over the map rather than beside it, so the two things a person
      // needs while looking at the map — where their pins are, and the way
      // out to the booking — are still there when the map fills the phone.
      overlayTop={mapFirst ? summary : undefined}
      overlayBottom={mapFooter ? () => mapFooter : undefined}
      // Draggable exactly when drawn — the same conditions the two points
      // above are built from, not the "has the passenger chosen one yet"
      // flags. The pickup is drawn from a default coordinate before anybody
      // has chosen it, so gating the drag on `hasPickup` left a green dot
      // sitting on the map that could not be moved.
      //
      // Dragging is the correction for a tap that landed a street out: far
      // quicker than re-arming the end and tapping again, and it says which
      // pin it means by which one the finger is on.
      draggableIds={[...(pickup.gps ? ['pickup'] : []), ...(hasDropoff && dropoff.gps ? ['dropoff'] : [])]}
      onPointDragEnd={(id, gps) => void placePin(gps, id === 'pickup' ? 'pickup' : 'dropoff')}
    />
  )

  const sheet = (
    <BottomSheet snap={effectiveSnap} onSnapChange={changeSnap} label="Where to">
      {sheetHeader?.()}
      {controls}
    </BottomSheet>
  )

  if (mapFirst) {
    return (
      // A tall map with the form over it. The height leaves the header and
      // the bottom navigation visible, and the rest of the page carries on
      // below — scrolling past the map still reaches trip history and the
      // rest, which a window-fixed map would have buried.
      <div
        ref={containerRef}
        className="scroll-mt-24 relative h-[calc(100vh-13rem)] min-h-[26rem] overflow-hidden rounded-xl border border-slate-200"
      >
        <div className="absolute inset-0">{map}</div>
        {/* Full screen makes the map a fixed layer over the whole phone, so
            the sheet becomes one too — above it, and filling the same box,
            which is what keeps its snap heights meaning the same thing.
            Otherwise the sheet is simply painted over, and going full screen
            costs you the destination, the pickup and the Book button.

            Two branches rather than one wrapper that changes class: the
            sheet sizes itself from its parent's height, and a wrapper that
            is `display: contents` the rest of the time has no height to
            measure — which collapses the sheet to nothing. */}
        {mapFullscreen ? (
          <div className="pointer-events-none fixed inset-0 z-[70]">{sheet}</div>
        ) : (
          sheet
        )}
      </div>
    )
  }

  return (
    // scroll-mt-24 keeps the toggle row clear of the sticky header (~81px)
    // when selectTarget scrolls this into view — without it, scrollIntoView's
    // default 'start' alignment tucks the top of this section directly under
    // the header, hiding the very controls the passenger just asked to see.
    <div ref={containerRef} className="scroll-mt-24 space-y-1">
      {controls}
      {map}
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
