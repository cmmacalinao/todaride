import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import type { GeoCoords } from '../types'

// A driver must be roughly at the terminal to join its queue — this is the
// radius we treat as "at the terminal." Real GPS on a phone is typically
// accurate to 5-20m outdoors, so 150m comfortably covers a terminal plus
// normal signal drift without being so loose it's meaningless.
export const TERMINAL_PROXIMITY_METERS = 150

// How near the pickup a driver has to be before the trip can be started.
// Tighter than the terminal radius: a terminal is a whole yard you might be
// parked anywhere in, while a pickup is one person standing in one spot.
export const PICKUP_PROXIMITY_METERS = 100

// How near the recorded drop-off the tricycle has to be before "Complete
// trip" is the ordinary one-tap ending. Further out it still works — a
// passenger says "para" wherever they like, and that is the whole point of
// a tricycle — but it asks first, because the alternative is a full fare
// charged halfway and a payment form opening while the passenger is still
// moving.
export const DROPOFF_PROXIMITY_METERS = 100

const EARTH_RADIUS_METERS = 6371000

export function haversineDistanceMeters(a: GeoCoords, b: GeoCoords): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h))
}

// The device's actual GPS/network location, not a simulated coordinate like
// everything else location-related in this app. Goes through Capacitor's
// Geolocation plugin when running inside the wrapped native app — that gets
// a real native permission prompt and a WebView-independent GPS read,
// instead of relying on the WebView's own (sometimes flaky/unimplemented)
// navigator.geolocation. Falls straight back to the browser API on the web,
// where that's the only option and already works fine.
export function getCurrentGeoPosition(): Promise<GeoCoords> {
  if (Capacitor.isNativePlatform()) {
    return Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 }).then((position) => ({
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    }))
  }
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location services are not available on this device/browser.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      (error) => reject(error),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  })
}

// Distances are shown in kilometres, everywhere, whatever their size.
//
// The app used to switch units on the reader: metres up to a kilometre, then
// km. Two units in one list means two numbers that cannot be compared at a
// glance — "800 m" against "1.2 km" is a puzzle, and a driver reading it at a
// terminal should not have to solve one. Precision does the adapting instead:
// two decimals below a kilometre, so 85 m is still a real number (0.09 km)
// rather than a rounded-away zero, and one above it, where a second decimal
// is noise.
export function formatKm(meters: number): string {
  const km = meters / 1000
  return `${km < 1 ? km.toFixed(2) : km.toFixed(1)} km`
}

// A point a given distance and compass bearing away from another. Standard
// destination-point formula on a sphere — at the tens-of-metres scale this
// works at, the earth being an ellipsoid does not show.
export function offsetMeters(from: GeoCoords, meters: number, bearingDegrees: number): GeoCoords {
  const angular = meters / EARTH_RADIUS_METERS
  const bearing = (bearingDegrees * Math.PI) / 180
  const lat1 = (from.lat * Math.PI) / 180
  const lng1 = (from.lng * Math.PI) / 180
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
  )
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    )
  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI }
}

// How far a simulated driver stands from the pickup when they take a job.
//
// A pilot tester needs the drive-to-pickup leg to be over in seconds so they
// can get to the part they are actually testing: the arrival, the GPS
// proximity check, and the passenger getting on. Starting them at their TODA
// terminal is the honest answer for a real driver and a useless one for a
// rehearsal — it is kilometres, every single run.
//
// 20-30m is deliberately just outside touching distance and well inside
// PICKUP_PROXIMITY_METERS, so "Start trip" unlocks immediately while the
// tricycle still visibly approaches from somewhere rather than materialising
// on top of the passenger.
export const SIMULATED_DRIVER_MIN_METERS = 20
export const SIMULATED_DRIVER_MAX_METERS = 30

// Same ride, same spot, on every device and every re-render — the position is
// derived from the ride's own id rather than drawn at random, so the driver
// does not teleport around the pickup each time the state syncs.
export function simulatedDriverOrigin(pickup: GeoCoords, seed: string): GeoCoords {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  const spread = SIMULATED_DRIVER_MAX_METERS - SIMULATED_DRIVER_MIN_METERS
  const meters = SIMULATED_DRIVER_MIN_METERS + (hash % (spread + 1))
  const bearing = (hash >>> 8) % 360
  return offsetMeters(pickup, meters, bearing)
}

// How close the tricycle has to be to the passenger before the trip starts
// itself. Tighter than PICKUP_PROXIMITY_METERS on purpose: that one guards a
// button a driver chooses to press, and 100m of slack is a kindness when a
// pin sits on the wrong side of a building. This one spends the passenger's
// money without being asked, so it waits until the two really are in the same
// spot — 15m is inside the noise of two consumer GPS fixes standing together,
// and outside the distance at which the driver is still visibly approaching.
export const AUTO_START_METERS = 15

// Past this, a passenger is told how far the nearest driver actually is
// before the booking goes out.
//
// A tricycle is not a car: a kilometre is not "just around the corner", it is
// several minutes of someone else's afternoon and the reason a passenger
// stands wondering whether the app heard them. Booking is still theirs to
// make — this only makes sure the wait is a thing they agreed to rather than
// something they discover.
export const FAR_DRIVER_METERS = 1000

// A tricycle's honest working average through a town: junctions, tricycle
// lanes, the odd passenger flagging it down. Not a highway speed, because
// this is not a highway journey.
export const TRICYCLE_KMH = 20

export function minutesToCover(meters: number): number {
  return Math.max(1, Math.round((meters / 1000 / TRICYCLE_KMH) * 60))
}

// "8 min" / "1 hr 5 min" — hours only appear once there are hours, so the
// common case stays two words.
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`
}
