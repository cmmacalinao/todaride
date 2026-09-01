import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MapContainer, Marker, Polygon, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { googleMapsApiKey } from '../lib/googleMapsLoader'
import { GoogleLiveMap } from './GoogleLiveMap'
import { markerBoxSize, markerHtml, type MarkerIcon } from './mapMarkerHtml'
import { NavMapBoundary } from './NavMapBoundary'
import type { GeoCoords } from '../types'

// Still split out of the main bundle, and still worth splitting even though
// nearly every screen now wants it: it is a fifth of a megabyte, and the
// first thing anybody sees is a login form with no map on it. Splitting lets
// that screen paint while the map arrives behind it.
const VectorLiveMap = lazy(() => import('./VectorLiveMap').then((m) => ({ default: m.VectorLiveMap })))

// Fetches that chunk ahead of time, for a screen that knows a map is coming.
//
// A failed preload is not worth reporting — the lazy import will simply try
// again for real.
export function preloadNavMap() {
  void import('./VectorLiveMap').catch(() => {})
}

export interface MapPoint {
  id: string
  gps: GeoCoords
  color: string
  label: string
  // Adds a soft pulsing halo — used for markers that are moving/live, so a
  // real GPS ping visually reads differently from a fixed pin.
  pulse?: boolean
  // Renders an emoji instead of the plain color dot, same white-backed-circle
  // treatment either way — 'tricycle' for the driver's own live marker,
  // 'pharmacy' for a pharmacy pin (so it reads as "a pharmacy is here" at a
  // glance instead of just another colored dot indistinguishable from a
  // pickup/dropoff point).
  icon?: MarkerIcon
  // Pins the label open instead of waiting for a hover, and it travels with
  // the marker. For the tricycle a passenger is actually sitting in: they
  // are holding the phone one-handed on a moving road and will not hover
  // anything, but they will glance down to check the number is still theirs.
  callout?: boolean
  // Shows that callout even while marker names are switched off.
  //
  // Names are hidden by default because on a phone-sized map the pills cover
  // the roads they label. That is the right default for a map being read and
  // the wrong one for a trip in progress: the two things moving are the
  // tricycle and the person in it, and "which dot am I" is the first question
  // anybody asks of a moving map. Those two, and nothing else, name
  // themselves.
  alwaysLabel?: boolean
}

