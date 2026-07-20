import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import ts from '../node_modules/typescript/lib/typescript.js'

const source = fs.readFileSync(new URL('../src/engine/seminarStream.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const { consumeSeminarSse } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)

const encoder = new TextEncoder()

function chunkedStream(chunks) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

test('liest Text-Deltas trotz beliebiger Chunk- und CRLF-Grenzen und verlangt DONE', async () => {
  const partials = []
  const result = await consumeSeminarSse(chunkedStream([
    'data: {"te',
    'xt":"Hallo"}\r',
    '\n\r\ndata: {"text":" Welt"}\n\n',
    'data: [DO',
    'NE]\n\n',
  ]), (partial) => partials.push(partial), { throttleMs: 100 })

  assert.equal(result.text, 'Hallo Welt')
  assert.equal(partials.at(-1), 'Hallo Welt')
  assert.ok(partials.length <= 2, 'schnelle Deltas werden für die UI gebündelt')
})

test('verwirft beschädigtes JSON im Antwortstream', async () => {
  await assert.rejects(
    consumeSeminarSse(chunkedStream(['data: {kaputt}\n\ndata: [DONE]\n\n'])),
    /ungültigen Antwortstream/u,
  )
})

test('meldet einen vorzeitig beendeten Stream ohne DONE', async () => {
  await assert.rejects(
    consumeSeminarSse(chunkedStream(['data: {"text":"Teilantwort"}\n\n'])),
    /vorzeitig beendet/u,
  )
})

test('bricht einen offenen Stream über AbortSignal ab', async () => {
  let cancelled = false
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"text":"Anfang"}\n\n'))
    },
    cancel() {
      cancelled = true
    },
  })
  const abortController = new AbortController()
  const result = consumeSeminarSse(stream, undefined, { signal: abortController.signal })
  abortController.abort()

  await assert.rejects(result, (error) => error?.name === 'AbortError')
  assert.equal(cancelled, true)
})
