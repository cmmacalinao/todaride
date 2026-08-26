import { describe, expect, it } from 'vitest'

// The rules the merged sign-up depends on, stated as the reducer states them.
// These are the two that used to be wrong in opposite directions: one person
// could become several parent records, and one student could only ever name
// one parent.
const digits = (v: string) => v.replace(/\D/g, '')
const sameNumber = (a: string, b: string) => digits(a) === digits(b)

describe('one household, one parent record', () => {
  it('treats the same number written differently as the same person', () => {
    // A form filled twice rarely produces identical text.
    expect(sameNumber('0917-100-1001', '09171001001')).toBe(true)
    expect(sameNumber('0917 100 1001', '09171001001')).toBe(true)
  })

  it('keeps genuinely different numbers apart', () => {
    expect(sameNumber('09171001001', '09171001002')).toBe(false)
  })
})

describe('how many parents a student may name', () => {
  type Link = { studentPassengerId: string; parentId: string }
  // The rule as written in REGISTER_GUARDIAN_FOR_STUDENT: refuse only when
  // this exact parent is already linked to this exact student.
  const wouldRefuse = (links: Link[], studentId: string, parentId: string) =>
    links.some((l) => l.studentPassengerId === studentId && l.parentId === parentId)

  it('accepts a second, different parent', () => {
    // Most students have two. The old rule refused the father because the
    // mother was already there.
    const links: Link[] = [{ studentPassengerId: 'pax-2', parentId: 'parent-mother' }]
    expect(wouldRefuse(links, 'pax-2', 'parent-father')).toBe(false)
  })

  it('still refuses the same parent twice', () => {
    const links: Link[] = [{ studentPassengerId: 'pax-2', parentId: 'parent-mother' }]
    expect(wouldRefuse(links, 'pax-2', 'parent-mother')).toBe(true)
  })

  it('lets one parent be linked to several children', () => {
    const links: Link[] = [{ studentPassengerId: 'pax-2', parentId: 'parent-mother' }]
    expect(wouldRefuse(links, 'pax-7', 'parent-mother')).toBe(false)
  })
})
