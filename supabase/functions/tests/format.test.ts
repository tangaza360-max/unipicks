// Money and dates look the same on every phone (style guide §6):
// "4,800 RWF", "4 Oct 2026", "20:27" in Kigali time, whatever the phone's
// language or time zone. Run with any TZ, e.g. TZ=America/New_York.
import { assertEquals } from 'jsr:@std/assert@1'
// @ts-ignore: plain JS module from the web app
import { formatDate, formatDateTime, formatDayMonth, formatMoney, formatTime, formatWeekday } from '../../../src/lib/format.js'

Deno.test('money: comma thousands, no decimals, RWF after', () => {
  assertEquals(formatMoney(4800), '4,800 RWF')
  assertEquals(formatMoney('10000'), '10,000 RWF')
  assertEquals(formatMoney(1234567), '1,234,567 RWF')
  assertEquals(formatMoney(4800.4), '4,800 RWF')
  assertEquals(formatMoney(0), '0 RWF')
  assertEquals(formatMoney(2500, 'USD'), '2,500 USD')
})

Deno.test('money: empty or invalid shows a dash, never "NaN RWF"', () => {
  for (const v of [null, undefined, '', 'abc', NaN]) assertEquals(formatMoney(v), '—')
})

Deno.test('dates and times are Kigali time (UTC+2), 24-hour', () => {
  const t = '2026-10-04T18:27:00Z' // 20:27 in Kigali
  assertEquals(formatDate(t), '4 Oct 2026')
  assertEquals(formatDayMonth(t), '4 Oct')
  assertEquals(formatTime(t), '20:27')
  assertEquals(formatDateTime(t), '4 Oct 2026, 20:27')
})

Deno.test('late evening UTC is already the next day in Kigali', () => {
  const t = '2026-10-04T22:30:00Z' // 00:30 on Monday 5 Oct in Kigali
  assertEquals(formatDate(t), '5 Oct 2026')
  assertEquals(formatTime(t), '00:30')
  assertEquals(formatWeekday(t), 'Mon')
})

Deno.test('empty dates: dash (or nothing for a time)', () => {
  assertEquals(formatDate(null), '—')
  assertEquals(formatDateTime('not a date'), '—')
  assertEquals(formatTime(undefined), '')
})
