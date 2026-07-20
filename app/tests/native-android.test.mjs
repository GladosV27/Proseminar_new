import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const nativeTs = fs.readFileSync(new URL('../src/engine/nativeLlm.ts', import.meta.url), 'utf8')
const manager = fs.readFileSync(
  new URL('../android/app/src/main/java/de/tudortmund/noesis/NativeLlmManager.kt', import.meta.url),
  'utf8',
)
const catalog = fs.readFileSync(
  new URL('../android/app/src/main/java/de/tudortmund/noesis/ModelCatalog.kt', import.meta.url),
  'utf8',
)
const plugin = fs.readFileSync(
  new URL('../android/app/src/main/java/de/tudortmund/noesis/NoesisNativeLlmPlugin.kt', import.meta.url),
  'utf8',
)
const mainActivity = fs.readFileSync(
  new URL('../android/app/src/main/java/de/tudortmund/noesis/MainActivity.java', import.meta.url),
  'utf8',
)
const speechPlugin = fs.readFileSync(
  new URL('../android/app/src/main/java/de/tudortmund/noesis/NoesisSpeechPlugin.kt', import.meta.url),
  'utf8',
)
const manifest = fs.readFileSync(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8')
const gradle = fs.readFileSync(new URL('../android/app/build.gradle', import.meta.url), 'utf8')
const liveVoice = fs.readFileSync(new URL('../src/engine/liveVoice.ts', import.meta.url), 'utf8')
const conversation = fs.readFileSync(new URL('../src/views/Conversation.tsx', import.meta.url), 'utf8')
const experiment = fs.readFileSync(new URL('../src/views/Experiment.tsx', import.meta.url), 'utf8')
const workflow = fs.readFileSync(new URL('../../.github/workflows/android-apk.yml', import.meta.url), 'utf8')
const androidIgnore = fs.readFileSync(new URL('../android/.gitignore', import.meta.url), 'utf8')

test('APK nutzt LiteRT-LM nativ auf der CPU und registriert die Capacitor-Bridge', () => {
  assert.match(gradle, /litertlm-android:0\.14\.0/)
  assert.match(gradle, /abiFilters\s+'arm64-v8a'/)
  assert.match(manager, /Backend\.CPU\(threadCount\s*=\s*cpuThreadCount\(\)\)/)
  assert.doesNotMatch(manager, /Backend\.GPU|Backend\.NPU/)
  assert.match(plugin, /@CapacitorPlugin\(name\s*=\s*"NoesisNativeLlm"\)/)
  assert.match(mainActivity, /registerPlugin\(NoesisNativeLlmPlugin\.class\)/)
})

test('Web- und Kotlin-Katalog verwenden dieselben geprüften Mobilmodelle', () => {
  for (const id of ['gemma-4-e2b-it', 'qwen3-0.6b-mobile']) {
    assert.match(nativeTs, new RegExp(id.replaceAll('.', '\\.')))
    assert.match(catalog, new RegExp(id.replaceAll('.', '\\.')))
  }
  assert.match(catalog, /2_588_147_712L/)
  assert.match(catalog, /181938105e0eefd105961417e8da75903eacda102c4fce9ce90f50b97139a63c/)
  assert.match(catalog, /347_251_840L/)
  assert.match(catalog, /2df6821ec12702dafd33915e7a1a1adc7c4b053f3672fd9555dfaf3a114c4139/)
  assert.match(catalog, /9262660a1676eed6d0c477ab1a86344430854664/)
  assert.match(catalog, /6aa2daf8aba4aa456797fb8040b36a3948bcfda7/)
  assert.doesNotMatch(catalog, /resolve\/main/)
})

test('Download wartet auf den verifizierten Zustand und lässt sich fortsetzen', () => {
  assert.match(manager, /setRequestProperty\("Range",\s*"bytes=\$rangeStart-"\)/)
  assert.match(manager, /sha256\(part\)/)
  assert.match(manager, /Os\.rename\(part\.absolutePath,\s*final\.absolutePath\)/)
  assert.match(nativeTs, /status\.state === 'ready' \|\| status\.state === 'loaded'/)
  assert.match(nativeTs, /await new Promise\(\(resolve\) => setTimeout\(resolve, 600\)\)/)
  assert.match(manager, /loaded\.toDouble\(\) \/ spec\.downloadBytes\.toDouble\(\)/)
  assert.match(nativeTs, /Math\.max\(0, Math\.min\(1, eventPct\)\)/)
  assert.ok(
    manager.indexOf('downloadErrors.containsKey(modelId) -> "error"') <
      manager.indexOf('partialFile.exists() && partialFile.length() > 0L -> "partial"'),
    'Ein abgebrochener Teildownload muss als Fehler statt dauerhaft als partial gemeldet werden',
  )
})

test('Eine alte native Instanz kann ein neu geladenes Modell nicht entsorgen', () => {
  assert.match(nativeTs, /NativeLlm\.dispose\(\{ modelId: this\.modelId \}\)/)
  assert.match(manager, /expectedModelId != null && loadedModel\?\.id != expectedModelId/)
  const disposeBlock = manager.slice(manager.indexOf('suspend fun dispose'))
  assert.ok(
    disposeBlock.indexOf('expectedModelId != null') < disposeBlock.indexOf('interrupt(null)'),
    'Der Ownership-Guard muss vor dem globalen Interrupt greifen',
  )
})

test('Qwen antwortet ohne Thinking-Latenz und LiteRT-Streamdeltas bleiben vollständig', () => {
  assert.match(manager, /mapOf\("enable_thinking" to false\)/)
  assert.match(manager, /sendMessageAsync\(user, extraContext\)/)
  assert.match(manager, /val delta = raw\.take\(remaining\)/)
  assert.doesNotMatch(manager, /raw\.startsWith\(previous\)|previous\.endsWith\(raw\)/)
  assert.match(manager, /CHARS_PER_REQUESTED_TOKEN_GUARD = 5/)
  assert.match(nativeTs, /qwen3-0\.6b-mobile' \? 1_800 : 10_500/)
})

test('APK besitzt native Android-Spracherkennung samt Laufzeitberechtigung', () => {
  assert.match(manifest, /android\.permission\.RECORD_AUDIO/)
  assert.match(speechPlugin, /@CapacitorPlugin\([\s\S]*name = "NoesisSpeech"/)
  assert.match(speechPlugin, /requestPermissionForAlias\("microphone"/)
  assert.match(speechPlugin, /SpeechRecognizer\.createSpeechRecognizer/)
  assert.match(speechPlugin, /RecognizerIntent\.EXTRA_PREFER_OFFLINE, true/)
  assert.match(mainActivity, /registerPlugin\(NoesisSpeechPlugin\.class\)/)
})

test('Offline-Toggle erlaubt Sprache nur über die native Android-Brücke', () => {
  assert.match(liveVoice, /recognitionProvider: 'native-android' \| 'web-speech' \| 'none'/)
  assert.match(conversation, /!ctx\.online && voiceCapabilities\.recognitionProvider !== 'native-android'/)
  assert.match(conversation, /!voiceCapabilities\.synthesis && !neuralVoiceReady/)
})

test('Mobile Engines bleiben Pilot und verändern nicht die Hauptmessung', () => {
  assert.match(experiment, /nativePilotEngine = ctx\.engine\.id\.startsWith\('native:'\)/)
  assert.match(experiment, /disabled=\{nativePilotEngine \|\| conditions\.length === 0/)
  assert.match(nativeTs, /minimumRamMB: 3_400/)
  assert.match(catalog, /minimumRamMb = 3_400/)
})

test('Release-Workflow akzeptiert nur vollständige Signierung und versioniert keine Schlüssel', () => {
  for (const secret of [
    'NOESIS_KEYSTORE_BASE64',
    'NOESIS_KEYSTORE_PASSWORD',
    'NOESIS_KEY_ALIAS',
    'NOESIS_KEY_PASSWORD',
  ]) assert.match(workflow, new RegExp(secret))
  assert.match(workflow, /-n "\$KEYSTORE_BASE64" && -n "\$KEYSTORE_PASSWORD" && -n "\$KEY_ALIAS" && -n "\$KEY_PASSWORD"/)
  assert.match(androidIgnore, /^\*\.jks$/m)
  assert.match(androidIgnore, /^\*\.keystore$/m)
})
