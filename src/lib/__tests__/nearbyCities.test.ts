import { describe, expect, it } from 'vitest'
import { MOCK_LANDMARKS } from '../../mock/data'
import { nearbyCities, searchLandmarksNearCity } from '../landmarkSearch'
import type { Landmark } from '../../types'

const place = (id: string, name: string, city: string, lat: number, lng: number): Landmark => ({
  id,
  name,
  aliases: [],
  category: 'other',
  city,
  gps: { lat, lng },
  todaOrgId: null,
})

describe('nearbyCities', () => {
  it('names the towns around San Jose City and leaves the far ones out', () => {
    const near = nearbyCities('San Jose City', MOCK_LANDMARKS)
    // eslint-disable-next-line no-console
    console.log('near San Jose City:', near.join(', '))
    expect(near).toContain('Science City of Muñoz')
    expect(near).not.toContain('San Jose City')
    expect(near).not.toContain('Cabanatuan City')
    expect(near).not.toContain('Gapan City')
  })
})

describe('searchLandmarksNearCity', () => {
  const landmarks = [
    place('a', 'Poblacion', 'Town A', 15.8, 121.0),
    place('b', 'Poblacion', 'Town B', 15.72, 120.92), // ~12 km away: a neighbour
    place('c', 'Poblacion', 'Town C', 15.2, 121.0), // ~67 km away: too far
  ]

  it('puts the chosen city first, then its neighbours, and never a far town', () => {
    const found = searchLandmarksNearCity('poblacion', landmarks, 'Town A', null)
    expect(found.map((m) => m.landmark.city)).toEqual(['Town A', 'Town B'])
  })

  it('searches everything when no city is chosen', () => {
    const found = searchLandmarksNearCity('poblacion', landmarks, undefined, null)
    expect(found).toHaveLength(3)
  })
})
