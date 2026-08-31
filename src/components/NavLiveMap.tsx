import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { nextNavCamera, normalizeDegrees, type NavCameraState } from '../lib/navCamera'
import { markerBoxSize, markerHtml } from './mapMarkerHtml'
import type { MapPoint } from './RealLiveMap'
import type { GeoCoords } from '../types'

// The map you look at while you are actually moving.
//
// Everywhere else in the app the map is something you read: you are standing
// still, choosing a pickup, checking where a tricycle is. North-up is right
// for that, and Leaflet draws it well.
//
// This one is different. You are on a tricycle with the phone in one hand,
// and the question is never "where is north" — it is "is that my turn". A map
// aligned to the direction of travel answers that without the rider having to
// rotate it in their head. Leaflet cannot rotate or tilt at all: it positions
// raster tile images in a grid, and there is no angle in that model. So this
// view uses MapLibre and vector tiles, which are drawn by the GPU and can be
// pointed anywhere.
//
// It is a second map engine in the app, which is a real cost. It is loaded
// only when a trip is underway (see RealLiveMap's lazy import), and if the
// tiles do not come, it says so and hands the screen back to the Leaflet map
// rather than showing a blank rectangle.

// Free, no key, no sign-up, no per-request billing to forget about — which
// matters for a pilot that may sit idle for weeks. If it ever goes away, the
// failure is visible and the Leaflet map takes over.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

// Close enough to read street names and see the next junction; not so close
// that a fast stretch of the Maharlika outruns the screen.
const NAV_ZOOM = 16.5

// The tricycle art faces left, so a marker rotated to a heading of zero would
// point west. Turning it a quarter circle first makes the artwork's nose the
// direction of travel.
const NAV_TRICYCLE_ART_OFFSET_DEGREES = 90

// Your own marker sits low on the screen rather than dead centre, so most of
// the map is road you have not driven yet. The number is a fraction of the
// map's height to pad the bottom by.
const AHEAD_BIAS = 0.28

export interface NavLiveMapProps {
  points: MapPoint[]
  routeLine?: GeoCoords[]
  routeIsReal?: boolean
  routeVariant?: 'trip' | 'pickup'
  height?: string
  // Where the person holding this phone is. The camera sits on it.
  center: GeoCoords
  // Direction of travel and how fast, straight from the device. The camera
  // decides for itself what to do with them — see navCamera.
  heading: number | null
  speedMps: number | null
  // Which marker is the viewer's own vehicle, so it can be turned to face the
  // way it is going. The passenger's phone is not driving, so nothing turns.
  rotatePointId?: string
  onFailed?: () => void
}

function pointKey(points: MapPoint[]): string {
  return points.map((p) => `${p.id}:${p.icon ?? ''}:${p.color}:${p.pulse ? 1 : 0}`).join('|')
}

