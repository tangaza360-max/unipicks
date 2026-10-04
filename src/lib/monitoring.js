import * as Sentry from '@sentry/react'

// Crash reports to Sentry (EU region), so the team gets an email when the
// app breaks. Only runs when VITE_SENTRY_DSN is set (Vercel Production), so
// local runs, previews and tests send nothing.
//
// Privacy: errors only (no session replay, no performance tracing), no user
// identity, IP, cookies or headers, and URLs are cut at "?" and "#" so login
// tokens (#access_token=…) and query values never leave the browser.

const dsn = import.meta.env.VITE_SENTRY_DSN
let enabled = false

function stripUrl(url) {
  return typeof url === 'string' ? url.split(/[?#]/)[0] : url
}

function scrubBreadcrumb(breadcrumb) {
  // Console messages can contain data the app logged; never send them.
  if (breadcrumb.category === 'console') return null
  const data = breadcrumb.data
  if (data) {
    for (const key of ['url', 'from', 'to']) {
      if (key in data) data[key] = stripUrl(data[key])
    }
  }
  return breadcrumb
}

function scrubEvent(event) {
  delete event.user
  if (event.request) {
    event.request = { url: stripUrl(event.request.url) }
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb).filter(Boolean)
  }
  return event
}

export function initMonitoring() {
  if (!dsn) return
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
    beforeBreadcrumb: scrubBreadcrumb,
    beforeSend: scrubEvent,
  })
  enabled = true
}

export function reportCrash(error) {
  if (enabled) Sentry.captureException(error)
}
