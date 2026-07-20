#!/usr/bin/env node

/**
 * Validiert einen Noesis-Ergebnisexport (JSON oder Abgabe-Paket) und wertet
 * Graph-RAG gegen Vektor-RAG aus. Es werden niemals verschiedene Messläufe,
 * Engines oder Retrieval-Backends in einer Kohorte zusammengefasst.
 *
 * Aufruf:
 *   node scripts/analyze-experiment-results.mjs graphrag-ergebnisse.json
 *   node scripts/analyze-experiment-results.mjs paket.json --run run_abc --json
 */

import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const SCORES = new Set(['korrekt', 'teilweise', 'falsch', 'enthaltung'])
const CONDITIONS = new Set(['baseline', 'vector', 'graph', 'vector_budget', 'hybrid', 'graph_no_edges'])
const RETRIEVALS = new Set(['tfidf', 'dense'])
const MAX_BYTES = 25 * 1024 * 1024

const ABSTENTION_MARKERS = [
  'keine gesicherte information',
  'keine information',
  'nicht im korpus',
  'nicht bekannt',
  'weiß ich nicht',
  'weiss ich nicht',
  'kann ich nicht beantworten',
  'enthalte mich',
  'liegt mir nicht vor',
  'existiert nicht',
  'finde ich im bereitgestellten kontext keine',
  'kann die demo-engine nicht antworten',
]

export class ExperimentAnalysisError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ExperimentAnalysisError'
  }
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requiredString(value, field, row) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ExperimentAnalysisError(`Trial ${row}: „${field}“ fehlt oder ist leer.`)
  }
  return value
}

function finiteNumber(value, field, row, { min = -Infinity, max = Infinity, nullable = false } = {}) {
  if (nullable && (value === null || value === undefined)) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new ExperimentAnalysisError(`Trial ${row}: „${field}“ ist keine gültige Zahl im Bereich ${min}…${max}.`)
  }
  return value
}

function optionalMetric(metrics, field, row) {
  const value = metrics?.[field]
  if (value === undefined || value === null) return null
  return finiteNumber(value, `generationMetrics.${field}`, row, { min: 0 })
}

function validateTrial(value, index) {
  const row = index + 1
  if (!record(value)) throw new ExperimentAnalysisError(`Trial ${row}: Ein Objekt wurde erwartet.`)
  const condition = requiredString(value.condition, 'condition', row)
  if (!CONDITIONS.has(condition)) throw new ExperimentAnalysisError(`Trial ${row}: unbekannte Bedingung „${condition}“.`)
  const retrieval = requiredString(value.retrieval, 'retrieval', row)
  if (!RETRIEVALS.has(retrieval)) throw new ExperimentAnalysisError(`Trial ${row}: unbekanntes Retrieval „${retrieval}“.`)
  const autoScore = requiredString(value.autoScore, 'autoScore', row)
  if (!SCORES.has(autoScore)) throw new ExperimentAnalysisError(`Trial ${row}: ungültiger Auto-Score „${autoScore}“.`)
  if (value.manualScore !== undefined && value.manualScore !== null && !SCORES.has(value.manualScore)) {
    throw new ExperimentAnalysisError(`Trial ${row}: ungültiger manueller Score „${String(value.manualScore)}“.`)
  }
  const repetition = finiteNumber(value.repetition, 'repetition', row, { min: 1 })
  if (!Number.isInteger(repetition)) throw new ExperimentAnalysisError(`Trial ${row}: „repetition“ muss ganzzahlig sein.`)
  const latencyScope = requiredString(value.latencyScope, 'latencyScope', row)
  if (latencyScope !== 'end-to-end' && latencyScope !== 'generation-only') {
    throw new ExperimentAnalysisError(`Trial ${row}: unbekannter Latenzbereich „${latencyScope}“.`)
  }
  const metrics = value.generationMetrics
  if (metrics !== undefined && metrics !== null && !record(metrics)) {
    throw new ExperimentAnalysisError(`Trial ${row}: „generationMetrics“ muss ein Objekt sein.`)
  }
  const evidenceRecall = finiteNumber(value.evidenceRecall, 'evidenceRecall', row, { min: 0, max: 1, nullable: true })
  const evidencePrecision = finiteNumber(value.evidencePrecision, 'evidencePrecision', row, { min: 0, max: 1, nullable: true })
  return {
    ...value,
    id: requiredString(value.id, 'id', row),
    runId: requiredString(value.runId, 'runId', row),
    questionId: requiredString(value.questionId, 'questionId', row),
    engine: requiredString(value.engine, 'engine', row),
    answer: typeof value.answer === 'string' ? value.answer : '',
    condition,
    retrieval,
    repetition,
    autoScore,
    manualScore: value.manualScore ?? null,
    latencyScope,
    latencyMs: finiteNumber(value.latencyMs, 'latencyMs', row, { min: 0 }),
    evidenceRecall,
    evidencePrecision,
    generationMetrics: {
      ttftMs: optionalMetric(metrics, 'ttftMs', row),
      tokensPerSecond: optionalMetric(metrics, 'tokensPerSecond', row),
    },
  }
}

