import type { GeoCoords, Landmark } from '../types'
import { haversineDistanceMeters } from './geo'

// Client-side stand-in for the pg_trgm `word_similarity`/`<%` search a real
// gazetteer table would use — the landmark list here is small (seeded per
// pilot, not the whole Philippines), so scoring every candidate on every
// keystroke is cheap enough to skip a database round trip entirely.

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents (ñ -> n, etc.)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Levenshtein distance, capped — a search box only ever compares short
// strings (a query and a place name/alias), so the classic O(n*m) table is
// plenty fast without a smarter algorithm.
function editDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const prev = new Array<number>(n + 1)
  const curr = new Array<number>(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j]
  }
  return prev[n]
}

// How well one candidate string (a name or an alias) matches the typed
// query, from 0 (no match) to 1 (exact). Word-boundary matches score highest
// so "neust" matching the start of "NEUST gate" beats a same-length fuzzy
// match buried in an unrelated word.
function stringScore(query: string, candidate: string): number {
  if (!query) return 0
  if (candidate === query) return 1
  if (candidate.startsWith(query)) return 0.9
  if (candidate.includes(` ${query}`)) return 0.85
  if (candidate.includes(query)) return 0.75
  // Typo tolerance: allow roughly one edit per 4 characters typed, so
  // "palengk" (missing the trailing e) or "gasolna" (one letter dropped)
  // still finds their target — matched against the candidate's own leading
  // slice so a short query isn't penalized for the rest of a long name.
  const window = candidate.slice(0, Math.max(query.length, 3) + 2)
  const maxEdits = Math.max(1, Math.floor(query.length / 4))
  const dist = editDistance(query, window)
  if (dist <= maxEdits) return 0.6 - dist * 0.1
  return 0
}

export interface LandmarkMatch {
  landmark: Landmark
  distanceMeters: number | null
}

// Ranked by how well the text matches first, and by distance from the
// rider only to break ties within the same match quality — a landmark two
// towns over that spells out the query exactly shouldn't lose to a
// same-name, weaker match nearby, but two equally good text matches should
// resolve to whichever one the rider is actually closer to.
export function searchLandmarks(
  query: string,
  landmarks: Landmark[],
  near: GeoCoords | null,
  limit = 8,
): LandmarkMatch[] {
  const q = normalize(query)
  if (!q) return []
  const scored = landmarks
    .map((landmark) => {
      const candidates = [landmark.name, ...landmark.aliases].map(normalize)
      const best = Math.max(...candidates.map((c) => stringScore(q, c)))
      const distanceMeters = near ? haversineDistanceMeters(near, landmark.gps) : null
      return { landmark, best, distanceMeters }
    })
    .filter((m) => m.best > 0)
    .sort((a, b) => {
      if (b.best !== a.best) return b.best - a.best
      if (a.distanceMeters == null || b.distanceMeters == null) return 0
      return a.distanceMeters - b.distanceMeters
    })
    .slice(0, limit)
  return scored.map(({ landmark, distanceMeters }) => ({ landmark, distanceMeters }))
}
