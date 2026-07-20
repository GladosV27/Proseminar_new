#!/usr/bin/env node

/**
 * Reproduziert die kompakte Text-/JSON-Analyse und die SHA-256-Prüfsummen
 * dieses eingefrorenen Noesis-Messlaufs.
 *
 * Aufruf aus der Repository-Wurzel:
 *   node docs/experiment-results/2026-07-20_qwen3-8b_dense_graph-vs-vector/reproduce-analysis.mjs
 */

import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  analysesForOutput,
  analyzeResults,
  formatAnalysis,
  validateResults,
} from '../../../app/scripts/analyze-experiment-results.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const RAW_FILE = 'raw-results.json'
const EXPECTED = {
  runId: 'run_mrsmtfho_e43f3c5f',
  engine: 'ollama:qwen3:8b',
  retrieval: 'dense',
  trials: 400,
  questions: 40,
  graphCorrect: 37,
  vectorCorrect: 30,
  graphOnlyCorrect: 9,
  vectorOnlyCorrect: 2,
  mcnemarExactP: 0.0654296875,
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: erwartet ${String(expected)}, erhalten ${String(actual)}`)
  }
}

function assertClose(actual, expected, label, tolerance = 1e-12) {
  if (typeof actual !== 'number' || Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: erwartet ${expected}, erhalten ${String(actual)}`)
  }
}

function effectiveScore(trial) {
  return trial.manualScore ?? trial.autoScore
}

function countUnstableScoreClusters(trials) {
  const clusters = new Map()
  for (const trial of trials) {
    const key = `${trial.condition}\u001f${trial.questionId}`
    const scores = clusters.get(key) ?? new Set()
    scores.add(effectiveScore(trial))
    clusters.set(key, scores)
  }
  return [...clusters.values()].filter((scores) => scores.size > 1).length
}

async function sha256(fileName) {
  const content = await readFile(join(HERE, fileName))
  return createHash('sha256').update(content).digest('hex')
}

async function main() {
  const parsed = JSON.parse(await readFile(join(HERE, RAW_FILE), 'utf8'))
  const trials = validateResults(parsed)
  assertEqual(trials.length, EXPECTED.trials, 'Anzahl validierter Trials')

  const analyses = analyzeResults(trials, {
    run: EXPECTED.runId,
    engine: EXPECTED.engine,
    retrieval: EXPECTED.retrieval,
  })
  assertEqual(analyses.length, 1, 'Anzahl Analyse-Kohorten')
  const analysis = analyses[0]

  assertEqual(analysis.uniqueQuestions, EXPECTED.questions, 'Einzigartige Fragen')
  assertEqual(analysis.questionLevel.graph.correct, EXPECTED.graphCorrect, 'Graph korrekt')
  assertEqual(analysis.questionLevel.vector.correct, EXPECTED.vectorCorrect, 'Vector korrekt')
  assertEqual(analysis.questionLevel.paired.graphOnlyCorrect, EXPECTED.graphOnlyCorrect, 'Nur Graph korrekt')
  assertEqual(analysis.questionLevel.paired.vectorOnlyCorrect, EXPECTED.vectorOnlyCorrect, 'Nur Vector korrekt')
  assertClose(analysis.questionLevel.paired.accuracyDelta, 0.175, 'Accuracy-Differenz')
  assertClose(analysis.questionLevel.paired.mcnemarExactP, EXPECTED.mcnemarExactP, 'Exakter McNemar-p-Wert')
  assertEqual(analysis.questionLevel.missingPairs, 0, 'Fehlende Fragepaare')
  assertEqual(analysis.missingPairs, 0, 'Fehlende Trialpaare')

  const manualScores = trials.filter((trial) => trial.manualScore !== null).length
  const unstableScoreClusters = countUnstableScoreClusters(trials)
  assertEqual(manualScores, 0, 'Manuell bewertete Trials')
  assertEqual(unstableScoreClusters, 0, 'Instabile Frage-Bedingung-Scorecluster')

  const compactAnalyses = analysesForOutput(analyses, { showPairs: false })
  const machineOutput = {
    schemaVersion: 1,
    source: {
      file: RAW_FILE,
      exportedAt: parsed.exportedAt,
      runId: EXPECTED.runId,
      engine: EXPECTED.engine,
      retrieval: EXPECTED.retrieval,
    },
    validation: {
      validatedTrials: trials.length,
      uniqueQuestions: analysis.uniqueQuestions,
      graphTrials: analysis.graph.n,
      vectorTrials: analysis.vector.n,
      missingQuestionPairs: analysis.questionLevel.missingPairs,
      missingTrialPairs: analysis.missingPairs,
      manualScores,
      automaticScores: trials.length - manualScores,
      unstableScoreClusters,
    },
    methodology: {
      primaryAccuracyUnit: 'unique-question-cluster',
      clusterRule: 'Mehrheit der Wiederholungen je Frage und Bedingung; Gleichstände werden ausgeschlossen',
      primaryIndependentN: analysis.questionLevel.paired.n,
      trialRowsPerCondition: analysis.graph.n,
      trialRowsUse: 'nur deskriptive Laufzeit-, Retrieval- und Stabilitätsanalyse',
      pseudoreplicationWarning: 'Wiederholungen derselben Frage sind keine unabhängigen Gütebeobachtungen.',
      scoring: 'vollautomatisch; keine manuelle oder doppelblinde Bewertung',
    },
    analyses: compactAnalyses,
  }

  const textOutput = [
    'Noesis – reproduzierbare Ergebnisanalyse',
    `Quelle: ${RAW_FILE}`,
    `Export: ${parsed.exportedAt}`,
    '',
    `Validierung erfolgreich: ${trials.length} eindeutige Trials; keine fehlenden Frage- oder Trialpaare.`,
    `Scoring: ${trials.length - manualScores} automatisch, ${manualScores} manuell; keine Doppelblindbewertung.`,
    `Stabilität: ${unstableScoreClusters} von ${analysis.uniqueQuestions * 2} Frage-Bedingung-Clustern wechselten über die Wiederholungen ihre Score-Kategorie.`,
    'Methodik: Die primäre Güteinferenz verwendet 40 einzigartige Fragen. Die 200 Trialzeilen je Bedingung dienen ausschließlich der deskriptiven Laufzeit- und Stabilitätsanalyse.',
    'Warnung: Eine Güteinferenz mit n=200 je Bedingung wäre Pseudoreplikation.',
    '',
    formatAnalysis(analyses, { showPairs: false }),
    '',
  ].join('\n')

  await writeFile(join(HERE, 'analysis.txt'), textOutput, 'utf8')
  await writeFile(join(HERE, 'analysis.json'), `${JSON.stringify(machineOutput, null, 2)}\n`, 'utf8')

  const hashedFiles = [
    'RESULTS.md',
    'analysis.json',
    'analysis.txt',
    'raw-results.csv',
    'raw-results.json',
    'reproduce-analysis.mjs',
    'submission-bundle.json',
  ]
  const checksumLines = []
  for (const fileName of hashedFiles) checksumLines.push(`${await sha256(fileName)}  ${fileName}`)
  await writeFile(join(HERE, 'SHA256SUMS.txt'), `${checksumLines.join('\n')}\n`, 'utf8')

  console.log(`Analyse reproduziert: ${resolve(HERE)}`)
  console.log(`Primär: Graph ${EXPECTED.graphCorrect}/${EXPECTED.questions}, Vector ${EXPECTED.vectorCorrect}/${EXPECTED.questions}, McNemar p=${EXPECTED.mcnemarExactP}`)
}

await main()
