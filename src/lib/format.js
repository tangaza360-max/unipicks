// One way to show money and dates everywhere (style guide §6), whatever
// language the phone is set to: "4,800 RWF", "4 Oct 2026", "20:27" (Kigali).

const KIGALI = 'Africa/Kigali'

const dateFmt = new Intl.DateTimeFormat('en-GB', { timeZone: KIGALI, day: 'numeric', month: 'short', year: 'numeric' })
const dayMonthFmt = new Intl.DateTimeFormat('en-GB', { timeZone: KIGALI, day: 'numeric', month: 'short' })
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: KIGALI, hour: '2-digit', minute: '2-digit', hour12: false })
const weekdayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: KIGALI, weekday: 'short' })

const toDate = (value) => {
  if (value === null || value === undefined || value === '') return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

// 4800 → "4,800 RWF". Empty or invalid → "—".
export function formatMoney(value, currency = 'RWF') {
  const n = Number(value)
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return '—'
  return `${Math.round(n).toLocaleString('en-US')} ${currency}`
}

// "4 Oct 2026"
export const formatDate = (value) => (toDate(value) ? dateFmt.format(toDate(value)) : '—')
// "4 Oct"
export const formatDayMonth = (value) => (toDate(value) ? dayMonthFmt.format(toDate(value)) : '—')
// "20:27"
export const formatTime = (value) => (toDate(value) ? timeFmt.format(toDate(value)) : '')
// "4 Oct 2026, 20:27"
export const formatDateTime = (value) => (toDate(value) ? `${formatDate(value)}, ${formatTime(value)}` : '—')
// "Mon"
export const formatWeekday = (value) => (toDate(value) ? weekdayFmt.format(toDate(value)) : '')
