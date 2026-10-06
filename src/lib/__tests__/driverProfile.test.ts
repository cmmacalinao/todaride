import { describe, expect, it } from 'vitest'
import {
  buildPublicDriverProfile,
  checkedDocuments,
  completedTripCount,
  driverSinceLabel,
  mayViewDriverProfile,
  PROFILE_REVIEW_COUNT,
  recentReviews,
} from '../driverProfile'
import type { Driver, DriverDocuments, Ride } from '../../types'

const docs = (submitted: Partial<Record<keyof DriverDocuments, boolean>>): DriverDocuments =>
  ({
    nbiClearance: { submitted: !!submitted.nbiClearance, dataUrl: null },
    driversLicense: { submitted: !!submitted.driversLicense, dataUrl: null },
    ltoRegistration: { submitted: !!submitted.ltoRegistration, dataUrl: null },
    lguRegistration: { submitted: !!submitted.lguRegistration, dataUrl: null },
  }) as DriverDocuments

const ride = (over: Partial<Ride>): Ride =>
  ({
    id: 'r',
    driverId: 'd1',
    passengerId: 'p1',
    status: 'completed',
    requestedAt: '2026-09-01T00:00:00.000Z',
    completedAt: '2026-09-01T00:20:00.000Z',
    driverRating: null,
    driverReviewText: null,
    bookedByParentId: null,
    ...over,
  }) as Ride

const driver = (over: Partial<Driver> = {}): Driver =>
  ({
    id: 'd1',
    name: 'Mang Ben',
    plateNumber: 'ABC 7788',
    rating: 4.8,
    ratingCount: 24,
    verificationStatus: 'approved',
    documents: docs({ driversLicense: true, ltoRegistration: true }),
    approvedAt: '2026-03-14T02:30:00.000Z',
    ...over,
  }) as Driver

describe('completedTripCount', () => {
  it('counts only this driver and only finished rides', () => {
    const rides = [
      ride({ id: 'a' }),
      ride({ id: 'b' }),
      ride({ id: 'c', status: 'cancelled' }),
      ride({ id: 'd', status: 'ongoing' }),
      ride({ id: 'e', driverId: 'd2' }),
    ]
    expect(completedTripCount(rides, 'd1')).toBe(2)
  })

  it('is zero for a driver who has not finished one yet', () => {
    expect(completedTripCount([ride({ status: 'requested' })], 'd1')).toBe(0)
    expect(completedTripCount([], 'd1')).toBe(0)
  })
})

describe('recentReviews', () => {
  it('takes the newest reviews that actually say something', () => {
    const rides = [
      ride({ id: '1', completedAt: '2026-09-01T00:00:00.000Z', driverRating: 5, driverReviewText: 'oldest' }),
      ride({ id: '2', completedAt: '2026-09-20T00:00:00.000Z', driverRating: 4, driverReviewText: 'newest' }),
      ride({ id: '3', completedAt: '2026-09-10T00:00:00.000Z', driverRating: 5, driverReviewText: 'middle' }),
    ]
    expect(recentReviews(rides, 'd1').map((r) => r.text)).toEqual(['newest', 'middle', 'oldest'])
  })

  // A star rating with no words is not a review; a blank card pads the list
  // and tells the reader nothing.
  it('skips a rating with no words, and whitespace-only text', () => {
    const rides = [
      ride({ id: '1', driverRating: 5, driverReviewText: null }),
      ride({ id: '2', driverRating: 5, driverReviewText: '   ' }),
      ride({ id: '3', driverRating: 5, driverReviewText: '  mabait  ' }),
    ]
    const got = recentReviews(rides, 'd1')
    expect(got).toHaveLength(1)
    expect(got[0].text).toBe('mabait')
  })

  it('skips review text with no rating attached', () => {
    expect(recentReviews([ride({ driverRating: null, driverReviewText: 'words' })], 'd1')).toEqual([])
  })

  it('ignores another driver and unfinished rides', () => {
    const rides = [
      ride({ id: '1', driverId: 'd2', driverRating: 5, driverReviewText: 'not mine' }),
      ride({ id: '2', status: 'cancelled', driverRating: 1, driverReviewText: 'cancelled' }),
    ]
    expect(recentReviews(rides, 'd1')).toEqual([])
  })

  it('caps the list', () => {
    const rides = Array.from({ length: 9 }, (_, i) =>
      ride({
        id: String(i),
        completedAt: `2026-09-1${i}T00:00:00.000Z`,
        driverRating: 5,
        driverReviewText: `review ${i}`,
      }),
    )
    expect(recentReviews(rides, 'd1')).toHaveLength(PROFILE_REVIEW_COUNT)
    expect(recentReviews(rides, 'd1', 2)).toHaveLength(2)
  })

  // A small town plus a dated review names the rider as surely as a byline.
  it('never carries the passenger who wrote it', () => {
    const got = recentReviews([ride({ driverRating: 5, driverReviewText: 'salamat' })], 'd1')
    expect(Object.keys(got[0]).sort()).toEqual(['at', 'rating', 'text'])
  })
})

