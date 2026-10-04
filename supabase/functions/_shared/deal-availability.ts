// When can a deal be ordered? Businesses set available_days and an optional
// available_from / available_until window on each deal (MerchantDeals.jsx).
// Times are Kigali wall-clock times. Rwanda is UTC+2 all year (no daylight
// saving), so a fixed offset is exact.
//
// Shared by the order Edge Functions (the real guard) and the deal page
// (src/pages/DealDetail.jsx imports this file), so both use the same rule.
// Plain TypeScript, no Deno or browser APIs.

export type DealHours = {
  available_days?: string[] | null
  available_from?: string | null
  available_until?: string | null
}

const WEEK = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
// Monday first, for labels.
const LABEL_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const SHORT: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
}
const KIGALI_OFFSET_MINUTES = 120

function kigaliClock(now: Date) {
  const local = new Date(now.getTime() + KIGALI_OFFSET_MINUTES * 60_000)
  const dayIndex = local.getUTCDay()
  return {
    day: WEEK[dayIndex],
    previousDay: WEEK[(dayIndex + 6) % 7],
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
  }
}

// "11:00" or "11:00:00" (Postgres time) -> minutes after midnight.
function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + (minutes || 0)
}

function daysOf(deal: DealHours): string[] {
  return Array.isArray(deal.available_days) && deal.available_days.length > 0
    ? deal.available_days
    : WEEK
}

function hasWindow(deal: DealHours): boolean {
  return Boolean(deal.available_from && deal.available_until) &&
    toMinutes(deal.available_from!) !== toMinutes(deal.available_until!)
}

// True when the deal can be ordered at `now`. The window includes its start
// and ends at its end time (11:00–14:00 accepts 11:00 to 13:59). A window that
// ends earlier than it starts runs overnight and belongs to the day it starts:
// Friday 18:00–02:00 is open Friday 18:00 to Saturday 01:59.
export function isDealOpenNow(deal: DealHours, now: Date = new Date()): boolean {
  const days = daysOf(deal)
  const { day, previousDay, minutes } = kigaliClock(now)

  if (!hasWindow(deal)) return days.includes(day)

  const from = toMinutes(deal.available_from!)
  const until = toMinutes(deal.available_until!)

  if (from < until) return days.includes(day) && minutes >= from && minutes < until
  if (minutes >= from) return days.includes(day)
  if (minutes < until) return days.includes(previousDay)
  return false
}

function hhmm(time: string): string {
  return time.slice(0, 5)
}

function daysLabel(deal: DealHours): string {
  const days = LABEL_ORDER.filter((d) => daysOf(deal).includes(d))
  if (days.length === 7) return 'every day'
  const indexes = days.map((d) => LABEL_ORDER.indexOf(d))
  const consecutive = indexes.every((value, i) => i === 0 || value === indexes[i - 1] + 1)
  if (consecutive && days.length >= 3) return `${SHORT[days[0]]}–${SHORT[days[days.length - 1]]}`
  return days.map((d) => SHORT[d]).join(', ')
}

// e.g. "Mon–Fri, 11:00–14:00", "every day, 18:00–02:00", "Sat, Sun".
export function dealHoursLabel(deal: DealHours): string {
  const days = daysLabel(deal)
  if (!hasWindow(deal)) return days
  return `${days}, ${hhmm(deal.available_from!)}–${hhmm(deal.available_until!)}`
}

// True when the business limited the deal to some days or hours.
export function hasDealHours(deal: DealHours): boolean {
  return daysOf(deal).length < 7 || hasWindow(deal)
}

export function dealClosedMessage(deal: DealHours): string {
  return `This deal is available ${dealHoursLabel(deal)} (Kigali time). Please order during those hours.`
}
