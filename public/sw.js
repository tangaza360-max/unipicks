const CACHE_NAME = 'unipicks-shell-v5'
const APP_SHELL = ['/icon-192.svg', '/icon-512.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)

  // Only handle same-origin requests. Let Supabase and others pass through.
  if (url.origin !== self.location.origin) return

  // Manifest: always fetch fresh. Never cache. So Chrome sees new icons.
  if (url.pathname === '/manifest.json') {
    event.respondWith(fetch(event.request, { cache: 'no-store' }))
    return
  }

  // HTML navigations: network-first, no HTTP cache.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).catch(async () => {
        const cachedShell = await caches.match('/index.html')
        return cachedShell || fetch('/')
      })
    )
    return
  }

  // Hashed build assets (Vite): network-first so phones always get
  // the version the current HTML points to. Fall back to cache if offline.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
          }
          return response
        })
        .catch(() => caches.match(event.request))
    )
    return
  }

  // Everything else (icons, static files): cache-first for speed.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached
      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === 'opaque') {
            return response
          }
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
          return response
        })
        .catch(() => new Response('', { status: 504, statusText: 'Network error' }))
    })
  )
})
// --- Phone alerts (Web Push) ---------------------------------------------------
// Payload sent by the Edge Functions (JSON): { title, body, url, tag }.
// url must be a path inside Unipicks ("/dashboard/orders"); anything else
// opens the dashboard. tag replaces an older alert about the same thing.

function safeAlertPath(url) {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : '/dashboard'
}

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }

  const options = {
    body: typeof data.body === 'string' ? data.body : '',
    icon: '/apple-touch-icon.png',
    data: { url: safeAlertPath(data.url) },
  }
  if (typeof data.tag === 'string' && data.tag) {
    options.tag = data.tag
    options.renotify = true
  }

  event.waitUntil(
    self.registration.showNotification(typeof data.title === 'string' && data.title ? data.title : 'Unipicks', options)
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(safeAlertPath(event.notification.data && event.notification.data.url), self.location.origin).href

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin)
      if (open) {
        return open.focus().then((client) => (client && 'navigate' in client ? client.navigate(target) : client))
      }
      return self.clients.openWindow(target)
    })
  )
})
