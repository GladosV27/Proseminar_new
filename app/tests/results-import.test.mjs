import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import ts from '../node_modules/typescript/lib/typescript.js'

const source = fs.readFileSync(new URL('../src/engine/resultsImport.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const { parseResultsImport, planResultsImport, ResultsImportError } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`
)

function trial(overrides = {}) {
  return {
    id: 't_1',
    runId: 'run_pc',
    repetitionId: 'run_pc_r1',
    repetition: 1,
    order: 1,
    seed: 20260616,
    questionOrder: 1,
    conditionOrder: 1,
    orderStrategy: 'seeded-test',
    questionId: 'q01',
    condition: 'graph',
    answer: 'Hegel; sagte: "Geist".\nZweite Zeile.',
    contextChars: 1200,
    retrievedIds: ['hegel', 'phaenomenologie'],
    latencyMs: 1234.5,
    latencyScope: 'end-to-end',
    prepareMs: 34.5,
    retrievalMs: 12,
    generationMs: 1200,
    autoScore: 'korrekt',
    manualScore: 'teilweise',
    blind: { A: 'korrekt' },
    engine: 'Phi-3.5-mini-instruct',
    retrieval: 'dense',
    evidenceRecall: 1,
    evidencePrecision: 0.5,
    timestamp: 1784500000000,
    ...overrides,
  }
}

const columns = [
  'id', 'runId', 'repetitionId', 'repetition', 'order', 'seed', 'questionOrder', 'conditionOrder',
  'orderStrategy', 'questionId', 'condition', 'retrieval', 'engine', 'autoScore', 'manualScore', 'blindA',
  'blindB', 'latencyMs', 'latencyScope', 'prepareMs', 'retrievalMs', 'generationMs', 'contextChars',
  'evidenceRecall', 'evidencePrecision', 'retrievedIds', 'timestamp', 'answer',
]

function csvCell(value) {
  const text = String(value ?? '')
  return /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function csvFor(result) {
  const flat = {
    ...result,
    blindA: result.blind?.A ?? '',
    blindB: result.blind?.B ?? '',
    retrievedIds: result.retrievedIds.join('|'),
  }
  return `${columns.join(';')}\r\n${columns.map((column) => csvCell(flat[column])).join(';')}\r\n`
}

function extendedCsvFor(result) {
  const extended = [
    ...columns.slice(0, -1),
    'executionEnvironment', 'generationMetrics', 'modelProvenance', 'answer',
  ]
  const flat = {
    ...result,
    blindA: result.blind?.A ?? '',
    blindB: result.blind?.B ?? '',
    retrievedIds: result.retrievedIds.join('|'),
    executionEnvironment: JSON.stringify(result.executionEnvironment ?? null),
    generationMetrics: JSON.stringify(result.generationMetrics ?? null),
    modelProvenance: JSON.stringify(result.modelProvenance ?? null),
  }
  return `${extended.join(';')}\r\n${extended.map((column) => csvCell(flat[column])).join(';')}\r\n`
}

test('JSON-Export und Abgabe-Paket werden als kanonische Trialdaten erkannt', () => {
  const result = trial()
  const json = parseResultsImport(JSON.stringify({ schemaVersion: 3, results: [result] }), 'ergebnisse.json')
  assert.equal(json.format, 'json')
  assert.deepEqual(json.results, [result])
  assert.deepEqual(json.runIds, ['run_pc'])

  const bundle = parseResultsImport(JSON.stringify({
    README: 'Paket',
    metadata_and_results: { schemaVersion: 3, results: [result] },
    csv: 'wird nicht als Quelle verwendet',
  }), 'abgabe-paket.json')
  assert.equal(bundle.format, 'submission-bundle')
  assert.deepEqual(bundle.results, [result])
})

test('Ausführungsumgebung des PCs bleibt beim JSON-Import am Trial erhalten', () => {
  const executionEnvironment = {
    capturedAt: 1784500000000,
    userAgent: 'PC-Testbrowser',
    platform: 'Win32',
    language: 'de-DE',
    origin: 'http://localhost:4173',
    hardwareConcurrency: 16,
    deviceMemoryGiB: 8,
    webgpu: true,
  }
  const preview = parseResultsImport(
    JSON.stringify({ schemaVersion: 3, results: [trial({ executionEnvironment })] }),
    'pc-ergebnisse.json',
  )
  assert.deepEqual(preview.results[0].executionEnvironment, executionEnvironment)
})

test('Ollama-Metriken und eingefrorene Modellprovenienz bleiben in JSON und CSV erhalten', () => {
  const generationMetrics = {
    ttftMs: 312.4,
    promptTokens: 420,
    completionTokens: 38,
    tokensPerSecond: 41.6,
    modelLoadMs: 2,
    promptEvalMs: 510,
    modelTotalMs: 1076,
  }
  const modelProvenance = {
    provider: 'ollama',
    model: 'qwen3:8b',
    digest: '500a1f067a9f',
    runtime: 'Ollama 0.32.1',
    endpoint: 'http://127.0.0.1:11434',
    parameterSize: '8.2B',
    quantization: 'Q4_K_M',
    modelSizeBytes: 5_200_000_000,
    residentVramBytes: 5_200_000_000,
    parameters: {
      temperature: 0, seed: 42, numCtx: 4096, numPredict: 160, think: false, keepAlive: '30m',
    },
  }
  const result = trial({ engine: 'ollama:qwen3:8b', generationMetrics, modelProvenance })
  const json = parseResultsImport(JSON.stringify({ schemaVersion: 4, results: [result] }), 'v4.json')
  assert.deepEqual(json.results[0].generationMetrics, generationMetrics)
  assert.deepEqual(json.results[0].modelProvenance, modelProvenance)

  const csv = parseResultsImport(extendedCsvFor(result), 'v4.csv')
  assert.deepEqual(csv.results[0].generationMetrics, generationMetrics)
  assert.deepEqual(csv.results[0].modelProvenance, modelProvenance)
})

test('CSV-Import erhält Semikolons, Anführungszeichen und Zeilenumbrüche in Antworten', () => {
  const result = trial()
  const preview = parseResultsImport(csvFor(result), 'ergebnisse.csv')
  assert.equal(preview.format, 'csv')
  assert.equal(preview.results.length, 1)
  assert.equal(preview.results[0].answer, result.answer)
  assert.deepEqual(preview.results[0].retrievedIds, result.retrievedIds)
  assert.deepEqual(preview.results[0].blind, result.blind)
})

test('Import verwirft manipulierte Enums und Zahlen statt Teilbestände zu speichern', () => {
  assert.throws(
    () => parseResultsImport(JSON.stringify({ schemaVersion: 3, results: [trial({ condition: 'free_prompt' })] }), 'bad.json'),
    (error) => error instanceof ResultsImportError && /unbekannte Bedingung/.test(error.message),
  )
  assert.throws(
    () => parseResultsImport(JSON.stringify({ schemaVersion: 3, results: [trial({ evidenceRecall: 1.5 })] }), 'bad.json'),
    (error) => error instanceof ResultsImportError && /evidenceRecall/.test(error.message),
  )
  assert.throws(
    () => parseResultsImport(JSON.stringify({ schemaVersion: 99, results: [trial()] }), 'future.json'),
    /neuer als diese App unterstützt/,
  )
  assert.throws(
    () => parseResultsImport(
      JSON.stringify({ schemaVersion: 3, results: [trial({ questionId: 'fremde-frage' })] }),
      'fremd.json',
      new Set(['q01', 'q02']),
    ),
    /unbekannte Frage-ID.*dieselbe Stichprobe/,
  )
})

test('Dubletten innerhalb einer Datei werden deterministisch übersprungen', () => {
  const first = trial()
  const preview = parseResultsImport(JSON.stringify({ schemaVersion: 3, results: [first, { ...first, id: 't_other' }] }), 'dupe.json')
  assert.equal(preview.sourceRows, 2)
  assert.equal(preview.results.length, 1)
  assert.equal(preview.duplicateRows, 1)
  assert.match(preview.warnings[0], /Dublette/)
})

test('Kollidierende Trial-IDs innerhalb einer Datei brechen den Import vollständig ab', () => {
  assert.throws(
    () => parseResultsImport(JSON.stringify({
      schemaVersion: 3,
      results: [trial(), trial({ questionId: 'q02', condition: 'vector' })],
    }), 'collision.json'),
    /Trial-ID-Konflikt/,
  )
})

test('Zusammenführen dedupliziert; Run- und Gesamtersatz haben klar abgegrenzte Wirkung', () => {
  const currentSame = trial({ answer: 'lokal' })
  const currentOther = trial({ id: 't_old', runId: 'run_old', repetitionId: 'run_old_r1', answer: 'anderer Lauf' })
  const importedSameRun = trial({ id: 't_new', answer: 'vom PC' })

  const merge = planResultsImport([currentSame, currentOther], [importedSameRun], 'merge')
  assert.equal(merge.added, 0)
  assert.equal(merge.duplicatesSkipped, 1)
  assert.deepEqual(merge.results, [currentSame, currentOther])

  const replaceRun = planResultsImport([currentSame, currentOther], [importedSameRun], 'replace-runs')
  assert.equal(replaceRun.existingRemoved, 1)
  assert.equal(replaceRun.added, 1)
  assert.deepEqual(replaceRun.results, [currentOther, importedSameRun])

  const replaceAll = planResultsImport([currentSame, currentOther], [importedSameRun], 'replace-all')
  assert.equal(replaceAll.existingRemoved, 2)
  assert.deepEqual(replaceAll.results, [importedSameRun])
})

test('Gleiche ID mit anderer Trial-Identität wird im Merge als Konflikt verworfen', () => {
  const current = trial()
  const maliciousCollision = trial({ questionId: 'q02', condition: 'vector' })
  const plan = planResultsImport([current], [maliciousCollision], 'merge')
  assert.equal(plan.added, 0)
  assert.equal(plan.conflictsSkipped, 1)
  assert.deepEqual(plan.results, [current])
})
