import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { nextNavCamera, normalizeDegrees, type NavCameraState } from '../lib/navCamera'
import { markerBoxSize, markerHtml } from './mapMarkerHtml'
import type { MapPoint, RealLiveMapProps } from './RealLiveMap'
import type { GeoCoords } from '../types'

// Every map in the app, drawn by the GPU from vector tiles.
//
// It replaces the Leaflet/raster map everywhere, for two reasons that pull in
// the same direction. Raster tiles are flat pictures of a map: they cannot be
// rotated or tilted, so a heading-up view during a trip is impossible, and
// their street names are baked into the image at whatever size the tile was
// drawn. Vector tiles are drawn on the phone, so the map can point anywhere
// and the labels stay upright and legible while it does.
//
// Rotation is not the default. On every screen except a trip in progress this
// behaves exactly like the map it replaces: north up, flat, framed on the
// points it was given. Somebody standing at a terminal choosing a destination
// does not want the map swinging round when they turn to look up the road.
// Only when `nav` is supplied - a trip that is actually underway, with a real
// fix and a direction - does the camera take over. See navCamera.ts.
//
// Leaflet is still in the tree as the fallback: no WebGL, no vector tiles, or
// any error at all, and RealLiveMap puts the old map back.

// Free, no key, no sign-up, no per-request billing to forget about, which
// matters for a pilot that may sit idle for weeks between test days.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

// Matches what Leaflet did: a lone point gets a street-level view, a set of
// points gets framed with room around them, and neither is allowed to zoom in
// so far that the surroundings disappear.
const SINGLE_POINT_ZOOM = 15
const FIT_MAX_ZOOM = 16
const FIT_PADDING = 30

// Close enough to read street names and see the next junction; not so close
// that a fast stretch of the Maharlika outruns the screen.
const NAV_ZOOM = 16.5

// The tricycle art faces left, so a marker rotated to a heading of zero would
// point west. A quarter turn first makes the artwork's nose the direction of
// travel.
const NAV_TRICYCLE_ART_OFFSET_DEGREES = 90

// In navigation mode the rider sits low on the screen, so most of the map is
// road they have not driven yet. A fraction of the map's height to pad the
// top by - padding the top pushes the centre down.
const AHEAD_BIAS = 0.28

type VectorLiveMapProps = RealLiveMapProps & {
  panLock?: { unlocked: boolean; onToggle: () => void }
  onFailed?: () => void
}

function calloutPill(label: string): string {
  const safe = label.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // Absolutely positioned so it never changes the marker's own box, which is
  // what MapLibre anchors on - a label that grew the element would drag the
  // pin off the coordinate it is meant to be marking.
  return `<div style="position:absolute;bottom:calc(100% + 7px);left:50%;transform:translateX(-50%);
    white-space:nowrap;background:#1e3a8a;color:#fff;font-size:11px;font-weight:700;
    padding:3px 8px;border-radius:9999px;box-shadow:0 1px 4px rgba(0,0,0,.35);pointer-events:none;">${safe}</div>`
}

function buildMarkerElement(p: MapPoint): HTMLDivElement {
  const el = document.createElement('div')
  const box = markerBoxSize(p.icon)
  el.style.position = 'relative'
  el.style.width = `${box}px`
  el.style.height = `${box}px`
  el.innerHTML =
    `<div data-art style="position:absolute;inset:0;">${markerHtml({ color: p.color, pulse: p.pulse, icon: p.icon, pointId: p.id })}</div>` +
    (p.callout ? calloutPill(p.label) : '')
  // The hover label. Leaflet drew its own tooltip; the browser's is the same
  // information with none of the positioning problems on a phone.
  el.title = p.label
  return el
}

function lineFeature(coords: GeoCoords[]): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: coords.map((p) => [p.lng, p.lat]) },
  }
}

