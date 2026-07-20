import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../src/engine/neuralVoice.ts', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const packagePatch = await readFile(
  new URL('../patches/@mintplex-labs+piper-tts-web+1.0.4.patch', import.meta.url),
  'utf8',
)
const installedPiper = await readFile(
  new URL('../node_modules/@mintplex-labs/piper-tts-web/dist/piper-tts-web.js', import.meta.url),
  'utf8',
)

test('Piper akzeptiert keine Fehlerseite oder unvollständige ONNX-Datei als Stimme', () => {
  assert.match(source, /PIPER_MODEL_BYTES = 63_201_294/)
  assert.match(source, /if \(!response\.ok\)/)
  assert.match(source, /received !== PIPER_MODEL_BYTES/)
  assert.match(source, /prefix\.startsWith\('<'\)/)
  assert.match(source, /await removeCachedVoice\(\)/)
  assert.doesNotMatch(source, /const \{ download \} = await piper\(\)/)
})

test('Piper-Modell ist auf eine geprüfte Hugging-Face-Revision festgelegt', () => {
  assert.match(source, /PIPER_VOICE_REVISION = '840e38a7e26d813bd6221b78cfbaefa3585b3f71'/)
  assert.match(source, /cache: 'no-store'/)
  assert.match(source, /redirect: 'follow'/)
})

test('Patch setzt lokale WASM-Pfade vor ONNX-Initialisierung und wird nach npm install angewendet', () => {
  assert.equal(packageJson.scripts.postinstall, 'patch-package')
  assert.match(packagePatch, /runtime paths must be installed before init/)
  const constructorStart = installedPiper.indexOf('this.voiceId = voiceId;')
  const wasmPosition = installedPiper.indexOf('__privateSet(this, _wasmPaths', constructorStart)
  const initPosition = installedPiper.indexOf('this.waitReady = this.init()', constructorStart)
  assert.ok(wasmPosition >= 0 && initPosition > wasmPosition)
})
