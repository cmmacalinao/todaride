import { useState } from 'react'
import { useRides } from '../context/RideContext'
import { searchLandmarks } from '../lib/landmarkSearch'
import { LANDMARK_CATEGORY_ICONS } from '../types'
import type { GeoCoords, Landmark } from '../types'

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`
}

// Nueva Ecija addressing runs on landmarks ("palengke", "sa may simbahan"),
// not street names — this is the fast path in front of the barangay
// dropdowns below it, not a replacement for them. Everything here is a
// synchronous scan of the small seeded landmark list (see
// lib/landmarkSearch.ts), so there is no loading state and no debounce to
// wire up.
export function DestinationSearch({
  near,
  onSelect,
  placeholder = 'Search a landmark — palengke, simbahan, CLSU…',
}: {
  // The rider's current position, for ranking equally-good text matches by
  // which one is actually closer. Optional: a passenger with GPS blocked
  // still gets results, just ranked by text alone.
  near?: GeoCoords | null
  onSelect: (landmark: Landmark) => void
  placeholder?: string
}) {
  const { landmarks } = useRides()
  const [query, setQuery] = useState('')
  const matches = searchLandmarks(query, landmarks, near ?? null)

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      {query.trim() &&
        (matches.length > 0 ? (
          <div className="mt-1 space-y-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
            {matches.map(({ landmark, distanceMeters }) => (
              <button
                key={landmark.id}
                type="button"
                onClick={() => {
                  onSelect(landmark)
                  setQuery('')
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-slate-50"
              >
                <span aria-hidden className="text-base leading-none">
                  {LANDMARK_CATEGORY_ICONS[landmark.category]}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{landmark.name}</span>
                {distanceMeters != null && (
                  <span className="shrink-0 text-[11px] text-slate-400">{formatDistance(distanceMeters)}</span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-1 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-400">
            No landmark matches "{query.trim()}" — try the address form below, or pin it on the map.
          </p>
        ))}
    </div>
  )
}
