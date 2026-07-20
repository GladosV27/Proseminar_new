import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import ts from '../node_modules/typescript/lib/typescript.js'

async function loadTypescriptModule(path) {
  const source = fs.readFileSync(path, 'utf8')
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`)
}

const backup = await loadTypescriptModule(new URL('../src/engine/knowledgeBackup.ts', import.meta.url))
const appSource = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const settingsSource = fs.readFileSync(new URL('../src/views/MobileSettings.tsx', import.meta.url), 'utf8')
const conversationSource = fs.readFileSync(new URL('../src/views/Conversation.tsx', import.meta.url), 'utf8')
const knowledgeSource = fs.readFileSync(new URL('../src/views/PersonalKnowledge.tsx', import.meta.url), 'utf8')

const sampleKnowledge = {
  nodes: [{ id: 'custom-test', title: 'Test', summary: 'Ein lokaler Test.', type: 'konzept', community: 'custom' }],
  edges: [],
  imports: [],
}

test('Wissens-Backup lässt sich verlustfrei prüfen und wieder einlesen', () => {
  const encoded = backup.createKnowledgeBackup(sampleKnowledge, new Date('2026-07-20T12:00:00.000Z'))
  const decoded = backup.parseKnowledgeBackup(encoded)
  assert.equal(decoded.kind, 'noesis-local-knowledge')
  assert.equal(decoded.schemaVersion, 1)
  assert.equal(decoded.exportedAt, '2026-07-20T12:00:00.000Z')
  assert.deepEqual(decoded.knowledge, sampleKnowledge)
})

test('Wissens-Restore lehnt fremde und strukturell beschädigte Dateien ab', () => {
  assert.throws(() => backup.parseKnowledgeBackup('{"kind":"irgendwas"}'), /kein Noesis-Wissens-Backup/)
  assert.throws(
    () => backup.parseKnowledgeBackup(JSON.stringify({
      kind: 'noesis-local-knowledge',
      schemaVersion: 1,
      exportedAt: '2026-07-20T12:00:00.000Z',
      knowledge: { nodes: [{ id: 42 }], edges: [] },
    })),
    /unvollständig oder beschädigt/,
  )
})

test('Native App zeigt genau Chat, Wissen, Graph und Einstellungen', () => {
  const nativeNav = appSource.slice(appSource.indexOf('const NATIVE_NAV'), appSource.indexOf('const STUDY_NAV'))
  for (const label of ['Chat', 'Wissen', 'Graph', 'Einstellungen']) assert.match(nativeNav, new RegExp(`label: '${label}'`))
  for (const hidden of ['Experiment', 'Ergebnisse', 'Arena', 'Bewerten']) assert.doesNotMatch(nativeNav, new RegExp(hidden))
  assert.match(appSource, /nativeApp \? NATIVE_NAV/)
  assert.match(appSource, /nativeApp \? <MobileSettings ctx=\{ctx\} \/>/)
})

test('Mobile Einrichtung wählt das Geräte-Modell mit einem Hauptknopf', () => {
  assert.match(settingsSource, /capabilities\?\.recommendedModelId/)
  assert.match(settingsSource, /Bestes Modell für dieses Gerät einrichten/)
  assert.match(settingsSource, /if \(restoreOffline\) ctx\.setOnline\(false\)/)
  assert.match(settingsSource, /Erweiterte Modellwahl/)
})

test('Auto-Retrieval bleibt Standard und manuelle Wege liegen unter Erweitert', () => {
  assert.match(conversationSource, /return stored === 'vector'[\s\S]*: 'auto'/)
  assert.match(conversationSource, /<summary>Erweitert/)
  assert.match(conversationSource, /\(\['vector', 'graph', 'hybrid'\] as ChatRetrievalMode\[\]\)/)
})

test('Eigene Quellen sind einzeln löschbar und manuell sicherbar', () => {
  assert.match(knowledgeSource, /function removeEntry\(/)
  assert.match(knowledgeSource, /function removeWikipediaImport\(/)
  assert.match(knowledgeSource, /createKnowledgeBackup\(ctx\.custom\)/)
  assert.match(knowledgeSource, /parseKnowledgeBackup\(await file\.text\(\)\)/)
})