export function NavLiveMap({
  points,
  routeLine,
  routeIsReal,
  routeVariant,
  height = '260px',
  center,
  heading,
  speedMps,
  rotatePointId,
  onFailed,
}: NavLiveMapProps) {
  const holderRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map())
  const bearingRef = useRef<number | null>(null)
  const [ready, setReady] = useState(false)
  const [camera, setCamera] = useState<NavCameraState>({ bearing: 0, pitch: 0, headingUp: false })

  // The map is created once. Every later change is pushed into it by the
  // effects below — rebuilding it on a prop change would restart the tile
  // download mid-trip on a phone that is paying for the data.
  useEffect(() => {
    if (!holderRef.current || mapRef.current) return
    let map: maplibregl.Map
    try {
      map = new maplibregl.Map({
        container: holderRef.current,
        style: STYLE_URL,
        center: [center.lng, center.lat],
        zoom: NAV_ZOOM,
        attributionControl: { compact: true },
        // One finger drags the map; two fingers rotate it. On a phone held in
        // one hand on a moving tricycle, one-finger rotation is triggered by
        // accident constantly, and the rider then has a map pointing at
        // nothing with no idea how it got there.
        dragRotate: false,
        pitchWithRotate: false,
        // The rider cannot reach a keyboard, and the box is inside a scrolling
        // page — a stray key or a scroll-wheel zoom is somebody else's input
        // landing on the map.
        keyboard: false,
      })
    } catch (err) {
      // No WebGL: an old handset, a locked-down webview, or a browser with
      // hardware acceleration off. Nothing here can recover from that.
      console.warn('Nav map could not start', err)
      onFailed?.()
      return
    }
    mapRef.current = map
    map.on('load', () => setReady(true))
    map.on('error', (e) => {
      // Style or tile failures. The map may still be usable, so this only
      // gives up if the style itself never arrived.
      if (!map.isStyleLoaded()) {
        console.warn('Nav map style failed', e?.error)
        onFailed?.()
      }
    })
    return () => {
      markersRef.current.forEach((m) => m.remove())
      markersRef.current.clear()
      map.remove()
      mapRef.current = null
    }
    // center/heading are read once for the initial view; the effects below own
    // them from then on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The camera. Recomputed from each new reading, then handed to MapLibre.
  useEffect(() => {
    const next = nextNavCamera({
      heading,
      speedMps,
      previousBearing: bearingRef.current,
      enabled: true,
    })
    bearingRef.current = next.headingUp ? next.bearing : null
    setCamera(next)
  }, [heading, speedMps])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const box = map.getContainer().getBoundingClientRect()
    if (box.height === 0) return
    map.easeTo({
      center: [center.lng, center.lat],
      bearing: camera.bearing,
      pitch: camera.pitch,
      zoom: NAV_ZOOM,
      // Keeps the rider low on the screen with the road ahead filling it.
      // Padding the TOP pushes the centre — and so the rider's own marker —
      // down the screen, leaving the upper two thirds for road they have not
      // driven yet. Padding the bottom does the exact opposite, which is the
      // easy way to get this backwards.
      padding: { top: Math.round(box.height * AHEAD_BIAS), bottom: 0, left: 0, right: 0 },
      // Roughly one GPS tick, so each move finishes about as the next reading
      // lands and the map appears to glide rather than step.
      duration: 900,
      essential: true,
    })
  }, [ready, center.lat, center.lng, camera.bearing, camera.pitch])

  // Markers. Created when the set of points changes, moved when they move.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const live = markersRef.current
    const seen = new Set<string>()

    points.forEach((p) => {
      seen.add(p.id)
      let marker = live.get(p.id)
      if (!marker) {
        const el = document.createElement('div')
        const box = markerBoxSize(p.icon)
        el.style.width = `${box}px`
        el.style.height = `${box}px`
        el.innerHTML = markerHtml({ color: p.color, pulse: p.pulse, icon: p.icon, pointId: p.id })
        marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([p.gps.lng, p.gps.lat])
          .addTo(map)
        live.set(p.id, marker)
      } else {
        marker.setLngLat([p.gps.lng, p.gps.lat])
      }

      // Only the viewer's own vehicle turns, and only against the map's own
      // rotation: the map is already pointing the way the ride is going, so a
      // marker turned by the full heading on top of that would point at the
      // heading twice over and sit sideways on a straight road.
      const art = marker.getElement().firstElementChild as HTMLElement | null
      if (art) {
        const turn = p.id === rotatePointId && camera.headingUp ? NAV_TRICYCLE_ART_OFFSET_DEGREES : 0
        art.style.transition = 'transform .3s linear'
        art.style.transform = `rotate(${normalizeDegrees(turn)}deg)`
      }
    })

    live.forEach((marker, id) => {
      if (seen.has(id)) return
      marker.remove()
      live.delete(id)
    })
  }, [ready, pointKey(points), points, rotatePointId, camera.headingUp])

  // The route line, as a GeoJSON source the style draws for us.
  //
  // Sources and layers can only be touched once the style itself has finished
  // loading, and MapLibre throws if you try — which, from inside an effect,
  // reaches React as a render error and takes the whole page down. 'load' is
  // not sufficient on its own: switching styles, or a remount over a map that
  // is still fetching, both leave a live map with no style on it. So the work
  // is guarded, and retried on the next styledata event if it was too early.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return

    const data: GeoJSON.Feature<GeoJSON.LineString> = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: (routeLine ?? []).map((p) => [p.lng, p.lat]),
      },
    }

    const apply = () => {
      if (!map.isStyleLoaded()) return false
      const existing = map.getSource('nav-route') as maplibregl.GeoJSONSource | undefined
      if (existing) {
        existing.setData(data)
        return true
      }
      map.addSource('nav-route', { type: 'geojson', data })
      map.addLayer({
        id: 'nav-route-line',
        type: 'line',
        source: 'nav-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': routeVariant === 'pickup' ? '#f59e0b' : '#2563eb',
          'line-width': routeVariant === 'pickup' ? 5 : 7,
          'line-opacity': routeIsReal ? 0.85 : 0.5,
          // A guessed straight line has to look guessed, the same way it does
          // on the Leaflet map.
          'line-dasharray': routeIsReal ? [1] : [2, 2],
        },
      })
      return true
    }

    // A missing route line is a cosmetic loss; it must never be able to take
    // the trip screen down with it.
    const tryApply = () => {
      try {
        return apply()
      } catch (err) {
        console.warn('Nav route line skipped', err)
        return true
      }
    }

    if (tryApply()) return
    const onStyle = () => {
      if (tryApply()) map.off('styledata', onStyle)
    }
    map.on('styledata', onStyle)
    return () => {
      map.off('styledata', onStyle)
    }
  }, [ready, routeLine, routeIsReal, routeVariant])

  return (
    <div className="relative" style={{ height }}>
      <div ref={holderRef} className="h-full w-full" />

      {/* What the map is doing, in the corner, because a tilted rotating map
          with no explanation is alarming the first time you see one. */}
      <div className="pointer-events-none absolute left-2 top-2 rounded-lg bg-white/92 px-2 py-1 text-[10px] font-semibold text-slate-700 shadow-sm">
        {camera.headingUp ? '🧭 Facing your direction' : '🧭 Waiting for direction…'}
      </div>

      {/* Which way north is. A rotated map owes the rider this much: without
          it there is no way to relate the screen to a road sign or to the
          directions somebody just shouted at you. */}
      <div className="pointer-events-none absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/92 shadow-sm">
        <span
          aria-label={`North is ${Math.round(normalizeDegrees(-camera.bearing))} degrees from the top of the map`}
          className="text-[13px] leading-none"
          style={{ transform: `rotate(${-camera.bearing}deg)`, transition: 'transform .3s linear' }}
        >
          ⬆️
        </span>
      </div>
    </div>
  )
}
