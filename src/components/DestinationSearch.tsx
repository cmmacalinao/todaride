import { useEffect, useRef, useState } from 'react'
import { useRides } from '../context/RideContext'
import { searchLandmarks } from '../lib/landmarkSearch'
import { searchNearbyPlaces, resolveGooglePlaceGps, type PlaceSuggestion } from '../lib/geocode'
import { LANDMARK_CATEGORY_ICONS } from '../types'
import type { GeoCoords } from '../types'

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`
}

// How long to sit still before the live fallback fires — a real pause in
// typing, not just the gap between keystrokes. Nominatim's usage policy caps
// free use at ~1 request/second; debounced this loosely, a name typed at a
// normal pace never reaches the network at all before either a local match
// appears or the reader finishes typing.
const LIVE_SEARCH_DEBOUNCE_MS = 700
const MIN_LIVE_QUERY_LENGTH = 3

// A place this box can hand back — a seeded Landmark satisfies this
// structurally (name + gps, plus fields this only ignores), and so does a
// bare live search result, so one onSelect serves both without the caller
// needing to know which kind it got.
export interface SelectedPlace {
  name: string
  gps: GeoCoords
}

// Nueva Ecija addressing runs on landmarks ("palengke", "sa may simbahan"),
// not street names — this is the fast path in front of the barangay
// dropdowns below it, not a replacement for them. The seeded landmark list
// (see lib/landmarkSearch.ts) is a synchronous, instant scan; only once that
// comes up empty does this reach for a live OpenStreetMap search, and only
// after the reader has paused — see LIVE_SEARCH_DEBOUNCE_MS.
export function DestinationSearch({
  city,
  near,
  onSelect,
  onOpenAddressForm,
  onPinOnMap,
  resultsClassName = '',
  noMatchNote,
  placeholder = 'Search a landmark — palengke, simbahan, CLSU…',
  className,
  inputClassName = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm',
  autoFocus = false,
}: {
  // Scopes results to the city already chosen above this box (see the City
  // row in PassengerPage) — a search is "palengke in this city", not a
  // province-wide lookup, so a same-named landmark three towns over never
  // outranks the one actually in the picked city. Unfiltered when blank.
  city?: string
  // The rider's current position, for ranking equally-good text matches by
  // which one is actually closer. Optional: a passenger with GPS blocked
  // still gets results, just ranked by text alone.
  near?: GeoCoords | null
  onSelect: (place: SelectedPlace) => void
  // Lets a no-match result open the caller's own Address form toggle
  // directly, instead of just telling the reader it exists somewhere below.
  // Omitted callers keep the plain, non-clickable line.
  onOpenAddressForm?: () => void
  // Lets a no-match result arm the map for a tap directly, the same as the
  // caller's own "Set on Map" button. Omitted callers keep the plain line.
  onPinOnMap?: () => void
  // Wraps whatever shows under the input (matches, live results, or the
  // no-match line). A caller seating this box in a flex toolbar passes an
  // absolute-positioned class here so the list floats over the map instead
  // of growing the row and shoving the buttons beside it onto a new line.
  resultsClassName?: string
  // Replaces the Fill Address Form / Set on Map links on a no-match with a
  // plain instruction — for a box sitting on the map itself, where "pin it
  // on the map" is already the thing right underneath, not a link away.
  noMatchNote?: string
  placeholder?: string
  // Lets a caller embed this as the destination bar itself (see
  // PassengerPage's Where to) rather than the plain boxed field this
  // defaults to.
  className?: string
  inputClassName?: string
  autoFocus?: boolean
}) {
  const { landmarks } = useRides()
  const [query, setQuery] = useState('')
  const scoped = city ? landmarks.filter((l) => l.city === city) : landmarks
  const matches = searchLandmarks(query, scoped, near ?? null)

  const [liveResults, setLiveResults] = useState<PlaceSuggestion[]>([])
  const [liveStatus, setLiveStatus] = useState<'idle' | 'loading' | 'done'>('idle')
  // Set only while a tapped Google prediction's own Place Details call is in
  // flight — Google's Autocomplete rows carry no gps of their own (see
  // PlaceSuggestion in lib/geocode.ts), so picking one needs this second,
  // one-off round trip before onSelect can fire.
  const [resolvingPlaceId, setResolvingPlaceId] = useState<string | null>(null)
  // Guards against a slow, stale request landing after a faster, newer one —
  // or after the reader has cleared the box entirely.
  const requestIdRef = useRef(0)

  const trimmed = query.trim()
  const shouldTryLive = matches.length === 0 && trimmed.length >= MIN_LIVE_QUERY_LENGTH

  useEffect(() => {
    if (!shouldTryLive) {
      setLiveResults([])
      setLiveStatus('idle')
      return
    }
    setLiveStatus('loading')
    const requestId = ++requestIdRef.current
    const timer = setTimeout(() => {
      void searchNearbyPlaces(trimmed, { city }).then((results) => {
        if (requestIdRef.current !== requestId) return // superseded by a newer query
        setLiveResults(results)
        setLiveStatus('done')
      })
    }, LIVE_SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldTryLive, trimmed, city])

  function pick(place: SelectedPlace) {
    onSelect(place)
    setQuery('')
    setLiveResults([])
    setLiveStatus('idle')
  }

  // A Nominatim row already carries its gps; a Google row doesn't (its
  // coordinate costs a separate billed Details call, so that call only
  // happens for the one row actually tapped — see resolveGooglePlaceGps).
  async function pickLive(place: PlaceSuggestion) {
    if (place.gps) {
      pick({ name: place.label, gps: place.gps })
      return
    }
    if (!place.placeId) return
    setResolvingPlaceId(place.placeId)
    const gps = await resolveGooglePlaceGps(place.placeId)
    setResolvingPlaceId(null)
    if (gps) pick({ name: place.label, gps })
  }

  return (
    <div className={className}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={inputClassName}
      />
      <div className={resultsClassName}>
      {trimmed &&
        (matches.length > 0 ? (
          <div className="mt-1 space-y-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
            {matches.map(({ landmark, distanceMeters }) => (
              <button
                key={landmark.id}
                type="button"
                onClick={() => pick(landmark)}
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
        ) : liveStatus === 'loading' ? (
          <p className="mt-1 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-400">
            Searching OpenStreetMap for "{trimmed}"…
          </p>
        ) : liveResults.length > 0 ? (
          <div className="mt-1 space-y-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
            {liveResults.map((place, i) => (
              <button
                key={place.placeId ?? `${place.gps?.lat},${place.gps?.lng},${i}`}
                type="button"
                disabled={resolvingPlaceId === place.placeId && !!place.placeId}
                onClick={() => void pickLive(place)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-slate-50 disabled:opacity-50"
              >
                <span aria-hidden className="text-base leading-none">
                  {place.placeId && resolvingPlaceId === place.placeId ? '⏳' : '🌐'}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{place.label}</span>
              </button>
            ))}
            {/* Required by OSM's ODbL licence wherever a search result drawn
                from it is shown — see lib/geocode.ts's searchNearbyPlaces.
                Google-sourced rows (placeId set) carry no gps of their own
                yet and need their own attribution, which the Maps JS SDK
                itself already supplies (its own logo/ToS link render
                wherever a Places-backed control is shown) — nothing extra
                to print here for that case. */}
            {liveResults[0]?.placeId == null && (
              <p className="border-t border-slate-100 px-2 pt-1 text-[10px] text-slate-400">
                Results © OpenStreetMap contributors
              </p>
            )}
          </div>
        ) : (
          <p className="mt-1 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-400">
            {noMatchNote ? (
              <>
                No landmark matches "{trimmed}"{city ? ` in ${city}` : ''}
                {shouldTryLive && liveStatus === 'done' ? ' and no nearby place found' : ''} — {noMatchNote}
              </>
            ) : (
              <>
                No landmark matches "{trimmed}"{city ? ` in ${city}` : ''}
                {shouldTryLive && liveStatus === 'done' ? ', and no nearby place found either' : ''} —{' '}
                {onOpenAddressForm ? (
                  <button
                    type="button"
                    onClick={onOpenAddressForm}
                    className="font-semibold text-brand-600 underline hover:text-brand-700"
                  >
                    Fill Address Form
                  </button>
                ) : (
                  'try the address form below'
                )}
                , or{' '}
                {onPinOnMap ? (
                  <button type="button" onClick={onPinOnMap} className="font-semibold text-red-600 underline hover:text-red-700">
                    Set on Map
                  </button>
                ) : (
                  'pin it on the map'
                )}
                .
              </>
            )}
          </p>
        ))}
      </div>
    </div>
  )
}
