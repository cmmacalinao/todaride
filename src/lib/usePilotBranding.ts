import { useEffect, useState } from 'react'
import { useRides } from '../context/RideContext'
import { useSession } from '../context/SessionContext'
import { findNearbyTodaOrg, getCurrentGeoPosition } from './geo'

export interface PilotBrandingResult {
  name: string
  // True for an actual TODA being named — GPS-detected, a recognized
  // driver's device, or Super Admin's manual override — false for the
  // generic fallback. Callers use this to decide whether the ad-like
  // framing belongs around the name: naming a real, specific org reads as a
  // promotion; the app naming itself does not.
  specific: boolean
  // "Near you" is true for the GPS-detected and manual-override cases —
  // both are naming a TODA for a passenger who could be anyone. A
  // recognized driver's device isn't a proximity guess at all, so labelling
  // it "near you" would be simply wrong; that case gets no tag rather than
  // a mislabeled one. Only meaningful when `specific` is true.
  showNearYouTag: boolean
}

// Which TODA's identity this screen should show, resolved fresh on every
// visit rather than stored anywhere new — with one exception: a device this
// app already recognises as a particular driver's own (see
// loggedInDriverId in SessionContext) shows that driver's fixed TODA ahead
// of everything else, the same way DriverPage does once they are actually
// logged in. It only survives on a device that never explicitly logged
// out — logOut() clears it — so this is "the driver who normally uses this
// phone", not a guess.
//
// Below that: whichever TODA's terminal is nearest right now (a passenger
// who travels between two pilot towns should see each town's own TODA, not
// whichever one first geolocated them), falling back to a device-wide
// manual override for when GPS is off or nothing is close enough, and
// finally to the app's own generic name so the slot this feeds is never
// blank.
export function usePilotBranding(): PilotBrandingResult {
  const { todaOrganizations, pilotTodaName, drivers } = useRides()
  const { loggedInDriverId } = useSession()
  const [nearbyOrgName, setNearbyOrgName] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getCurrentGeoPosition()
      .then((position) => {
        if (cancelled) return
        const org = findNearbyTodaOrg(position, todaOrganizations)
        setNearbyOrgName(org?.name ?? null)
      })
      .catch(() => {
        // Denied, unavailable, or timed out — the fallback tiers below
        // cover this silently, the same way the rest of the app treats a
        // missing GPS fix as "carry on without it" rather than an error to
        // surface.
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const recognizedDriver = loggedInDriverId ? drivers.find((d) => d.id === loggedInDriverId) : null
  const recognizedDriverOrgName = recognizedDriver?.todaOrgId
    ? todaOrganizations.find((o) => o.id === recognizedDriver.todaOrgId)?.name
    : null

  if (recognizedDriverOrgName) return { name: recognizedDriverOrgName, specific: true, showNearYouTag: false }
  if (nearbyOrgName) return { name: nearbyOrgName, specific: true, showNearYouTag: true }
  if (pilotTodaName) return { name: pilotTodaName, specific: true, showNearYouTag: true }
  return { name: 'TODA Ride Mobility', specific: false, showNearYouTag: false }
}
