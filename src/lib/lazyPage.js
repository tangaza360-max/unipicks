import { lazy } from 'react'

// Screens load only when opened, so the first visit downloads much less
// (Google Core Web Vitals: faster first load on mobile data).
//
// After a new deploy, a phone still showing the old version may ask for a
// screen file that no longer exists. Then reload once to get the new
// version; the guard stops a reload loop if the network is really down
// (the error then reaches the error screen as before).
const RELOAD_KEY = 'unipicks:reloaded-for-new-version'

export function reloadOnceForNewVersion(storage = window.sessionStorage, reload = () => window.location.reload(), now = Date.now()) {
  try {
    const last = Number(storage.getItem(RELOAD_KEY) || 0)
    if (now - last < 10_000) return false
    storage.setItem(RELOAD_KEY, String(now))
  } catch {
    return false
  }
  reload()
  return true
}

export function lazyPage(load) {
  return lazy(() =>
    load().catch((error) => {
      if (reloadOnceForNewVersion()) return new Promise(() => {}) // the page is reloading
      throw error
    })
  )
}
