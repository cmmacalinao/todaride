import { STREET_PATHS } from '../mock/data'
import type { GeoCoords, Landmark, MockLocation } from '../types'

// The green "set the pin along this road" line — see STREET_PATHS.
//
// A chosen place is a plain MockLocation by the time the map sees it (see
// createCustomLocation), so which street it came from is recovered rather
// than carried: the street landmark whose pin the location still sits on
// (a pick lands exactly on the landmark's midpoint), or whose name the
// location still bears. Once the passenger drags the pin off the midpoint
// and the reverse-geocode renames it, neither holds and the line goes —
// its job, guiding the pin onto the right road, is done by then.
export function streetLinesFor(
  location: Pick<MockLocation, 'gps' | 'label'> | null | undefined,
  landmarks: Landmark[],
): GeoCoords[][] | null {
  if (!location?.gps) return null
  const { lat, lng } = location.gps
  const street = landmarks.find(
    (l) =>
      l.category === 'street' &&
      STREET_PATHS[l.id] !== undefined &&
      ((l.gps.lat === lat && l.gps.lng === lng) || l.name === location.label),
  )
  if (!street) return null
  return STREET_PATHS[street.id].map((run) => run.map(([rlat, rlng]) => ({ lat: rlat, lng: rlng })))
}

// One line of guidance to sit by the map while a street line is showing.
export const STREET_PIN_NOTE = 'Set the Pin on Map — drag the dot along the green line to the exact spot on that street.'
