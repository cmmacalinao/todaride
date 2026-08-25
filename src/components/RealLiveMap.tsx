import { useEffect, useRef, useState } from 'react'
import { MapContainer, Marker, Polygon, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { googleMapsApiKey } from '../lib/googleMapsLoader'
import { GoogleLiveMap } from './GoogleLiveMap'
import type { GeoCoords } from '../types'

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
  icon?: 'tricycle' | 'pharmacy' | 'terminal'
  // Pins the label open instead of waiting for a hover, and it travels with
  // the marker. For the tricycle a passenger is actually sitting in: they
  // are holding the phone one-handed on a moving road and will not hover
  // anything, but they will glance down to check the number is still theirs.
  callout?: boolean
}

interface RealLiveMapProps {
  points: MapPoint[]
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
  // Re-fits the viewport whenever an existing point's coordinates change,
  // not just when points are added/removed — used by the booking-flow
  // address picker so choosing a new barangay (or dropping a pin) pans the
  // map there. Left off for live-tracking views (TripMonitor, driver maps),
  // where re-centering on every GPS tick would fight the viewer's own
  // pan/zoom.
  refitOnMove?: boolean
  // Callers that already label the pins right below the map (see
  // LocationMapPicker's Pickup/Destination summary) can drop this legend
  // rather than print the same two addresses twice. Defaults to showing it:
  // everywhere else it is the only thing naming what the dots mean.
  hideLegend?: boolean
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
}

function routeLineStyle(routeIsReal: boolean | undefined, routeVariant: 'trip' | 'pickup' | undefined) {
  if (!routeIsReal) return { color: '#94a3b8', dashArray: '4 4', weight: 2 }
  return routeVariant === 'pickup'
    ? { color: '#f59e0b', weight: 2.5, opacity: 0.85 }
    : { color: '#2563eb', weight: 4, opacity: 0.7 }
}

const EMOJI_MARKER_ICONS: Record<'tricycle' | 'pharmacy' | 'terminal', string> = {
  tricycle: '🛺',
  terminal: '🚏',
  pharmacy: '💊',
}

// Pharmacy pins render at ~75% of the driver/tricycle marker's size — a
// pharmacy is one of several static reference points on a browsing map, not
// the one live thing the eye should be drawn to (the driver's own position
// during tracking), so it doesn't need the same visual weight.
const EMOJI_MARKER_SIZES: Record<'tricycle' | 'pharmacy' | 'terminal', { box: number; font: number }> = {
  tricycle: { box: 18, font: 11 },
  terminal: { box: 16, font: 10 },
  pharmacy: { box: 20, font: 11 },
}