export interface RealLiveMapProps {
  points: MapPoint[]
  // Fills its parent instead of taking a fixed height — for a map-first
  // layout where the parent decides how tall the map is. The parent must
  // have a real height of its own.
  fill?: boolean
  // Rendered over the map itself, so they stay put when it goes full screen —
  // a caption or a summary drawn outside the map disappears the moment the
  // map fills the phone, which is when it is most wanted.
  overlayTop?: ReactNode
  // Told whether the map is full screen, because the bottom of an embedded
  // map is often already spoken for — the booking sheet sits there — while in
  // full screen it is the only place left to put anything.
  overlayBottom?: (fullscreen: boolean) => ReactNode
  // Told when the map fills the phone, so a caller can bring its own panels
  // along. Full screen is a `fixed` layer over everything, and anything the
  // caller drew beside the map — a bottom sheet, most of all — is painted
  // over unless it is told to come too.
  onFullscreenChange?: (fullscreen: boolean) => void
  // Either a real OSRM/Google road-network path (many points, follows actual
  // streets) or just the two leg endpoints as a fallback — routeIsReal picks
  // the line style so the two read differently (solid road path vs. dashed
  // "as the crow flies" placeholder).
  routeLine?: GeoCoords[]
  // A faint second line, for a connection worth hinting at rather than
  // drawing: on a shared ride it runs from the passenger already aboard to
  // the one waiting further up the road, so the driver can see the two are
  // on the same journey without it competing with the route they follow.
  hintLine?: GeoCoords[]
  routeIsReal?: boolean
  // 'pickup' draws a thinner, differently-colored line for the "driver en
  // route to you" leg so it reads as distinct from the main trip route
  // (pickup→dropoff, or the booking-form preview) — defaults to 'trip'.
  routeVariant?: 'trip' | 'pickup'
  // Lets the caller turn the map into a pin-drop picker — fires with the
  // tapped coordinate instead of (or alongside) the read-only live-tracking
  // display. Absent for plain tracking views (TripMonitor).
  onMapClick?: (gps: GeoCoords) => void
  // Lets a marker itself be the "pick this one" control (e.g. tapping a
  // pharmacy pin selects it, same as tapping its row in the list below) —
  // fires with that point's id. Independent of onMapClick, which fires for
  // taps on the bare map background instead of a specific marker.
  onPointClick?: (id: string) => void
  // Closed areas drawn under the pins — TODA and city-proper boundaries.
  areas?: { id: string; points: GeoCoords[]; color: string; label?: string }[]
  // CSS height for the map canvas. Defaults to a card-sized 220px; a screen
  // where the map is the whole point (the driver's home view) passes its own
  // so the map fills what is left of the phone instead of being a strip.
  height?: string
  // Callers that already label the pins right below the map (see
  // LocationMapPicker's Pickup/Destination summary) can drop this legend
  // rather than print the same two addresses twice. Defaults to showing it:
  // everywhere else it is the only thing naming what the dots mean.
  hideLegend?: boolean
  // Starts unlocked rather than skipping the lock: drag and the zoom buttons
  // work from the first render, but the palm icon stays on screen so it can
  // still be locked back down deliberately. Set on the two trip-tracking
  // maps (TripMonitor, DriverPage's active trip), which are what a driver or
  // a passenger is actually looking at for the length of a ride, not a map
  // sitting in the middle of a page of other things to read. Left off
  // everywhere else — a booking map with a long form above and below it is
  // exactly the page a stray swipe traps someone on, which is what the lock
  // exists for.
  alwaysInteractive?: boolean
  // Keeps every participant in view for the length of a trip: the frame is
  // rebuilt as the markers move, rather than fitted once and left behind by
  // the one marker that travels. Terminal pins are excluded — they are on
  // every map and never move, and fitting them zooms the trip out to nothing.
  //
  // It still yields the instant the reader takes the map over (see
  // FitBounds), and re-locking the map hands the frame back.
  followAll?: boolean
  // The account owner's own live position. Given, a pinch re-centres the map
  // on them instead of on wherever the frame happened to be.
  centerOn?: GeoCoords | null
  // A trip moment worth re-framing for — pass a value that changes at that
  // moment (arrival at the pickup point) and the map fits everything again,
  // even if the viewer had panned away. Arrival ends one leg and begins
  // another, so the view starts fresh rather than wherever the last leg left
  // it; control returns to the viewer immediately after.
  refitSignal?: string
  // Which markers the viewport is framed around. Every marker still draws —
  // this only decides what has to be *visible*. Once the trip is underway the
  // pickup is behind you, so framing it too zooms the map out around a place
  // nobody is going back to; the tricycle and the destination are the pair
  // that matters. Defaults to framing everything.
  fitPointIds?: string[]
  // Holds the frame still: no panning, no zooming, no stray drag. Used while
  // a trip is underway, when the map is something you glance at to see where
  // you are — not something to go exploring in, and certainly not something
  // to nudge out of position and have to put back one-handed on a tricycle.
  frozen?: boolean
  // Markers the viewer may pick up and put down, by id, with where they were
  // dropped reported back. Used for setting a terminal's real position: the
  // operator knows where the gate is, and pointing at it on a map is a truer
  // answer than typing coordinates.
  draggableIds?: string[]
  onPointDragEnd?: (id: string, gps: GeoCoords) => void
  // Turns the map into a navigation view for the length of a trip: tilted,
  // and turned so the road ahead points at the top of the phone. Needs a
  // position to sit on and a direction to face; without either it stays the
  // ordinary north-up map, which is also what it falls back to if the vector
  // tiles cannot be reached.
  //
  // Only for a screen somebody is looking at while moving. On a booking map
  // it would be worse than useless — you are standing still, and a map that
  // rotates when you turn round to look at a jeepney is a map that will not
  // hold still.
  nav?: {
    center: GeoCoords
    heading: number | null
    speedMps: number | null
    // Which marker is this phone's own vehicle, so it can be turned to face
    // the way it is travelling.
    rotatePointId?: string
  } | null
}

function routeLineStyle(routeIsReal: boolean | undefined, routeVariant: 'trip' | 'pickup' | undefined) {
  if (!routeIsReal) return { color: '#94a3b8', dashArray: '4 4', weight: 2 }
  return routeVariant === 'pickup'
    ? { color: '#f59e0b', weight: 2.5, opacity: 0.85 }
    : { color: '#2563eb', weight: 4, opacity: 0.7 }
}

function dotIcon(color: string, pulse?: boolean, icon?: MarkerIcon, pointId?: string) {
  const box = markerBoxSize(icon)
  return L.divIcon({
    className: '',
    html: markerHtml({ color, pulse, icon, pointId }),
    iconSize: [box, box],
    iconAnchor: [box / 2, box / 2],
  })
}

