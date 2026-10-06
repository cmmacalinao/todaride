import type { DocumentType, Driver, DriverDocuments } from '../types'
import { DOCUMENT_TYPES } from '../mock/data'

// Which driver documents actually block, and which are nice to have.
//
// Every document used to be required to approve a driver, which is the right
// default for a mature operation and the wrong one for a TODA signing up its
// members this week. An NBI clearance takes days to obtain and costs money; a
// barangay or LGU permit may not exist yet for a driver whose franchise is
// held by the operator. Insisting on all four meant a driver standing in
// front of an admin, licence and registration in hand, could not be approved.
//
// So the set is configurable, and the two that are genuinely about whether
// this person may legally carry a passenger — the driver's licence and the
// LTO registration of the tricycle — are required by default. The other two
// are collected, shown, and chased, but do not stop somebody driving.
//
// The honest cost of this is that "verified driver" means less than it did.
// It is still the right trade for the pilot, and it is why the passenger's
// profile sheet only ticks documents that are *currently required and
// approved* rather than everything on file: the badge should mean what the
// platform actually enforces today, not what it once hoped to.

export const DEFAULT_REQUIRED_DOCUMENTS: DocumentType[] = ['driversLicense', 'ltoRegistration']

export const DOCUMENT_LABEL: Record<DocumentType, string> = {
  nbiClearance: 'NBI clearance',
  driversLicense: "Driver's license",
  ltoRegistration: 'LTO registration',
  lguRegistration: 'LGU / barangay permit',
}

// Days a driver gets to produce a document that has just become required.
export const DEFAULT_DOCUMENT_GRACE_DAYS = 30

export function requiredDocumentsOrDefault(configured: DocumentType[] | undefined | null): DocumentType[] {
  // An unset list means the defaults, not "nothing is required". A missing
  // setting must never read as an open door.
  if (!configured) return [...DEFAULT_REQUIRED_DOCUMENTS]
  const valid = configured.filter((t) => DOCUMENT_TYPES.includes(t))
  return valid.length > 0 ? valid : [...DEFAULT_REQUIRED_DOCUMENTS]
}

export function isDocumentRequired(
  type: DocumentType,
  configured: DocumentType[] | undefined | null,
): boolean {
  return requiredDocumentsOrDefault(configured).includes(type)
}

// Which required documents this driver has not handed in.
export function missingRequiredDocuments(
  documents: DriverDocuments | undefined,
  configured: DocumentType[] | undefined | null,
): DocumentType[] {
  const required = requiredDocumentsOrDefault(configured)
  if (!documents) return required
  return required.filter((t) => !documents[t]?.submitted)
}

// Whether a signup may be submitted, or an admin may approve.
//
// Optional documents are deliberately not consulted: an admin looking at a
// driver with a licence and a registration should be able to approve them
// while the NBI clearance is still being queued for.
export function canApproveDriver(
  documents: DriverDocuments | undefined,
  configured: DocumentType[] | undefined | null,
): boolean {
  return missingRequiredDocuments(documents, configured).length === 0
}

// A driver who was approved under a looser rule and is now short of a
// document that has since become required.
//
// They are not un-approved for it — they were approved honestly under the
// rule in force, and pulling their livelihood for a rule change made this
// morning would be unjust. They get a deadline instead.
export function driversNeedingNewDocument(
  drivers: Driver[],
  configured: DocumentType[] | undefined | null,
): Driver[] {
  return drivers.filter(
    (d) => d.verificationStatus === 'approved' && missingRequiredDocuments(d.documents, configured).length > 0,
  )
}

export function documentsDueDate(fromMs: number, graceDays: number = DEFAULT_DOCUMENT_GRACE_DAYS): string {
  const days = Number.isFinite(graceDays) && graceDays > 0 ? Math.round(graceDays) : DEFAULT_DOCUMENT_GRACE_DAYS
  return new Date(fromMs + days * 24 * 60 * 60 * 1000).toISOString()
}

// The deadline to stamp on a driver when a document becomes required.
//
// An existing deadline is kept rather than pushed out: a driver already two
// weeks into a thirty-day window should not get a fresh thirty days because
// an admin toggled an unrelated checkbox. The date somebody was given is the
// date they were given.
export function documentsDueByAfterChange(args: {
  existingDueBy: string | null | undefined
  nowMs: number
  graceDays?: number
}): string {
  if (args.existingDueBy) return args.existingDueBy
  return documentsDueDate(args.nowMs, args.graceDays)
}
