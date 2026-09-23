import { googleMapsApiKey, loadGoogleMaps, type GooglePlacesSessionToken } from './googleMapsLoader'
import type { GeoCoords } from '../types'

export interface GeocodeResult {
  gps: GeoCoords
  // The comma-separated segment of the query that actually matched — equal
  // to the full input when the exact address resolved, or a broader
  // trailing chunk (city/province) when only that part was found in
  // OpenStreetMap's data. Lets the UI be honest about precision instead of
  // silently pretending a city-level match is the exact address.
  matchedText: string
  exact: boolean
}

// Tries Google's Geocoding API first (only when VITE_GOOGLE_MAPS_API_KEY is
// configured) — Google's PH address coverage is noticeably better than
// OSM's free data, especially for small barangays/sitios. Resolves null
// (never throws) on any failure so the Nominatim fallback below still runs.
async function geocodeOnceGoogle(query: string): Promise<GeoCoords | null> {
  const loading = loadGoogleMaps()
  if (!loading) return null
  try {
    await loading
  } catch {
    return null
  }
  if (!window.google?.maps) return null
  return new Promise((resolve) => {
    const geocoder = new window.google!.maps.Geocoder()
    geocoder.geocode({ address: query, componentRestrictions: { country: 'PH' } }, (results, status) => {
      if (status === 'OK' && results && results.length > 0) {
        const loc = results[0].geometry.location
        resolve({ lat: loc.lat(), lng: loc.lng() })
      } else {
        resolve(null)
      }
    })
  })
}

async function geocodeOnce(query: string, signal: AbortSignal): Promise<GeoCoords | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ph&q=${encodeURIComponent(query)}`
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal })
  if (!res.ok) return null
  const results = (await res.json()) as { lat: string; lon: string }[]
  if (results.length === 0) return null
  return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) }
}

async function reverseGeocodeOnceGoogle(gps: GeoCoords): Promise<string | null> {
  const loading = loadGoogleMaps()
  if (!loading) return null
  try {
    await loading
  } catch {
    return null
  }
  if (!window.google?.maps) return null
  return new Promise((resolve) => {
    const geocoder = new window.google!.maps.Geocoder()
    geocoder.geocode({ location: { lat: gps.lat, lng: gps.lng } }, (results, status) => {
      if (status === 'OK' && results && results.length > 0) resolve(results[0].formatted_address)
      else resolve(null)
    })
  })
}

// Turns a raw map-tap coordinate into a readable label — the inverse of
// geocodeAddress, used when the passenger drops a pin directly on the map
// instead of picking province/city/barangay. Google's reverse geocoder is
// tried first (same key-gated pattern as geocodeAddress), falling back to
// Nominatim's free reverse endpoint. Returns null (never throws) if both
// fail, so the caller can fall back to a generic "Pinned location" label.
export async function reverseGeocode(gps: GeoCoords): Promise<string | null> {
  const googleLabel = await reverseGeocodeOnceGoogle(gps)
  if (googleLabel) return googleLabel
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${gps.lat}&lon=${gps.lng}&zoom=18&addressdetails=0`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const data = (await res.json()) as { display_name?: string }
    return data.display_name ?? null
  } catch {
    return null
  }
}

export interface PlaceSuggestion {
  label: string
  // Nominatim results carry the coordinate up front. Google's Autocomplete
  // predictions deliberately don't — resolving one costs a separate Place
  // Details call, so it only happens for the one result the rider actually
  // picks (see resolveGooglePlaceGps), not for every row shown.
  gps: GeoCoords | null
  placeId?: string
  // A street from searchStreets: its OpenStreetMap id ("W253920152"), for
  // fetching the road's own shape (see fetchStreetLine).
  osmId?: string
}

// One Autocomplete session covers every keystroke of a single search plus
// the Place Details call that follows picking a result — Google bills (or
// doesn't; Autocomplete predictions paired with a completed session are
// free) per session, not per request, but only while every request in it
// shares this same token. Reset once a session ends (a Details call fires,
// or the reader clears the box) so the next search starts its own.
let sessionToken: GooglePlacesSessionToken | null = null
// AutocompleteService needs no map; PlacesService.getDetails does need a
// container, though nothing here ever attaches it to the page — Google's
// API just requires an element to construct the service against.
let placesAttrDiv: HTMLDivElement | null = null