function dotIcon(color: string, pulse?: boolean, icon?: 'tricycle' | 'pharmacy' | 'terminal', pointId?: string) {
  const stamp = pointId ? ` data-point-id="${pointId.replace(/"/g, '&quot;')}"` : ''
  if (icon) {
    const emoji = EMOJI_MARKER_ICONS[icon]
    const { box, font } = EMOJI_MARKER_SIZES[icon]
    const halfBox = box / 2
    const haloInset = box === 26 ? -6 : -5
    return L.divIcon({
      className: '',
      html: `<div${stamp} style="position:relative;width:${box}px;height:${box}px;">
        ${pulse ? `<div style="position:absolute;inset:${haloInset}px;border-radius:9999px;background:${color};opacity:0.25;"></div>` : ''}
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border-radius:9999px;background:white;border:2px solid ${color};box-shadow:0 1px 3px rgba(0,0,0,0.45);font-size:${font}px;line-height:1;">${emoji}</div>
      </div>`,
      iconSize: [box, box],
      iconAnchor: [halfBox, halfBox],
    })
  }
  return L.divIcon({
    className: '',
    html: `<div${stamp} style="position:relative;width:18px;height:18px;">
      ${pulse ? `<div style="position:absolute;inset:-7px;border-radius:9999px;background:${color};opacity:0.25;"></div>` : ''}
      <div style="position:absolute;inset:0;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.45);"></div>
    </div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

// Fits the map to all current points once, then only re-fits if the *set* of
// points changes (e.g. a driver marker appears) — not on every tiny GPS
// update, so live tracking doesn't jump-recenter the view each tick. Callers
// that want a re-fit on every coordinate change too (the address picker) opt
// in via `refitOnMove`.
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
  refitOnMove,
  refitSignal,
  fitPointIds,
}: {
  points: MapPoint[]
  refitOnMove?: boolean
  refitSignal?: string
  fitPointIds?: string[]
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
  const requested = fitPointIds ? points.filter((p) => fitPointIds.includes(p.id)) : points
  const framed = requested.length > 0 ? requested : points

  const fitKey = refitOnMove
    ? framed.map((p) => `${p.id}:${p.gps.lat.toFixed(5)},${p.gps.lng.toFixed(5)}`).join('|')
    : framed.map((p) => p.id).join(',')

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
function OsmLiveMap({ points, routeLine, hintLine, routeIsReal, routeVariant, onMapClick, onPointClick, areas, refitOnMove, refitSignal, fitPointIds, frozen, draggableIds, onPointDragEnd, height = '220px' }: RealLiveMapProps) {
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
      <FitBounds points={points} refitOnMove={refitOnMove} refitSignal={refitSignal} fitPointIds={fitPointIds} />
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

// Picks the renderer — real Google Maps tiles/roads when
// VITE_GOOGLE_MAPS_API_KEY is configured (see googleMapsLoader.ts), the free
// OpenStreetMap/Leaflet stack otherwise — behind one shared wrapper (sizing,
// border, and the point legend below the map) so callers never need to know
// which one is active.
export function RealLiveMap({ points, routeLine, hintLine, routeIsReal, routeVariant, onMapClick, onPointClick, areas, refitOnMove, refitSignal, fitPointIds, frozen = false, draggableIds, onPointDragEnd, hideLegend = false, height }: RealLiveMapProps) {
  // If the Google script fails to load (bad key, network block, CSP), fall
  // back to the OSM/Leaflet canvas instead of showing an empty map.
  const [googleFailed, setGoogleFailed] = useState(false)
  if (points.length === 0) return null
  const useGoogle = !!googleMapsApiKey() && !googleFailed
  const displayPoints = spreadOverlappingPoints(points)

  // Terminals are scenery: on every map, never changing, and their own pins
  // already name them on tap. Listing all of them above the map pushed the
  // pickup, the drop-off and the tricycle — the things the viewer opened it
  // for — off the top of the key.
  const legendPoints = points.filter((p) => p.icon !== 'terminal')
  return (
    // relative z-0 makes this its own stacking context. Leaflet gives its
    // panes z-index 400 and its controls up to 1000, which beat the fixed
    // header (z-20) and let the map paint over it while scrolling. Confining
    // them here fixes every map in the app at once, rather than escalating
    // the header z-index and losing the same race again later.
    <div className={`relative z-0 overflow-hidden rounded-lg border border-slate-200 ${frozen ? 'map-frozen' : ''}`}>
      {/* Above the map: it names what the pins mean, and a key you meet
          after the picture is a key you have already tried to read without. */}
      {!hideLegend && legendPoints.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-b border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-500">
          {legendPoints.map((p) => (
            <span key={p.id} className="flex items-center gap-1 truncate">
              <span style={{ color: p.color }}>●</span>
              {p.label}
            </span>
          ))}
        </div>
      )}
      {useGoogle ? (
        <GoogleLiveMap
          points={displayPoints}
          routeLine={routeLine}
          routeIsReal={routeIsReal}
          routeVariant={routeVariant}
          onMapClick={onMapClick}
          onPointClick={onPointClick}
          refitOnMove={refitOnMove}
          refitSignal={refitSignal}
          fitPointIds={fitPointIds}
          frozen={frozen}
          height={height}
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
          refitOnMove={refitOnMove}
          refitSignal={refitSignal}
          fitPointIds={fitPointIds}
          frozen={frozen}
          height={height}
          draggableIds={draggableIds}
          onPointDragEnd={onPointDragEnd}
        />
      )}
    </div>
  )
}
