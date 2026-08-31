// Where the navigation camera should be pointing.
//
// Kept separate from the map component, and pure, because this is the part
// that decides whether a heading-up map is pleasant or unusable — and the
// only way to know is to run a recorded ride through it and look at the
// numbers, which you cannot do to a function that needs a WebGL canvas.
//
// Everything here is degrees clockwise from north, the same convention the
// Geolocation API and MapLibre both use.

export interface NavCameraInput {
  // GeolocationCoordinates.heading — the direction of travel the device
  // reports. Null when it does not know, which is most of the time while
  // standing still, and on any desktop browser.
  heading: number | null
  speedMps: number | null
  // What the camera was doing on the previous tick. Null on the first one.
  previousBearing: number | null
  // Whether heading-up is wanted at all: off for a finished trip, off if the
  // rider has turned it off.
  enabled: boolean
}

export interface NavCameraState {
  bearing: number
  pitch: number
  // True when the map is genuinely following the direction of travel, as
  // opposed to holding a stale bearing or sitting flat facing north. The UI
  // needs to know the difference: a compass button that claims the map is
  // aligned when it is only frozen is a lie the rider finds out about at a
  // junction.
  headingUp: boolean
}

// Below walking pace, a phone's reported heading is mostly noise: standing
// at a rank waiting for a passenger, it swings through the full circle every
// few seconds. Rotating the map on that is what makes people put the phone
// down. 1.4 m/s is about 5 km/h — a brisk walk, well under any tricycle that
// is actually moving.
export const MIN_ROTATE_SPEED_MPS = 1.4

// A degree or two of wobble at a steady 20 km/h is normal and constant.
// Turning the whole map for it costs a redraw and reads as drift.
export const BEARING_DEADBAND_DEGREES = 3

// How much of the gap to close each tick. The watch fires roughly once a
// second, so this settles a 90° corner in about four of them — fast enough to
// be turning while you are turning, slow enough that a single bad fix cannot
// spin the map.
export const BEARING_SMOOTHING = 0.35

// Enough tilt to see up the road without the far half of the screen becoming
// a smear of horizon. Steeper looks impressive and shows less.
export const NAV_PITCH_DEGREES = 55

export function normalizeDegrees(deg: number): number {
  const d = deg % 360
  return d < 0 ? d + 360 : d
}

// Signed turn from one bearing to another, taking the short way round: +170,
// not -190. Without this a heading crossing north makes the map spin most of
// the way round the compass to arrive somewhere a few degrees away.
export function shortestTurn(from: number, to: number): number {
  let d = (normalizeDegrees(to) - normalizeDegrees(from)) % 360
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return d
}

export function nextNavCamera({
  heading,
  speedMps,
  previousBearing,
  enabled,
}: NavCameraInput): NavCameraState {
  if (!enabled) return { bearing: 0, pitch: 0, headingUp: false }

  const held = previousBearing ?? 0
  const moving = speedMps != null && speedMps >= MIN_ROTATE_SPEED_MPS
  const usable = heading != null && Number.isFinite(heading) && moving

  // Stopped, or the device has no heading to give. Hold the bearing rather
  // than snapping back to north: a map that spins to north at every red light
  // and back again when you pull away is worse than one that is briefly a few
  // degrees stale. Still tilted, and still reported as heading-up, because
  // the frame is the one the rider was last actually travelling along.
  if (!usable) {
    if (previousBearing == null) return { bearing: 0, pitch: 0, headingUp: false }
    return { bearing: held, pitch: NAV_PITCH_DEGREES, headingUp: true }
  }

  // First usable fix: go straight there. Easing in from north would swing the
  // map through a turn that never happened.
  if (previousBearing == null) {
    return { bearing: normalizeDegrees(heading), pitch: NAV_PITCH_DEGREES, headingUp: true }
  }

  const turn = shortestTurn(held, heading)
  if (Math.abs(turn) < BEARING_DEADBAND_DEGREES) {
    return { bearing: held, pitch: NAV_PITCH_DEGREES, headingUp: true }
  }
  return {
    bearing: normalizeDegrees(held + turn * BEARING_SMOOTHING),
    pitch: NAV_PITCH_DEGREES,
    headingUp: true,
  }
}