export function extractResults(parsed) {
  if (Array.isArray(parsed)) return parsed
  if (!record(parsed)) throw new ExperimentAnalysisError('Die JSON-Wurzel muss ein Objekt oder Array sein.')
  if (Array.isArray(parsed.results)) return parsed.results
  if (record(parsed.metadata_and_results) && Array.isArray(parsed.metadata_and_results.results)) {
    return parsed.metadata_and_results.results
  }
  throw new ExperimentAnalysisError('Kein Ergebnis-Array gefunden. Erwartet wird „results“ oder „metadata_and_results.results“.')
}

export function validateResults(parsed) {
  const raw = extractResults(parsed)
  if (!raw.length) throw new ExperimentAnalysisError('Der Export enthält keine Trials.')
  const trials = raw.map(validateTrial)
  const ids = new Set()
  const identities = new Set()
  for (const trial of trials) {
    if (ids.has(trial.id)) throw new ExperimentAnalysisError(`Doppelte Trial-ID „${trial.id}“.`)
    ids.add(trial.id)
    const identity = [trial.runId, trial.engine, trial.retrieval, trial.questionId, trial.repetition, trial.condition].join('\u001f')
    if (identities.has(identity)) {
      throw new ExperimentAnalysisError(
        `Mehrdeutiger Trial für ${trial.runId}/${trial.engine}/${trial.retrieval}/${trial.questionId}/W${trial.repetition}/${trial.condition}.`,
      )
    }
    identities.add(identity)
  }
  return trials
}

function quantile(sorted, p) {
  if (!sorted.length) return null
  if (sorted.length === 1) return sorted[0]
  const position = (sorted.length - 1) * p
  const lower = Math.floor(position)
  const fraction = position - lower
  return sorted[lower] + (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * fraction
}

export function distribution(values) {
  const sorted = values.filter((value) => typeof value === 'number' && Number.isFinite(value)).sort((a, b) => a - b)
  const q1 = quantile(sorted, 0.25)
  const median = quantile(sorted, 0.5)
  const q3 = quantile(sorted, 0.75)
  return { n: sorted.length, median, q1, q3, iqr: q1 === null || q3 === null ? null : q3 - q1 }
}

function mean(values) {
  const valid = values.filter((value) => typeof value === 'number' && Number.isFinite(value))
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null
}

function wilson95(correct, n) {
  if (!n) return { low: null, high: null }
  const z = 1.96
  const p = correct / n
  const denominator = 1 + (z * z) / n
  const centre = (p + (z * z) / (2 * n)) / denominator
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denominator
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) }
}

function normalizedAnswer(answer) {
  return answer.toLocaleLowerCase('de-DE').normalize('NFKD').replace(/\p{Diacritic}/gu, '')
}

function isAbstention(trial) {
  const answer = normalizedAnswer(trial.answer)
  return ABSTENTION_MARKERS.some((marker) => answer.includes(normalizedAnswer(marker)))
}

function effectiveScore(trial) {
  return trial.manualScore ?? trial.autoScore
}

