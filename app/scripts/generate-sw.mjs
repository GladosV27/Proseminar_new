import { createHash } from 'node:crypto'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const appDirectory = path.resolve(scriptDirectory, '..')
const distDirectory = path.join(appDirectory, 'dist')
const serviceWorkerPath = path.join(distDirectory, 'sw.js')
const BUILD_PLACEHOLDER = '__APP_BUILD_ID__'
const MANIFEST_PLACEHOLDER = "['__PRECACHE_MANIFEST__']"
// Große optionale Laufzeiten (WebLLM/ONNX) würden sonst bereits beim ersten
// QR-Aufruf auf jedes Handy geladen. Sie werden erst bei bewusster Modell-
// bzw. Embedding-Wahl geladen und dann vom Runtime-Cache gespeichert.
const MAX_PRECACHE_FILE_BYTES = 3 * 1024 * 1024

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(directory, entry.name)
      return entry.isDirectory() ? listFiles(absolutePath) : [absolutePath]
    }),
  )
  return nested.flat()
}

function toScopedUrl(absolutePath) {
  const relativePath = path.relative(distDirectory, absolutePath).split(path.sep).join('/')
  return `./${relativePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`
}

async function createBuildId(files) {
  const hash = createHash('sha256')
  for (const file of files) {
    hash.update(toScopedUrl(file))
    hash.update(await readFile(file))
  }
  return hash.digest('hex').slice(0, 12)
}

async function main() {
  let files
  try {
    files = (await listFiles(distDirectory)).sort((a, b) => a.localeCompare(b, 'en'))
  } catch (error) {
    throw new Error(
      `Produktions-Build fehlt (${distDirectory}). Zuerst \"npm.cmd run build\" ausführen. ${error instanceof Error ? error.message : error}`,
    )
  }

  if (files.length === 0) throw new Error(`Der Build-Ordner ist leer: ${distDirectory}`)

  let template
  try {
    template = await readFile(serviceWorkerPath, 'utf8')
  } catch (error) {
    throw new Error(
      `Service-Worker-Vorlage fehlt im Build: ${serviceWorkerPath}. ${error instanceof Error ? error.message : error}`,
    )
  }

  if (!template.includes(BUILD_PLACEHOLDER) || !template.includes(MANIFEST_PLACEHOLDER)) {
    throw new Error(
      'Die Service-Worker-Vorlage enthält nicht alle Build-Platzhalter. Bitte app/public/sw.js prüfen.',
    )
  }

  const buildId = await createBuildId(files)
  const sizes = await Promise.all(files.map(async (file) => ({ file, bytes: (await stat(file)).size })))
  const precacheFiles = sizes
    .filter(({ file, bytes }) => !file.includes(`${path.sep}assets${path.sep}`) || bytes <= MAX_PRECACHE_FILE_BYTES)
    .map(({ file }) => file)
  const excluded = sizes.filter(({ file }) => !precacheFiles.includes(file))
  const manifest = precacheFiles.map(toScopedUrl)
  const generated = template
    .replaceAll(BUILD_PLACEHOLDER, buildId)
    .replace(MANIFEST_PLACEHOLDER, JSON.stringify(manifest, null, 2))

  await writeFile(serviceWorkerPath, generated, 'utf8')
  console.log(
    `Offline-App-Shell erzeugt: ${manifest.length} Dateien, Build ${buildId}, Cache graphrag-app-shell-${buildId}` +
      (excluded.length
        ? `; ${excluded.length} optionale Großdatei(en) (${(excluded.reduce((sum, item) => sum + item.bytes, 0) / 1024 / 1024).toFixed(1)} MB) werden erst bei Nutzung geladen`
        : ''),
  )
}

main().catch((error) => {
  console.error(`Offline-Build fehlgeschlagen: ${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
})
