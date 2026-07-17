/*
 * Graph-RAG Lab – versionierte Offline-App-Shell.
 *
 * Diese Datei wird nach dem Vite-Build von scripts/generate-sw.mjs
 * vervollständigt. Der Service Worker verwaltet ausschließlich Caches mit
 * APP_CACHE_PREFIX. Caches von WebLLM, Transformers.js oder anderen
 * Bibliotheken werden weder verändert noch gelöscht.
 */
const BUILD_ID = '__APP_BUILD_ID__'
const APP_CACHE_PREFIX = 'graphrag-app-shell-'
const APP_CACHE = `${APP_CACHE_PREFIX}${BUILD_ID}`
const PRECACHE_URLS = ['__PRECACHE_MANIFEST__']

const scopeUrl = (relativeUrl) => new URL(relativeUrl, self.registration.scope).href

async function precacheAppShell() {
  const cache = await caches.open(APP_CACHE)

  try {
    await Promise.all(
      PRECACHE_URLS.map(async (relativeUrl) => {
        const url = scopeUrl(relativeUrl)
        const request = new Request(url, { cache: 'reload' })
        const response = await fetch(request)

        if (!response.ok) {
          throw new Error(`Precache fehlgeschlagen: ${relativeUrl} (${response.status})`)
        }

        await cache.put(request, response)
      }),
    )
  } catch (error) {
    await caches.delete(APP_CACHE)
    throw error
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheAppShell().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        // Den unmittelbar vorherigen App-Build behalten: Eine noch geöffnete
        // alte Seite kann daraus ihre lazy geladenen Chunks beziehen, obwohl
        // der neue Worker bereits via skipWaiting übernommen hat. Fremde
        // Modellcaches werden durch den Präfixfilter weiterhin nie berührt.
        const olderAppCaches = keys.filter((key) => key.startsWith(APP_CACHE_PREFIX) && key !== APP_CACHE)
        const previousAppCache = olderAppCaches.at(-1)
        return Promise.all(
          olderAppCaches
            .filter((key) => key !== previousAppCache)
            .map((key) => caches.delete(key)),
        )
      })
      .then(() => self.clients.claim()),
  )
})

async function navigationResponse(request) {
  const cache = await caches.open(APP_CACHE)

  try {
    const response = await fetch(request)
    if (response.ok) await cache.put(request, response.clone())
    return response
  } catch {
    const exact = await cache.match(request, { ignoreSearch: true })
    if (exact) return exact

    const appEntry = await cache.match(scopeUrl('./index.html'))
    if (appEntry) return appEntry

    return new Response(
      'Die Offline-App-Shell ist unvollständig. Bitte die Vortrag-Vorbereitung erneut ausführen.',
      {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      },
    )
  }
}

async function assetResponse(request) {
  const cache = await caches.open(APP_CACHE)
  const cached = await cache.match(request, { ignoreSearch: true })
  if (cached) return cached

  try {
    const response = await fetch(request)
    if (response.ok) await cache.put(request, response.clone())
    return response
  } catch {
    return new Response('Ressource ist offline nicht verfügbar.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const requestUrl = new URL(event.request.url)
  if (requestUrl.origin !== self.location.origin) return

  event.respondWith(
    event.request.mode === 'navigate'
      ? navigationResponse(event.request)
      : assetResponse(event.request),
  )
})

async function getOfflineStatus(requestId) {
  const cache = await caches.open(APP_CACHE)
  const expected = PRECACHE_URLS.map((relativeUrl) => ({
    relativeUrl,
    absoluteUrl: scopeUrl(relativeUrl),
  }))
  const checks = await Promise.all(
    expected.map(async ({ relativeUrl, absoluteUrl }) => ({
      relativeUrl,
      present: Boolean(await cache.match(absoluteUrl, { ignoreSearch: true })),
    })),
  )
  const missing = checks.filter((item) => !item.present).map((item) => item.relativeUrl)

  return {
    type: 'OFFLINE_STATUS',
    requestId,
    ready: missing.length === 0,
    buildId: BUILD_ID,
    cacheName: APP_CACHE,
    cached: PRECACHE_URLS.length - missing.length,
    total: PRECACHE_URLS.length,
    expectedCount: PRECACHE_URLS.length,
    cachedCount: PRECACHE_URLS.length - missing.length,
    missing,
    scope: self.registration.scope,
  }
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting())
    return
  }

  if (event.data?.type !== 'GET_OFFLINE_STATUS') return

  event.waitUntil(
    getOfflineStatus(event.data.requestId)
      .then((status) => {
        const replyPort = event.ports?.[0]
        if (replyPort) replyPort.postMessage(status)
        else event.source?.postMessage(status)
      })
      .catch((error) => {
        const failure = {
          type: 'OFFLINE_STATUS',
          requestId: event.data.requestId,
          ready: false,
          buildId: BUILD_ID,
          cacheName: APP_CACHE,
          cached: 0,
          total: PRECACHE_URLS.length,
          expectedCount: PRECACHE_URLS.length,
          cachedCount: 0,
          missing: [...PRECACHE_URLS],
          error: error instanceof Error ? error.message : String(error),
        }
        const replyPort = event.ports?.[0]
        if (replyPort) replyPort.postMessage(failure)
        else event.source?.postMessage(failure)
      }),
  )
})