function summarizeCondition(trials) {
  const correct = trials.filter((trial) => effectiveScore(trial) === 'korrekt').length
  const answerAbstentions = trials.filter(isAbstention).length
  const scoredAbstentions = trials.filter((trial) => effectiveScore(trial) === 'enthaltung').length
  const e2e = trials.filter((trial) => trial.latencyScope === 'end-to-end').map((trial) => trial.latencyMs)
  return {
    n: trials.length,
    correct,
    accuracy: trials.length ? correct / trials.length : null,
    answerAbstentions,
    abstentionRate: trials.length ? answerAbstentions / trials.length : null,
    scoredAbstentions,
    scoredAbstentionRate: trials.length ? scoredAbstentions / trials.length : null,
    evidenceRecallN: trials.filter((trial) => trial.evidenceRecall !== null).length,
    evidenceRecall: mean(trials.map((trial) => trial.evidenceRecall)),
    evidencePrecisionN: trials.filter((trial) => trial.evidencePrecision !== null).length,
    evidencePrecision: mean(trials.map((trial) => trial.evidencePrecision)),
    e2eMs: distribution(e2e),
    ttftMs: distribution(trials.map((trial) => trial.generationMetrics.ttftMs)),
    tokensPerSecond: distribution(trials.map((trial) => trial.generationMetrics.tokensPerSecond)),
  }
}

function majorityCorrect(trials) {
  const correct = trials.filter((trial) => effectiveScore(trial) === 'korrekt').length
  const incorrect = trials.length - correct
  if (correct === incorrect) return null
  return correct > incorrect
}

function questionClusters(trials) {
  const clusters = new Map()
  for (const trial of trials) {
    const rows = clusters.get(trial.questionId) ?? []
    rows.push(trial)
    clusters.set(trial.questionId, rows)
  }
  return new Map([...clusters].map(([questionId, rows]) => [questionId, {
    questionId,
    outcome: majorityCorrect(rows),
    trials: rows.length,
    correctTrials: rows.filter((trial) => effectiveScore(trial) === 'korrekt').length,
    repetitions: [...new Set(rows.map((trial) => trial.repetition))].sort((a, b) => a - b),
  }]))
}

function summarizeQuestionClusters(trials) {
  const clusters = [...questionClusters(trials).values()]
  const decided = clusters.filter((cluster) => cluster.outcome !== null)
  const correct = decided.filter((cluster) => cluster.outcome).length
  const interval95 = wilson95(correct, decided.length)
  return {
    clusters: clusters.length,
    n: decided.length,
    correct,
    accuracy: decided.length ? correct / decided.length : null,
    interval95,
    ties: clusters.length - decided.length,
    trials: trials.length,
  }
}

function pairKey(trial) {
  return `${trial.questionId}\u001f${trial.repetition}`
}

function pairedValue(graph, vector, getter) {
  const g = getter(graph)
  const v = getter(vector)
  return typeof g === 'number' && Number.isFinite(g) && typeof v === 'number' && Number.isFinite(v) ? g - v : null
}

function exactMcNemar(graphOnly, vectorOnly) {
  const discordant = graphOnly + vectorOnly
  if (!discordant) return null
  const k = Math.min(graphOnly, vectorOnly)
  let probability = 0.5 ** discordant
  let tail = probability
  for (let i = 1; i <= k; i++) {
    probability *= (discordant - i + 1) / i
    tail += probability
  }
  return Math.min(1, 2 * tail)
}

