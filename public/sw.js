const CACHE_NAME = 'unipicks-shell-v2'
const APP_SHELL = ['/manifest.json', '/icon-192.svg', '/icon-512.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
    )),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  // Navigation requests (the HTML document): always try network first,
  // so users get the latest deploy. Fall back to cache only if offline.
  if (event.request.mode === 'navigate') {
    // Your app needs live data anyway (deals, payments), so there's no
    // meaningful offline fallback here — just always fetch fresh.
    event.respondWith(fetch(event.request))
    return
  }

  // Static assets: cache-first for speed, since these rarely change mid-session.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached

      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type === 'opaque') return response
        const copy = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
        return response
      })
    }),
  )
})
