import { BottomSheet, type SheetSnap } from './BottomSheet'
import { useWatchPosition } from '../lib/liveTracking'
import { useRides } from '../context/RideContext'
import { formatAddressLine } from '../lib/addressFormat'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { RealLiveMap, type MapPoint } from './RealLiveMap'
import { createCustomLocation, reverseGeocodeToPhAddress, type PhAddressTags } from '../lib/customLocation'
import { STREET_PIN_NOTE, streetLinesFor } from '../lib/streetPaths'
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
  pickupIsMyLocation = false,
  leadingAction,
  sheetNote,
  mapFooter,
  sheetExtras,
  detailsBar,
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
  sheetPeekFraction,
  // Take a pin off the map again. Absent on screens where the two ends are
  // not the reader's to change.
  onClearPickup,
  onClearDropoff,

  terminals = [],
  extraPoints = [],
  onScanQr,
  toolbarAction,
  streetGuide = true,
  pickupAutomatic = false,
  pinPicking = true,
}: {
  mapFirst?: boolean
  sheetHeader?: () => ReactNode
  sheetSnap?: SheetSnap
  onSheetSnapChange?: (snap: SheetSnap) => void
  // A taller "peek" for a caller whose sheetHeader just grew a second
  // address row — enough to show that row without also surfacing the rest
  // of the form, which stays behind "half"/"full" as usual.
  sheetPeekFraction?: number
  onClearPickup?: () => void
  onClearDropoff?: () => void
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
  // The pickup is the passenger's own live position, found automatically
  // rather than picked — labelled that way on the summary so it reads as
  // "here is where you are", not as an address someone typed and might have
  // gotten wrong. False the moment it is a chosen address instead: a pin
  // dropped on the map, a saved place, or wherever a guest booking's pickup
  // was set — none of those are "my location" for whoever is booking.
  pickupIsMyLocation?: boolean
  // Terminals to draw alongside the two pins — where tricycles wait. Shown,
  // never selectable: tapping the map still moves whichever pin is armed.
  terminals?: Terminal[]
  // Passed straight through to RealLiveMap's own button row — see there for
  // why this is a callback rather than a route.
  onScanQr?: () => void
  // Passed straight through to RealLiveMap's button row too, seated right
  // after Legend — the booking screen puts a landmark search box there so a
  // destination can be found without scrolling back up to the Where to bar.
  toolbarAction?: ReactNode
  // Whether a chosen street still draws its green guide line (and frames
  // the map on it). The booking form turns this off the moment a ride is
  // requested: the pin is placed by then, and the trip map is for the trip.
  streetGuide?: boolean
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
  // Rendered under the location row, at the bottom of the sheet. Whatever a
  // caller has that is optional belongs here rather than above the button
  // that sends the booking.
  sheetExtras?: ReactNode
  // The Fare/Arrives/Distance/Time/Trip row, handed to the map so full screen
  // shows it above the map. Normal view draws it under the map from the
  // caller's side.
  detailsBar?: ReactNode
  // Sits to the right of the submit in that same under-map row — for the one
  // control that belongs with the booking action rather than in the form
  // below it: how many people are riding.
  underMapAction?: ReactNode
  // Which end the "My GPS location" button fills, and therefore when it is
  // shown at all: a ride wants it on the Pickup tab (you are standing at the
  // pickup), an errand on the Deliver-to tab (you are standing where it
  // should be brought). Omit it and no button appears.
  showGpsFor?: 'pickup' | 'dropoff'
  // The pickup is not the passenger's to set here — it is where their phone
  // says they are, booking for themselves. Only the destination is asked
  // for: one button under the map, the pin armed on it for good, and the
  // pickup marker drawn but not draggable. Book for someone, Group Ride and
  // PaDeliver leave this off, since there the pickup is somewhere else.
  pickupAutomatic?: boolean
  // Whether the map is for choosing places at all. Off once a ride is booked
  // or under way: the pickup and destination are settled, so the centre pin
  // and its Set buttons would only invite moving a trip that is already
  // happening.
  pinPicking?: boolean

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
  // Set just before a placed/dragged pin is handed up: the caller answers
  // with a new location id, which flips refitSignal and would otherwise
  // re-centre the map on the spot — yanking the view out from under the
  // finger that just put the dot there. Consumed for exactly the one
  // render that follows (see the reset effect below).
  const holdNextFitRef = useRef(false)
  // Runs after every render, so the hold above lasts for the single render
  // its pin placement triggers and no longer — a later city or destination
  // change still re-frames the map as usual.
  useEffect(() => {
    holdNextFitRef.current = false
  })
  const containerRef = useRef<HTMLDivElement>(null)
  // The shortened lines in the row are for reading at a glance; this opens
  // the full postal chain for the times someone needs to check the exact
  // spot — a sitio, a house number, the province — that shortening removed.
  const [showFullAddress, setShowFullAddress] = useState(false)
  // Where the sheet sits in map-first layout. Starts half open: enough to
  // show From and Destination without hiding the map they refer to.
  // Down by default - see the note on bookingSheetSnap in PassengerPage. Any
  // screen with a map opens showing the map, not a panel covering it.
  const [internalSheetSnap, setInternalSheetSnap] = useState<SheetSnap>('peek')
  // Where the map's centre pin is pointing right now — the map reports it as
  // it slides underneath (see RealLiveMap's centerPin). Only a candidate:
  // nothing is chosen until the button under the map is tapped.
  const [centerGps, setCenterGps] = useState<GeoCoords | null>(null)
  const effectiveSnap = sheetSnap ?? internalSheetSnap
  const changeSnap = onSheetSnapChange ?? setInternalSheetSnap

  // `end` defaults to whichever pin is armed, which is what a tap on the map
  // means. A drag passes its own end instead: picking a marker up already
  // says which one it is, whatever the toggle happens to be set to.
  // The end a tap on the map, or the centre pin, sets. Always the
  // destination when the pickup is where the phone is — see pickupAutomatic.
  const armed: 'pickup' | 'dropoff' = pickupAutomatic ? 'dropoff' : target

  async function placePin(gps: GeoCoords, end: 'pickup' | 'dropoff' = armed) {
    setStatus('locating')
    try {
      const { label, guess } = await reverseGeocodeToPhAddress(gps)
      const location = createCustomLocation(label ?? `Pinned location (${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)})`, gps, guess ?? undefined)
      holdNextFitRef.current = true
      if (end === 'pickup') onPinPickup(location, guess)
      else onPinDropoff(location, guess)
      setStatus('idle')
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
  const { drivers, landmarks } = useRides()
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
    ...(pickup.gps ? [{ id: 'pickup', gps: pickup.gps, color: '#dc2626', icon: 'pickup' as const, label: `${pickupLabel} — ${formatAddressLine(pickup.label)}` }] : []),
    ...(hasDropoff && dropoff.gps
      ? [{ id: 'dropoff', gps: dropoff.gps, color: '#16a34a', icon: 'dropoff' as const, label: `${dropoffLabel} — ${formatAddressLine(dropoff.label)}` }]
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
    // "My Location — " ahead of the address, only for an auto-found pickup.
    // Said once, here, rather than folded into the address itself — the
    // address is still the real, useful thing to show (it is what gets read
    // out to a driver), this just names where it came from.
    prefix?: string,
  ) => (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setShowFullAddress(true)}
        title="Tap to see the complete address"
        className={`min-w-0 flex-1 truncate text-left ${
          end === 'pickup' ? 'text-red-600' : 'text-green-700'
        } ${target === end ? 'font-semibold' : 'font-normal'}`}
      >
        {icon}{' '}
        {isSet ? (
          <>
            {prefix && <span className="font-normal opacity-75">{prefix} — </span>}
            {formatAddressLine(label)}
          </>
        ) : (
          <span className="text-slate-400">not set yet</span>
        )}
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
          ? 'w-full hover:bg-slate-50'
          : 'min-w-0 flex-1 bg-slate-50 hover:bg-slate-100'
      }`}
    >
      {summaryRow('pickup', '📍', hasPickup, pickup.label, onClearPickup, pickupIsMyLocation ? 'My Location' : undefined)}
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
        {/* The way to act on the pins, beside the tabs that choose which
            pin a tap moves. The two-line address summary moved down a row,
            into the space beside the passenger counter — see below. In
            map-first the summary is the row above the map instead (see
            overlayTop). */}
        {/* The Pickup / Destination tabs that used to sit here are gone. The
            buttons under the map (see setFromCenter) each name the end they
            set, so a pair of tabs choosing which end the next action means
            was the same question asked twice, one row apart. */}
      </div>
      {belowTabs}
      {/* Directly under the two address strips, which is where the sheet is
          answering "where from, where to, go". The location status, Group
          ride and the rest are settings around that decision and follow it
          rather than stand between the destination and the way to act on it.
          Book on the left, how many are riding on the right; the fare sits
          with the button that commits to it. */}
      {/* The address summary fills the half of this row the passenger
          counter leaves empty, directly above the map it captions. */}
      {(!mapFirst || leadingAction || underMapAction) && (
        <div className="flex items-center justify-end gap-2">
          {/* The from/to summary used to sit here, beside the passenger
              counter. It rides in the map's own toolbar now, right of Full
              screen (see overlayTop below), so the two addresses are read
              where the map they describe starts. */}
          {mapFirst && leadingAction && <div className="min-w-0 flex-1">{leadingAction}</div>}
          {underMapAction && <div className="shrink-0">{underMapAction}</div>}
        </div>
      )}
      {/* Map-first shows this over the map instead, under the address
          summary — see overlayTop above. */}
      {!mapFirst && sheetNote}
      {/* The standing "Location"/refresh row that used to sit here is gone —
          the GPS button right below already does the one thing that
          mattered (fill this end with a live fix), so a second, separate
          "refresh my location" control above it was answering a question
          nobody was asking twice. */}
      {sheetExtras}
      {/* Named the armed end so a tap was unambiguous. On the booking screen
         the two Set-on-Map buttons say which end they arm at the moment of
         arming it, so this repeated an answer already given - and the GPS
         button with it, which the pickup now takes from the phone anyway. */}
    </>
  )

  // Whether the map has taken the whole phone. The sheet follows it there —
  // see the wrapper below.
  const [mapFullscreen, setMapFullscreen] = useState(false)

  // centerOn: a pinch means "closer to me". Without it the map zooms about
  // whatever the frame happened to be centred on, and the person doing the
  // pinching slides off the edge.
  // A street picked from the search draws its road in green — either end.
  const pickupStreet = streetGuide ? streetLinesFor(pickup, landmarks) : null
  const dropoffStreet = streetGuide ? streetLinesFor(dropoff, landmarks) : null
  const streetLines = [...(pickupStreet ?? []), ...(dropoffStreet ?? [])]
  // The one exception to "the map never moves on its own": picking a
  // street is a request to see that street, so the view frames the whole
  // road (see frameLines) while its green line is showing. Dragging the pin
  // renames the location (see streetLinesFor), the line goes, and the map
  // is left alone again from there.
  const streetEnd: "pickup" | "dropoff" | null = dropoffStreet ? "dropoff" : pickupStreet ? "pickup" : null
  const streetNote =
    streetLines.length > 0 ? (
      <p className="mb-1 rounded-md border border-green-300 bg-green-50 px-2 py-1 text-[11px] font-medium text-green-800">
        🛣️ {STREET_PIN_NOTE}
      </p>
    ) : null

  // Sets an end to whatever the centre pin is over. Two buttons rather than
  // one that follows the armed tab: with one, a passenger who has lined the
  // map up has to notice which end it currently means, and switch tabs first
  // if it is the wrong one — with the map already where they want it. Each
  // button says the end it sets, so the map is lined up once and the choice
  // is the tap itself. Tapping one also arms that end, so the pin's colour
  // and any following tap on the map agree with what was just set.
  function setEndFromCenter(end: 'pickup' | 'dropoff') {
    if (!centerGps) return
    onTargetChange(end)
    void placePin(centerGps, end)
  }

  const setFromCenter = (
    <div className="mt-1.5 flex gap-1.5">
      {!pickupAutomatic && (
      <button
        type="button"
        onClick={() => setEndFromCenter('pickup')}
        disabled={!centerGps || status === 'locating'}
        className="flex-1 rounded-lg border border-red-500/40 bg-red-500/15 py-2 text-[11px] font-bold text-red-900 shadow-sm transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-50"
      >
        📍 Set {pickupLabel} here
      </button>
      )}
      {/* Always offered: this button is how a destination gets chosen, so
          it cannot wait on one having been chosen already (hasDropoff). */}
      <button
          type="button"
          onClick={() => setEndFromCenter('dropoff')}
          disabled={!centerGps || status === 'locating'}
          className="flex-1 rounded-lg border border-green-500/40 bg-green-500/15 py-2 text-[11px] font-bold text-green-900 shadow-sm transition hover:bg-green-500/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          🏁 Set {dropoffLabel} here
        </button>
    </div>
  )

  const map = (
    <>
    {streetNote}
    <RealLiveMap
      points={points}
      streetLines={streetLines}
      // No legend on this map: the 📍/🏁 summary directly above it already
      // names both pins, so a key naming them again under it was the same
      // two lines twice.
      hideLegend
      // No tap-to-place any more: a tap used to drop whichever pin was
      // armed, and with the centre pin that became a second, less exact way
      // to do the same thing — one that fired on every stray touch of a map
      // that now has to be dragged around to be used at all.
      // The map is the pointer: a pin stands at the middle of the frame and
      // the passenger slides the place they mean under its tip, then taps
      // the button below to set it. Tapping the map still works and still
      // places the armed pin — this is the way that survives a thumb, which
      // covers the very corner it is trying to choose.
      centerPin={pinPicking}
      // Red while the pickup is armed, green once it is the destination — the
      // same colours as the Pickup and Destination strips and the two buttons
      // under the map, so the pointer says which end it is about to set
      // without a word.
      centerPinColor={armed === 'pickup' ? '#dc2626' : '#16a34a'}
      onCenterChange={setCenterGps}
      refitSignal={streetEnd ? `${refitSignal}|street:${streetEnd}` : refitSignal}
      holdFit={holdNextFitRef.current}
      // Frame the pins once on open, then leave the view alone — the
      // passenger moves the map, not the map the passenger. (Except a
      // street pick — see streetEnd above.)
      fitOnce={!streetEnd}
      frameLines={streetEnd ? (streetEnd === 'dropoff' ? dropoffStreet : pickupStreet) ?? undefined : undefined}
      centerOn={myPosition}
      fill={mapFirst}
      onFullscreenChange={setMapFullscreen}
      onScanQr={onScanQr}
      toolbarAction={toolbarAction}
      detailsBar={detailsBar}
      // Handed to the map, which draws it as a row above itself, under its
      // toolbar: outside the map so no road is hidden under it, and still
      // inside the frame that fills the phone in full screen.
      overlayTop={
        mapFirst ? (
          // Stacked under the address summary rather than beside it — the
          // eta/fare numbers follow straight from "here to there", so they
          // read as its next line rather than a separate card competing with
          // it for the same strip of map.
          <div className="space-y-1.5">
            {summary}
            {sheetNote}
          </div>
        ) : (
          summary
        )
      }
      // In the toolbar row, right of Full screen, rather than as its own row:
      // two short lines that would otherwise spend a strip of a phone screen.
      overlayTopInline={!mapFirst}
      // Full screen lifts the map out of the page, and the Set Pickup / Set
      // Destination buttons that normally sit under it stay behind — which
      // left the centre pin with nothing to press. So in full screen they ride
      // along the bottom of the map itself.
      overlayBottom={(fullscreen) =>
        (fullscreen && pinPicking) || mapFooter ? (
          <>
            {fullscreen && !mapFirst && pinPicking && (
              // A white card behind them: see-through buttons laid over the
              // map read the street names and the map credits through them.
              <div className="rounded-xl bg-white/95 p-1.5 pt-0 shadow-lg">
                {setFromCenter}
                {/* And the booking button under them, as in the normal view:
                    set the place, then book, without leaving full screen. */}
                {leadingAction && <div className="mt-1.5">{leadingAction}</div>}
              </div>
            )}
            {mapFooter}
          </>
        ) : null
      }
      // Draggable exactly when drawn — the same conditions the two points
      // above are built from, not the "has the passenger chosen one yet"
      // flags. The pickup is drawn from a default coordinate before anybody
      // has chosen it, so gating the drag on `hasPickup` left a green dot
      // sitting on the map that could not be moved.
      //
      // Dragging is the correction for a tap that landed a street out: far
      // quicker than re-arming the end and tapping again, and it says which
      // pin it means by which one the finger is on.
      draggableIds={[...(pickup.gps && !pickupAutomatic ? ['pickup'] : []), ...(hasDropoff && dropoff.gps ? ['dropoff'] : [])]}
      onPointDragEnd={(id, gps) => void placePin(gps, id === 'pickup' ? 'pickup' : 'dropoff')}
    />
    {/* Only where the map sits in the page. In map-first layout the map fills
        its box and the booking sheet is drawn over it, so a button appended
        underneath would land outside the frame; there it rides in the
        sheet's own footer instead (see mapFooter). */}
    {!mapFirst && pinPicking && setFromCenter}
    {/* The booking button, straight under Set Destination here: set where
        you are going, then go — the two steps one above the other, where the
        thumb already is, rather than the button a whole map's height away. */}
    {!mapFirst && leadingAction && <div className="mt-1.5">{leadingAction}</div>}
    </>
  )

  const sheet = (
    <BottomSheet snap={effectiveSnap} onSnapChange={changeSnap} label="Where to" peekFraction={sheetPeekFraction}>
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
          // Into the body, for the same reason the map goes there: a `fixed`
          // layer is only fixed to the viewport while no ancestor has a
          // transform or a containment property, and the sheet has to end up
          // in the same coordinate space as the map it rides over. Sized to
          // match it so the snap heights keep meaning the same thing.
          createPortal(
            <div
              className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-screen"
              style={{
                height: '100dvh',
                paddingTop: 'env(safe-area-inset-top)',
                paddingBottom: 'env(safe-area-inset-bottom)',
              }}
            >
              {sheet}
            </div>,
            document.body,
          )
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
