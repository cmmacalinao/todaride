import { describe, expect, it } from 'vitest'
import {
  REFERENCE_DIGITS,
  SIMULATED_OPENING_BALANCE,
  balanceAfter,
  canAfford,
  formatBalance,
  groupReference,
  simulatedReference,
} from '../walletSimulation'

describe('the reference the pretend wallet prints', () => {
  it('is as long as a real one', () => {
    // Shorter and the real validation on the fare screen would reject the
    // app's own simulation, which looks like a bug in the validation.
    expect(simulatedReference(() => 0.5)).toHaveLength(REFERENCE_DIGITS)
    expect(simulatedReference()).toMatch(/^\d{13}$/)
  })

  it('never starts with a zero', () => {
    expect(simulatedReference(() => 0)[0]).not.toBe('0')
    expect(simulatedReference(() => 0.999999)[0]).not.toBe('0')
  })

  it('is different each time', () => {
    const seen = new Set(Array.from({ length: 50 }, () => simulatedReference()))
    expect(seen.size).toBeGreaterThan(45)
  })

  it('prints in the groups a receipt uses', () => {
    expect(groupReference('1029383827362')).toBe('1029 383 827 362')
  })

  it('leaves something of the wrong length alone rather than mangling it', () => {
    expect(groupReference('123')).toBe('123')
  })
})

describe('the imaginary balance', () => {
  it('pays a fare it can cover', () => {
    expect(canAfford(SIMULATED_OPENING_BALANCE, 92)).toBe(true)
    expect(balanceAfter(1250, 92)).toBe(1158)
  })

  it('refuses a fare it cannot, and does not move', () => {
    expect(canAfford(50, 92)).toBe(false)
    expect(balanceAfter(50, 92)).toBe(50)
  })

  it('refuses a fare of nothing', () => {
    expect(canAfford(1250, 0)).toBe(false)
  })

  it('keeps centavos honest', () => {
    expect(balanceAfter(100.1, 0.2)).toBe(99.9)
  })

  it('reads like money', () => {
    expect(formatBalance(1250)).toBe('1,250.00')
    expect(formatBalance(1158.5)).toBe('1,158.50')
  })
})