// Fits the map to all current points once, then only re-fits if the *set* of
// points changes (e.g. a driver marker appears). A marker MOVING never
// re-fits: a tricycle crossing town would otherwise re-zoom the map every
// tick of the trip, which is the whole complaint about maps that will not
// hold still. Only an explicit refitSignal — arriving at the pickup, picking
// a different destination — asks for the frame back.
// Frames every marker — pickup, destination, and the tricycle among them — so
// the whole trip is visible the moment the map opens, and keeps framing it as
// markers come and go.
//
// It stops the instant the reader takes over. Someone who has panned or
// zoomed is looking at something specific, and snapping their view back on
// the next marker update takes it away from them. From the first drag or
// zoom, the viewport is theirs and nothing here touches it again.
function FitBounds({
  points,
  refitSignal,
  fitPointIds,
  followAll,
  centerOn,
}: {
  points: MapPoint[]
  refitSignal?: string
  fitPointIds?: string[]
  followAll?: boolean
  // Where the person holding the phone is. Given, the map re-centres on it
  // whenever the zoom changes.
  centerOn?: GeoCoords | null
}) {
  const map = useMap()
  const userMovedRef = useRef(false)
  // Our own fitBounds/setView fire zoomstart too. This marks the window in
  // which a zoom is ours, so it is not mistaken for the reader's.
  const programmaticRef = useRef(false)

  useMapEvents({
    // Only ever the reader — Leaflet never drags the map itself.
    dragstart() {
      userMovedRef.current = true
    },
    zoomstart() {
      if (!programmaticRef.current) userMovedRef.current = true
    },
    moveend() {
      programmaticRef.current = false
    },
  })

  // A changed signal hands the viewport back to the map for one fit. Skips
  // the very first run: opening the map already fits, and clearing a flag
  // that is still false achieves nothing.
  const firstSignalRef = useRef(true)
  useEffect(() => {
    if (firstSignalRef.current) {
      firstSignalRef.current = false
      return
    }
    userMovedRef.current = false
  }, [refitSignal])

  // Falls back to every point when the named ones are not on the map (yet) —
  // an empty frame is worse than a wide one.
  const requested = followAll
    ? points.filter((p) => p.icon !== 'terminal')
    : fitPointIds
      ? points.filter((p) => fitPointIds.includes(p.id))
      : points
  const framed = requested.length > 0 ? requested : points

  // Identity only, so a marker that merely moves leaves the viewport alone —
  // except while following a trip, where movement is exactly the thing the
  // frame has to keep up with.
  const fitKey = followAll
    ? framed.map((p) => `${p.id}:${p.gps.lat.toFixed(4)},${p.gps.lng.toFixed(4)}`).join('|')
    : framed.map((p) => p.id).join(',')

  // Zooming keeps you in the middle.
  //
  // Leaflet zooms about the centre of the current view, so a map framed on a
  // pickup and a destination drifts further from the person every time they
  // pinch — by the third zoom the thing they were trying to look at more
  // closely is off the edge. Re-centring on their own position makes the zoom
  // mean "closer to me", which is what a pinch means on every other map they
  // have ever used.
  //
  // Only on zoom, never on pan: dragging is how somebody looks at somewhere
  // else, and snapping back would make that impossible.
  const centerRef = useRef(centerOn)
  centerRef.current = centerOn
  useMapEvents({
    zoomend() {
      const here = centerRef.current
      if (!here) return
      programmaticRef.current = true
      map.setView([here.lat, here.lng], map.getZoom(), { animate: true })
    },
  })

  useEffect(() => {
    if (framed.length === 0) return
    if (userMovedRef.current) return
    programmaticRef.current = true
    if (framed.length === 1) {
      map.setView([framed[0].gps.lat, framed[0].gps.lng], 15)
      return
    }
    const bounds = L.latLngBounds(framed.map((p) => [p.gps.lat, p.gps.lng] as [number, number]))
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey, refitSignal])

  return null
}

