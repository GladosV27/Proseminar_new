import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import ts from '../node_modules/typescript/lib/typescript.js'

function transpile(path) {
  return ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
}

const textJs = transpile(new URL('../src/engine/text.ts', import.meta.url))
const textUrl = `data:text/javascript;base64,${Buffer.from(textJs).toString('base64')}`
const graphJs = transpile(new URL('../src/engine/graphRag.ts', import.meta.url)).replace("'./text'", `'${textUrl}'`)
const { GraphIndex } = await import(`data:text/javascript;base64,${Buffer.from(graphJs).toString('base64')}`)

const graph = {
  nodes: [
    { id: 'a', title: 'Alpha', type: 'konzept', community: 'test', summary: 'Alpha begründet die Erkenntnistheorie.' },
    { id: 'b', title: 'Beta', type: 'konzept', community: 'test', summary: 'Beta entwickelt die Theorie weiter.' },
    { id: 'c', title: 'Gamma', type: 'konzept', community: 'test', summary: 'Ein unabhängiges Thema.' },
  ],
  edges: [{ source: 'a', target: 'b', relation: 'beeinflusst', label: 'beeinflusst' }],
}

test('Graph-RAG traversiert eine explizite Beziehung vom erkannten Seed', () => {
  const result = new GraphIndex(graph).extract('Wie beeinflusst Alpha Beta?', { depth: 2, beam: 3, maxNodes: 6 })
  assert.deepEqual(result.seeds.map((node) => node.id), ['a', 'b'])
  assert.ok(result.nodes.some((node) => node.id === 'a'))
  assert.ok(result.nodes.some((node) => node.id === 'b'))
  assert.equal(result.edges.length, 1)
  assert.match(result.context, /Alpha — beeinflusst → Beta/)
})
