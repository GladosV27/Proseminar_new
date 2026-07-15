/*
 * Service Worker: macht die App nach dem ersten Besuch offline nutzbar
 * (App-Shell-Caching, stale-while-revalidate). Modellgewichte cachen
 * WebLLM/transformers.js selbst über die Cache API – hier werden bewusst
 * nur same-origin-Ressourcen behandelt.
 */
const CACHE = 'graphrag-lab-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)
  if (url.origin !== location.origin) return
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(e.request)
      const network = fetch(e.request)
        .then((res) => {
          if (res.ok) cache.put(e.request, res.clone())
          return res
        })
        .catch(() => cached)
      return cached || network
    }),
  )
})
