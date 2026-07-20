import type { Condition, KnowledgeGraph, Question, RetrievalMode, Score, TrialResult } from '../data/types'
import { getDenseIndex, denseReady } from './embeddings'
import { GraphIndex } from './graphRag'
import type { LLMEngine } from './llm'
import { normalize } from './text'
import { VectorIndex, vectorContext, type RetrievedChunk } from './vectorRag'

/**
 * Experiment-Runner: führt eine Frage unter einer der fünf Bedingungen aus
 * und misst Latenz, Kontextgröße, Evidenzabdeckung und Antwortqualität.
 *
 * Bedingungen (unabhängige Variable):
 *  - B0 baseline:       nur parametrisches Wissen, kein Kontext
 *  - B1 vector:         Top-k isolierte Chunks (TF-IDF oder dichte Embeddings)
 *  - B2 graph:          linearisierter Subgraph (Tripel + Pfadknoten-Auszüge)
 *  - B1b vector_budget: KONTROLLE – Vektor-RAG erhält so viele Chunks, bis das
 *                       Zeichenbudget dem Graph-Kontext derselben Frage
 *                       entspricht. Das reduziert die Konfundierung durch
 *                       unterschiedliche Kontextmengen; die Repräsentation
 *                       unterscheidet sich weiterhin.
 *  - B3 hybrid:         EXPLORATION – Subgraph + zusätzliche Vektor-Chunks;
 *                       testet, ob die Fehler beider Verfahren komplementär sind.
 */

export const ALL_CONDITIONS: Condition[] = ['baseline', 'vector', 'graph', 'vector_budget', 'graph_no_edges', 'hybrid']
export const CORE_CONDITIONS: Condition[] = ['baseline', 'vector', 'graph']

export const CONDITION_INFO: Record<Condition, { label: string; short: string; color: string }> = {
  baseline: { label: 'Baseline (nur LLM)', short: 'Baseline', color: 'var(--cat-1)' },
  vector: { label: 'Vektor-RAG', short: 'Vektor', color: 'var(--cat-2)' },
  graph: { label: 'Graph-RAG', short: 'Graph', color: 'var(--cat-3)' },
  vector_budget: { label: 'Vektor-RAG (Budget-Kontrolle)', short: 'Vektor+Budget', color: 'var(--cat-4)' },
  graph_no_edges: { label: 'Graph-Ablation (ohne Kanten im Kontext)', short: 'Graph−Kanten', color: '#8a6b52' },
  hybrid: { label: 'Hybrid (Graph + Vektor)', short: 'Hybrid', color: 'var(--cat-5)' },
}

export const SYSTEM_PROMPT = [
  'Du bist ein präziser Wissensassistent auf einem Smartphone.',
  'Antworte auf Deutsch, in höchstens drei Sätzen, ohne Spekulation.',
  'Wenn der bereitgestellte Kontext (falls vorhanden) die Antwort nicht enthält',
  'oder du sie nicht sicher weißt, sage ausdrücklich: »Dazu habe ich keine gesicherte Information.«',
].join(' ')

export interface PreparedTrial {
  condition: Condition
  retrieval: RetrievalMode
  /** reine Retrieval-/Subgraph-Extraktionszeit innerhalb der Vorbereitung */
  retrievalMs: number
  userPrompt: string
  context: string
  retrievedIds: string[]
  subgraph?: { nodes: string[]; edges: { source: string; target: string; label: string }[] }
}

export interface PrepareOpts {
  retrieval?: RetrievalMode
  k?: number
  /** Product-chat optimization only; omitted experiment runs keep the frozen defaults. */
  graph?: { depth: number; beam: number; maxNodes: number }
  hybridExtra?: number
}

export const ORDER_STRATEGY = 'seeded-question-shuffle+cyclic-condition-counterbalance-v1'

export interface TrialRunMetadata {
  runId: string
  repetitionId: string
  repetition: number
  order: number
  seed: number
  questionOrder: number
  conditionOrder: number
  orderStrategy: string
}

export interface RunOpts extends PrepareOpts {
  metadata?: TrialRunMetadata
}

export interface ScheduledTrial {
  question: Question
  condition: Condition
  repetition: number
  order: number
  questionOrder: number
  conditionOrder: number
}

