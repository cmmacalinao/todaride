import { DOCUMENT_LABELS, DOCUMENT_TYPES } from '../mock/data'
import type { DriverDocuments } from '../types'

// What is wrong with a driver's signup, field by field.
//
// The form used to answer with one sentence naming five fields at once, and
// left the driver to work out which of them applied to them — on a phone, at
// a terminal, with a queue behind them. This returns every failure, so
// someone with three things missing is told three things once rather than
// pressing the button three times to discover them one at a time.
//
// Kept out of the component so it can be tested without rendering a form or
// getting past an OTP step, which needs either an SMS to a real phone or a
// shared setting changed for everybody.
export type ProblemField =
  // Declared in the order the fields appear on screen. That is the order they
  // are listed back, and the order the first problem is picked from — a list
  // that jumps around the form is a list nobody reads twice.
  'plate' | 'license' | 'confirmLicense' | 'expiry' | 'address' | 'emergencyContact' | 'pin' | 'documents'

export interface Problem {
  field: ProblemField
  message: string
}

export interface DriverSignupDraft {
  plateNumber: string
  licenseNo: string
  confirmLicenseNo: string
  licenseExpiry: string
  address: { province: string; city: string; barangay: string; addressDetail: string }
  // Someone to call if something happens to the driver on the road. Checked
  // when given; the registration form always gives it.
  emergencyContact?: { name: string; phone: string; driverPhone: string }
  pin: string
  documents: DriverDocuments
  // When open signup is on, documents are deferred rather than demanded —
  // see the grace period in Super Admin.
  documentsRequired: boolean
  now?: number
}

export function findDriverSignupProblems(draft: DriverSignupDraft): Problem[] {
  const now = draft.now ?? Date.now()
  const found: Problem[] = []

  if (!draft.plateNumber.trim()) {
    found.push({ field: 'plate', message: 'Tricycle plate number is empty.' })
  }

  if (!draft.licenseNo.trim()) {
    found.push({ field: 'license', message: "Driver's license number is empty." })
  } else if (draft.licenseNo.trim() !== draft.confirmLicenseNo.trim()) {
    // Only worth saying once there is something to compare against. Telling
    // somebody the two do not match while the first is still blank is true
    // and unhelpful.
    found.push({
      field: 'confirmLicense',
      message: "The two license numbers don't match — check both against your license.",
    })
  }

  if (!draft.licenseExpiry) {
    found.push({ field: 'expiry', message: 'License expiry date is empty.' })
  } else if (new Date(draft.licenseExpiry).getTime() <= now) {
    found.push({
      field: 'expiry',
      message: "That expiry date has already passed — an expired license can't be used to register.",
    })
  }

  const missingAddress = [
    !draft.address.province && 'province',
    !draft.address.city && 'city',
    !draft.address.barangay && 'barangay',
    !draft.address.addressDetail.trim() && 'street address',
  ].filter(Boolean)
  if (missingAddress.length > 0) {
    found.push({
      field: 'address',
      message: `Home address still needs your ${missingAddress.join(', ')}.`,
    })
  }

  if (draft.emergencyContact) {
    const digits = (v: string) => v.replace(/\D/g, '')
    const { name, phone, driverPhone } = draft.emergencyContact
    const missing = [!name.trim() && 'name', !phone.trim() && 'phone number'].filter(Boolean)
    if (missing.length > 0) {
      found.push({ field: 'emergencyContact', message: `Emergency contact still needs a ${missing.join(' and ')}.` })
    } else if (digits(phone).length < 7) {
      found.push({ field: 'emergencyContact', message: "The emergency contact's number looks too short." })
    } else if (digits(driverPhone) && digits(phone) === digits(driverPhone)) {
      // The one number that is no use when the driver cannot answer.
      found.push({ field: 'emergencyContact', message: 'The emergency contact must be someone else — that is your own number.' })
    }
  }

  if (draft.pin.length !== 4) {
    found.push({ field: 'pin', message: 'PIN must be exactly 4 digits.' })
  }

  if (draft.documentsRequired) {
    const missingDocs = DOCUMENT_TYPES.filter((type) => !draft.documents[type].submitted)
    if (missingDocs.length > 0) {
      found.push({
        field: 'documents',
        message: `Still to upload: ${missingDocs.map((type) => DOCUMENT_LABELS[type]).join(', ')}.`,
      })
    }
  }

  return found
}
