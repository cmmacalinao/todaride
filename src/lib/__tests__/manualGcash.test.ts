import { describe, expect, it } from 'vitest'
import {
  SAMPLE_GCASH_NUMBER,
  canCollectGcash,
  formatGcashNumber,
  gcashSendLink,
  isGcashAccountReady,
  isGcashNumber,
  isPlausibleGcashReference,
  isSampleGcashAccount,
  normaliseGcashNumber,
  normaliseReference,
} from '../manualGcash'

const account = (accountNumber: string, accountName = 'Juan Dela Cruz') => ({
  accountName,
  accountNumber,
  qrDataUrl: null,
})

describe('the number money is sent to', () => {
  it('reads a number however it was written down', () => {
    expect(normaliseGcashNumber('0917-800-2020')).toBe('09178002020')
    expect(normaliseGcashNumber(' 0917 800 2020 ')).toBe('09178002020')
    expect(isGcashNumber('0917-800-2020')).toBe(true)
  })

  it('refuses anything that is not a mobile number', () => {
    // Every one of these would take a fare somewhere nobody can collect it.
    expect(isGcashNumber('')).toBe(false)
    expect(isGcashNumber('0917800202')).toBe(false)
    expect(isGcashNumber('091780020201')).toBe(false)
    expect(isGcashNumber('6391780020')).toBe(false)
    expect(isGcashNumber('call me')).toBe(false)
  })

  it('prints it the way GCash does', () => {
    expect(formatGcashNumber('09178002020')).toBe('0917 800 2020')
    expect(formatGcashNumber('0917-800-2020')).toBe('0917 800 2020')
  })

  it('leaves something that is not a number alone rather than grouping it', () => {
    expect(formatGcashNumber('ask the driver')).toBe('ask the driver')
  })
})

describe('whether an account can be shown as a payment target', () => {
  it('needs both a name and a number', () => {
    expect(isGcashAccountReady(account('09178002020'))).toBe(true)
    expect(isGcashAccountReady(account('09178002020', '   '))).toBe(false)
    expect(isGcashAccountReady(account('09178'))).toBe(false)
    expect(isGcashAccountReady(null)).toBe(false)
  })

  it('knows the sample number the app ships with', () => {
    // Shown as a warning, not hidden: a pilot that collects real fares into
    // the example number is sending strangers money.
    expect(isSampleGcashAccount(account(SAMPLE_GCASH_NUMBER))).toBe(true)
    expect(isSampleGcashAccount(account('0917-800-2020'))).toBe(true)
    expect(isSampleGcashAccount(account('09298052527'))).toBe(false)
  })
})

describe('the hand-off into GCash', () => {
  it('carries the recipient and the fare', () => {
    expect(gcashSendLink(account('0917-800-2020'), 85)).toBe('gcash://send?recipient=09178002020&amount=85')
  })

  it('refuses to build a link that could send money nowhere', () => {
    expect(gcashSendLink(account('0917'), 85)).toBeNull()
    expect(gcashSendLink(null, 85)).toBeNull()
  })

  it('refuses an amount that is not a fare', () => {
    expect(gcashSendLink(account('09178002020'), 0)).toBeNull()
    expect(gcashSendLink(account('09178002020'), -85)).toBeNull()
    expect(gcashSendLink(account('09178002020'), Number.NaN)).toBeNull()
  })
})

describe('the reference off the receipt', () => {
  it('takes it however it was copied', () => {
    expect(normaliseReference('1029 383 827 362')).toBe('1029383827362')
    expect(normaliseReference('Ref. No. 1029-383-827-362')).toBe('1029383827362')
    expect(isPlausibleGcashReference('1029 383 827 362')).toBe(true)
  })

  it('rejects a typo rather than recording it as a payment', () => {
    expect(isPlausibleGcashReference('')).toBe(false)
    expect(isPlausibleGcashReference('123')).toBe(false)
    expect(isPlausibleGcashReference('paid na po')).toBe(false)
  })

  it('rejects something far too long to be a reference', () => {
    expect(isPlausibleGcashReference('1'.repeat(25))).toBe(false)
  })
})

describe('whether fares may be collected into it', () => {
  it('needs a real account, not just a well-formed one', () => {
    expect(canCollectGcash(account('09298052527'))).toBe(true)
    // Well-formed, and somebody else's.
    expect(canCollectGcash(account(SAMPLE_GCASH_NUMBER))).toBe(false)
    expect(canCollectGcash(account('0917'))).toBe(false)
    expect(canCollectGcash(null)).toBe(false)
  })
})
