// Optional swap-in for the free Nominatim/OSRM stack: when
// VITE_GOOGLE_MAPS_API_KEY is set, geocode.ts and routing.ts prefer Google's
// Geocoding/Directions APIs for better PH address and road coverage. Loaded
// via Google's official JS SDK (not raw REST fetch) — Google's REST
// Geocoding/Directions endpoints don't reliably support browser CORS, and
// the JS SDK is what Google actually recommends for client-side use.
// Falls back to the free OSM stack whenever the key is absent, the script
// fails to load, or Google itself returns no result.

export interface GoogleLatLng {
  lat: number
  lng: number
}

export interface GoogleMapOptions {
  center: GoogleLatLng
  zoom: number
  disableDefaultUI?: boolean
  zoomControl?: boolean
  gestureHandling?: string
}

export interface GoogleMapClickEvent {
  latLng: { lat: () => number; lng: () => number } | null
}

export interface GoogleMap {
  setCenter: (latLng: GoogleLatLng) => void
  setOptions: (options: Record<string, unknown>) => void
  fitBounds: (bounds: GoogleLatLngBounds, padding?: number) => void
  addListener: {
    (event: 'click', handler: (e: GoogleMapClickEvent) => void): void
    (event: 'dragstart' | 'zoom_changed' | 'idle', handler: () => void): void
  }
}

export interface GoogleLatLngBounds {
  extend: (latLng: GoogleLatLng) => void
}

export interface GoogleMarkerIcon {
  path: number
  scale: number
  fillColor: string
  fillOpacity: number
  strokeColor: string
  strokeWeight: number
}

export interface GoogleMarkerLabel {
  text: string
  fontSize?: string
}

export interface GoogleMarkerOptions {
  position: GoogleLatLng
  map?: GoogleMap | null
  title?: string
  icon?: GoogleMarkerIcon
  // A tricycle-emoji driver marker sets this alongside a plain white-circle
  // icon (see GoogleLiveMap) instead of a custom bitmap icon.
  label?: GoogleMarkerLabel
  zIndex?: number
  // A pin the reader can pick up and move — same idea as draggableIds on
  // the Vector/OSM backends (see GoogleLiveMap).
  draggable?: boolean
}

export interface GoogleMarker {
  setPosition: (latLng: GoogleLatLng) => void
  setIcon: (icon: GoogleMarkerIcon) => void
  setLabel: (label: GoogleMarkerLabel | null) => void
  setDraggable: (draggable: boolean) => void
  // Real Google LatLng, not the plain GoogleLatLng shape above — method-
  // based, the same as GoogleMapClickEvent.latLng, since that is what the
  // SDK actually hands back from a drag.
  getPosition: () => { lat: () => number; lng: () => number } | null
  setMap: (map: GoogleMap | null) => void
  addListener: (event: string, handler: () => void) => void
}

export interface GooglePolylineOptions {
  path: GoogleLatLng[]
  map?: GoogleMap | null
  strokeColor?: string
  strokeOpacity?: number
  strokeWeight?: number
}

export interface GooglePolyline {
  setPath: (path: GoogleLatLng[]) => void
  setMap: (map: GoogleMap | null) => void
}

export interface GoogleDirectionsResult {
  routes: Array<{
    overview_path: Array<{ lat: () => number; lng: () => number }>
    legs: Array<{ distance?: { value: number }; duration?: { value: number } }>
  }>
}

declare global {
  interface Window {
    google?: {
      maps: {
        Geocoder: new () => {
          geocode: (
            request:
              | { address: string; componentRestrictions?: { country: string } }
              | { location: GoogleLatLng },
            callback: (
              results: Array<{
                geometry: { location: { lat: () => number; lng: () => number } }
                formatted_address: string
              }> | null,
              status: string,
            ) => void,
          ) => void
        }
        DirectionsService: new () => {
          route: (
            request: {
              origin: { lat: number; lng: number }
              destination: { lat: number; lng: number }
              travelMode: string
            },
            callback: (result: GoogleDirectionsResult | null, status: string) => void,
          ) => void
        }
        TravelMode: { DRIVING: string }
        Map: new (el: HTMLElement, opts: GoogleMapOptions) => GoogleMap
        Marker: new (opts: GoogleMarkerOptions) => GoogleMarker
        Polyline: new (opts: GooglePolylineOptions) => GooglePolyline
        LatLngBounds: new () => GoogleLatLngBounds
        SymbolPath: { CIRCLE: number }
        places: {
          AutocompleteService: new () => {
            getPlacePredictions: (
              request: {
                input: string
                sessionToken?: GooglePlacesSessionToken
                componentRestrictions?: { country: string }
              },
              callback: (
                predictions: Array<{ description: string; place_id: string }> | null,
                status: string,
              ) => void,
            ) => void
          }
          AutocompleteSessionToken: new () => GooglePlacesSessionToken
          PlacesService: new (attrContainer: HTMLDivElement) => {
            getDetails: (
              request: { placeId: string; sessionToken?: GooglePlacesSessionToken; fields: string[] },
              callback: (
                result: { geometry?: { location: { lat: () => number; lng: () => number } } } | null,
                status: string,
              ) => void,
            ) => void
          }
          PlacesServiceStatus: { OK: string }
        }
      }
    }
  }
}

// Opaque — this app never reads a session token's own fields, only passes
// the same instance from a prediction request through to the Details call
// that ends it (see lib/geocode.ts's searchGooglePlaces/resolveGooglePlaceGps).
export type GooglePlacesSessionToken = object

let loadPromise: Promise<void> | null = null

export function googleMapsApiKey(): string | undefined {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
}

// Returns null immediately (no promise created) when no key is configured,
// so callers can cheaply skip Google entirely and go straight to the OSM
// fallback without waiting on anything.
export function loadGoogleMaps(): Promise<void> | null {
  const apiKey = googleMapsApiKey()
  if (!apiKey) return null
  if (window.google?.maps) return Promise.resolve()
  if (loadPromise) return loadPromise

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    // libraries=places: DestinationSearch's live fallback (see lib/geocode.ts)
    // needs AutocompleteService/PlacesService, which don't load by default.
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async&v=weekly&libraries=places`
    script.async = true
    script.onload = () => {
      if (window.google?.maps) resolve()
      else reject(new Error('google.maps unavailable after script load'))
    }
    script.onerror = () => reject(new Error('Failed to load Google Maps script'))
    document.head.appendChild(script)
  })
  return loadPromise
}