function buildPairs(trials) {
  const vectors = new Map(trials.filter((trial) => trial.condition === 'vector').map((trial) => [pairKey(trial), trial]))
  return trials
    .filter((trial) => trial.condition === 'graph')
    .map((graph) => ({ graph, vector: vectors.get(pairKey(graph)) }))
    .filter((pair) => pair.vector)
    .map(({ graph, vector }) => {
      const graphCorrect = effectiveScore(graph) === 'korrekt'
      const vectorCorrect = effectiveScore(vector) === 'korrekt'
      return {
        questionId: graph.questionId,
        repetition: graph.repetition,
        graphScore: effectiveScore(graph),
        vectorScore: effectiveScore(vector),
        accuracyDelta: Number(graphCorrect) - Number(vectorCorrect),
        abstentionDelta: Number(isAbstention(graph)) - Number(isAbstention(vector)),
        evidenceRecallDelta: pairedValue(graph, vector, (trial) => trial.evidenceRecall),
        evidencePrecisionDelta: pairedValue(graph, vector, (trial) => trial.evidencePrecision),
        e2eMsDelta: graph.latencyScope === 'end-to-end' && vector.latencyScope === 'end-to-end'
          ? graph.latencyMs - vector.latencyMs
          : null,
        ttftMsDelta: pairedValue(graph, vector, (trial) => trial.generationMetrics.ttftMs),
        tokensPerSecondDelta: pairedValue(graph, vector, (trial) => trial.generationMetrics.tokensPerSecond),
      }
    })
    .sort((a, b) => a.repetition - b.repetition || a.questionId.localeCompare(b.questionId, 'de'))
}

function summarizePairs(pairs) {
  const graphOnly = pairs.filter((pair) => pair.accuracyDelta === 1).length
  const vectorOnly = pairs.filter((pair) => pair.accuracyDelta === -1).length
  return {
    n: pairs.length,
    accuracyDelta: mean(pairs.map((pair) => pair.accuracyDelta)),
    abstentionDelta: mean(pairs.map((pair) => pair.abstentionDelta)),
    graphOnlyCorrect: graphOnly,
    vectorOnlyCorrect: vectorOnly,
    evidenceRecallDelta: mean(pairs.map((pair) => pair.evidenceRecallDelta)),
    evidencePrecisionDelta: mean(pairs.map((pair) => pair.evidencePrecisionDelta)),
    e2eMsDelta: distribution(pairs.map((pair) => pair.e2eMsDelta)),
    ttftMsDelta: distribution(pairs.map((pair) => pair.ttftMsDelta)),
    tokensPerSecondDelta: distribution(pairs.map((pair) => pair.tokensPerSecondDelta)),
  }
}

function buildQuestionPairs(trials) {
  const graph = questionClusters(trials.filter((trial) => trial.condition === 'graph'))
  const vector = questionClusters(trials.filter((trial) => trial.condition === 'vector'))
  const expectedQuestionIds = new Set([...graph.keys(), ...vector.keys()])
  const sharedQuestionIds = [...graph.keys()].filter((questionId) => vector.has(questionId))
  const pairs = sharedQuestionIds.map((questionId) => {
    const graphCluster = graph.get(questionId)
    const vectorCluster = vector.get(questionId)
    return {
      questionId,
      graphCorrect: graphCluster.outcome,
      vectorCorrect: vectorCluster.outcome,
      graphTrials: graphCluster.trials,
      vectorTrials: vectorCluster.trials,
      graphCorrectTrials: graphCluster.correctTrials,
      vectorCorrectTrials: vectorCluster.correctTrials,
    }
  })
  return {
    pairs,
    expectedPairs: expectedQuestionIds.size,
    missingPairs: expectedQuestionIds.size - sharedQuestionIds.length,
  }
}

function summarizeQuestionPairs(questionPairs) {
  const decided = questionPairs.filter((pair) => pair.graphCorrect !== null && pair.vectorCorrect !== null)
  const graphOnly = decided.filter((pair) => pair.graphCorrect && !pair.vectorCorrect).length
  const vectorOnly = decided.filter((pair) => !pair.graphCorrect && pair.vectorCorrect).length
  const graphCorrect = decided.filter((pair) => pair.graphCorrect).length
  const vectorCorrect = decided.filter((pair) => pair.vectorCorrect).length
  return {
    n: decided.length,
    excludedTies: questionPairs.length - decided.length,
    graphCorrect,
    vectorCorrect,
    accuracyDelta: decided.length ? (graphCorrect - vectorCorrect) / decided.length : null,
    graphOnlyCorrect: graphOnly,
    vectorOnlyCorrect: vectorOnly,
    mcnemarExactP: exactMcNemar(graphOnly, vectorOnly),
  }
}

