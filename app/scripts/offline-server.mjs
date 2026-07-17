import { createReadStream, existsSync, statSync } from 'node:fs'
import { access } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const distDirectory = path.resolve(scriptDirectory, '..', 'dist')
const indexPath = path.join(distDirectory, 'index.html')
const serviceWorkerPath = path.join(distDirectory, 'sw.js')
const HOST = 'localhost'
const PORT = 4173
const APP_URL = `http://${HOST}:${PORT}/`

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
])

function commonHeaders(filePath) {
  const fileName = path.basename(filePath)
  const isUpdateSensitive = fileName === 'index.html' || fileName === 'sw.js'
  return {
    'Cache-Control': isUpdateSensitive ? 'no-cache' : 'public, max-age=31536000, immutable',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'X-Content-Type-Options': 'nosniff',
  }
}

function sendText(response, status, message) {
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(message)
}

function serveFile(request, response, filePath) {
  const extension = path.extname(filePath).toLowerCase()
  const mimeType = MIME_TYPES.get(extension) ?? 'application/octet-stream'
  response.writeHead(200, {
    ...commonHeaders(filePath),
    'Content-Type': mimeType,
    'Content-Length': statSync(filePath).size,
  })

  if (request.method === 'HEAD') {
    response.end()
    return
  }

  const stream = createReadStream(filePath)
  stream.on('error', () => {
    if (!response.headersSent) sendText(response, 500, 'Die Datei konnte nicht gelesen werden.')
    else response.destroy()
  })
  stream.pipe(response)
}

function resolveRequestPath(request) {
  const rawPathname = new URL(request.url ?? '/', APP_URL).pathname
  const pathname = decodeURIComponent(rawPathname)
  const requestedPath = pathname === '/' ? '/index.html' : pathname
  const resolved = path.resolve(distDirectory, `.${requestedPath}`)
  const insideDist = resolved === distDirectory || resolved.startsWith(`${distDirectory}${path.sep}`)
  return insideDist ? resolved : null
}

function openBrowser() {
  let command
  let args

  if (process.platform === 'win32') {
    command = 'cmd.exe'
    args = ['/c', 'start', '', APP_URL]
  } else if (process.platform === 'darwin') {
    command = 'open'
    args = [APP_URL]
  } else {
    command = 'xdg-open'
    args = [APP_URL]
  }

  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' })
    child.on('error', (error) => {
      console.warn(`Browser konnte nicht automatisch geöffnet werden: ${error.message}`)
    })
    child.unref()
  } catch (error) {
    console.warn(`Browser konnte nicht automatisch geöffnet werden: ${error instanceof Error ? error.message : error}`)
  }
}

async function main() {
  try {
    await Promise.all([access(indexPath), access(serviceWorkerPath)])
  } catch {
    console.error('FEHLER: Der Vortrag-Build fehlt oder ist unvollständig.')
    console.error(`Erwartet: ${indexPath} und ${serviceWorkerPath}`)
    console.error('Bitte vorher VORTRAG_OFFLINE_VORBEREITEN.cmd ausführen.')
    process.exitCode = 1
    return
  }

  const server = http.createServer((request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendText(response, 405, 'Nur GET und HEAD werden unterstützt.')
      return
    }

    let filePath
    try {
      filePath = resolveRequestPath(request)
    } catch {
      sendText(response, 400, 'Ungültige URL.')
      return
    }

    if (!filePath) {
      sendText(response, 403, 'Zugriff außerhalb des App-Builds ist nicht erlaubt.')
      return
    }

    if (existsSync(filePath) && statSync(filePath).isFile()) {
      serveFile(request, response, filePath)
      return
    }

    const acceptsHtml = (request.headers.accept ?? '').includes('text/html')
    if (acceptsHtml) {
      serveFile(request, response, indexPath)
      return
    }

    sendText(response, 404, 'Datei nicht gefunden.')
  })

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`FEHLER: Port ${PORT} ist bereits belegt.`)
      console.error(`Falls die App bereits unter ${APP_URL} läuft, dieses Fenster schließen.`)
      console.error('Andernfalls den anderen lokalen Server beenden und erneut starten.')
    } else {
      console.error(`Serverfehler: ${error.message}`)
    }
    process.exitCode = 1
  })

  server.listen(PORT, HOST, () => {
    console.log('')
    console.log('Graph-RAG Lab – Offline-Vortragsserver')
    console.log(`App: ${APP_URL}`)
    console.log(`Build: ${distDirectory}`)
    console.log('Keine Cloud und keine Server-Inferenz. Beenden mit Strg+C.')
    console.log('')

    if (process.argv.includes('--open')) openBrowser()
  })

  const stop = () => server.close(() => process.exit(0))
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}

main().catch((error) => {
  console.error(`Offline-Server konnte nicht starten: ${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
})