// The pan toggle, built as a Leaflet control rather than a box floated over
// the map.
//
// Leaflet stacks controls added to the same corner in the order they were
// added, and styles every .leaflet-bar button identically — so this docks
// directly beneath the +/- pair and is the same size as them by construction.
// Positioning it by hand meant guessing the zoom control's height in pixels,
// which is how it ended up half-hidden behind it.
// An open palm — the hand you would put on a paper map to slide it. Reads as
// "touch me and the map moves" without a word of instruction, which is the
// whole job of a control a driver meets once, at speed, on a phone.
const PAN_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M18 11V6a2 2 0 0 0-4 0"/>' +
  '<path d="M14 10V4a2 2 0 0 0-4 0v2"/>' +
  '<path d="M10 10.5V6a2 2 0 0 0-4 0v8"/>' +
  '<path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.3l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/>' +
  '</svg>'

function PanLockControl({ unlocked, onToggle }: { unlocked: boolean; onToggle: () => void }) {
  const map = useMap()
  // The control is created once; the handler must not be, or every toggle
  // would tear the button out of the DOM and put a new one back.
  const toggleRef = useRef(onToggle)
  toggleRef.current = onToggle
  const linkRef = useRef<HTMLAnchorElement | null>(null)

  useEffect(() => {
    const control = new L.Control({ position: 'topleft' })
    control.onAdd = () => {
      const bar = L.DomUtil.create('div', 'leaflet-bar leaflet-control')
      const link = L.DomUtil.create('a', 'toda-pan-toggle', bar) as HTMLAnchorElement
      link.href = '#'
      link.role = 'button'
      link.innerHTML = PAN_ICON
      linkRef.current = link
      L.DomEvent.on(link, 'click', (e) => {
        L.DomEvent.stop(e)
        toggleRef.current()
      })
      // Without this a tap on the button also reaches the map underneath.
      L.DomEvent.disableClickPropagation(bar)
      return bar
    }
    control.addTo(map)
    return () => {
      control.remove()
      linkRef.current = null
    }
  }, [map])

  // State lives on the existing element rather than in a re-created control.
  useEffect(() => {
    const link = linkRef.current
    if (!link) return
    link.title = unlocked ? 'Map unlocked — scroll the page to lock it' : 'Tap to move the map'
    link.setAttribute('aria-label', link.title)
    link.setAttribute('aria-pressed', String(unlocked))
    link.classList.toggle('is-unlocked', unlocked)
  }, [unlocked])

  return null
}

// Turns the map's own interaction handlers on and off. Toggled here rather
// than through MapContainer's props, which Leaflet reads once at creation and
// never again — a map created while moving would stay movable for the rest of
// the trip.
function FreezeView({ frozen }: { frozen?: boolean }) {
  const map = useMap()
  useEffect(() => {
    // scrollWheelZoom stays out of this list: it is off by design everywhere,
    // so re-enabling it here would switch on something never asked for.
    const handlers = [map.dragging, map.touchZoom, map.doubleClickZoom, map.boxZoom, map.keyboard]
    for (const h of handlers) {
      if (!h) continue
      if (frozen) h.disable()
      else h.enable()
    }
  }, [map, frozen])
  return null
}

