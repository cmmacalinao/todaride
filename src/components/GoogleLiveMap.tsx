import { useEffect, useRef, useState } from 'react'
import { loadGoogleMaps } from '../lib/googleMapsLoader'
import type { GoogleMap, GoogleMapClickEvent, GoogleMarker, GooglePolyline } from '../lib/googleMapsLoader'
import type { GeoCoords } from '../types'
import type { MapPoint } from './RealLiveMap'

interface GoogleLiveMapProps {
  points: MapPoint[]
  routeLine?: GeoCoords[]
  // The stretch of the route already driven — a faint red trail under the
  // route. Same contract as the Vector/OSM engines (see RealLiveMap).
  passedLine?: GeoCoords[]
  routeIsReal?: boolean
  routeVariant?: 'trip' | 'pickup'
  onMapClick?: (gps: GeoCoords) => void
  onPointClick?: (id: string) => void
  // Which points the reader can pick up and drop elsewhere — a correction
  // for a tap (or a geocoded address) that landed a street out. Same
  // contract as the Vector/OSM backends in RealLiveMap.tsx: a point drawn
  // from `points` is draggable exactly when its id is listed here,
  // regardless of whether it came from a map tap or an address form.
  draggableIds?: string[]
  onPointDragEnd?: (id: string, gps: GeoCoords) => void
  // Lets the caller (RealLiveMap.tsx) fall back to the OSM/Leaflet canvas
  // when the Google Maps script fails to load (bad key, network block, CSP)
  // instead of rendering nothing.
  onFailed?: () => void
  // See RealLiveMap's followAll — keeps every trip participant framed as
  // they move, terminals excluded.
  followAll?: boolean
  // See RealLiveMap's refitSignal — a trip moment worth re-framing for.
  refitSignal?: string
  // See RealLiveMap's fitPointIds — which markers the viewport frames.
  fitPointIds?: string[]
  // See RealLiveMap's frameLines — frame these coordinates instead.
  frameLines?: GeoCoords[][]
  // See RealLiveMap's frozen — holds the frame still during a trip.
  frozen?: boolean
  // CSS height for the map canvas. The default suits a map that sits among
  // other cards; a screen where the map IS the screen passes its own.
  height?: string
}