function cohortKey(trial) {
  return [trial.runId, trial.engine, trial.retrieval].join('\u001f')
}

export function analyzeResults(trials, filters = {}) {
  const selected = trials.filter((trial) =>
    (!filters.run || trial.runId === filters.run)
    && (!filters.engine || trial.engine === filters.engine)
    && (!filters.retrieval || trial.retrieval === filters.retrieval),
  )
  if (!selected.length) throw new ExperimentAnalysisError('Keine Trials entsprechen den gewählten Filtern.')
  const groups = new Map()
  for (const trial of selected) {
    const key = cohortKey(trial)
    const group = groups.get(key) ?? []
    group.push(trial)
    groups.set(key, group)
  }
  return [...groups.values()].map((group) => {
    const exemplar = group[0]
    const graph = group.filter((trial) => trial.condition === 'graph')
    const vector = group.filter((trial) => trial.condition === 'vector')
    const pairs = buildPairs(group)
    const questionPairData = buildQuestionPairs(group)
    const expectedPairKeys = new Set([...graph, ...vector].map(pairKey))
    const repetitions = [...new Set([...graph, ...vector].map((trial) => trial.repetition))].sort((a, b) => a - b)
    return {
      runId: exemplar.runId,
      engine: exemplar.engine,
      retrieval: exemplar.retrieval,
      graph: summarizeCondition(graph),
      vector: summarizeCondition(vector),
      questionLevel: {
        graph: summarizeQuestionClusters(graph),
        vector: summarizeQuestionClusters(vector),
        expectedPairs: questionPairData.expectedPairs,
        missingPairs: questionPairData.missingPairs,
        paired: summarizeQuestionPairs(questionPairData.pairs),
        pairs: questionPairData.pairs,
      },
      uniqueQuestions: new Set([...graph, ...vector].map((trial) => trial.questionId)).size,
      repetitions,
      expectedPairs: expectedPairKeys.size,
      missingPairs: expectedPairKeys.size - pairs.length,
      paired: summarizePairs(pairs),
      pairs,
    }
  }).sort((a, b) => a.runId.localeCompare(b.runId) || a.engine.localeCompare(b.engine) || a.retrieval.localeCompare(b.retrieval))
}

