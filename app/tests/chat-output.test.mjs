import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import ts from '../node_modules/typescript/lib/typescript.js'

const source = fs.readFileSync(new URL('../src/engine/chatOutput.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const { completeChatAnswer } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)

test('entfernt nach einem Tokenlimit nur das unvollständige Schlussfragment', () => {
  const answer = completeChatAnswer(
    'Einstein entwickelte die Relativitätstheorie. Er leistete wichtige Beiträge zur Quantenphysik. In einer späteren Umfrage wurde er mit Newton, Maxwell',
  )
  assert.equal(
    answer.text,
    'Einstein entwickelte die Relativitätstheorie. Er leistete wichtige Beiträge zur Quantenphysik.',
  )
  assert.equal(answer.trimmed, true)
})

test('lässt eine vollständig abgeschlossene Antwort unverändert', () => {
  const answer = completeChatAnswer('Einstein entwickelte die Relativitätstheorie.')
  assert.equal(answer.text, 'Einstein entwickelte die Relativitätstheorie.')
  assert.equal(answer.trimmed, false)
})
