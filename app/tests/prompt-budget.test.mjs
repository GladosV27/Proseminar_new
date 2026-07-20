import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import ts from '../node_modules/typescript/lib/typescript.js'

const source = fs.readFileSync(new URL('../src/engine/promptBudget.ts', import.meta.url), 'utf8')
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const { compactPromptToCharacterBudget } = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`
)

test('native Prompt-Kompaktierung überschreitet auch bei riesiger Frage nie das Budget', () => {
  const prompt = `KONTEXT:\n${'Kontext '.repeat(2_000)}\n\nFRAGE:${' sehrlang'.repeat(2_000)}`
  const compacted = compactPromptToCharacterBudget(prompt, 1_800)
  assert.ok(compacted.length <= 1_800)
  assert.match(compacted, /^KONTEXT:/)
  assert.match(compacted, /FRAGE:/)
})

test('kurzer Prompt bleibt bytegleich', () => {
  assert.equal(compactPromptToCharacterBudget('FRAGE: Hallo?', 1_800), 'FRAGE: Hallo?')
})
