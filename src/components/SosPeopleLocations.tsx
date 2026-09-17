import type { GeoCoords, Ride, SosAlert } from '../types'
import { formatKm, haversineDistanceMeters } from '../lib/geo'
import { isActiveAlert } from '../lib/safety'
import { useNow } from '../lib/liveTracking'
import { RealLiveMap, type MapPoint } from './RealLiveMap'

// Where the passenger is and where the tricycle is, side by side.
//
// An SOS on a trip used to carry one pin, and on the trip where it matters
// most there are two places, not one: the passenger has got out, or been put
// out, and the tricycle has driven on. Whoever responds needs both — the
// person first, and the vehicle so it can be found — and the gap between
// them, which on its own says whether the two are still together.
//
// While the alert is open, each position is the one that phone is still
// publishing on the ride, so the rows and pins keep moving; once it is
// closed, or a phone stops reporting, the position saved on the alert at the
// moment it went up is shown instead, and said to be that.

interface Spot {
  gps: GeoCoords
  live: boolean
  at: string | null
}

function spotFor(active: boolean, liveGps: GeoCoords | null | undefined, liveAt: string | null | undefined, saved: GeoCoords | null | undefined, savedAt: string): Spot | null {
  if (active && liveGps) return { gps: liveGps, live: true, at: liveAt ?? null }
  if (saved) return { gps: saved, live: false, at: savedAt }
  return null
}

function age(at: string | null, now: number): string {
  if (!at) return ''
  const s = Math.max(0, Math.round((now - new Date(at).getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`
}

interface SosPeopleLocationsProps {
  alert: SosAlert
  ride: Ride | null
  passengerName: string
  driverLabel: string
  // The trip screens already draw both people on their own map, right above;
  // the safety desk has no map of its own, so it asks for one here.
  showMap?: boolean
}

export function SosPeopleLocations({ alert, ride, passengerName, driverLabel, showMap = false }: SosPeopleLocationsProps) {
  const active = isActiveAlert(alert)
  const now = useNow(5000, active)
  const passenger = spotFor(active, ride?.passengerLiveGps, ride?.passengerLiveGpsAt, alert.passengerLocation, alert.createdAt)
  const driver = spotFor(active, ride?.driverLiveGps, ride?.driverLiveGpsAt, alert.driverLocation, alert.createdAt)
  const apart = passenger && driver ? haversineDistanceMeters(passenger.gps, driver.gps) : null

  const row = (icon: string, name: string, spot: Spot | null) => (
    <p className="flex flex-wrap items-baseline gap-x-1.5">
      <span className="font-semibold">
        {icon} {name}:
      </span>
      {spot ? (
        <>
          <a
            href={`https://www.google.com/maps?q=${spot.gps.lat},${spot.gps.lng}`}
            target="_blank"
            rel="noreferrer"
            className="text-brand-700 underline"
          >
            {spot.gps.lat.toFixed(5)}, {spot.gps.lng.toFixed(5)} · open map
          </a>
          <span className="text-[10px] text-slate-500">
            {spot.live ? `live · ${age(spot.at, now)}` : 'at the time of the SOS'}
          </span>
        </>
      ) : (
        <span className="text-slate-500">location not available</span>
      )}
    </p>
  )

  const points: MapPoint[] = [
    ...(passenger
      ? [{ id: 'sos-passenger', gps: passenger.gps, color: '#4f46e5', label: `🧍 ${passengerName}`, callout: true, alwaysLabel: true, pulse: passenger.live }]
      : []),
    ...(driver
      ? [{ id: 'sos-driver', gps: driver.gps, color: '#2563eb', label: `🛺 ${driverLabel}`, callout: true, alwaysLabel: true, pulse: driver.live, icon: 'tricycle' as const }]
      : []),
  ]

  return (
    <div className="space-y-1.5 rounded-lg border border-danger-200 bg-white p-2 text-[11px] text-slate-700">
      <p className="text-[11px] font-bold text-danger-900">📍 Where they are</p>
      {row('🧍', passengerName, passenger)}
      {row('🛺', driverLabel, driver)}
      {apart !== null && (
        <p className={`font-semibold ${apart > 50 ? 'text-danger-700' : 'text-slate-600'}`}>
          📏 {formatKm(apart)} apart{apart > 50 ? ' — not together' : ''}
        </p>
      )}
      {showMap && points.length > 0 && (
        <RealLiveMap
          points={points}
          routeLine={passenger && driver ? [passenger.gps, driver.gps] : undefined}
          routeIsReal={false}
          followAll
          hideLegend
          alwaysInteractive
          height="220px"
        />
      )}
    </div>
  )
}
