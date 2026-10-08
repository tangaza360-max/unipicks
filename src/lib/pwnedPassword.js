// Block passwords that are already in public data leaks (founder decision
// 2026-10-08; Supabase's own check needs the Pro plan). Uses the free Pwned
// Passwords range API with k-anonymity: only the first 5 characters of the
// password's SHA-1 code leave the phone, never the password.
// API: https://haveibeenpwned.com/api/v3#SearchingPwnedPasswordsByRange
// Standard: NIST SP 800-63B §5.1.1.2 (check new passwords against breach lists).

export const PWNED_RANGE_URL = 'https://api.pwnedpasswords.com/range/'
export const PWNED_PASSWORD_MESSAGE =
  'This password has appeared in a data leak, so hackers already know it. Please choose another one.'

export async function sha1Parts(password) {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password))
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
  return [hex.slice(0, 5), hex.slice(5)]
}

// The answer has one "SUFFIX:COUNT" line per known hash; padding lines have count 0.
export function countInRange(text, suffix) {
  for (const line of String(text).split('\n')) {
    const [lineSuffix, count] = line.trim().split(':')
    if (lineSuffix === suffix) return Number.parseInt(count, 10) || 0
  }
  return 0
}

// How many times the password appears in leaks, or null when the check could
// not run (no network, service down, slow). Sign-up is never blocked by an
// outage: Supabase's 8-character minimum still applies.
export async function timesPwned(password, { fetchImpl = fetch, timeoutMs = 4000 } = {}) {
  try {
    const [prefix, suffix] = await sha1Parts(password)
    const response = await fetchImpl(PWNED_RANGE_URL + prefix, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) return null
    return countInRange(await response.text(), suffix)
  } catch {
    return null
  }
}