describe('driverSinceLabel', () => {
  it('gives month and year only, never the exact day', () => {
    const label = driverSinceLabel('2026-03-14T02:30:00.000Z')
    expect(label).toMatch(/2026/)
    expect(label).not.toMatch(/14/)
  })

  it('is absent when nobody recorded an approval date', () => {
    expect(driverSinceLabel(null)).toBeNull()
    expect(driverSinceLabel(undefined)).toBeNull()
    expect(driverSinceLabel('not a date')).toBeNull()
  })
})

describe('checkedDocuments', () => {
  // The tick should mean what the platform enforces today. An NBI clearance
  // on file while NBI is optional is not what "verified" claims.
  it('ticks only documents that are required now AND submitted', () => {
    const d = driver({ documents: docs({ driversLicense: true, ltoRegistration: true, nbiClearance: true }) })
    expect([...checkedDocuments(d, null)].sort()).toEqual(['driversLicense', 'ltoRegistration'])
  })

  it('does not tick a required document that is missing', () => {
    const d = driver({ documents: docs({ driversLicense: true }) })
    expect(checkedDocuments(d, null)).toEqual(['driversLicense'])
  })

  it('follows the configured set', () => {
    const d = driver({ documents: docs({ driversLicense: true, nbiClearance: true }) })
    expect(checkedDocuments(d, ['nbiClearance'])).toEqual(['nbiClearance'])
  })

  it('ticks nothing for a driver with no documents on file', () => {
    expect(checkedDocuments({ documents: undefined } as unknown as Driver, null)).toEqual([])
  })
})

describe('mayViewDriverProfile', () => {
  it('lets a passenger who rode with this driver look', () => {
    const rides = [ride({ passengerId: 'p1', status: 'ongoing' })]
    expect(mayViewDriverProfile({ rides, driverId: 'd1', passengerId: 'p1' })).toBe(true)
  })

  it('lets the parent who booked the ride look', () => {
    const rides = [ride({ passengerId: 'kid', bookedByParentId: 'mum' })]
    expect(mayViewDriverProfile({ rides, driverId: 'd1', passengerId: 'mum' })).toBe(true)
  })

  // Otherwise the app is a browsable directory of drivers' faces and plates.
  it('refuses a stranger, and refuses anonymous callers', () => {
    const rides = [ride({ passengerId: 'p1' })]
    expect(mayViewDriverProfile({ rides, driverId: 'd1', passengerId: 'p2' })).toBe(false)
    expect(mayViewDriverProfile({ rides, driverId: 'd1', passengerId: null })).toBe(false)
    expect(mayViewDriverProfile({ rides: [], driverId: 'd1', passengerId: 'p1' })).toBe(false)
  })

  it('refuses a different driver than the one they rode with', () => {
    const rides = [ride({ driverId: 'd1', passengerId: 'p1' })]
    expect(mayViewDriverProfile({ rides, driverId: 'd9', passengerId: 'p1' })).toBe(false)
  })
})

