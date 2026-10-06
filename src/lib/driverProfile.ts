import type { DocumentType, Driver, Ride } from '../types'
import { isDocumentRequired } from './requiredDocuments'

// What a passenger may see about their driver, and nothing else.
//
// A passenger about to get into a stranger's tricycle has a real need to know
// who the person is: that somebody checked their papers, that other people
// have ridden with them, which TODA will answer for them. That is what this
// builds.
//
// The driver has an equally real need not to be handed over. The same screen
// could trivially show a phone number, a home address, a licence number or a
// photograph of a government ID — all of it already on the Driver record —
// and a driver has no way to take any of it back once a passenger has it. The
// asymmetry matters: the passenger is choosing one ride, the driver is
// exposed to every passenger they ever carry.
//
// So this module returns a deliberately narrow shape rather than a filtered
// Driver. Picking fields to include means a field added to Driver later is
// absent here by default; filtering fields out means a new field is exposed
// by default and somebody has to notice. The test asserts the absence
// directly, so that stays true.

export interface PublicDriverProfile {
  id: string
  name: string
  todaName: string | null
  // Only an approved photo is ever shown. A pending one has not been looked
  // at, and the review is the point: it is what stops a driver uploading
  // somebody else's face, or something a passenger should not be shown.
  photoDataUrl: string | null
  bodyNumber: string | null
  plateNumber: string | null
  vehicleDescription: string | null
  rating: number
  ratingCount: number
  completedTrips: number
  // Month and year only. The exact day adds nothing a passenger needs and
  // narrows down when somebody signed up.
  driverSince: string | null
  // Documents that are required today AND approved. See requiredDocuments:
  // the tick should mean what the platform enforces now.
  checkedDocuments: DocumentType[]
  reviews: PublicReview[]
}

export interface PublicReview {
  rating: number
  text: string
  // ISO; the UI renders it as "3 weeks ago". No passenger name, ever — a
  // small town and a dated review name the rider as surely as a byline.
  at: string
}

export const PROFILE_REVIEW_COUNT = 5

export function completedTripCount(rides: Ride[], driverId: string): number {
  return rides.filter((r) => r.driverId === driverId && r.status === 'completed').length
}

// The newest reviews that actually say something.
//
// An empty review attached to a star rating is not a review; showing a blank
// card would pad the list and tell the reader nothing.
export function recentReviews(rides: Ride[], driverId: string, limit = PROFILE_REVIEW_COUNT): PublicReview[] {
  return rides
    .filter(
      (r) =>
        r.driverId === driverId &&
        r.status === 'completed' &&
        typeof r.driverReviewText === 'string' &&
        r.driverReviewText.trim().length > 0 &&
        typeof r.driverRating === 'number',
    )
    .sort((a, b) => Date.parse(b.completedAt ?? b.requestedAt) - Date.parse(a.completedAt ?? a.requestedAt))
    .slice(0, limit)
    .map((r) => ({
      rating: r.driverRating as number,
      text: (r.driverReviewText as string).trim(),
      at: r.completedAt ?? r.requestedAt,
    }))
}

export function driverSinceLabel(approvedAt: string | null | undefined): string | null {
  if (!approvedAt) return null
  const d = new Date(approvedAt)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })
}

export function checkedDocuments(
  driver: Pick<Driver, 'documents'>,
  configuredRequired: DocumentType[] | undefined | null,
): DocumentType[] {
  const docs = driver.documents
  if (!docs) return []
  return (Object.keys(docs) as DocumentType[]).filter(
    (t) => isDocumentRequired(t, configuredRequired) && docs[t]?.submitted,
  )
}

// Whether this passenger is allowed to look at all.
//
// Not every driver is public. A passenger may see the profile of a driver
// they have actually ridden with, or are riding with now — which is the
// moment the information is for. Otherwise the app would be a directory of
// drivers' faces and vehicles that anyone could browse.
export function mayViewDriverProfile(args: {
  rides: Ride[]
  driverId: string
  passengerId: string | null
}): boolean {
  if (!args.passengerId) return false
  return args.rides.some(
    (r) =>
      r.driverId === args.driverId &&
      (r.passengerId === args.passengerId ||
        r.bookedByParentId === args.passengerId ||
        r.familyBookerId === args.passengerId ||
        r.familyPayerId === args.passengerId),
  )
}

export function buildPublicDriverProfile(args: {
  driver: Driver
  rides: Ride[]
  todaName: string | null
  configuredRequired: DocumentType[] | undefined | null
}): PublicDriverProfile {
  const { driver, rides, todaName, configuredRequired } = args
  return {
    id: driver.id,
    name: driver.name,
    todaName,
    photoDataUrl: driver.profilePhotoStatus === 'approved' ? (driver.profilePhotoDataUrl ?? null) : null,
    bodyNumber: driver.bodyNumber ?? null,
    plateNumber: driver.plateNumber ?? null,
    vehicleDescription: driver.vehicleDescription ?? null,
    rating: driver.rating ?? 0,
    ratingCount: driver.ratingCount ?? 0,
    completedTrips: completedTripCount(rides, driver.id),
    driverSince: driverSinceLabel(driver.approvedAt),
    checkedDocuments: checkedDocuments(driver, configuredRequired),
    reviews: recentReviews(rides, driver.id),
  }
}
