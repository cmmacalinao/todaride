import { describe, expect, it } from 'vitest'
import {
  findPartnerByCode,
  generatePartnerCode,
  marketingSplit,
  referralActive,
  todaQualifiesForReward,
} from '../marketingProgram'
import type { Driver, TodaOrganization } from '../../types'

const driver = (id: string, extra: Partial<Driver> = {}): Driver =>
  ({ id, name: id, todaOrgId: 'toda-a', verificationStatus: 'approved', ...extra }) as Driver
const org = (extra: Partial<TodaOrganization> = {}): TodaOrganization =>
  ({ id: 'toda-a', name: 'A TODA', ...extra }) as TodaOrganization

const now = new Date('2026-09-17T00:00:00Z').getTime()
const recentlyReferred = new Date('2026-06-01T00:00:00Z').toISOString()

describe('partner referral codes', () => {
  it('makes a code that is not already taken', () => {
    let i = 0
    const seq = [0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5]
    const code = generatePartnerCode(['TR-AAAAA'], () => seq[i++ % seq.length])
    expect(code).not.toBe('TR-AAAAA')
    expect(code).toMatch(/^TR-[A-Z2-9]{5}$/)
  })

  it('finds a partner however the code is typed', () => {
    const partner = driver('p', { partnerCode: 'TR-ABCDE' })
    expect(findPartnerByCode([partner], ' tr-abcde ')?.id).toBe('p')
    expect(findPartnerByCode([partner], 'TR-ZZZZZ')).toBeNull()
    expect(findPartnerByCode([partner], '')).toBeNull()
  })
})

describe('who earns on a recruit ride', () => {
  const partner = driver('p', { partnerCode: 'TR-ABCDE' })
  const recruit = driver('r', { referredByDriverId: 'p', referredAt: recentlyReferred })

  it('pays the partner ₱0.70 while the referral is within a year', () => {
    const split = marketingSplit({ recruit, drivers: [partner, recruit], orgs: [org()], platformFee: 3, at: now })
    expect(split.partnerDriverId).toBe('p')
    expect(split.partnerCommission).toBe(0.7)
  })

  it('stops paying a year after the recruit signed up', () => {
    const old = driver('r', { referredByDriverId: 'p', referredAt: '2025-09-01T00:00:00Z' })
    expect(referralActive(old, now)).toBe(false)
    expect(marketingSplit({ recruit: old, drivers: [partner, old], orgs: [org()], platformFee: 3, at: now }).partnerCommission).toBe(0)
  })

  it('pays nothing for a driver nobody recruited', () => {
    const plain = driver('x')
    expect(marketingSplit({ recruit: plain, drivers: [partner, plain], orgs: [org()], platformFee: 3, at: now }).partnerCommission).toBe(0)
  })

  it('pays the TODA ₱0.30 only once every member is registered', () => {
    const drivers = [partner, recruit]
    const notYet = marketingSplit({ recruit, drivers, orgs: [org({ officialMemberCount: 5 })], platformFee: 3, at: now })
    expect(notYet.todaReferralReward).toBe(0)
    const complete = marketingSplit({ recruit, drivers, orgs: [org({ officialMemberCount: 2 })], platformFee: 3, at: now })
    expect(complete.todaReferralReward).toBe(0.3)
    expect(complete.todaReferralOrgId).toBe('toda-a')
  })

  it('never counts a pending driver as a registered member', () => {
    const pending = driver('q', { verificationStatus: 'pending' })
    expect(todaQualifiesForReward(org({ officialMemberCount: 3 }), [partner, recruit, pending])).toBe(false)
  })

  it('never pays out more than the platform fee the ride carried', () => {
    const drivers = [partner, recruit]
    const orgs = [org({ officialMemberCount: 2 })]
    expect(marketingSplit({ recruit, drivers, orgs, platformFee: 0, at: now }).partnerCommission).toBe(0)
    const small = marketingSplit({ recruit, drivers, orgs, platformFee: 0.8, at: now })
    expect(small.partnerCommission).toBe(0.7)
    expect(small.todaReferralReward).toBe(0.1)
  })
})