describe('buildPublicDriverProfile', () => {
  const rides = [ride({ id: '1', driverRating: 5, driverReviewText: 'mabilis' }), ride({ id: '2' })]

  it('carries what a passenger getting into a stranger’s tricycle needs', () => {
    const p = buildPublicDriverProfile({
      driver: driver({ bodyNumber: '07', vehicleDescription: 'Blue sidecar, yellow roof' }),
      rides,
      todaName: 'Bantug TODA',
      configuredRequired: null,
    })
    expect(p.name).toBe('Mang Ben')
    expect(p.todaName).toBe('Bantug TODA')
    expect(p.bodyNumber).toBe('07')
    expect(p.plateNumber).toBe('ABC 7788')
    expect(p.vehicleDescription).toBe('Blue sidecar, yellow roof')
    expect(p.rating).toBe(4.8)
    expect(p.ratingCount).toBe(24)
    expect(p.completedTrips).toBe(2)
    expect(p.reviews).toHaveLength(1)
    expect([...p.checkedDocuments].sort()).toEqual(['driversLicense', 'ltoRegistration'])
  })

  // A pending photo has not been looked at, and the review is what stops a
  // driver uploading somebody else's face.
  it('shows a photo only once an admin has approved it', () => {
    const photo = 'data:image/jpeg;base64,AAAA'
    const shown = (status?: 'pending' | 'approved' | 'rejected') =>
      buildPublicDriverProfile({
        driver: driver({ profilePhotoDataUrl: photo, profilePhotoStatus: status }),
        rides: [],
        todaName: null,
        configuredRequired: null,
      }).photoDataUrl
    expect(shown('approved')).toBe(photo)
    expect(shown('pending')).toBeNull()
    expect(shown('rejected')).toBeNull()
    expect(shown(undefined)).toBeNull()
  })

  it('copes with a driver missing every optional field', () => {
    const p = buildPublicDriverProfile({
      driver: { id: 'd1', name: 'Bare', documents: docs({}) } as unknown as Driver,
      rides: [],
      todaName: null,
      configuredRequired: null,
    })
    expect(p.bodyNumber).toBeNull()
    expect(p.vehicleDescription).toBeNull()
    expect(p.driverSince).toBeNull()
    expect(p.rating).toBe(0)
    expect(p.completedTrips).toBe(0)
  })

  // The asymmetry this guards: the passenger is choosing one ride, the driver
  // is exposed to every passenger they ever carry and cannot take any of it
  // back. A field added to Driver later must not surface here by accident.
  describe('privacy', () => {
    const loaded = driver({
      phone: '+639171234567',
      address: '12 Maharlika St, Bantug',
      licenseNo: 'N02-99-887766',
      pin: '5150',
      nbiClearanceNo: 'NBI-55443322',
      documents: docs({ driversLicense: true, ltoRegistration: true, nbiClearance: true }),
      earningsToday: 1450,
      partnerCode: 'PARTNER-XYZ',
      referralCode: 'REF-ABC',
      email: 'ben@example.com',
      deviceToken: 'tok-123',
    } as unknown as Partial<Driver>)

    const built = buildPublicDriverProfile({
      driver: loaded,
      rides,
      todaName: 'Bantug TODA',
      configuredRequired: null,
    })

    it('exposes exactly the agreed fields and no others', () => {
      expect(Object.keys(built).sort()).toEqual([
        'bodyNumber',
        'checkedDocuments',
        'completedTrips',
        'driverSince',
        'id',
        'name',
        'photoDataUrl',
        'plateNumber',
        'rating',
        'ratingCount',
        'reviews',
        'todaName',
        'vehicleDescription',
      ])
    })

    it('leaks no sensitive value anywhere in the built profile', () => {
      const serialised = JSON.stringify(built)
      for (const secret of [
        '+639171234567',
        'Maharlika',
        'N02-99-887766',
        '5150',
        'NBI-55443322',
        '1450',
        'PARTNER-XYZ',
        'REF-ABC',
        'ben@example.com',
        'tok-123',
      ]) {
        expect(serialised).not.toContain(secret)
      }
    })

    it('carries no document photographs, only which ones were checked', () => {
      const withPhotos = driver({
        documents: {
          nbiClearance: { submitted: true, dataUrl: 'data:image/jpeg;base64,NBIPHOTO' },
          driversLicense: { submitted: true, dataUrl: 'data:image/jpeg;base64,LICENCEPHOTO' },
          ltoRegistration: { submitted: true, dataUrl: 'data:image/jpeg;base64,LTOPHOTO' },
          lguRegistration: { submitted: true, dataUrl: 'data:image/jpeg;base64,LGUPHOTO' },
        } as unknown as DriverDocuments,
      })
      const p = buildPublicDriverProfile({
        driver: withPhotos,
        rides: [],
        todaName: null,
        configuredRequired: null,
      })
      expect(JSON.stringify(p)).not.toContain('PHOTO')
      expect([...p.checkedDocuments].sort()).toEqual(['driversLicense', 'ltoRegistration'])
    })
  })
})
