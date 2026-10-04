// Supabase sends people back with the error in the URL when an email link
// (signup confirmation, later password reset) is expired or already used,
// e.g. /#error=access_denied&error_code=otp_expired. The app used to ignore
// it and silently show the signup page. These helpers turn it into a clear
// message on the login page.

const MESSAGES = {
  otp_expired:
    'This email link has expired or was already used. If you already confirmed your email, log in below. If not, sign up again to get a new link. Forgot your password? Use "Forgot password?" below to get a new reset link.',
}

const FALLBACK = 'This email link did not work. Please log in below, or sign up again to get a new link.'

// Returns the error code from the URL (hash or query), or null.
export function readAuthLinkError(location = window.location) {
  for (const raw of [location.hash.slice(1), location.search.slice(1)]) {
    const params = new URLSearchParams(raw)
    const code = params.get('error_code') || params.get('error')
    if (code) return code
  }
  return null
}

export function authLinkErrorMessage(code) {
  if (!code) return ''
  return MESSAGES[code] || FALLBACK
}