// Real Google Maps tiles/roads, used by RealLiveMap.tsx instead of the
// Leaflet/OSM canvas whenever a Google Maps API key is configured. Talks to
// the Maps JS SDK imperatively via refs (create the map once, then mutate
// markers/polyline in place) rather than pulling in a React wrapper library
// — matches the dependency-free pattern already used for the Google
// geocoding/routing swap in geocode.ts/routing.ts.
export function GoogleLiveMap({ points, routeLine, passedLine, routeIsReal, routeVariant, onMapClick, onPointClick, draggableIds, onPointDragEnd, onFailed, refitSignal, followAll, fitPointIds, frameLines, frozen, height = '220px' }: GoogleLiveMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<GoogleMap | null>(null)
  const markersRef = useRef<Map<string, GoogleMarker>>(new Map())
  const polylineRef = useRef<GooglePolyline | null>(null)
  const passedRef = useRef<GooglePolyline | null>(null)
  const lastFitKeyRef = useRef<string>('')
  // Set once the reader pans or zooms; from then on the viewport is theirs
  // and the auto-fit below stops touching it.
  const userMovedRef = useRef(false)
  // Our own fitBounds/setCenter also fire zoom_changed — this marks the
  // window in which that zoom is ours, not the reader's.
  const programmaticRef = useRef(false)
  const firstSignalRef = useRef(true)

  // A changed signal hands the viewport back for one fit. Skipped on the
  // first run — opening the map already fits.
  useEffect(() => {
    if (firstSignalRef.current) {
      firstSignalRef.current = false
      return
    }
    userMovedRef.current = false
    lastFitKeyRef.current = ''
  }, [refitSignal])
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  // Kept current across renders so the one click listener (added once, on
  // map creation) always calls the latest callback instead of a stale one.
  const onMapClickRef = useRef(onMapClick)
  onMapClickRef.current = onMapClick
  const onPointClickRef = useRef(onPointClick)
  onPointClickRef.current = onPointClick
  const onPointDragEndRef = useRef(onPointDragEnd)
  onPointDragEndRef.current = onPointDragEnd

  useEffect(() => {
    const loading = loadGoogleMaps()
    if (!loading) {
      setStatus('failed')
      onFailed?.()
      return
    }
    let cancelled = false
    loading
      .then(() => {
        if (cancelled || !containerRef.current || !window.google?.maps) return
        mapRef.current = new window.google.maps.Map(containerRef.current, {
          center: { lat: points[0].gps.lat, lng: points[0].gps.lng },
          zoom: 15,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
        })
        mapRef.current.addListener('click', (e: GoogleMapClickEvent) => {
          if (e.latLng) onMapClickRef.current?.({ lat: e.latLng.lat(), lng: e.latLng.lng() })
        })
        // Google only fires dragstart for a real drag, so it needs no guard.
        mapRef.current.addListener('dragstart', () => {
          userMovedRef.current = true
        })
        mapRef.current.addListener('zoom_changed', () => {
          if (!programmaticRef.current) userMovedRef.current = true
        })
        mapRef.current.addListener('idle', () => {
          programmaticRef.current = false
        })
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('failed')
          onFailed?.()
        }
      })
    return () => {
      cancelled = true
    }
    // Map is created once on mount — later point updates move existing
    // markers instead of recreating the map (see the effect below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A stable primitive for the effect's dependency list — the array itself
  // is a fresh identity most renders (built inline by the caller), which
  // would otherwise rebuild every marker on every render regardless of
  // whether the draggable set actually changed. Same trick VectorLiveMap
  // uses for the same reason.
  const draggableKey = (draggableIds ?? []).join(',')

  useEffect(() => {
    const map = mapRef.current
    const google = window.google
    if (status !== 'ready' || !map || !google) return

    const seenIds = new Set(points.map((p) => p.id))
    for (const [id, marker] of markersRef.current) {
      if (!seenIds.has(id)) {
        marker.setMap(null)
        markersRef.current.delete(id)
      }
    }

    for (const p of points) {
      const position = { lat: p.gps.lat, lng: p.gps.lng }
      // An emoji marker (tricycle for the driver, pharmacy for a pharmacy
      // pin) uses a plain white backing circle (the emoji itself is drawn
      // via `label`, on top) instead of the solid color dot every other
      // point uses. Pharmacy pins render at ~75% of the tricycle marker's
      // size — see the matching comment in RealLiveMap.tsx's dotIcon.
      const icon = p.icon
        ? {
            path: google.maps.SymbolPath.CIRCLE,
            scale: p.icon === 'pharmacy' ? 10 : 13,
            fillColor: '#ffffff',
            fillOpacity: 1,
            strokeColor: p.color,
            strokeWeight: 2,
          }
        : {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: p.color,
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          }
      const label =
        p.icon === 'tricycle'
          ? { text: '🛺', fontSize: '11px' }
          : p.icon === 'pharmacy'
            ? { text: '💊', fontSize: '11px' }
            : null
      // Same rule as the Vector/OSM backends: draggable exactly when this
      // point's id is listed, whether it got here from a tap, a drag, or a
      // geocoded address — the caller decides which pins may move, not
      // which backend happened to render them.
      const draggable = !!draggableIds?.includes(p.id)
      const existing = markersRef.current.get(p.id)
      if (existing) {
        existing.setPosition(position)
        existing.setIcon(icon)
        existing.setLabel(label)
        existing.setDraggable(draggable)
      } else {
        const marker = new google.maps.Marker({
          position,
          map,
          title: p.label,
          icon,
          label: label ?? undefined,
          zIndex: p.pulse ? 10 : 1,
          draggable,
        })
        marker.addListener('click', () => onPointClickRef.current?.(p.id))
        // Fires once the reader lets go — mid-drag movement is the SDK's
        // own doing, nothing here needs to track it. getPosition() reads
        // wherever they dropped it.
        marker.addListener('dragend', () => {
          const dropped = marker.getPosition()
          if (dropped) onPointDragEndRef.current?.(p.id, { lat: dropped.lat(), lng: dropped.lng() })
        })
        markersRef.current.set(p.id, marker)
      }
    }

    if (passedLine && passedLine.length > 1) {
      const path = passedLine.map((c) => ({ lat: c.lat, lng: c.lng }))
      if (passedRef.current) {
        passedRef.current.setPath(path)
      } else {
        passedRef.current = new google.maps.Polyline({ path, map, strokeColor: '#dc2626', strokeOpacity: 0.35, strokeWeight: 3 })
      }
    } else if (passedRef.current) {
      passedRef.current.setMap(null)
      passedRef.current = null
    }

    if (routeLine && routeLine.length > 1) {
      const path = routeLine.map((c) => ({ lat: c.lat, lng: c.lng }))
      const options = !routeIsReal
        ? { strokeColor: '#94a3b8', strokeOpacity: 0.6, strokeWeight: 2 }
        : routeVariant === 'pickup'
          ? { strokeColor: '#f59e0b', strokeOpacity: 0.85, strokeWeight: 2.5 }
          : { strokeColor: '#2563eb', strokeOpacity: 0.7, strokeWeight: 4 }
      if (polylineRef.current) {
        polylineRef.current.setPath(path)
      } else {
        polylineRef.current = new google.maps.Polyline({ path, map, ...options })
      }
    } else if (polylineRef.current) {
      polylineRef.current.setMap(null)
      polylineRef.current = null
    }

    // Re-fit only when the *set* of points changes (e.g. a driver marker
    // appears). A marker that merely moves never re-frames the map.
    // Applied on every pass, not just at creation: a map built while moving
    // has to be freezable later.
    map.setOptions({
      draggable: !frozen,
      gestureHandling: frozen ? 'none' : 'greedy',
      zoomControl: !frozen,
      disableDoubleClickZoom: !!frozen,
      keyboardShortcuts: !frozen,
    })

    const requested = followAll
      ? points.filter((p) => p.icon !== 'terminal')
      : fitPointIds
        ? points.filter((p) => fitPointIds.includes(p.id))
        : points
    const framed = requested.length > 0 ? requested : points
    // Identity only — a marker that moves never re-frames the map — except
    // while following a trip, where movement is the point.
    const frameCoords = (frameLines ?? []).flat()
    const fitKey =
      (followAll
        ? framed.map((p) => `${p.id}:${p.gps.lat.toFixed(4)},${p.gps.lng.toFixed(4)}`).join('|')
        : framed.map((p) => p.id).join(',')) + (frameCoords.length > 1 ? `lines:${frameCoords.length}:${frameCoords[0].lat},${frameCoords[0].lng}` : '')
    // Same rule as the Leaflet map: frame everything until the reader takes
    // the viewport over, then leave it alone.
    if (fitKey !== lastFitKeyRef.current && !userMovedRef.current) {
      lastFitKeyRef.current = fitKey
      programmaticRef.current = true
      if (frameCoords.length > 1) {
        const bounds = new google.maps.LatLngBounds()
        for (const p of frameCoords) bounds.extend({ lat: p.lat, lng: p.lng })
        map.fitBounds(bounds, 30)
      } else if (framed.length === 1) {
        map.setCenter({ lat: framed[0].gps.lat, lng: framed[0].gps.lng })
      } else if (framed.length > 1) {
        const bounds = new google.maps.LatLngBounds()
        for (const p of framed) bounds.extend({ lat: p.gps.lat, lng: p.gps.lng })
        map.fitBounds(bounds, 30)
      }
    }
  }, [points, routeLine, passedLine, routeIsReal, routeVariant, status, refitSignal, followAll, fitPointIds, frameLines, frozen, draggableKey])

  if (status === 'failed') return null
  return <div ref={containerRef} style={{ height, width: '100%', cursor: onMapClick ? 'crosshair' : undefined }} />
}
