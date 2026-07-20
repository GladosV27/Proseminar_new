import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import ts from '../node_modules/typescript/lib/typescript.js'

async function loadTs(path) {
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
}

const ollama = await loadTs('../src/engine/ollama.ts')
const resume = await loadTs('../src/engine/experimentResume.ts')
const experimentSource = fs.readFileSync(new URL('../src/views/Experiment.tsx', import.meta.url), 'utf8')
const resultsSource = fs.readFileSync(new URL('../src/views/Results.tsx', import.meta.url), 'utf8')

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function ndjsonResponse(chunks) {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream({
    start(controller) {
      // Absichtlich mitten in einer JSON-Zeile teilen: der Parser muss echte
      // Netz-Chunkgrenzen statt idealisierter Zeilen verarbeiten.
      const text = chunks.map((chunk) => JSON.stringify(chunk)).join('\n') + '\n'
      const split = Math.floor(text.length / 2)
      controller.enqueue(encoder.encode(text.slice(0, split)))
      controller.enqueue(encoder.encode(text.slice(split)))
      controller.close()
    },
  }), { status: 200 })
}

test('Ollama-Messstand friert schnelle deterministische Defaults ein', () => {
  const config = ollama.frozenOllamaConfig()
  assert.equal(config.model, 'qwen3:8b')
  assert.equal(config.temperature, 0)
  assert.equal(config.seed, 42)
  assert.equal(config.numCtx, 4096)
  assert.equal(config.numPredict, 160)
  assert.equal(config.think, false)
  assert.equal(config.keepAlive, '30m')
  assert.equal(Object.isFrozen(config), true)
})

