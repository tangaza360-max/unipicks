// Where to go after logging in, from ?next=. Only pages inside Unipicks that
// a shared link can point to; anything else (another website, "//evil.com",
// odd characters) goes to Home. Stops "open redirect" tricks (OWASP).
const ALLOWED = [/^\/deal\/[0-9a-f-]{36}$/i, /^\/dashboard(\/[a-z-]+)?$/]
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
