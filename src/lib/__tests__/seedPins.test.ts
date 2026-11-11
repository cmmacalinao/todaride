import { describe, expect, it } from 'vitest'
import { MOCK_DRIVERS, MOCK_PASSENGERS, MOCK_PARENTS } from '../../mock/data'

// The seeded roster shipped with each driver's plate number as their PIN —
// UTS-2001 opened with 2001, all the way down. A plate is public: it is
// painted on the sidecar and shown to every passenger who books that driver,
// so anyone who had ridden with them could read their login off the booking
// screen and open their trips and earnings.
//
// These seeded accounts are dispatched to real users during the pilot, so
// this is a guard rather than a style note.
describe('seeded driver PINs are not guessable from anything public', () => {
  it('never repeats the digits of the plate number', () => {
    for (const driver of MOCK_DRIVERS) {
      if (!driver.pin) continue
      const plateDigits = driver.plateNumber.replace(/\D/g, '')
      expect(
        plateDigits.includes(driver.pin),
        `${driver.name} (${driver.plateNumber}) has a PIN readable off the plate`,
      ).toBe(false)
    }
  })

  it('never repeats the last digits of the phone number', () => {
    for (const driver of MOCK_DRIVERS) {
      if (!driver.pin) continue
      const phoneDigits = (driver.phone ?? '').replace(/\D/g, '')
      expect(phoneDigits.endsWith(driver.pin), `${driver.name} has a PIN that is the tail of their phone`).toBe(false)
    }
  })

  it('is not four of the same digit, and no two drivers share one', () => {
    const seen = new Set<string>()
    for (const driver of MOCK_DRIVERS) {
      if (!driver.pin) continue
      expect(/^(\d)\1{3}$/.test(driver.pin), `${driver.name} has a repeated-digit PIN`).toBe(false)
      expect(seen.has(driver.pin), `${driver.name} shares a PIN with another driver`).toBe(false)
      seen.add(driver.pin)
    }
  })
})

// An account with no PIN is deliberate — a child registered by their parent,
// or a parent placeholder a student created — and means "does not sign in
// here". UnifiedAuth now fails closed on those. This pins the shape the
// auth code relies on: a PIN is either absent or a real four digits, never
// an empty string, which would read as "no PIN" in one place and "a PIN that
// matches nothing" in another.
describe('seeded account PINs are absent or four digits, never blank', () => {
  it('holds for every seeded driver, passenger and parent', () => {
    for (const account of [...MOCK_DRIVERS, ...MOCK_PASSENGERS, ...MOCK_PARENTS]) {
      if (account.pin === null || account.pin === undefined) continue
      expect(account.pin, `${account.name} has a blank or malformed PIN`).toMatch(/^\d{4}$/)
    }
  })
})