function endSession() {
  sessionToken = null
}

async function loadGooglePlaces(): Promise<boolean> {
  if (!googleMapsApiKey()) return false
  const loading = loadGoogleMaps()
  if (!loading) return false
  try {
    await loading
  } catch {
    return false
  }
  return !!window.google?.maps?.places
}

// Google's business-listing coverage in rural PH areas is far ahead of
// OSM's free data (a named bank branch or fast-food chain is often just
// missing from OSM entirely) — tried first when a key is configured, with
// Nominatim as the always-available fallback. Resolves null (never throws
// or returns []) on any failure so searchNearbyPlaces's own fallback runs;
// an empty array would instead be read as "Google searched and found
// nothing," which isn't what a loading failure means.
async function searchGooglePlaces(
  query: string,
  scope: { city?: string; province?: string },
): Promise<PlaceSuggestion[] | null> {
  const ready = await loadGooglePlaces()
  if (!ready) return null
  if (!sessionToken) sessionToken = new window.google!.maps.places.AutocompleteSessionToken()
  const scoped = [query, scope.city, scope.province ?? 'Nueva Ecija', 'Philippines'].filter(Boolean).join(', ')
  return new Promise((resolve) => {
    const service = new window.google!.maps.places.AutocompleteService()
    service.getPlacePredictions(
      { input: scoped, sessionToken: sessionToken!, componentRestrictions: { country: 'ph' } },
      (predictions, status) => {
        if (status !== window.google!.maps.places.PlacesServiceStatus.OK || !predictions) {
          resolve(null)
          return
        }
        resolve(predictions.map((p) => ({ label: p.description, gps: null, placeId: p.place_id })))
      },
    )
  })
}

// The other half of a Google result: called only once, when the rider taps
// a suggestion with no gps of its own yet. Ends the Autocomplete session
// this placeId's prediction came from either way (success or failure) —
// Google's session billing is per completed round trip, not per attempt.
export async function resolveGooglePlaceGps(placeId: string): Promise<GeoCoords | null> {
  if (!window.google?.maps?.places) return null
  if (!placesAttrDiv) placesAttrDiv = document.createElement('div')
  const usedToken = sessionToken ?? undefined
  endSession()
  return new Promise((resolve) => {
    const service = new window.google!.maps.places.PlacesService(placesAttrDiv!)
    service.getDetails({ placeId, sessionToken: usedToken, fields: ['geometry'] }, (result, status) => {
      if (status === window.google!.maps.places.PlacesServiceStatus.OK && result?.geometry) {
        resolve({ lat: result.geometry.location.lat(), lng: result.geometry.location.lng() })
      } else {
        resolve(null)
      }
    })
  })
}