/** Begrenzt jeden eingegebenen Seed reproduzierbar auf einen unsigned 32-bit-Wert. */
export function normalizeExperimentSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 0
  return Math.trunc(seed) >>> 0
}

function mixSeed(seed: number, salt: number): number {
  let x = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0
  x ^= x >>> 16
  x = Math.imul(x, 0x85ebca6b)
  x ^= x >>> 13
  x = Math.imul(x, 0xc2b2ae35)
  return (x ^ (x >>> 16)) >>> 0
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let x = state
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

function seededShuffle<T>(items: readonly T[], random: () => number): T[] {
  const shuffled = [...items]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

/**
 * Reproduzierbarer Ablaufplan: Fragen werden je Wiederholung mit dem Seed
 * gemischt. Die Bedingungen rotieren danach zyklisch über die Fragen und
 * Wiederholungen, sodass jede Bedingung möglichst gleich oft früh/spät läuft.
 */
export function buildTrialSchedule(
  questions: readonly Question[],
  conditions: readonly Condition[],
  repetitions: number,
  seed: number,
): ScheduledTrial[] {
  if (conditions.length === 0 || questions.length === 0 || repetitions <= 0) return []
  const normalizedSeed = normalizeExperimentSeed(seed)
  const baseConditions = seededShuffle(conditions, seededRandom(mixSeed(normalizedSeed, 0)))
  const schedule: ScheduledTrial[] = []
  let order = 0

  for (let repetition = 1; repetition <= Math.trunc(repetitions); repetition++) {
    const shuffledQuestions = seededShuffle(questions, seededRandom(mixSeed(normalizedSeed, repetition)))
    shuffledQuestions.forEach((question, questionIndex) => {
      const offset = (questionIndex + repetition - 1) % baseConditions.length
      for (let conditionIndex = 0; conditionIndex < baseConditions.length; conditionIndex++) {
        schedule.push({
          question,
          condition: baseConditions[(offset + conditionIndex) % baseConditions.length],
          repetition,
          order: ++order,
          questionOrder: questionIndex + 1,
          conditionOrder: conditionIndex + 1,
        })
      }
    })
  }
  return schedule
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100
}

function newTrialId(): string {
  return 't_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export class ExperimentRunner {
  readonly vectorIndex: VectorIndex
  readonly graphIndex: GraphIndex

  constructor(readonly graph: KnowledgeGraph) {
    this.vectorIndex = new VectorIndex(graph)
    this.graphIndex = new GraphIndex(graph)
  }

  private async retrieveChunks(query: string, k: number, mode: RetrievalMode): Promise<RetrievedChunk[]> {
    if (mode === 'dense') {
      if (!denseReady()) throw new Error('Dichte Embeddings sind nicht geladen (Modelle → Embeddings).')
      return getDenseIndex(this.graph).retrieve(query, k)
    }
    return this.vectorIndex.retrieve(query, k)
  }

  async prepare(questionText: string, condition: Condition, opts: PrepareOpts = {}): Promise<PreparedTrial> {
    const retrieval = opts.retrieval ?? 'tfidf'
    const k = opts.k ?? 4

    if (condition === 'baseline') {
      return { condition, retrieval, retrievalMs: 0, context: '', retrievedIds: [], userPrompt: `FRAGE: ${questionText}` }
    }

    if (condition === 'vector') {
      const retrievalStarted = performance.now()
      const chunks = await this.retrieveChunks(questionText, k, retrieval)
      const retrievalMs = roundMs(performance.now() - retrievalStarted)
      const ctx = vectorContext(chunks)
      return {
        condition,
        retrieval,
        retrievalMs,
        context: ctx,
        retrievedIds: chunks.map((c) => c.id),
        userPrompt: `KONTEXT:\n${ctx}\n\nFRAGE: ${questionText}`,
      }
    }

    if (condition === 'vector_budget') {
      // Budget der Graph-Bedingung für DIESELBE Frage bestimmen und Vektor-RAG
      // so viele Chunks geben, bis es dasselbe Zeichenbudget erreicht.
      const retrievalStarted = performance.now()
      const budget = this.graphIndex.extract(questionText).context.length
      const pool = await this.retrieveChunks(questionText, 16, retrieval)
      const retrievalMs = roundMs(performance.now() - retrievalStarted)
      const chosen: RetrievedChunk[] = []
      for (const c of pool) {
        chosen.push(c)
        if (vectorContext(chosen).length >= budget && chosen.length >= k) break
      }
      const ctx = vectorContext(chosen)
      return {
        condition,
        retrieval,
        retrievalMs,
        context: ctx,
        retrievedIds: chosen.map((c) => c.id),
        userPrompt: `KONTEXT:\n${ctx}\n\nFRAGE: ${questionText}`,
      }
    }

    // graph & hybrid teilen die Subgraph-Extraktion
    const graphRetrievalStarted = performance.now()
    const sub = this.graphIndex.extract(questionText, opts.graph)
    let retrievalMs = performance.now() - graphRetrievalStarted
    const subgraph = {
      nodes: sub.nodes.map((n) => n.id),
      edges: sub.edges.map((e) => ({ source: e.source, target: e.target, label: e.label })),
    }

    if (condition === 'graph_no_edges') {
      const nodeContext = sub.nodes.map((node) => `[${node.title}] ${node.summary}`).join('\n\n')
      return {
        condition,
        retrieval,
        retrievalMs: roundMs(retrievalMs),
        context: nodeContext,
        retrievedIds: sub.nodes.map((n) => n.id),
        subgraph: { nodes: subgraph.nodes, edges: [] },
        userPrompt: `KONTEXT (KNOTEN OHNE RELATIONEN):\n${nodeContext}\n\nFRAGE: ${questionText}`,
      }
    }

    if (condition === 'graph') {
      return {
        condition,
        retrieval,
        retrievalMs: roundMs(retrievalMs),
        context: sub.context,
        retrievedIds: sub.nodes.map((n) => n.id),
        subgraph,
        userPrompt: `KONTEXT:\n${sub.context}\n\nFRAGE: ${questionText}`,
      }
    }

    // hybrid: Subgraph + Vektor-Chunks, die der Graph nicht ohnehin enthält
    const inSub = new Set(sub.nodes.map((n) => n.id))
    const vectorRetrievalStarted = performance.now()
    const hybridExtra = Math.max(0, opts.hybridExtra ?? 3)
    const vectorChunks = await this.retrieveChunks(questionText, k + Math.max(2, hybridExtra), retrieval)
    retrievalMs += performance.now() - vectorRetrievalStarted
    const extra = vectorChunks.filter((c) => !inSub.has(c.id)).slice(0, hybridExtra)
    const ctx =
      sub.context + (extra.length ? '\n\nZUSÄTZLICHE ARTIKEL (Ähnlichkeitssuche):\n' + extra.map((c) => `[${c.title}] ${c.text}`).join('\n\n') : '')
    return {
      condition,
      retrieval,
      retrievalMs: roundMs(retrievalMs),
      context: ctx,
      retrievedIds: [...sub.nodes.map((n) => n.id), ...extra.map((c) => c.id)],
      subgraph,
      userPrompt: `KONTEXT:\n${ctx}\n\nFRAGE: ${questionText}`,
    }
  }

  async run(
    question: Question,
    condition: Condition,
    engine: LLMEngine,
    opts: RunOpts = {},
    onToken?: (partial: string) => void,
  ): Promise<{ result: TrialResult; prepared: PreparedTrial }> {
    const endToEndStarted = performance.now()
    const { metadata, ...prepareOpts } = opts
    const prepared = await this.prepare(question.text, condition, prepareOpts)
    const generationStarted = performance.now()
    const gen = await engine.generate(SYSTEM_PROMPT, prepared.userPrompt, onToken)
    const finished = performance.now()
    const fallbackRunId = `standalone_${Date.now().toString(36)}`
    const run = metadata ?? {
      runId: fallbackRunId,
      repetitionId: `${fallbackRunId}_r1`,
      repetition: 1,
      order: 1,
      seed: 0,
      questionOrder: 1,
      conditionOrder: 1,
      orderStrategy: 'standalone-unrandomized',
    }
    const { recall, precision } = evidenceMetrics(question, prepared.retrievedIds)
    return {
      prepared,
      result: {
        id: newTrialId(),
        runId: run.runId,
        repetitionId: run.repetitionId,
        repetition: run.repetition,
        order: run.order,
        seed: metadata ? run.seed : null,
        questionOrder: run.questionOrder,
        conditionOrder: run.conditionOrder,
        orderStrategy: run.orderStrategy,
        questionId: question.id,
        condition,
        answer: gen.text,
        contextChars: prepared.context.length,
        retrievedIds: prepared.retrievedIds,
        latencyMs: roundMs(finished - endToEndStarted),
        latencyScope: 'end-to-end',
        prepareMs: roundMs(generationStarted - endToEndStarted),
        retrievalMs: prepared.retrievalMs,
        generationMs: roundMs(finished - generationStarted),
        ...(gen.metrics ? { generationMetrics: gen.metrics } : {}),
        autoScore: autoScoreAnswer(question, gen.text),
        engine: gen.engine,
        ...(gen.provenance ? { modelProvenance: gen.provenance } : {}),
        retrieval: prepared.retrieval,
        evidenceRecall: recall,
        evidencePrecision: precision,
        timestamp: Date.now(),
      },
    }
  }
}

// ────────────────────────── Evidenz-Diagnostik ──────────────────────────

/**
 * Misst, ob das Retrieval die Gold-Evidenz überhaupt geliefert hat.
 * Trennt Retrieval-Versagen (Evidenz fehlt im Kontext) von Generierungs-
 * Versagen (Evidenz war da, das Modell hat sie nicht genutzt).
 */
export function evidenceMetrics(q: Question, retrievedIds: string[]): { recall: number | null; precision: number | null } {
  if (q.goldPath.length === 0) return { recall: null, precision: retrievedIds.length ? null : null }
  if (retrievedIds.length === 0) return { recall: 0, precision: null }
  const retrieved = new Set(retrievedIds)
  const hit = q.goldPath.filter((id) => retrieved.has(id)).length
  return {
    recall: hit / q.goldPath.length,
    precision: hit / retrievedIds.length,
  }
}

// ────────────────────────── Auto-Scoring ──────────────────────────

const ABSTAIN_MARKERS = [
  'keine gesicherte information',
  'keine information',
  'nicht im korpus',
  'nicht bekannt',
  'weiss ich nicht',
  'kann ich nicht beantworten',
  'enthalte mich',
  'liegt mir nicht vor',
  'existiert nicht',
  'finde ich im bereitgestellten kontext keine',
  'kann die demo-engine nicht antworten',
]

export function isAbstention(answer: string): boolean {
  const a = normalize(answer)
  return ABSTAIN_MARKERS.some((m) => a.includes(normalize(m)))
}

/**
 * Regelbasiertes Scoring gegen Gold-Schlüsselbegriffe.
 * Konservativ ausgelegt; maßgeblich ist die verblindete Doppelbewertung
 * (Ansicht »Bewerten«, vgl. Ausarbeitung Abschnitt 4.4).
 */
export function autoScoreAnswer(q: Question, answer: string): Score {
  const a = normalize(answer)
  if (q.expectAbstain) {
    return isAbstention(answer) ? 'korrekt' : 'falsch'
  }
  if (isAbstention(answer)) return 'enthaltung'
  const must = q.mustContain.map(normalize)
  const hits = must.filter((m) => a.includes(m)).length
  const anyOk = !q.anyOf || q.anyOf.some((x) => a.includes(normalize(x)))
  if (hits === must.length && anyOk) return 'korrekt'
  if (hits > 0) return 'teilweise'
  return 'falsch'
}

// ────────────────────────── Aggregation für das Dashboard ──────────────────────────

export interface AggRow {
  condition: Condition
  n: number
  korrekt: number
  teilweise: number
  falsch: number
  enthaltung: number
  accuracy: number
  /** Anzahl der Trials mit echter End-to-End-Messung (Altdaten ausgeschlossen) */
  latencyN: number
  medianLatency: number
  p95Latency: number
  medianGeneration: number
  medianPrepare: number
  meanContext: number
  /** ⌀ Evidenz-Recall (nur Trials mit Gold-Pfad) */
  meanEvidenceRecall: number | null
  /** Genauigkeit, gegeben die Gold-Evidenz war vollständig im Kontext */
  accGivenFullEvidence: number | null
}

export function effectiveScore(r: TrialResult): Score {
  return r.manualScore ?? r.autoScore
}

/** Empirisches Perzentil nach der Nearest-Rank-Methode für bereits sortierte Werte. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const rank = Math.max(1, Math.ceil(p * sorted.length))
  return sorted[Math.min(rank - 1, sorted.length - 1)]
}

export function aggregate(results: TrialResult[], byCondition: Condition[]): AggRow[] {
  return byCondition.map((c) => {
    const rs = results.filter((r) => r.condition === c)
    const count = (s: Score) => rs.filter((r) => effectiveScore(r) === s).length
    // Vor der Schema-Migration bezeichnete latencyMs nur die Generierungszeit.
    // Solche Werte werden nicht mit echten End-to-End-Messungen vermischt.
    const lat = rs
      .filter((r) => r.latencyScope === 'end-to-end')
      .map((r) => r.latencyMs)
      .sort((a, b) => a - b)
    const generation = rs.map((r) => r.generationMs).sort((a, b) => a - b)
    const preparation = rs
      .map((r) => r.prepareMs)
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b)
    const withEv = rs.filter((r) => r.evidenceRecall !== null && r.evidenceRecall !== undefined)
    const fullEv = withEv.filter((r) => (r.evidenceRecall ?? 0) >= 1)
    return {
      condition: c,
      n: rs.length,
      korrekt: count('korrekt'),
      teilweise: count('teilweise'),
      falsch: count('falsch'),
      enthaltung: count('enthaltung'),
      accuracy: rs.length ? count('korrekt') / rs.length : 0,
      latencyN: lat.length,
      medianLatency: percentile(lat, 0.5),
      p95Latency: percentile(lat, 0.95),
      medianGeneration: generation.length ? generation[Math.floor(generation.length / 2)] : 0,
      medianPrepare: preparation.length ? preparation[Math.floor(preparation.length / 2)] : 0,
      meanContext: rs.length ? Math.round(rs.reduce((s, r) => s + r.contextChars, 0) / rs.length) : 0,
      meanEvidenceRecall: withEv.length ? withEv.reduce((s, r) => s + (r.evidenceRecall ?? 0), 0) / withEv.length : null,
      accGivenFullEvidence: fullEv.length
        ? fullEv.filter((r) => effectiveScore(r) === 'korrekt').length / fullEv.length
        : null,
    }
  })
}

export interface PairedComparison {
  a: Condition
  b: Condition
  /** Unabhängigere Fragecluster mit eindeutiger Mehrheitsentscheidung. */
  pairs: number
  /** Vollständige Trial-Paare; nur deskriptiv und für Laufzeitmetriken. */
  trialPairs: number
  /** Fragecluster ohne eindeutige Mehrheit in mindestens einer Bedingung. */
  excludedTies: number
  accuracyA: number
  accuracyB: number
  delta: number
  aOnlyCorrect: number
  bOnlyCorrect: number
  mcnemarExactP: number | null
}

export interface QuestionClusterSummary {
  /** Alle vorhandenen Fragecluster einschließlich Gleichständen. */
  clusters: number
  /** Cluster mit eindeutiger Mehrheitsentscheidung; Nenner der Accuracy. */
  n: number
  correct: number
  accuracy: number
  ties: number
  /** Einzeltrials im Cluster; nur deskriptiv. */
  trials: number
}

function questionClusterKey(r: TrialResult): string {
  return `${r.runId}|${r.questionId}|${r.engine}|${r.retrieval}`
}

function majorityCorrect(rows: readonly TrialResult[]): boolean | null {
  const correct = rows.filter((row) => effectiveScore(row) === 'korrekt').length
  const incorrect = rows.length - correct
  if (correct === incorrect) return null
  return correct > incorrect
}

/**
 * Accuracy auf Ebene einzigartiger Fragen. Wiederholungen werden innerhalb
 * eines Run/Engine/Retrieval-Clusters per Mehrheit zusammengefasst. Bei einem
 * Gleichstand wird das Cluster transparent aus der binären Inferenz entfernt.
 */
export function questionClusterSummary(results: TrialResult[]): QuestionClusterSummary {
  const clusters = new Map<string, TrialResult[]>()
  for (const result of results) {
    const key = questionClusterKey(result)
    const rows = clusters.get(key) ?? []
    rows.push(result)
    clusters.set(key, rows)
  }
  const outcomes = [...clusters.values()].map(majorityCorrect)
  const decided = outcomes.filter((value): value is boolean => value !== null)
  const correct = decided.filter(Boolean).length
  return {
    clusters: outcomes.length,
    n: decided.length,
    correct,
    accuracy: decided.length ? correct / decided.length : 0,
    ties: outcomes.length - decided.length,
    trials: results.length,
  }
}

/**
 * Primärer gepaarter Genauigkeitsvergleich auf Ebene einzigartiger Fragen.
 * Trial-Paare derselben Wiederholung werden nur noch deskriptiv gezählt.
 */
export function pairedComparison(results: TrialResult[], a: Condition, b: Condition): PairedComparison {
  const trialKey = (r: TrialResult) => `${questionClusterKey(r)}|${r.repetition}`
  const trialBs = new Set(results.filter((r) => r.condition === b).map(trialKey))
  const trialPairs = results.filter((r) => r.condition === a && trialBs.has(trialKey(r))).length

  const clustered = (condition: Condition) => {
    const map = new Map<string, TrialResult[]>()
    for (const result of results.filter((row) => row.condition === condition)) {
      const key = questionClusterKey(result)
      const rows = map.get(key) ?? []
      rows.push(result)
      map.set(key, rows)
    }
    return new Map([...map].map(([key, rows]) => [key, majorityCorrect(rows)] as const))
  }
  const as = clustered(a)
  const bs = clustered(b)
  const sharedKeys = [...as.keys()].filter((key) => bs.has(key))
  const excludedTies = sharedKeys.filter((key) => as.get(key) === null || bs.get(key) === null).length
  const pairs = sharedKeys
    .map((key) => [as.get(key), bs.get(key)] as const)
    .filter((pair): pair is readonly [boolean, boolean] => pair[0] !== null && pair[1] !== null)
  const aCorrect = pairs.filter(([aOutcome]) => aOutcome).length
  const bCorrect = pairs.filter(([, bOutcome]) => bOutcome).length
  const aOnlyCorrect = pairs.filter(([aOutcome, bOutcome]) => aOutcome && !bOutcome).length
  const bOnlyCorrect = pairs.filter(([aOutcome, bOutcome]) => !aOutcome && bOutcome).length
  const discordant = aOnlyCorrect + bOnlyCorrect
  let p: number | null = null
  if (discordant > 0) {
    const k = Math.min(aOnlyCorrect, bOnlyCorrect)
    let probability = Math.pow(0.5, discordant)
    let tail = probability
    for (let i = 1; i <= k; i++) {
      probability *= (discordant - i + 1) / i
      tail += probability
    }
    p = Math.min(1, 2 * tail)
  }
  return {
    a, b, pairs: pairs.length, trialPairs, excludedTies,
    accuracyA: pairs.length ? aCorrect / pairs.length : 0,
    accuracyB: pairs.length ? bCorrect / pairs.length : 0,
    delta: pairs.length ? (aCorrect - bCorrect) / pairs.length : 0,
    aOnlyCorrect, bOnlyCorrect, mcnemarExactP: p,
  }
}

// ────────────────────────── Verblindete Bewertung & Cohens κ ──────────────────────────

/** deterministische Misch-Reihenfolge (Hash über Trial-ID) – für die Verblindung */
export function blindOrder(results: TrialResult[]): TrialResult[] {
  const hash = (s: string) => {
    let h = 2166136261
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    return h >>> 0
  }
  return [...results].sort((a, b) => hash(a.id) - hash(b.id))
}

/**
 * Cohens κ zwischen den verblindeten Bewertungen A und B
 * (über alle Trials, die beide bewertet haben).
 */
export function cohensKappa(results: TrialResult[]): { kappa: number | null; n: number; agree: number } {
  const both = results.filter((r) => r.blind?.A && r.blind?.B)
  const n = both.length
  if (n === 0) return { kappa: null, n: 0, agree: 0 }
  const cats: Score[] = ['korrekt', 'teilweise', 'falsch', 'enthaltung']
  const agree = both.filter((r) => r.blind!.A === r.blind!.B).length
  const po = agree / n
  let pe = 0
  for (const c of cats) {
    const pa = both.filter((r) => r.blind!.A === c).length / n
    const pb = both.filter((r) => r.blind!.B === c).length / n
    pe += pa * pb
  }
  const kappa = pe >= 1 ? 1 : (po - pe) / (1 - pe)
  return { kappa, n, agree }
}
