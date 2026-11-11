// When a shop is actually open.
//
// The storefront has always shown "Open now" from a manual isOpen switch. A
// switch is only true while somebody remembers to flip it, and the one thing
// nobody does at 9pm after closing up is open the app to say so — so the
// badge told customers a shut shop was open, and orders went to a dark
// store. Hours make it answer itself.
//
// The manual switch stays, and stays able to close: a shop that runs out of
// rice at 2pm, or shuts for a fiesta, needs to say so without editing a
// schedule. It can only ever close, never force open outside the hours —
// "open" is a promise someone has to be standing there to keep.

// "HH:MM", 24-hour. Null for a day the shop does not open at all.
export type DayHours = { open: string; close: string } | null

// Seven entries, index 0 = Sunday, matching Date.getDay() so no call site
// has to remember an offset.
export type OpeningHours = DayHours[]

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function emptyOpeningHours(): OpeningHours {
  return [null, null, null, null, null, null, null]
}

// Minutes since midnight, or null if it isn't a time.
export function parseHhMm(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  const hours = Number(m[1])
  const minutes = Number(m[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

// 13:05 -> "1:05 PM". The app writes times the way a tarpaulin does.
export function formatHhMm(value: string): string {
  const total = parseHhMm(value)
  if (total === null) return value
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  const suffix = hours < 12 ? 'AM' : 'PM'
  const display = hours % 12 === 0 ? 12 : hours % 12
  return `${display}:${String(minutes).padStart(2, '0')} ${suffix}`
}

// A shift that ends before it starts runs past midnight — a carinderia open
// 17:00–02:00 is open at 1am, which is precisely when somebody wants it.
function coversMinute(day: DayHours, minute: number): boolean {
  if (!day) return false
  const open = parseHhMm(day.open)
  const close = parseHhMm(day.close)
  if (open === null || close === null) return false
  if (close > open) return minute >= open && minute < close
  // A wrapping shift only covers the evening on its own day. The hours after
  // midnight belong to the day that opened, so they are matched by the
  // yesterday check in scheduleIsOpen and deliberately not here — otherwise
  // "Monday 17:00–02:00" would claim 1am on Monday morning, which is the
  // tail of a Sunday shift nobody scheduled.
  if (close < open) return minute >= open
  // open === close reads as "all day", which is what 00:00–00:00 means on
  // every sign that bothers to say it.
  return true
}

export function hasOpeningHours(hours: OpeningHours | null | undefined): boolean {
  return Array.isArray(hours) && hours.some((d) => d !== null)
}

// Is the schedule alone open at this moment? Yesterday is checked too, for
// the overnight shift that started before midnight.
export function scheduleIsOpen(hours: OpeningHours | null | undefined, now: Date): boolean {
  if (!hasOpeningHours(hours)) return false
  const list = hours as OpeningHours
  const minute = now.getHours() * 60 + now.getMinutes()
  const today = now.getDay()
  if (coversMinute(list[today] ?? null, minute)) return true
  const yesterday = (today + 6) % 7
  const prior = list[yesterday] ?? null
  if (!prior) return false
  const open = parseHhMm(prior.open)
  const close = parseHhMm(prior.close)
  // Only a shift that genuinely wrapped past midnight can still be running.
  if (open === null || close === null || close >= open) return false
  return minute < close
}

// What the badge should say. A shop with no hours set behaves exactly as it
// did before this existed: the switch is the whole answer.
export function vendorIsOpen(
  vendor: { isOpen: boolean; openingHours?: OpeningHours | null },
  now: Date = new Date(),
): boolean {
  if (!hasOpeningHours(vendor.openingHours)) return vendor.isOpen
  return vendor.isOpen && scheduleIsOpen(vendor.openingHours, now)
}

// "Opens 7:00 AM" when that is today, "Opens Mon 7:00 AM" when it is not —
// so a closed shop says when to come back instead of only that it is shut.
// Null when nothing is scheduled within the week, or when the shop is shut
// by its own switch, where an opening time would be a guess.
export function nextOpeningLabel(
  vendor: { isOpen: boolean; openingHours?: OpeningHours | null },
  now: Date = new Date(),
): string | null {
  if (!hasOpeningHours(vendor.openingHours) || !vendor.isOpen) return null
  const hours = vendor.openingHours as OpeningHours
  const minute = now.getHours() * 60 + now.getMinutes()
  for (let ahead = 0; ahead < 7; ahead += 1) {
    const day = (now.getDay() + ahead) % 7
    const entry = hours[day] ?? null
    if (!entry) continue
    const open = parseHhMm(entry.open)
    if (open === null) continue
    // Today only counts if it has not already started.
    if (ahead === 0 && open <= minute) continue
    const when = formatHhMm(entry.open)
    return ahead === 0 ? `Opens ${when}` : `Opens ${DAY_SHORT[day]} ${when}`
  }
  return null
}

// The whole week as lines a customer can read, collapsing runs of identical
// days: "Mon–Fri 7:00 AM – 7:00 PM" rather than five rows saying the same.
export function openingHoursSummary(hours: OpeningHours | null | undefined): string[] {
  if (!hasOpeningHours(hours)) return []
  const list = hours as OpeningHours
  // Monday first, which is how a week reads on a door.
  const order = [1, 2, 3, 4, 5, 6, 0]
  const key = (day: number) => {
    const entry = list[day] ?? null
    return entry ? `${entry.open}-${entry.close}` : 'closed'
  }
  const lines: string[] = []
  let runStart = 0
  for (let i = 1; i <= order.length; i += 1) {
    const same = i < order.length && key(order[i]) === key(order[runStart])
    if (same) continue
    const from = order[runStart]
    const to = order[i - 1]
    const entry = list[from] ?? null
    const days = from === to ? DAY_SHORT[from] : `${DAY_SHORT[from]}–${DAY_SHORT[to]}`
    lines.push(entry ? `${days} ${formatHhMm(entry.open)} – ${formatHhMm(entry.close)}` : `${days} Closed`)
    runStart = i
  }
  return lines
}
