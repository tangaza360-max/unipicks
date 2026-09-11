const CACHE_NAME = 'unipicks-shell-v3'
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

  // Navigation requests (the HTML document): always fetch fresh from the
  // network, bypassing any HTTP cache, so users always get the latest
  // deploy's index.html — never a stale one pointing at old JS filenames.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).catch(async () => {
        const cachedShell = await caches.match('/index.html')
        return cachedShell || fetch('/')
      }),
    )
    return
  }

  // Static assets: cache-first for speed. If a fetch fails outright
  // (offline, etc.), return a clean error response instead of letting
  // the promise reject uncaught.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached

      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === 'opaque') return response
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
          return response
        })
        .catch(() => new Response('', { status: 504, statusText: 'Network error' }))
    }),
  )
})