async function searchNominatimPlaces(
  query: string,
  scope: { city?: string; province?: string },
  limit: number,
): Promise<PlaceSuggestion[]> {
  const scoped = [query, scope.city, scope.province ?? 'Nueva Ecija', 'Philippines'].filter(Boolean).join(', ')
  const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=0&limit=${limit}&countrycodes=ph&q=${encodeURIComponent(scoped)}`
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) return []
    const results = (await res.json()) as { lat: string; lon: string; display_name: string }[]
    return results.map((r) => ({ label: r.display_name, gps: { lat: parseFloat(r.lat), lng: parseFloat(r.lon) } }))
  } catch {
    return []
  }
}

// The fallback DestinationSearch reaches for once the local landmark list
// (see lib/landmarkSearch.ts) comes up empty — Google Places first (see
// searchGooglePlaces) when VITE_GOOGLE_MAPS_API_KEY is configured, else
// straight to a multi-result Nominatim search, scoped to the city/province
// already picked so "palengke"-like typos aside, a real but unseeded place
// (a specific bank branch, a newer subdivision) still resolves to
// something. Never called per-keystroke: Nominatim's usage policy caps free
// use at ~1 request/second, so the caller is responsible for debouncing to a
// real pause in typing, not just a short one. Returns [] rather than
// throwing on any failure (offline, timeout, no results) — an empty list and
// a real miss look identical to the search box either way.
export async function searchNearbyPlaces(
  query: string,
  scope: { city?: string; province?: string },
  limit = 5,
): Promise<PlaceSuggestion[]> {
  const q = query.trim()
  if (!q) return []
  const google = await searchGooglePlaces(q, scope)
  if (google) return google.slice(0, limit)
  return searchNominatimPlaces(q, scope, limit)
}

// Free, keyless geocoding via OpenStreetMap's Nominatim search API — turns a
// typed address into a real lat/lng. Small informal Philippine subdivision/
// sitio names are frequently missing from OSM's free data even when the
// containing city/province is well-mapped, so this progressively drops the
// leading (most specific) comma-separated segment and retries — "Bosca, Sto.
// Tomas, San Jose City, Nueva Ecija" falling through to "San Jose City,
// Nueva Ecija" is a real, correct city-level placement, not a miss. Returns
// null only if nothing in the whole chain resolves (bad network, timeout, or
// a query with no recognizable Philippine place at all).
export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  const fullQuery = query.trim()
  const parts = fullQuery
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) return null

  const googleGps = await geocodeOnceGoogle(fullQuery)
  if (googleGps) return { gps: googleGps, matchedText: fullQuery, exact: true }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    for (let i = 0; i < parts.length; i++) {
      const attempt = parts.slice(i).join(', ')
      const gps = await geocodeOnce(attempt, controller.signal)
      if (gps) return { gps, matchedText: attempt, exact: i === 0 }
      // Nominatim's usage policy caps free-tier use at ~1 request/second.
      if (i < parts.length - 1) await new Promise((r) => setTimeout(r, 1000))
    }
    return null
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

// Streets, by name, for the Where to search (2026-09-22). The seeded landmark
// list has places, not roads, and Nominatim's free-text search misses most
// Philippine street names — OSM calls the town "San Jose", so a query with
// "San Jose City" appended came back empty, and a half-typed name never
// matched at all. Photon (komoot's free search over the same OpenStreetMap
// data) is made for search-as-you-type: partial names match, only roads are
// asked for, the box keeps it to Nueva Ecija and the towns on its edge, and
// `near` ranks the closest first. Returns [] on any failure, like the rest.
const STREET_SEARCH_BBOX = '120.55,15.20,121.40,16.25'
const NOT_A_STREET = new Set(['bus_stop', 'crossing', 'traffic_signals', 'street_lamp', 'stop', 'give_way', 'milestone', 'speed_camera', 'elevator'])
export async function searchStreets(
  query: string,
  near: GeoCoords | null,
  limit = 6,
  // The town picked in the City row: a street in another town is not an
  // answer to "where in Pantabangan?" (2026-09-23).
  city?: string,
): Promise<PlaceSuggestion[]> {
  const q = query.trim()
  if (q.length < 3) return []
  const bias = near ? `&lat=${near.lat}&lon=${near.lng}` : ''
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=${limit + 4}&osm_tag=highway&bbox=${STREET_SEARCH_BBOX}${bias}`
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) return []
    const data = (await res.json()) as {
      features: { geometry: { coordinates: [number, number] }; properties: { name?: string; osm_value?: string; osm_type?: string; osm_id?: number; district?: string; city?: string; county?: string } }[]
    }
    const seen = new Set<string>()
    const out: PlaceSuggestion[] = []
    for (const f of data.features ?? []) {
      const p = f.properties
      if (!p.name || (p.osm_value && NOT_A_STREET.has(p.osm_value))) continue
      const [lngHere, latHere] = f.geometry.coordinates
      if (!sameTown(city, p, { lat: latHere, lng: lngHere }, near)) continue
      const label = [p.name, p.district, p.city ?? p.county].filter(Boolean).join(', ')
      // One row per street and place — a long road comes back as several pieces.
      if (seen.has(label)) continue
      seen.add(label)
      const [lng, lat] = f.geometry.coordinates
      out.push({ label, gps: { lat, lng }, osmId: p.osm_type && p.osm_id ? `${p.osm_type}${p.osm_id}` : undefined })
      if (out.length >= limit) break
    }
    return out
  } catch {
    return []
  }
}

