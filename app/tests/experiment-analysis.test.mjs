import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

import {
  analysesForOutput,
  ExperimentAnalysisError,
  analyzeResults,
  distribution,
  extractResults,
  formatAnalysis,
  validateResults,
} from '../scripts/analyze-experiment-results.mjs'

function trial(condition, overrides = {}) {
  const graph = condition === 'graph'
  return {
    id: `${condition}_${overrides.questionId ?? 'q01'}_${overrides.repetition ?? 1}`,
    runId: 'run_night',
    repetitionId: 'run_night_r1',
    repetition: 1,
    order: graph ? 1 : 2,
    seed: 20260616,
    questionOrder: 1,
    conditionOrder: graph ? 1 : 2,
    orderStrategy: 'seeded-test',
    questionId: 'q01',
    condition,
    answer: graph ? 'Stuttgart.' : 'Dazu habe ich keine gesicherte Information.',
    contextChars: graph ? 800 : 500,
    retrievedIds: ['hegel'],
    latencyMs: graph ? 1200 : 1000,
    latencyScope: 'end-to-end',
    prepareMs: 20,
    retrievalMs: 10,
    generationMs: graph ? 1180 : 980,
    generationMetrics: {
      ttftMs: graph ? 200 : 150,
      tokensPerSecond: graph ? 30 : 35,
    },
    autoScore: graph ? 'korrekt' : 'enthaltung',
    engine: 'ollama:qwen3:8b',
    retrieval: 'dense',
    evidenceRecall: graph ? 1 : 0.5,
    evidencePrecision: graph ? 0.5 : 0.25,
    timestamp: 1784500000000,
    ...overrides,
  }
}

test('erkennt JSON-Export und verschachteltes Abgabe-Paket', () => {
  const rows = [trial('graph'), trial('vector')]
  assert.equal(extractResults({ results: rows }), rows)
  assert.equal(extractResults({ metadata_and_results: { results: rows } }), rows)
})

test('validiert, trennt Kohorten und berechnet echte Graph-minus-Vector-Paare', () => {
  const trials = validateResults({ results: [
    trial('graph'),
    trial('vector'),
    trial('graph', { id: 'g2', questionId: 'q02', repetition: 2, autoScore: 'falsch', latencyMs: 900 }),
    trial('vector', { id: 'v2', questionId: 'q02', repetition: 2, autoScore: 'korrekt', latencyMs: 1100 }),
  ] })
  const [analysis] = analyzeResults(trials)
  assert.equal(analysis.graph.n, 2)
  assert.equal(analysis.vector.n, 2)
  assert.equal(analysis.paired.n, 2)
  assert.equal(analysis.paired.accuracyDelta, 0)
  assert.equal(analysis.paired.graphOnlyCorrect, 1)
  assert.equal(analysis.paired.vectorOnlyCorrect, 1)
  assert.equal(analysis.paired.evidenceRecallDelta, 0.5)
  assert.equal(analysis.questionLevel.paired.n, 2)
  assert.equal(analysis.questionLevel.paired.graphOnlyCorrect, 1)
  assert.equal(analysis.questionLevel.paired.vectorOnlyCorrect, 1)
  assert.equal(analysis.missingPairs, 0)
  assert.match(formatAnalysis([analysis], { showPairs: true }), /q02\/W2/)
})

test('Genauigkeitsinferenz clustert fünf deterministische Wiederholungen auf 40 Fragen', () => {
  const rows = []
  const outcome = (questionIndex) => {
    if (questionIndex <= 28) return { graph: 'korrekt', vector: 'korrekt' }
    if (questionIndex <= 37) return { graph: 'korrekt', vector: 'falsch' }
    if (questionIndex <= 39) return { graph: 'falsch', vector: 'korrekt' }
    return { graph: 'falsch', vector: 'falsch' }
  }
  for (let questionIndex = 1; questionIndex <= 40; questionIndex++) {
    const questionId = `q${String(questionIndex).padStart(2, '0')}`
    const scores = outcome(questionIndex)
    for (let repetition = 1; repetition <= 5; repetition++) {
      for (const condition of ['graph', 'vector']) {
        rows.push(trial(condition, {
          id: `${condition}_${questionId}_${repetition}`,
          questionId,
          repetition,
          autoScore: scores[condition],
          answer: scores[condition] === 'korrekt' ? 'Belegte Antwort.' : 'Falsche Antwort.',
        }))
      }
    }
  }

  const [analysis] = analyzeResults(validateResults({ results: rows }))
  assert.equal(analysis.graph.n, 200)
  assert.equal(analysis.vector.n, 200)
  assert.equal(analysis.questionLevel.graph.n, 40)
  assert.equal(analysis.questionLevel.graph.correct, 37)
  assert.equal(analysis.questionLevel.vector.n, 40)
  assert.equal(analysis.questionLevel.vector.correct, 30)
  assert.equal(analysis.questionLevel.paired.graphOnlyCorrect, 9)
  assert.equal(analysis.questionLevel.paired.vectorOnlyCorrect, 2)
  assert.equal(analysis.questionLevel.paired.accuracyDelta, 0.175)
  assert.equal(analysis.questionLevel.paired.mcnemarExactP, 0.0654296875)
  assert.equal(analysis.paired.graphOnlyCorrect, 45)
  assert.equal(analysis.paired.vectorOnlyCorrect, 10)
  assert.equal('mcnemarExactP' in analysis.paired, false)
  assert.match(formatAnalysis([analysis], { showPairs: false }), /37\/40 Fragecluster korrekt/)
  assert.match(formatAnalysis([analysis], { showPairs: false }), /McNemar exakt p=0,0654/)

  const [compact] = analysesForOutput([analysis], { showPairs: false })
  assert.equal('pairs' in compact, false)
  assert.equal('pairs' in compact.questionLevel, false)
})

test('Median und IQR verwenden lineare Quantile und ignorieren fehlende Werte', () => {
  assert.deepEqual(distribution([1, 2, null, 3, 4]), {
    n: 4,
    median: 2.5,
    q1: 1.75,
    q3: 3.25,
    iqr: 1.5,
  })
})

test('mehrdeutige Paare und ungültige Evidenzwerte werden abgelehnt', () => {
  assert.throws(
    () => validateResults({ results: [trial('graph'), trial('graph', { id: 'duplicate_identity' })] }),
    (error) => error instanceof ExperimentAnalysisError && /Mehrdeutiger Trial/.test(error.message),
  )
  assert.throws(
    () => validateResults({ results: [trial('graph', { evidenceRecall: 1.2 })] }),
    (error) => error instanceof ExperimentAnalysisError && /evidenceRecall/.test(error.message),
  )
})

test('Ergebnis-UI verwendet Fragecluster für Wilson-Intervall und McNemar', async () => {
  const [experimentSource, resultsSource] = await Promise.all([
    readFile(new URL('../src/engine/experiment.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/views/Results.tsx', import.meta.url), 'utf8'),
  ])
  assert.match(experimentSource, /export function questionClusterSummary/)
  assert.match(experimentSource, /const sharedKeys = \[\.\.\.as\.keys\(\)\]/)
  assert.match(experimentSource, /trialPairs, excludedTies/)
  assert.match(resultsSource, /wilson\(summary\.correct, summary\.n\)/)
  assert.match(resultsSource, /Primäre Genauigkeit auf Frageebene/)
  assert.match(resultsSource, /McNemar und Genauigkeitsdifferenz verwenden gepaarte Fragecluster/)
})