// Fires onMapClick with the tapped lat/lng — a bare listener component (no
// visible output) since react-leaflet wires map events through hooks rather
// than DOM handlers on MapContainer itself.
function ClickHandler({ onMapClick }: { onMapClick: (gps: GeoCoords) => void }) {
  useMapEvents({
    click(e) {
      onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  return null
}

// The free, keyless renderer — OpenStreetMap tiles via Leaflet. Used
// whenever no Google Maps API key is configured (see RealLiveMap below).
function OsmLiveMap({ points, routeLine, hintLine, routeIsReal, routeVariant, onMapClick, onPointClick, areas, refitSignal, fitPointIds, followAll, centerOn, frozen, draggableIds, onPointDragEnd, height = '320px', panLock }: RealLiveMapProps & { panLock?: { unlocked: boolean; onToggle: () => void } }) {
  const center: [number, number] = [points[0].gps.lat, points[0].gps.lng]

  return (
    <MapContainer
      center={center}
      zoom={15}
      scrollWheelZoom={false}
      style={{ height, width: '100%', cursor: onMapClick ? 'crosshair' : undefined }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {onMapClick && <ClickHandler onMapClick={onMapClick} />}
      {areas?.map((a) =>
        a.points.length >= 3 ? (
          <Polygon
            key={a.id}
            positions={a.points.map((p) => [p.lat, p.lng])}
            pathOptions={{ color: a.color, weight: 2, fillOpacity: 0.12, dashArray: '6 4' }}
          >
            {a.label && <Tooltip sticky>{a.label}</Tooltip>}
          </Polygon>
        ) : null,
      )}
      {hintLine && hintLine.length > 1 && (
        <Polyline
          positions={hintLine.map((p) => [p.lat, p.lng])}
          pathOptions={{ color: '#0f2a6b', weight: 1.5, opacity: 0.45, dashArray: '3 5' }}
        />
      )}
      {routeLine && routeLine.length > 1 && (
        <Polyline positions={routeLine.map((p) => [p.lat, p.lng])} pathOptions={routeLineStyle(routeIsReal, routeVariant)} />
      )}
      {points.map((p) => (
        <Marker
          key={`${p.id}${p.callout ? ':callout' : ''}`}
          position={[p.gps.lat, p.gps.lng]}
          icon={dotIcon(p.color, p.pulse, p.icon, p.id)}
          draggable={!!draggableIds?.includes(p.id)}
          eventHandlers={{
            ...(onPointClick ? { click: () => onPointClick(p.id) } : {}),
            ...(draggableIds?.includes(p.id) && onPointDragEnd
              ? {
                  dragend: (e: L.DragEndEvent) => {
                    const { lat, lng } = (e.target as L.Marker).getLatLng()
                    onPointDragEnd(p.id, { lat, lng })
                  },
                }
              : {}),
          }}
        >
          <Tooltip direction="top" offset={[0, -10]} permanent={p.callout} className={p.callout ? 'toda-callout' : undefined}>
            {p.label}
          </Tooltip>
        </Marker>
      ))}
      <FreezeView frozen={frozen} />
      {panLock && <PanLockControl unlocked={panLock.unlocked} onToggle={panLock.onToggle} />}
      <FitBounds points={points} refitSignal={refitSignal} fitPointIds={fitPointIds} followAll={followAll} centerOn={centerOn} />
    </MapContainer>
  )
}

// Small barangays that OpenStreetMap's free Nominatim data doesn't have a
// point for fall back to a broader match (e.g. the whole city) — see
// geocode.ts's progressive fallback. When that happens to two different
// points on the same map (pickup and dropoff both landing on the same
// city-center coordinate is the common case), their pins would render stacked
// exactly on top of each other with no visual way to tell them apart. This
// nudges exact-duplicate coordinates apart by a few meters, in different
// directions per duplicate, purely for map display — it never touches the
// underlying ride/route data (fare, ETA, and the actual route line still use
// the real, un-nudged coordinates), so it's just making an existing geocoding
// gap visible instead of hiding it as one indistinguishable pin.
function spreadOverlappingPoints(points: MapPoint[]): MapPoint[] {
  const seen = new Map<string, number>()
  return points.map((p) => {
    const key = `${p.gps.lat.toFixed(5)},${p.gps.lng.toFixed(5)}`
    const duplicateIndex = seen.get(key) ?? 0
    seen.set(key, duplicateIndex + 1)
    if (duplicateIndex === 0) return p

    // Golden-angle spacing fans any number of duplicates out evenly instead
    // of stacking them along one line; ~15m per step is enough to separate
    // pins at any zoom level this map is realistically viewed at.
    const angle = duplicateIndex * 2.399963229728653
    const radiusMeters = 15 * duplicateIndex
    const metersPerDegLat = 111320
    const metersPerDegLng = 111320 * Math.cos((p.gps.lat * Math.PI) / 180)
    return {
      ...p,
      gps: {
        lat: p.gps.lat + (Math.sin(angle) * radiusMeters) / metersPerDegLat,
        lng: p.gps.lng + (Math.cos(angle) * radiusMeters) / metersPerDegLng,
      },
    }
  })
}

// One legend row's marker, drawn by the same code that draws it on the map.
//
// Not an approximation of it: markerHtml is the single source of both, so a
// change to the tricycle's artwork or the pulse ring shows up here without
// anybody remembering to update a key. The markup is trusted because this
// module wrote it — the only caller-supplied values reaching it are a colour
// and an icon name, both of which it re-emits as CSS rather than as HTML.
function MarkerArt({ point }: { point: MapPoint }) {
  const box = markerBoxSize(point.icon)
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center"
      style={{ width: box, height: box }}
      dangerouslySetInnerHTML={{
        __html: markerHtml({ color: point.color, icon: point.icon }),
      }}
    />
  )
}

// The map's own on/off switch for touch.
//
// A map inside a scrolling page is a trap on a phone: a finger dragged across
// it pans the map instead of scrolling past it, so the page appears stuck.
// Every map therefore starts locked — it draws, it can be read, and a swipe
// goes straight through it to the page. Tapping this hands the map the
// gestures on purpose, and the next scroll of the page hands them back.
function PanLock({ unlocked, onToggle }: { unlocked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={unlocked}
      aria-label={unlocked ? 'Lock the map' : 'Unlock the map to move it'}
      title={unlocked ? 'Map unlocked — scroll the page to lock it again' : 'Tap to move the map'}
      // Sits directly under Leaflet's +/- stack: that control is 10px from
      // the top-left corner and two 30px buttons tall, so 78px clears it with
      // a hair of breathing room. Same column, so the three map controls read
      // as one group rather than two ideas at opposite corners.
      //
      // z-[1000] clears Leaflet's own panes and controls, which run to 1000
      // inside the container's stacking context.
      className={`absolute left-[10px] top-[78px] z-[1000] flex h-[30px] w-[30px] items-center justify-center rounded border shadow-md transition ${
        unlocked
          ? 'border-brand-700 bg-brand-600 text-white'
          : 'border-slate-300 bg-white/95 text-slate-600 hover:bg-white'
      }`}
    >
      {/* The same open palm as the Leaflet control's, drawn rather than typed
          so it renders identically on every phone. */}
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M18 11V6a2 2 0 0 0-4 0" />
        <path d="M14 10V4a2 2 0 0 0-4 0v2" />
        <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
        <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.3l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15" />
      </svg>
    </button>
  )
}

// Picks the renderer — real Google Maps tiles/roads when
// VITE_GOOGLE_MAPS_API_KEY is configured (see googleMapsLoader.ts), the free
// OpenStreetMap/Leaflet stack otherwise — behind one shared wrapper (sizing,
// border, and the point legend below the map) so callers never need to know
// which one is active.
export function RealLiveMap({ points, fill, overlayTop, overlayBottom, onFullscreenChange, routeLine, hintLine, routeIsReal, routeVariant, onMapClick, onPointClick, areas, refitSignal, fitPointIds, followAll, centerOn, frozen = false, draggableIds, onPointDragEnd, hideLegend = false, alwaysInteractive = false, height, nav }: RealLiveMapProps) {
  // If the Google script fails to load (bad key, network block, CSP), fall
  // back to the OSM/Leaflet canvas instead of showing an empty map.
  const [googleFailed, setGoogleFailed] = useState(false)
  // Same idea for the navigation view: no WebGL, no vector tiles, no signal —
  // the rider gets the north-up map rather than an empty box. It never tries
  // again on its own, because a view that flickers between two different maps
  // mid-trip is worse than one that quietly settles for the plainer one.
  const [navFailed, setNavFailed] = useState(false)
  // The map filling the phone, for following a route rather than glancing at
  // one. Local to the map, so every screen that draws one gets it.
  const [fullscreen, setFullscreen] = useState(false)
  // Marker names, off until asked for — see the row above the map.
  const [showLabels, setShowLabels] = useState(false)
  // Locked until asked otherwise — see PanLock. alwaysInteractive starts
  // already unlocked instead of skipping the control: a driver or a
  // passenger watching a trip should not have to tap anything before they
  // can look closer, but the icon stays, so they can still lock it back down
  // deliberately — before scrolling past it, say — rather than it vanishing
  // the moment panning stopped needing a first tap.
  const [unlocked, setUnlocked] = useState(alwaysInteractive)
  // Counts the times the map has gone back under glass. Feeding it into the
  // framing signal is what makes re-locking resume automatic framing after a
  // reader has panned away.
  const [relocks, setRelocks] = useState(0)

  // In an effect rather than in the button's onClick, so a caller is told
  // however the state changed.
  useEffect(() => {
    onFullscreenChange?.(fullscreen)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen])

  // Scrolling the page puts the map back under glass. Someone who has moved
  // on to read the fare or the driver's details is no longer working the map,
  // and leaving it live means the next swipe that happens to land on it
  // pans the map instead of the page.
  //
  // Capture, because scroll does not bubble: the page scrolls #root here and
  // its own pane inside the split-screen simulator, and this has to catch
  // both without knowing which.
  useEffect(() => {
    if (!unlocked) return
    const relock = () => {
      setUnlocked(false)
      setRelocks((n) => n + 1)
    }
    document.addEventListener('scroll', relock, { capture: true, passive: true })
    return () => document.removeEventListener('scroll', relock, { capture: true })
  }, [unlocked])

  if (points.length === 0) return null
  // The vector map is now the map. Leaflet stays behind it as the fallback:
  // no WebGL, no vector tiles, or any error at all, and the old raster map
  // takes over rather than the screen showing an empty rectangle.
  const useVector = !navFailed
  const useGoogle = !useVector && !!googleMapsApiKey() && !googleFailed
  const displayPoints = spreadOverlappingPoints(points)

  // Terminals are scenery: on every map, never changing, and their own pins
  // already name them on tap. Listing all of them above the map pushed the
  // pickup, the drop-off and the tricycle — the things the viewer opened it
  // for — off the top of the key.
  const legendPoints = points.filter((p) => p.icon !== 'terminal')
  // A caller that froze this map meant it — a finished trip is a picture, not
  // a thing to explore, and no button should offer to move it.
  const interactive = !frozen
  // A map that has the screen to itself is not sitting in a scrolling page,
  // so there is no swipe for it to steal and nothing for the lock to protect.
  // Making people find a padlock before they can pan or pinch their own map
  // is the wrong trade the moment the map *is* the page.
  const ownsScreen = fullscreen || !!fill
  const locked = frozen || (!unlocked && !ownsScreen)
  // Re-locking the map is the reader saying they are done with it, so the
  // frame comes back to the app: FitBounds treats a changed signal as
  // permission to fit again, which is what clears the "reader has taken
  // over" flag their first pan set.
  const framingSignal = `${refitSignal ?? ''}|${relocks}`
  const body = (
    // relative z-0 makes this its own stacking context. Leaflet gives its
    // panes z-index 400 and its controls up to 1000, which beat the fixed
    // header (z-20) and let the map paint over it while scrolling. Confining
    // them here fixes every map in the app at once, rather than escalating
    // the header z-index and losing the same race again later.
    <div
      // Full screen is the visible viewport, not the layout one. `inset-0`
      // sizes to the layout viewport, which on a phone is taller than the
      // screen whenever the browser's own address bar is showing — so the
      // bottom of the map, and the sheet pinned to it, sat below the fold and
      // could not be reached. 100dvh tracks what is actually on screen;
      // h-screen underneath it is the fallback for a browser without dvh.
      style={
        fullscreen
          ? {
              height: '100dvh',
              // Clear of the phone's own furniture. A full-screen layer at
              // top:0 starts underneath the status bar — which this app tints
              // with its brand colour, so it is an opaque blue strip lying
              // across the Close and Names buttons rather than a transparent
              // one. Zero on a desktop browser, so this costs nothing there.
              paddingTop: 'env(safe-area-inset-top)',
              paddingBottom: 'env(safe-area-inset-bottom)',
            }
          : undefined
      }
      className={
        fullscreen
          ? 'fixed inset-x-0 top-0 z-[60] flex h-screen flex-col bg-white'
          : `relative z-0 flex flex-col overflow-hidden rounded-lg border border-slate-200 ${fill ? 'h-full' : ''} ${frozen ? 'map-frozen' : ''}`
      }
    >
      {/* Full screen, and the names, in one row above the map.
          A 320px strip is enough to glance at and not enough to look at
          properly — following a route or checking which street is coming
          wants the whole phone. The names are off by default because on a
          small map the pills cover the roads they are labelling; tapping
          shows them. */}
      <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-2 py-1">
        <button
          type="button"
          onClick={() => setFullscreen((v) => !v)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          {fullscreen ? '✕ Close' : '⛶ Full screen'}
        </button>
        {!hideLegend && legendPoints.length > 0 && (
          <button
            type="button"
            onClick={() => setShowLabels((v) => !v)}
            aria-pressed={showLabels}
            className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition ${
              showLabels
                ? 'border-brand-300 bg-brand-50 text-brand-700'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            🏷️ Legend
          </button>
        )}
      </div>
      {interactive && useGoogle && (
        <PanLock
          unlocked={unlocked}
          onToggle={() =>
            setUnlocked((v) => {
              if (v) setRelocks((n) => n + 1)
              return !v
            })
          }
        />
      )}
      {/* The key, once asked for. It used to be always on, which is right for
          a map you are reading and wrong for one you are riding with.

          Each row wears the marker it is describing, drawn by the same code
          that draws it on the map — the tricycle's own artwork, the terminal
          sign, the figure that is you. A coloured dot beside every line meant
          the key answered "what colour is this" while the map was asking
          "what is that little blue tricycle", and the reader had to translate
          between the two. */}
      {showLabels && !hideLegend && legendPoints.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-500">
          {legendPoints.map((p) => (
            <span key={p.id} className="flex items-center gap-1.5 truncate">
              <MarkerArt point={p} />
              {p.label}
            </span>
          ))}
        </div>
      )}
      {/* The map and anything drawn over it. Relative so the overlays below
          anchor to the map itself, which is what keeps them on screen when it
          goes full screen. */}
      <div className={`relative ${fullscreen || fill ? "min-h-0 flex-1" : ""}`}>
      {useVector ? (
        <NavMapBoundary onFailed={() => setNavFailed(true)}>
          <Suspense
            fallback={
              <div
                className="flex items-center justify-center bg-slate-100 text-[11px] text-slate-500"
                style={{ height: height ?? '320px' }}
              >
                Loading map…
              </div>
            }
          >
            <VectorLiveMap
              points={displayPoints}
              areas={areas}
              routeLine={routeLine}
              hintLine={hintLine}
              routeIsReal={routeIsReal}
              routeVariant={routeVariant}
              onMapClick={onMapClick}
              onPointClick={onPointClick}
              refitSignal={framingSignal}
              fitPointIds={fitPointIds}
              followAll={followAll}
              centerOn={centerOn}
              frozen={locked}
              draggableIds={draggableIds}
              onPointDragEnd={onPointDragEnd}
              height={fullscreen || fill ? "100%" : height}
              nav={nav}
              showLabels={showLabels}
              // Hidden once a map owns the screen (full screen, or map-first
              // booking) everywhere except alwaysInteractive — there, full
              // screen is precisely the moment a driver or a passenger most
              // wants to be able to lock the map on purpose, rather than
              // having the one control that could stop an accidental drag
              // disappear the moment the map got bigger.
              panLock={
                interactive && (alwaysInteractive || !ownsScreen)
                  ? {
                      unlocked,
                      onToggle: () =>
                        setUnlocked((v) => {
                          if (v) setRelocks((n) => n + 1)
                          return !v
                        }),
                    }
                  : undefined
              }
              onFailed={() => setNavFailed(true)}
            />
          </Suspense>
        </NavMapBoundary>
      ) : useGoogle ? (
        <GoogleLiveMap
          points={displayPoints}
          routeLine={routeLine}
          routeIsReal={routeIsReal}
          routeVariant={routeVariant}
          onMapClick={onMapClick}
          onPointClick={onPointClick}
          refitSignal={framingSignal}
          fitPointIds={fitPointIds}
          followAll={followAll}
          frozen={locked}
          height={fullscreen || fill ? "100%" : height}
          onFailed={() => setGoogleFailed(true)}
        />
      ) : (
        <OsmLiveMap
          points={displayPoints}
          areas={areas}
          routeLine={routeLine}
          hintLine={hintLine}
          routeIsReal={routeIsReal}
          routeVariant={routeVariant}
          onMapClick={onMapClick}
          onPointClick={onPointClick}
          refitSignal={framingSignal}
          fitPointIds={fitPointIds}
          followAll={followAll}
          centerOn={centerOn}
          frozen={locked}
          height={fullscreen || fill ? "100%" : height}
          panLock={
            interactive
              ? {
                  unlocked,
                  onToggle: () =>
                    setUnlocked((v) => {
                      if (v) setRelocks((n) => n + 1)
                      return !v
                    }),
                }
              : undefined
          }
          draggableIds={draggableIds}
          onPointDragEnd={onPointDragEnd}
        />
      )}
      {overlayTop && (
        <div className="pointer-events-none absolute left-[3.25rem] right-2 top-2 z-10">
          <div className="pointer-events-auto">{overlayTop}</div>
        </div>
      )}
      {overlayBottom && (
        <div className="pointer-events-none absolute inset-x-2 bottom-2 z-10">
          <div className="pointer-events-auto">{overlayBottom(fullscreen)}</div>
        </div>
      )}
      </div>
    </div>
  )

  // Full screen leaves the component tree entirely.
  //
  // `position: fixed` is only fixed to the viewport while no ancestor has a
  // transform, a filter, or a containment property - any one of those makes
  // that ancestor the containing block instead, and the "full screen" map is
  // then confined to a card halfway down a page. The same goes for stacking:
  // an ancestor with its own z-index can seat a z-60 child underneath a z-20
  // header. Neither is something this component can check for, and both were
  // leaving the Close and Legend buttons clipped under the status bar on a
  // phone. Rendered into the document body, there is no ancestor left to do
  // it - the map is a sibling of the app, not a descendant.
  return fullscreen && typeof document !== 'undefined' ? createPortal(body, document.body) : body
}