// Everything else OpenStreetMap knows about a town — restaurants, sari-sari
// stores, schools, clinics, resorts, offices (2026-09-23). The seeded
// landmark list is a snapshot and a small municipality like Pantabangan has
// very little of it; this asks the live map instead, the same source the
// tiles are drawn from, so whatever a passenger can see on the map can be
// searched for by name.
//
// Same Photon service as searchStreets, minus the highway filter and minus
// the roads themselves (those have their own section in the box). Results are
// kept to the town being booked in: by the name Photon reports, or — where it
// reports none — by being within reach of that town's centre.
const PLACE_NEAR_KM = 12
export async function searchOsmPlaces(
  query: string,
  near: GeoCoords | null,
  city: string | undefined,
  limit = 6,
): Promise<PlaceSuggestion[]> {
  const q = query.trim()
  if (q.length < 3) return []
  const bias = near ? `&lat=${near.lat}&lon=${near.lng}` : ''
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=${limit + 10}&bbox=${STREET_SEARCH_BBOX}${bias}`
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) return []
    const data = (await res.json()) as {
      features: {
        geometry: { coordinates: [number, number] }
        properties: { name?: string; osm_key?: string; osm_value?: string; street?: string; district?: string; city?: string; county?: string; type?: string }
      }[]
    }
    const seen = new Set<string>()
    const out: PlaceSuggestion[] = []
    for (const f of data.features ?? []) {
      const pr = f.properties
      // Roads are the Streets section's job, and a bare house number is not
      // a place anybody searches for by name.
      if (!pr.name || pr.osm_key === 'highway' || pr.osm_key === 'place') continue
      const [lng, lat] = f.geometry.coordinates
      if (!sameTown(city, pr, { lat, lng }, near)) continue
      const label = [pr.name, pr.street, pr.district, pr.city ?? pr.county].filter(Boolean).join(', ')
      if (seen.has(label)) continue
      seen.add(label)
      out.push({ label, gps: { lat, lng } })
      if (out.length >= limit) break
    }
    return out
  } catch {
    return []
  }
}

// Is this result in the town the passenger picked? OSM writes town names its
// own way — "San Jose" for San Jose City, "Muñoz" for Science City of Muñoz —
// so the comparison drops the City/Science City wording and the ñ. A result
// carrying no town at all is kept only if it is close to the town centre.
export function sameTown(
  city: string | undefined,
  props: { city?: string; county?: string; district?: string },
  gps: GeoCoords,
  cityCentre: GeoCoords | null,
): boolean {
  if (!city) return true
  const plain = (n: string) =>
    n
      .toLowerCase()
      .replace(/ñ/g, 'n')
      .replace(/(science|city|of|municipality)/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  const want = plain(city)
  const named = [props.city, props.county, props.district].filter(Boolean).map((n) => plain(n as string))
  if (named.length > 0) return named.some((n) => n === want || n.includes(want) || want.includes(n))
  if (!cityCentre) return true
  return haversineKm(cityCentre, gps) <= PLACE_NEAR_KM
}

function haversineKm(a: GeoCoords, b: GeoCoords): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

// The shape of a street picked from searchStreets, so the map can draw it as
// a green line (the same guide a seeded street gets — see streetPaths.ts) and
// the customer can slide the pin to the right spot along it. One call, only
// for the street actually tapped. Null on any failure: the map still goes to
// the street's point, just without the line.
export async function fetchStreetLine(osmId: string): Promise<GeoCoords[][] | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)
    const res = await fetch(
      `https://nominatim.openstreetmap.org/lookup?osm_ids=${encodeURIComponent(osmId)}&format=json&polygon_geojson=1`,
      { headers: { Accept: 'application/json' }, signal: controller.signal },
    )
    clearTimeout(timeout)
    if (!res.ok) return null
    const [hit] = (await res.json()) as { geojson?: { type: string; coordinates: unknown } }[]
    const g = hit?.geojson
    if (!g) return null
    const toRun = (coords: [number, number][]) => coords.map(([lng, lat]) => ({ lat, lng }))
    if (g.type === 'LineString') return [toRun(g.coordinates as [number, number][])]
    if (g.type === 'MultiLineString') return (g.coordinates as [number, number][][]).map(toRun)
    return null
  } catch {
    return null
  }
}
