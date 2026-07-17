import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import ts from '../node_modules/typescript/lib/typescript.js'

const source = fs.readFileSync(new URL('../src/engine/conversationContext.ts', import.meta.url), 'utf8')
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const context = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`)

test('behandelt die Mathetower-Frage trotz „es“ als neues Thema', () => {
  const question = 'Wie viele Etagen hat der Mathetower der TU-Dortmund. Falls du es nicht weißt, füge es in deinen Wissensbaum hinzu'
  assert.equal(context.isFollowUpQuestion(question), false)
  assert.equal(context.requestsKnowledgeFallback(question), true)
  assert.equal(
    context.contextualizeRetrievalQuestion(question, 'Wer war Albert Einstein?'),
    'Wie viele Etagen hat der Mathetower der TU-Dortmund',
  )
})

test('behält echte Anschlussfragen beim vorherigen Thema', () => {
  assert.equal(context.isFollowUpQuestion('Was schrieb er danach?'), true)
  assert.equal(
    context.contextualizeRetrievalQuestion('Was schrieb er danach?', 'Wer war Immanuel Kant?'),
    'Wer war Immanuel Kant?\nAnschlussfrage: Was schrieb er danach?',
  )
})