export function VectorLiveMap({
  points,
  routeLine,
  hintLine,
  routeIsReal,
  routeVariant,
  onMapClick,
  onPointClick,
  areas,
  refitSignal,
  fitPointIds,
  followAll,
  centerOn,
  frozen,
  draggableIds,
  onPointDragEnd,
  height = '220px',
  nav,
  panLock,
  onFailed,
}: VectorLiveMapProps) {
  const holderRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map())
  const bearingRef = useRef<number | null>(null)
  const userMovedRef = useRef(false)
  const [ready, setReady] = useState(false)
  const [camera, setCamera] = useState<NavCameraState>({ bearing: 0, pitch: 0, headingUp: false })

  // Callbacks live in refs so the listeners below can be attached once, on the
  // map that is created once. Re-attaching them on every render would leak a
  // handler per frame on a screen that re-renders on every GPS tick.
  const onMapClickRef = useRef(onMapClick)
  onMapClickRef.current = onMapClick
  const onPointClickRef = useRef(onPointClick)
  onPointClickRef.current = onPointClick
  const onPointDragEndRef = useRef(onPointDragEnd)
  onPointDragEndRef.current = onPointDragEnd
  const centerRef = useRef(centerOn)
  centerRef.current = centerOn

  // Created once. Every later change is pushed in by the effects below -
  // rebuilding it on a prop change would restart the tile download on a phone
  // that is paying for the data.
  useEffect(() => {
    if (!holderRef.current || mapRef.current) return
    let map: maplibregl.Map
    try {
      map = new maplibregl.Map({
        container: holderRef.current,
        style: STYLE_URL,
        center: [points[0].gps.lng, points[0].gps.lat],
        zoom: SINGLE_POINT_ZOOM,
        attributionControl: { compact: true },
        // One finger drags, two fingers zoom. Rotation by gesture stays off:
        // on a phone held one-handed it fires by accident constantly, and the
        // rider is then looking at a map pointing at nothing with no idea how
        // it got there. During a trip the camera does the turning.
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        // Off by design, exactly as it was on the Leaflet map: a map inside a
        // scrolling page must never eat the wheel.
        scrollZoom: false,
        keyboard: false,
      })
    } catch (err) {
      // No WebGL: an old handset, a locked-down webview, or hardware
      // acceleration switched off. Nothing here can recover from that.
      console.warn('Vector map could not start', err)
      onFailed?.()
      return
    }
    mapRef.current = map
    // A handle for the dev console, so a map that looks wrong can be
    // interrogated rather than guessed at from a screenshot. Compiled away in
    // a build.
    if (import.meta.env.DEV) (window as unknown as { __todaMap?: maplibregl.Map }).__todaMap = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left')

    map.on('load', () => setReady(true))
    map.on('error', (e) => {
      if (!map.isStyleLoaded()) {
        console.warn('Vector map style failed', e?.error)
        onFailed?.()
      }
    })

    // Who moved the map. MapLibre attaches originalEvent only to gestures the
    // person actually made, so this distinguishes a reader taking over from
    // the app's own fitBounds - which Leaflet needed a hand-rolled flag for.
    const takeOver = (e: { originalEvent?: unknown }) => {
      if (e.originalEvent) userMovedRef.current = true
    }
    map.on('dragstart', takeOver)
    map.on('zoomstart', takeOver)

    map.on('click', (e) => {
      onMapClickRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng })
    })

    // Zooming keeps you in the middle.
    //
    // A map framed on a pickup and a destination drifts further from the
    // person every time they pinch, and by the third zoom the thing they were
    // looking at is off the edge. Re-centring makes the zoom mean "closer to
    // me".
    //
    // Only for a zoom the person performed: re-centring after the app's own
    // fitBounds would undo the frame it had just built.
    map.on('zoomend', (e) => {
      const here = centerRef.current
      if (!here || !(e as { originalEvent?: unknown }).originalEvent) return
      map.setCenter([here.lng, here.lat])
    })

    return () => {
      markersRef.current.forEach((m) => m.remove())
      markersRef.current.clear()
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sources and layers can only be touched once the style has loaded, and
  // MapLibre throws if you try - which, from inside an effect, reaches React
  // as a render error and takes the whole screen down. Everything that draws
  // goes through here.
  // Runs drawing work against a map whose style exists.
  //
  // `ready` is set on the map's own 'load', which is the point at which
  // sources and layers may be added — and the only thing the earlier crash
  // was really about. It deliberately does NOT gate on isStyleLoaded():
  // that reports whether every tile has settled, and it flips to false for a
  // moment each time a source is added. Gating on it meant the first layer
  // knocked out the second, the second knocked out the third, and a caller
  // passing a fresh array literal each render (`areas={[...]}`) re-ran its
  // effect fast enough to tear down the retry before it could fire. The
  // boundaries simply never drew.
  function whenStyled(fn: (map: maplibregl.Map) => void) {
    const map = mapRef.current
    if (!map || !ready) return
    try {
      fn(map)
    } catch (err) {
      // A missing line or polygon is a cosmetic loss. It must never be able
      // to take the trip screen down with it.
      console.warn('Vector map layer skipped', err)
    }
  }

  // ---- camera -----------------------------------------------------------

  useEffect(() => {
    if (!nav) {
      bearingRef.current = null
      setCamera({ bearing: 0, pitch: 0, headingUp: false })
      return
    }
    const next = nextNavCamera({
      heading: nav.heading,
      speedMps: nav.speedMps,
      previousBearing: bearingRef.current,
      enabled: true,
    })
    bearingRef.current = next.headingUp ? next.bearing : null
    setCamera(next)
  }, [nav, nav?.heading, nav?.speedMps])

  // Navigation camera: sits on the rider and points where they are going.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !nav) return
    const box = map.getContainer().getBoundingClientRect()
    if (box.height === 0) return
    map.easeTo({
      center: [nav.center.lng, nav.center.lat],
      bearing: camera.bearing,
      pitch: camera.pitch,
      zoom: NAV_ZOOM,
      // Padding the TOP pushes the centre - and so the rider's marker - down
      // the screen, leaving the upper two thirds for road not yet driven.
      // Padding the bottom does the exact opposite, which is the easy way to
      // get this backwards.
      padding: { top: Math.round(box.height * AHEAD_BIAS), bottom: 0, left: 0, right: 0 },
      // Roughly one GPS tick, so each move finishes about as the next reading
      // lands and the map glides rather than steps.
      duration: 900,
      essential: true,
    })
  }, [ready, nav, nav?.center.lat, nav?.center.lng, camera.bearing, camera.pitch])

  // A changed signal hands the viewport back for one fit. The first run is
  // skipped: opening the map already fits, and clearing a flag that is still
  // false achieves nothing.
  const firstSignalRef = useRef(true)
  useEffect(() => {
    if (firstSignalRef.current) {
      firstSignalRef.current = false
      return
    }
    userMovedRef.current = false
  }, [refitSignal])

  // Falls back to every point when the named ones are not on the map yet - an
  // empty frame is worse than a wide one.
  const requested = followAll
    ? points.filter((p) => p.icon !== 'terminal')
    : fitPointIds
      ? points.filter((p) => fitPointIds.includes(p.id))
      : points
  const framed = requested.length > 0 ? requested : points

  // Identity only, so a marker that merely moves leaves the viewport alone -
  // except while following a trip, where movement is exactly what the frame
  // has to keep up with.
  const fitKey = followAll
    ? framed.map((p) => `${p.id}:${p.gps.lat.toFixed(4)},${p.gps.lng.toFixed(4)}`).join('|')
    : framed.map((p) => p.id).join(',')

  useEffect(() => {
    const map = mapRef.current
    // While the navigation camera is driving, the frame is its business.
    if (!map || !ready || nav || framed.length === 0 || userMovedRef.current) return
    if (framed.length === 1) {
      map.easeTo({ center: [framed[0].gps.lng, framed[0].gps.lat], zoom: SINGLE_POINT_ZOOM, duration: 400 })
      return
    }
    const bounds = new maplibregl.LngLatBounds()
    framed.forEach((p) => bounds.extend([p.gps.lng, p.gps.lat]))
    map.fitBounds(bounds, { padding: FIT_PADDING, maxZoom: FIT_MAX_ZOOM, duration: 400 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fitKey, refitSignal, !!nav])

  // ---- interaction lock --------------------------------------------------

  // A map inside a scrolling page is a trap on a phone: a finger dragged
  // across it pans the map instead of scrolling past, so the page appears
  // stuck. Locked, a swipe goes straight through to the page.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const locked = !!frozen
    const handlers = [map.dragPan, map.touchZoomRotate, map.doubleClickZoom, map.keyboard]
    handlers.forEach((h) => {
      if (!h) return
      if (locked) h.disable()
      else h.enable()
    })
  }, [ready, frozen])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    map.getCanvas().style.cursor = onMapClick ? 'crosshair' : ''
  }, [ready, onMapClick])

  // ---- markers -----------------------------------------------------------

  const pointKey = points
    .map((p) => `${p.id}:${p.icon ?? ''}:${p.color}:${p.pulse ? 1 : 0}:${p.callout ? 1 : 0}:${p.label}`)
    .join('|')
  const draggableKey = (draggableIds ?? []).join(',')

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const live = markersRef.current
    const seen = new Set<string>()

    points.forEach((p) => {
      seen.add(p.id)
      const draggable = !!draggableIds?.includes(p.id)
      let marker = live.get(p.id)
      if (!marker) {
        const el = buildMarkerElement(p)
        marker = new maplibregl.Marker({ element: el, anchor: 'center', draggable })
          .setLngLat([p.gps.lng, p.gps.lat])
          .addTo(map)
        el.addEventListener('click', (ev) => {
          // Otherwise the click continues to the map underneath and a tap
          // meant to pick a pharmacy also drops a pin somewhere.
          ev.stopPropagation()
          onPointClickRef.current?.(p.id)
        })
        marker.on('dragend', () => {
          const { lat, lng } = marker!.getLngLat()
          onPointDragEndRef.current?.(p.id, { lat, lng })
        })
        live.set(p.id, marker)
      } else {
        marker.setLngLat([p.gps.lng, p.gps.lat])
        marker.setDraggable(draggable)
      }

      // Only the viewer's own vehicle turns, and only when the map itself is
      // pointing the way the ride is going. Turning the marker by the full
      // heading on top of an already-rotated map would point at the heading
      // twice over and sit sideways on a straight road.
      const art = marker.getElement().querySelector<HTMLElement>('[data-art]')
      if (art) {
        const turn = nav && p.id === nav.rotatePointId && camera.headingUp ? NAV_TRICYCLE_ART_OFFSET_DEGREES : 0
        art.style.transition = 'transform .3s linear'
        art.style.transform = `rotate(${normalizeDegrees(turn)}deg)`
      }
    })

    live.forEach((marker, id) => {
      if (seen.has(id)) return
      marker.remove()
      live.delete(id)
    })
  }, [ready, pointKey, points, draggableKey, draggableIds, nav, camera.headingUp])

  // Rebuilds a marker's artwork when its appearance changes, which setLngLat
  // alone cannot do.
  useEffect(() => {
    if (!ready) return
    points.forEach((p) => {
      const marker = markersRef.current.get(p.id)
      if (!marker) return
      const fresh = buildMarkerElement(p)
      const el = marker.getElement()
      if (el.innerHTML !== fresh.innerHTML) el.innerHTML = fresh.innerHTML
      el.title = p.label
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pointKey])

  // ---- lines and areas ---------------------------------------------------

  // Keyed on the shape of each line rather than the array holding it. Callers
  // build these fresh on every render, so depending on identity would re-run
  // the layer work on every GPS tick for a line that has not changed.
  const shapeKey = (line?: GeoCoords[]) =>
    line && line.length > 0
      ? `${line.length}:${line[0].lat},${line[0].lng}:${line[line.length - 1].lat},${line[line.length - 1].lng}`
      : '0'
  const routeKey = shapeKey(routeLine)
  const hintKey = shapeKey(hintLine)

  useEffect(() => {
    whenStyled((map) => {
        const data = lineFeature(routeLine && routeLine.length > 1 ? routeLine : [])
        const src = map.getSource('route') as maplibregl.GeoJSONSource | undefined
        if (src) {
          src.setData(data)
        } else {
          map.addSource('route', { type: 'geojson', data })
          map.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#2563eb', 'line-width': 4, 'line-opacity': 0.7 },
          })
        }
        // A guessed straight line has to look guessed, the same as before.
        map.setPaintProperty('route-line', 'line-color', !routeIsReal ? '#94a3b8' : routeVariant === 'pickup' ? '#f59e0b' : '#2563eb')
        map.setPaintProperty('route-line', 'line-width', !routeIsReal ? 2 : routeVariant === 'pickup' ? 3 : 5)
        map.setPaintProperty('route-line', 'line-opacity', !routeIsReal ? 0.9 : routeVariant === 'pickup' ? 0.85 : 0.7)
        map.setPaintProperty('route-line', 'line-dasharray', routeIsReal ? [1] : [3, 3])
    })
  }, [ready, routeKey, routeIsReal, routeVariant])

  useEffect(() => {
    whenStyled((map) => {
        const data = lineFeature(hintLine && hintLine.length > 1 ? hintLine : [])
        const src = map.getSource('hint') as maplibregl.GeoJSONSource | undefined
        if (src) {
          src.setData(data)
          return
        }
        map.addSource('hint', { type: 'geojson', data })
        map.addLayer({
          id: 'hint-line',
          type: 'line',
          source: 'hint',
          layout: { 'line-cap': 'round' },
          paint: { 'line-color': '#0f2a6b', 'line-width': 1.5, 'line-opacity': 0.45, 'line-dasharray': [3, 5] },
        })
    })
  }, [ready, hintKey])

  const areaKey = (areas ?? []).map((a) => `${a.id}:${a.color}:${a.points.length}`).join('|')
  useEffect(() => {
    whenStyled((map) => {
        const data: GeoJSON.FeatureCollection<GeoJSON.Polygon> = {
          type: 'FeatureCollection',
          features: (areas ?? [])
            .filter((a) => a.points.length >= 3)
            .map((a) => ({
              type: 'Feature' as const,
              properties: { color: a.color, label: a.label ?? '' },
              geometry: {
                type: 'Polygon' as const,
                // A GeoJSON ring has to close on itself; Leaflet closed it for us.
                coordinates: [[...a.points.map((p) => [p.lng, p.lat] as [number, number]), [a.points[0].lng, a.points[0].lat]]],
              },
            })),
        }
        const src = map.getSource('areas') as maplibregl.GeoJSONSource | undefined
        if (src) {
          src.setData(data)
          return
        }
        map.addSource('areas', { type: 'geojson', data })
        // Drawn beneath everything else: boundaries are the ground a trip
        // happens on, not a thing competing with the pins for attention.
        const firstLayer = map.getStyle().layers?.find((l) => l.type === 'symbol')?.id
        map.addLayer(
          {
            id: 'areas-fill',
            type: 'fill',
            source: 'areas',
            paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.12 },
          },
          firstLayer,
        )
        map.addLayer(
          {
            id: 'areas-line',
            type: 'line',
            source: 'areas',
            paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-dasharray': [6, 4] },
          },
          firstLayer,
        )
    })
  }, [ready, areaKey])

  return (
    <div className="relative" style={{ height }}>
      <div ref={holderRef} className="h-full w-full" />

      {panLock && (
        <button
          type="button"
          onClick={panLock.onToggle}
          aria-pressed={panLock.unlocked}
          aria-label={panLock.unlocked ? 'Lock the map' : 'Unlock the map to move it'}
          title={panLock.unlocked ? 'Map unlocked — scroll the page to lock it again' : 'Tap to move the map'}
          // Directly under MapLibre's +/- stack, same column, so the three
          // controls read as one group rather than two ideas in two corners.
          className={`absolute left-[10px] top-[78px] z-10 flex h-[29px] w-[29px] items-center justify-center rounded border shadow-md transition ${
            panLock.unlocked
              ? 'border-brand-700 bg-brand-600 text-white'
              : 'border-slate-300 bg-white/95 text-slate-600 hover:bg-white'
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M18 11V6a2 2 0 0 0-4 0" />
            <path d="M14 10V4a2 2 0 0 0-4 0v2" />
            <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
            <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.3l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15" />
          </svg>
        </button>
      )}

      {/* Only while the camera is driving. On an ordinary north-up map these
          would be two pieces of furniture explaining nothing. */}
      {nav && (
        <>
          {/* Offset clear of the zoom stack in the same corner, which it was
              sitting underneath. */}
          <div className="pointer-events-none absolute left-[48px] top-2 rounded-lg bg-white/92 px-2 py-1 text-[10px] font-semibold text-slate-700 shadow-sm">
            {camera.headingUp ? '🧭 Facing your direction' : '🧭 Waiting for direction…'}
          </div>
          <div className="pointer-events-none absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/92 shadow-sm">
            <span
              aria-label={`North is ${Math.round(normalizeDegrees(-camera.bearing))} degrees from the top of the map`}
              className="text-[13px] leading-none"
              style={{ transform: `rotate(${-camera.bearing}deg)`, transition: 'transform .3s linear' }}
            >
              ⬆️
            </span>
          </div>
        </>
      )}
    </div>
  )
}
