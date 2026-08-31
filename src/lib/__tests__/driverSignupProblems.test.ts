import { describe, expect, it } from 'vitest'
import { findDriverSignupProblems, type DriverSignupDraft } from '../driverSignupProblems'
import { DOCUMENT_TYPES } from '../../mock/data'
import type { DriverDocuments } from '../../types'

const NOW = new Date('2026-08-31T00:00:00Z').getTime()
const FUTURE = '2030-01-01'
const PAST = '2020-01-01'

function documents(submitted: boolean): DriverDocuments {
  return Object.fromEntries(
    DOCUMENT_TYPES.map((type) => [type, { submitted, dataUrl: submitted ? 'data:,' : null }]),
  ) as DriverDocuments
}

function draft(overrides: Partial<DriverSignupDraft> = {}): DriverSignupDraft {
  return {
    plateNumber: 'ABC 1234',
    licenseNo: 'N01-23-456789',
    confirmLicenseNo: 'N01-23-456789',
    licenseExpiry: FUTURE,
    address: { province: 'Nueva Ecija', city: 'Science City of Muñoz', barangay: 'Bantug', addressDetail: 'Purok 2' },
    pin: '1234',
    documents: documents(true),
    documentsRequired: true,
    now: NOW,
    ...overrides,
  }
}

describe('what is wrong with a driver signup', () => {
  it('finds nothing wrong with a complete form', () => {
    expect(findDriverSignupProblems(draft())).toEqual([])
  })

  // The whole point of the change: three missing things reported at once,
  // rather than one per press of the button.
  it('reports every problem at once, not just the first', () => {
    const problems = findDriverSignupProblems(
      draft({ plateNumber: '  ', licenseExpiry: '', pin: '12' }),
    )
    expect(problems.map((p) => p.field)).toEqual(['plate', 'expiry', 'pin'])
  })

  it('lists problems in the order the fields appear on screen', () => {
    const problems = findDriverSignupProblems(
      draft({
        pin: '',
        plateNumber: '',
        address: { province: '', city: '', barangay: '', addressDetail: '' },
        licenseNo: '',
      }),
    )
    expect(problems.map((p) => p.field)).toEqual(['plate', 'license', 'address', 'pin'])
  })

  it('names which parts of the address are missing', () => {
    const [problem] = findDriverSignupProblems(
      draft({ address: { province: 'Nueva Ecija', city: '', barangay: '', addressDetail: 'Purok 2' } }),
    )
    expect(problem.field).toBe('address')
    expect(problem.message).toContain('city')
    expect(problem.message).toContain('barangay')
    expect(problem.message).not.toContain('province')
  })

  it('catches a mistyped license confirmation, but not while the first is blank', () => {
    expect(
      findDriverSignupProblems(draft({ confirmLicenseNo: 'N01-23-000000' })).map((p) => p.field),
    ).toEqual(['confirmLicense'])
    // Blank license: say that, and do not also say the two do not match.
    expect(findDriverSignupProblems(draft({ licenseNo: '', confirmLicenseNo: '' })).map((p) => p.field)).toEqual(
      ['license'],
    )
  })

  it('rejects an expired license separately from a missing date', () => {
    expect(findDriverSignupProblems(draft({ licenseExpiry: PAST }))[0].message).toContain('already passed')
    expect(findDriverSignupProblems(draft({ licenseExpiry: '' }))[0].message).toContain('empty')
  })

  it('demands documents only when they are required', () => {
    const none = documents(false)
    expect(
      findDriverSignupProblems(draft({ documents: none, documentsRequired: true })).map((p) => p.field),
    ).toEqual(['documents'])
    // Open signup: the same empty form passes, because the documents are
    // deferred to the grace period rather than waived.
    expect(findDriverSignupProblems(draft({ documents: none, documentsRequired: false }))).toEqual([])
  })
})