test('Ollama-Engine prüft, wärmt vor und speichert Digest sowie Laufzeitmetriken', async () => {
  const originalFetch = globalThis.fetch
  const requests = []
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init, body: init.body ? JSON.parse(init.body) : undefined })
    const path = new URL(String(url)).pathname
    if (path === '/api/version') return jsonResponse({ version: '0.32.1' })
    if (path === '/api/tags') return jsonResponse({ models: [{
      name: 'qwen3:8b',
      model: 'qwen3:8b',
      digest: '500a1f067a9f-full-digest',
      size: 5_200_000_000,
      details: { parameter_size: '8.2B', quantization_level: 'Q4_K_M' },
    }] })
    if (path === '/api/generate') return jsonResponse({ done: true })
    if (path === '/api/ps') return jsonResponse({ models: [{ name: 'qwen3:8b', size_vram: 5_200_000_000 }] })
    if (path === '/api/chat') return ndjsonResponse([
      { model: 'qwen3:8b', message: { content: 'Hegel ' }, done: false },
      {
        model: 'qwen3:8b',
        message: { content: 'schrieb die Phänomenologie des Geistes.' },
        done: true,
        total_duration: 1_100_000_000,
        load_duration: 2_000_000,
        prompt_eval_count: 300,
        prompt_eval_duration: 600_000_000,
        eval_count: 20,
        eval_duration: 500_000_000,
      },
    ])
    throw new Error(`unerwarteter Pfad ${path}`)
  }

  try {
    const engine = new ollama.OllamaEngine()
    await engine.load()
    let streamed = ''
    const result = await engine.generate('System', 'Frage', (partial) => { streamed = partial })
    assert.equal(result.text, 'Hegel schrieb die Phänomenologie des Geistes.')
    assert.equal(streamed, result.text)
    assert.equal(result.metrics.promptTokens, 300)
    assert.equal(result.metrics.completionTokens, 20)
    assert.equal(result.metrics.tokensPerSecond, 40)
    assert.ok(result.metrics.ttftMs >= 0)
    assert.equal(result.provenance.digest, '500a1f067a9f-full-digest')
    assert.equal(result.provenance.runtime, 'Ollama 0.32.1')
    assert.equal(result.provenance.parameters.think, false)
    assert.equal(result.provenance.residentVramBytes, 5_200_000_000)

    const chat = requests.find((request) => request.url.endsWith('/api/chat')).body
    assert.equal(chat.think, false)
    assert.equal(chat.options.temperature, 0)
    assert.equal(chat.options.seed, 42)
    assert.equal(chat.options.num_ctx, 4096)
    assert.equal(chat.options.num_predict, 160)
    assert.equal(chat.keep_alive, '30m')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('fehlendes Ollama-Modell wird erklärt und niemals durch eine andere Engine ersetzt', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    const path = new URL(String(url)).pathname
    if (path === '/api/version') return jsonResponse({ version: '0.32.1' })
    if (path === '/api/tags') return jsonResponse({ models: [] })
    throw new Error(`unerwarteter Pfad ${path}`)
  }
  try {
    const engine = new ollama.OllamaEngine()
    await assert.rejects(() => engine.load(), /ollama pull qwen3:8b/)
    await assert.rejects(() => engine.generate('System', 'Frage'), /noch nicht geprüft und vorgewärmt/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Checkpoint überspringt nur bereits erfolgreiche Trials derselben Run-, Engine- und Retrieval-Identität', () => {
  const provenance = {
    provider: 'ollama', model: 'qwen3:8b', digest: 'abc', runtime: 'Ollama 0.32.1',
    parameters: { temperature: 0, seed: 42, numCtx: 4096, numPredict: 160, think: false, keepAlive: '30m' },
  }
  const fingerprint = resume.experimentConfigFingerprint({
    engineId: 'ollama:qwen3:8b', modelProvenance: provenance, retrieval: 'dense',
    conditions: ['baseline', 'graph'], repetitions: 1, seed: 42,
  })
  const checkpoint = resume.newCheckpoint(fingerprint, 2, {
    retrieval: 'dense', conditions: ['baseline', 'graph'], repetitions: 1, seed: 42,
  }, 1_000)
  const schedule = [
    { repetition: 1, condition: 'baseline', question: { id: 'q01' } },
    { repetition: 1, condition: 'graph', question: { id: 'q01' } },
  ]
  const results = [{
    runId: checkpoint.runId, engine: 'ollama:qwen3:8b', retrieval: 'dense',
    repetition: 1, condition: 'baseline', questionId: 'q01',
  }]
  const state = resume.pendingTrials(schedule, results, checkpoint, 'ollama:qwen3:8b', 'dense')
  assert.equal(state.completed, 1)
  assert.deepEqual(state.pending, [schedule[1]])

  const changed = resume.experimentConfigFingerprint({
    engineId: 'ollama:qwen3:8b', modelProvenance: { ...provenance, digest: 'different' }, retrieval: 'dense',
    conditions: ['baseline', 'graph'], repetitions: 1, seed: 42,
  })
  assert.notEqual(changed, fingerprint)
})

test('Checkpoint speichert die komplette Dense-Laufkonfiguration für einen Reload', () => {
  const settings = {
    retrieval: 'dense', conditions: ['baseline', 'vector', 'graph'], repetitions: 3, seed: 20260616,
  }
  const checkpoint = resume.newCheckpoint('abc12345', 1596, settings, 1_000)
  const storage = {
    getItem: () => JSON.stringify(checkpoint),
  }
  assert.deepEqual(resume.loadCheckpoint(storage).settings, settings)
})

test('Nachtlauf prüft Dense vor dem ersten Trial und hängt Ergebnisse atomar an', () => {
  const denseLoad = experimentSource.indexOf('await loadDenseModel(')
  const denseIndex = experimentSource.indexOf('await getDenseIndex(BASE_GRAPH).ensureBuilt(')
  const firstTrial = experimentSource.indexOf('await ctx.baseRunner.run(')
  assert.ok(denseLoad > 0 && denseLoad < firstTrial)
  assert.ok(denseIndex > denseLoad && denseIndex < firstTrial)
  assert.match(experimentSource, /ctx\.setResults\(\(current\) => \[\.\.\.current, \{ \.\.\.result, executionEnvironment \}\]\)/)
})

test('Messdaten können während eines laufenden Nachtlaufs nicht gelöscht werden', () => {
  assert.match(resultsSource, /if \(ctx\.experimentStatus\.state === 'running'\) return/)
  assert.match(resultsSource, /disabled=\{ctx\.experimentStatus\.state === 'running'\}/)
})
