import { describe, expect, it } from 'vitest'
import {
  canApproveDriver,
  DEFAULT_DOCUMENT_GRACE_DAYS,
  DEFAULT_REQUIRED_DOCUMENTS,
  documentsDueByAfterChange,
  documentsDueDate,
  driversNeedingNewDocument,
  isDocumentRequired,
  missingRequiredDocuments,
  requiredDocumentsOrDefault,
} from '../requiredDocuments'
import type { Driver, DriverDocuments } from '../../types'

const docs = (submitted: Partial<Record<keyof DriverDocuments, boolean>>): DriverDocuments =>
  ({
    nbiClearance: { submitted: !!submitted.nbiClearance, dataUrl: null },
    driversLicense: { submitted: !!submitted.driversLicense, dataUrl: null },
    ltoRegistration: { submitted: !!submitted.ltoRegistration, dataUrl: null },
    lguRegistration: { submitted: !!submitted.lguRegistration, dataUrl: null },
  }) as DriverDocuments

const driver = (id: string, over: Partial<Driver> = {}): Driver =>
  ({ id, name: id, verificationStatus: 'approved', documents: docs({}), ...over }) as Driver

describe('which documents are required', () => {
  it('requires the two that say whether somebody may legally carry a passenger', () => {
    expect(DEFAULT_REQUIRED_DOCUMENTS).toEqual(['driversLicense', 'ltoRegistration'])
  })

  // A missing setting must never read as an open door.
  it('falls back to the defaults when nothing is configured', () => {
    expect(requiredDocumentsOrDefault(undefined)).toEqual(DEFAULT_REQUIRED_DOCUMENTS)
    expect(requiredDocumentsOrDefault(null)).toEqual(DEFAULT_REQUIRED_DOCUMENTS)
    expect(requiredDocumentsOrDefault([])).toEqual(DEFAULT_REQUIRED_DOCUMENTS)
  })

  it('ignores a document type it does not recognise', () => {
    expect(requiredDocumentsOrDefault(['driversLicense', 'nonsense' as never])).toEqual(['driversLicense'])
  })

  it('answers for a single type', () => {
    expect(isDocumentRequired('driversLicense', null)).toBe(true)
    expect(isDocumentRequired('nbiClearance', null)).toBe(false)
    expect(isDocumentRequired('nbiClearance', ['nbiClearance'])).toBe(true)
  })
})

describe('approving a driver', () => {
  // The case this whole change exists for: a driver standing in front of an
  // admin with a licence and a registration, NBI clearance still queued for.
  it('approves on the required documents alone', () => {
    const d = docs({ driversLicense: true, ltoRegistration: true })
    expect(canApproveDriver(d, null)).toBe(true)
    expect(missingRequiredDocuments(d, null)).toEqual([])
  })

  it('refuses while a required document is missing', () => {
    const d = docs({ driversLicense: true })
    expect(canApproveDriver(d, null)).toBe(false)
    expect(missingRequiredDocuments(d, null)).toEqual(['ltoRegistration'])
  })

  it('does not care about optional documents either way', () => {
    const without = docs({ driversLicense: true, ltoRegistration: true })
    const with_ = docs({ driversLicense: true, ltoRegistration: true, nbiClearance: true })
    expect(canApproveDriver(without, null)).toBe(canApproveDriver(with_, null))
  })

  it('refuses a driver with no documents at all', () => {
    expect(canApproveDriver(undefined, null)).toBe(false)
    expect(missingRequiredDocuments(undefined, null)).toEqual(DEFAULT_REQUIRED_DOCUMENTS)
  })

  it('follows a changed configuration', () => {
    const d = docs({ driversLicense: true, ltoRegistration: true })
    expect(canApproveDriver(d, ['nbiClearance'])).toBe(false)
  })
})

describe('when a document becomes required', () => {
  const approvedWithoutNbi = driver('d1', { documents: docs({ driversLicense: true, ltoRegistration: true }) })
  const approvedWithNbi = driver('d2', {
    documents: docs({ driversLicense: true, ltoRegistration: true, nbiClearance: true }),
  })
  const pending = driver('d3', { verificationStatus: 'pending', documents: docs({}) })

  it('finds the approved drivers now short of it', () => {
    const affected = driversNeedingNewDocument(
      [approvedWithoutNbi, approvedWithNbi, pending],
      ['driversLicense', 'ltoRegistration', 'nbiClearance'],
    )
    expect(affected.map((d) => d.id)).toEqual(['d1'])
  })

  it('leaves everyone alone when nothing new is required', () => {
    expect(driversNeedingNewDocument([approvedWithoutNbi, approvedWithNbi], null)).toEqual([])
  })

  it('gives a deadline the configured number of days out', () => {
    const now = Date.parse('2026-10-01T00:00:00.000Z')
    expect(documentsDueDate(now, 30)).toBe(new Date(now + 30 * 864e5).toISOString())
    expect(documentsDueDate(now)).toBe(new Date(now + DEFAULT_DOCUMENT_GRACE_DAYS * 864e5).toISOString())
  })

  it('falls back to the default for a nonsense grace period', () => {
    const now = Date.parse('2026-10-01T00:00:00.000Z')
    expect(documentsDueDate(now, -5)).toBe(new Date(now + DEFAULT_DOCUMENT_GRACE_DAYS * 864e5).toISOString())
    expect(documentsDueDate(now, Number.NaN)).toBe(new Date(now + DEFAULT_DOCUMENT_GRACE_DAYS * 864e5).toISOString())
  })

  // A driver two weeks into a thirty-day window should not get a fresh
  // thirty days because an admin toggled an unrelated checkbox.
  it('keeps a deadline somebody has already been given', () => {
    const existing = '2026-10-20T00:00:00.000Z'
    expect(documentsDueByAfterChange({ existingDueBy: existing, nowMs: Date.now() })).toBe(existing)
  })

  it('stamps a new deadline when there is none', () => {
    const now = Date.parse('2026-10-01T00:00:00.000Z')
    expect(documentsDueByAfterChange({ existingDueBy: null, nowMs: now, graceDays: 10 })).toBe(
      new Date(now + 10 * 864e5).toISOString(),
    )
  })
})
