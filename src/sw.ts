/// <reference lib="webworker" />
// Custom service worker (injectManifest mode — see vite.config.ts) instead
// of vite-plugin-pwa's auto-generated one, because that's the only way to
// add a `push` handler. Reproduces the same precache/runtime-cache/
// navigation behavior the old generateSW config had, plus push notifications.

import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL, type PrecacheEntry } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { clientsClaim } from 'workbox-core'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>
}

self.skipWaiting()
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// No client-side router here (one index.html, tab state only) — but the
// PHP push backend under /push/ must never be swallowed by the SPA shell.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/push\//],
  }),
)

registerRoute(
  /^https:\/\/api\.goal\.bg\/.*/i,
  new NetworkFirst({
    cacheName: 'goalbg-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 5 })],
  }),
  'GET',
)

// Manual data (public/data/*.json): deliberately NOT in vite.config.ts's
// injectManifest.globPatterns, so it's never locked to a build-time precache
// hash — NetworkFirst here means editing one of these files and redeploying
// just that file (no app rebuild) reaches users on their next successful
// fetch, with an offline fallback.
registerRoute(
  /\/data\/.*\.json$/,
  new NetworkFirst({
    cacheName: 'manual-data-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 })],
  }),
  'GET',
)

// ---- Push notifications ----
// Payload shape is whatever check-match.php's sendPushToAll() sends:
// { title, body, data }.

interface PushPayload {
  title?: string
  body?: string
  data?: Record<string, unknown>
}

self.addEventListener('push', (event: PushEvent) => {
  let payload: PushPayload = {}
  try {
    payload = event.data?.json() ?? {}
  } catch {
    payload = { body: event.data?.text() }
  }

  const title = payload.title ?? 'Черно Море'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body ?? '',
      icon: '/icon-192.jpg',
      badge: '/icon-192.jpg',
      data: payload.data ?? {},
    }),
  )
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientsArr) => {
      const existing = clientsArr.find((c) => 'focus' in c) as WindowClient | undefined
      if (existing) return existing.focus()
      return self.clients.openWindow('/')
    }),
  )
})