function fmtNumber(value, digits = 1) {
  return value === null || value === undefined ? '–' : value.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function fmtPercent(value) {
  return value === null || value === undefined ? '–' : `${fmtNumber(value * 100, 1)} %`
}

function fmtDist(value, unit) {
  if (!value.n) return '– (n=0)'
  return `${fmtNumber(value.median)} [${fmtNumber(value.q1)}–${fmtNumber(value.q3)}] ${unit} (n=${value.n})`
}

function printQuestionCondition(label, summary) {
  console.log(`  ${label}`)
  console.log(`    ${summary.correct}/${summary.n} Fragecluster korrekt = ${fmtPercent(summary.accuracy)}`)
  console.log(`    Wilson-95%-Intervall [${fmtPercent(summary.interval95.low)}–${fmtPercent(summary.interval95.high)}] · ${summary.trials} Trialzeilen`)
  if (summary.ties) console.log(`    ${summary.ties} Fragecluster ohne eindeutige Mehrheit wurden aus der binären Inferenz entfernt.`)
}

function printTrialCondition(label, summary) {
  console.log(`  ${label}`)
  console.log(`    n=${summary.n} Trials · deskriptive Accuracy ${summary.correct}/${summary.n} = ${fmtPercent(summary.accuracy)}`)
  console.log(`    Enthaltung (Antwortmarker) ${summary.answerAbstentions}/${summary.n} = ${fmtPercent(summary.abstentionRate)} · Score „enthaltung“ ${summary.scoredAbstentions}/${summary.n}`)
  console.log(`    Evidenz-Recall ${fmtPercent(summary.evidenceRecall)} (n=${summary.evidenceRecallN}) · -Precision ${fmtPercent(summary.evidencePrecision)} (n=${summary.evidencePrecisionN})`)
  console.log(`    E2E Median [Q1–Q3] ${fmtDist(summary.e2eMs, 'ms')}`)
  console.log(`    TTFT Median [Q1–Q3] ${fmtDist(summary.ttftMs, 'ms')}`)
  console.log(`    Geschwindigkeit Median [Q1–Q3] ${fmtDist(summary.tokensPerSecond, 'tok/s')}`)
}

export function formatAnalysis(analyses, { showPairs = true } = {}) {
  const lines = []
  const original = console.log
  console.log = (...args) => lines.push(args.join(' '))
  try {
    for (const analysis of analyses) {
      console.log('')
      console.log(`=== Run ${analysis.runId} · ${analysis.engine} · Retrieval ${analysis.retrieval} ===`)
      console.log(`  ${analysis.uniqueQuestions} eindeutige Fragen · Wiederholungen ${analysis.repetitions.join(', ')}`)
      console.log('  PRIMÄRE GENAUIGKEITSINFERENZ: einzigartige Fragecluster')
      printQuestionCondition('Graph-RAG', analysis.questionLevel.graph)
      printQuestionCondition(analysis.retrieval === 'dense' ? 'Dense Vector-RAG' : 'TF-IDF Vector-RAG', analysis.questionLevel.vector)
      console.log('  Gepaarter Unterschied Graph − Vector auf Frageebene')
      console.log(`    ${analysis.questionLevel.paired.n}/${analysis.questionLevel.expectedPairs} entschiedene Fragepaare · fehlend ${analysis.questionLevel.missingPairs} · Gleichstände ${analysis.questionLevel.paired.excludedTies}`)
      console.log(`    Δ Accuracy ${fmtPercent(analysis.questionLevel.paired.accuracyDelta)} · nur Graph korrekt ${analysis.questionLevel.paired.graphOnlyCorrect} · nur Vector korrekt ${analysis.questionLevel.paired.vectorOnlyCorrect}`)
      console.log(`    McNemar exakt p=${analysis.questionLevel.paired.mcnemarExactP === null ? '–' : fmtNumber(analysis.questionLevel.paired.mcnemarExactP, 4)}`)
      console.log('  DESKRIPTIVE TRIAL- UND TIMINGDATEN: Wiederholungen sind nicht unabhängig')
      printTrialCondition('Graph-RAG', analysis.graph)
      printTrialCondition(analysis.retrieval === 'dense' ? 'Dense Vector-RAG' : 'TF-IDF Vector-RAG', analysis.vector)
      console.log(`  ${analysis.paired.n}/${analysis.expectedPairs} gepaarte Trialzeilen · fehlend ${analysis.missingPairs} · duplikatgewichtete Δ Accuracy ${fmtPercent(analysis.paired.accuracyDelta)} (keine Inferenz)`)
      console.log(`    Δ Enthaltung ${fmtPercent(analysis.paired.abstentionDelta)} · Δ Evidenz-Recall ${fmtPercent(analysis.paired.evidenceRecallDelta)} · Δ Evidenz-Precision ${fmtPercent(analysis.paired.evidencePrecisionDelta)}`)
      console.log(`    Δ E2E Median [Q1–Q3] ${fmtDist(analysis.paired.e2eMsDelta, 'ms')}`)
      console.log(`    Δ TTFT Median [Q1–Q3] ${fmtDist(analysis.paired.ttftMsDelta, 'ms')}`)
      console.log(`    Δ Geschwindigkeit Median [Q1–Q3] ${fmtDist(analysis.paired.tokensPerSecondDelta, 'tok/s')}`)
      if (analysis.repetitions.length > 1) {
        console.log('    ACHTUNG: Trialzeilen derselben Frage sind keine unabhängigen Stichproben; McNemar wird deshalb ausschließlich auf Frageclustern berechnet.')
      }
      if (showPairs && analysis.pairs.length) {
        console.log('  Einzelpaare (Graph − Vector):')
        console.log('    Frage/W | Scores G/V | Δkorrekt | ΔEvR | ΔEvP | ΔE2E ms | ΔTTFT ms | Δtok/s')
        for (const pair of analysis.pairs) {
          console.log(
            `    ${pair.questionId}/W${pair.repetition} | ${pair.graphScore}/${pair.vectorScore} | ${pair.accuracyDelta >= 0 ? '+' : ''}${pair.accuracyDelta}`
            + ` | ${fmtNumber(pair.evidenceRecallDelta, 2)} | ${fmtNumber(pair.evidencePrecisionDelta, 2)}`
            + ` | ${fmtNumber(pair.e2eMsDelta)} | ${fmtNumber(pair.ttftMsDelta)} | ${fmtNumber(pair.tokensPerSecondDelta)}`,
          )
        }
      }
    }
  } finally {
    console.log = original
  }
  return lines.join('\n').trimStart()
}

function usage() {
  return [
    'Noesis Graph-RAG-vs.-Vector-RAG-Analyse',
    '',
    'Aufruf:',
    '  node scripts/analyze-experiment-results.mjs <export.json> [Optionen]',
    '',
    'Optionen:',
    '  --run <ID>          nur einen Messlauf analysieren',
    '  --engine <ID>       nur eine Engine analysieren',
    '  --retrieval <Modus> nur tfidf oder dense analysieren',
    '  --json              maschinenlesbare Analyse ausgeben',
    '  --no-pairs          Einzelpaare in Text- und JSON-Ausgabe ausblenden',
    '  --help              diese Hilfe anzeigen',
  ].join('\n')
}

function parseArgs(argv) {
  const args = { file: null, filters: {}, json: false, showPairs: true, help: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') args.help = true
    else if (arg === '--json') args.json = true
    else if (arg === '--no-pairs') args.showPairs = false
    else if (arg === '--run' || arg === '--engine' || arg === '--retrieval') {
      const value = argv[++i]
      if (!value) throw new ExperimentAnalysisError(`Nach ${arg} fehlt ein Wert.`)
      args.filters[arg.slice(2)] = value
    } else if (arg.startsWith('-')) throw new ExperimentAnalysisError(`Unbekannte Option „${arg}“.`)
    else if (!args.file) args.file = arg
    else throw new ExperimentAnalysisError(`Unerwartetes zweites Eingabefile „${arg}“.`)
  }
  if (args.filters.retrieval && !RETRIEVALS.has(args.filters.retrieval)) {
    throw new ExperimentAnalysisError('Für --retrieval ist nur „dense“ oder „tfidf“ erlaubt.')
  }
  return args
}

export function analysesForOutput(analyses, { showPairs = true } = {}) {
  if (showPairs) return analyses
  return analyses.map((analysis) => {
    const { pairs: _trialPairs, questionLevel, ...summary } = analysis
    const { pairs: _questionPairs, ...questionSummary } = questionLevel
    return { ...summary, questionLevel: questionSummary }
  })
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2))
    if (args.help) {
      console.log(usage())
      return
    }
    if (!args.file) throw new ExperimentAnalysisError(`Eine JSON-Datei fehlt.\n\n${usage()}`)
    const source = await readFile(args.file)
    if (source.byteLength > MAX_BYTES) throw new ExperimentAnalysisError('Die Datei ist größer als 25 MB.')
    let parsed
    try {
      parsed = JSON.parse(source.toString('utf8'))
    } catch (error) {
      throw new ExperimentAnalysisError(`Ungültiges JSON: ${error instanceof Error ? error.message : String(error)}`)
    }
    const trials = validateResults(parsed)
    const analyses = analyzeResults(trials, args.filters)
    if (args.json) console.log(JSON.stringify({
      validatedTrials: trials.length,
      analyses: analysesForOutput(analyses, { showPairs: args.showPairs }),
    }, null, 2))
    else {
      console.log(`Validierung erfolgreich: ${trials.length} eindeutige Trials.`)
      console.log(formatAnalysis(analyses, { showPairs: args.showPairs }))
    }
    if (analyses.some((analysis) => !analysis.graph.n || !analysis.vector.n || analysis.missingPairs > 0)) process.exitCode = 1
  } catch (error) {
    console.error(`Analyse abgebrochen: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 2
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (invokedPath === import.meta.url) await main()
