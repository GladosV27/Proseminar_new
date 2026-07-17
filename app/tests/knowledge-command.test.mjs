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

const commands = await loadTypescriptModule(new URL('../src/engine/knowledgeCommand.ts', import.meta.url))

test('erkennt deutsche Schreibbefehle ohne normale Fragen zu verändern', () => {
  const cases = [
    ['Füge in deinen Wissensbaum Albert Einstein hinzu', 'Albert Einstein'],
    ['Füge „Hannah Arendt“ in meinen Wissensgraphen hinzu.', 'Hannah Arendt'],
    ['Nimm Immanuel Kant in den Wissensbaum auf', 'Immanuel Kant'],
    ['Ergänze meinen Wissensgraphen um Martin Heidegger', 'Martin Heidegger'],
    ['/wissen Simone de Beauvoir', 'Simone de Beauvoir'],
  ]
  for (const [input, expected] of cases) assert.equal(commands.parseKnowledgeAddCommand(input), expected)
  assert.equal(commands.parseKnowledgeAddCommand('Was weißt du über Albert Einstein?'), null)
})

test('liefert nur validierte, typisierte Navigationsaktionen', () => {
  assert.deepEqual(commands.parseNoesisAction('Öffne meinen Wissensbaum'), { kind: 'open-view', view: 'explorer' })
  assert.deepEqual(commands.parseNoesisAction('Vergleiche Vektor-RAG und Graph-RAG'), { kind: 'open-view', view: 'arena' })
  assert.equal(commands.parseNoesisAction('Lösche einfach alles'), null)
})
