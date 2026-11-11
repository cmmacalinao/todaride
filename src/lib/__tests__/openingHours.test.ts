import { describe, expect, it } from 'vitest'
import {
  emptyOpeningHours,
  formatHhMm,
  nextOpeningLabel,
  openingHoursSummary,
  parseHhMm,
  scheduleIsOpen,
  vendorIsOpen,
  type OpeningHours,
} from '../openingHours'

// Index 0 is Sunday, same as Date.getDay().
function week(entries: Partial<Record<number, { open: string; close: string }>>): OpeningHours {
  const hours = emptyOpeningHours()
  for (const [day, value] of Object.entries(entries)) hours[Number(day)] = value ?? null
  return hours
}

// 2026-11-09 is a Monday.
const monday9am = new Date('2026-11-09T09:00:00')
const monday6am = new Date('2026-11-09T06:00:00')
const monday8pm = new Date('2026-11-09T20:00:00')
const tuesday1am = new Date('2026-11-10T01:00:00')
const sunday9am = new Date('2026-11-08T09:00:00')

describe('parseHhMm / formatHhMm', () => {
  it('reads a 24-hour time and writes it the way a tarpaulin does', () => {
    expect(parseHhMm('07:30')).toBe(450)
    expect(parseHhMm('00:00')).toBe(0)
    expect(formatHhMm('13:05')).toBe('1:05 PM')
    expect(formatHhMm('00:30')).toBe('12:30 AM')
    expect(formatHhMm('12:00')).toBe('12:00 PM')
  })

  it('refuses what is not a time, rather than inventing one', () => {
    expect(parseHhMm('25:00')).toBeNull()
    expect(parseHhMm('7:60')).toBeNull()
    expect(parseHhMm('closed')).toBeNull()
  })
})

describe('scheduleIsOpen', () => {
  const weekday = week({ 1: { open: '07:00', close: '19:00' } })

  it('is open inside the hours and shut outside them', () => {
    expect(scheduleIsOpen(weekday, monday9am)).toBe(true)
    expect(scheduleIsOpen(weekday, monday6am)).toBe(false)
    expect(scheduleIsOpen(weekday, monday8pm)).toBe(false)
  })

  it('is shut on a day with no hours at all', () => {
    expect(scheduleIsOpen(weekday, sunday9am)).toBe(false)
  })

  it('keeps an overnight shift open past midnight, on the next day', () => {
    // Open Monday evening through to 2am Tuesday.
    const ihawan = week({ 1: { open: '17:00', close: '02:00' } })
    expect(scheduleIsOpen(ihawan, monday8pm)).toBe(true)
    expect(scheduleIsOpen(ihawan, tuesday1am)).toBe(true)
    // ...but not at 1am on Monday, which belongs to Sunday's shift.
    expect(scheduleIsOpen(ihawan, new Date('2026-11-09T01:00:00'))).toBe(false)
  })

  it('treats equal open and close as open all day', () => {
    expect(scheduleIsOpen(week({ 1: { open: '00:00', close: '00:00' } }), monday6am)).toBe(true)
  })
})

describe('vendorIsOpen', () => {
  const weekday = week({ 1: { open: '07:00', close: '19:00' } })

  it('falls back to the manual switch when no hours are set', () => {
    expect(vendorIsOpen({ isOpen: true }, monday6am)).toBe(true)
    expect(vendorIsOpen({ isOpen: false }, monday9am)).toBe(false)
    expect(vendorIsOpen({ isOpen: true, openingHours: emptyOpeningHours() }, monday6am)).toBe(true)
  })

  it('lets the switch close a shop inside its own hours, but never force it open outside them', () => {
    // Ran out of rice at 2pm: shut, though the schedule says otherwise.
    expect(vendorIsOpen({ isOpen: false, openingHours: weekday }, monday9am)).toBe(false)
    // Switch left on overnight: still shut, because nobody is there.
    expect(vendorIsOpen({ isOpen: true, openingHours: weekday }, monday8pm)).toBe(false)
    expect(vendorIsOpen({ isOpen: true, openingHours: weekday }, monday9am)).toBe(true)
  })
})

describe('nextOpeningLabel', () => {
  it('names the time when the shop opens later today', () => {
    expect(nextOpeningLabel({ isOpen: true, openingHours: week({ 1: { open: '07:00', close: '19:00' } }) }, monday6am)).toBe(
      'Opens 7:00 AM',
    )
  })

  it('names the day when the next opening is not today', () => {
    // Closed Monday, open Tuesday.
    const hours = week({ 2: { open: '08:00', close: '17:00' } })
    expect(nextOpeningLabel({ isOpen: true, openingHours: hours }, monday9am)).toBe('Opens Tue 8:00 AM')
  })

  it('says nothing when the shop shut itself, where an opening time would be a guess', () => {
    const hours = week({ 1: { open: '07:00', close: '19:00' } })
    expect(nextOpeningLabel({ isOpen: false, openingHours: hours }, monday6am)).toBeNull()
    expect(nextOpeningLabel({ isOpen: true }, monday6am)).toBeNull()
  })
})

describe('openingHoursSummary', () => {
  it('collapses identical days into one line, starting the week on Monday', () => {
    const hours = week({
      1: { open: '07:00', close: '19:00' },
      2: { open: '07:00', close: '19:00' },
      3: { open: '07:00', close: '19:00' },
      4: { open: '07:00', close: '19:00' },
      5: { open: '07:00', close: '19:00' },
      6: { open: '08:00', close: '15:00' },
    })
    expect(openingHoursSummary(hours)).toEqual([
      'Mon–Fri 7:00 AM – 7:00 PM',
      'Sat 8:00 AM – 3:00 PM',
      'Sun Closed',
    ])
  })

  it('says nothing at all when no hours are set', () => {
    expect(openingHoursSummary(null)).toEqual([])
    expect(openingHoursSummary(emptyOpeningHours())).toEqual([])
  })
})
