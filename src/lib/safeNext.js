// Where to go after logging in, from ?next=. Only pages inside Unipicks that
// a shared link can point to; anything else (another website, "//evil.com",
// odd characters) goes to Home. Stops "open redirect" tricks (OWASP).
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const ALLOWED = [
  new RegExp(`^/deal/${UUID}$`, 'i'),
  /^\/dashboard(\/[a-z-]+)?$/,
  // The two pages students' order alerts open: My orders, and paying for one
  // order (each only exactly; the database shows an order only to its owner).
  /^\/dashboard\/profile\?view=orders$/,
  new RegExp(`^/payment\\?order_id=${UUID}$`, 'i'),
]
export const HOME = '/dashboard/deals'

export function safeNext(value) {
  if (typeof value !== 'string') return HOME
  return ALLOWED.some((rule) => rule.test(value)) ? value : HOME
}

// "/login?next=/deal/…" — keeps the deal when moving between log in and sign up.
export function withNext(path, next) {
  const target = safeNext(next)
  return target === HOME ? path : `${path}?next=${encodeURIComponent(target)}`
}
