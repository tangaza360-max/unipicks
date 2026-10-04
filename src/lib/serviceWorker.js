// Keeps the service worker (public/sw.js) current on every device.
//
// register() alone never re-checks an existing registration, and a tab that
// stays open for days (or a phone that only resumes the app) may keep running
// an old sw.js. On 2026-10-04 a laptop still ran the 23/09 version, which had
// no code to show phone alerts, so alerts arrived but were never shown.
//
// So: never read sw.js from the HTTP cache, and ask the browser to look for a
// newer sw.js when the app opens and each time it comes back on screen.
// sw.js calls skipWaiting(), so a new version takes over at once.

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      const checkForUpdate = () => registration.update().catch(() => {})
      checkForUpdate()
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate()
      })
    } catch (error) {
      console.error('Service worker registration failed:', error)
    }
  })
}
