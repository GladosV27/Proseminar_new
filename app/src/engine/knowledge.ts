import type {
  GraphEdge,
  GraphNode,
  KnowledgeGraph,
  KnowledgeImportDelta,
  KnowledgeImportReport,
  KnowledgeProvenance,
  KnowledgeSourceKind,
} from '../data/types'
import { splitSentences, stem, tokenize } from './text'

/**
 * Konservative Standards für automatisch abgeleitete Themenkanten.
 * Die Werte sind absichtlich exportiert: Tests, UI-Berichte und spätere
 * Kalibrierungen können dieselben, nachvollziehbaren Schwellen verwenden.
 */
export const THEMATIC_LINK_DEFAULTS = Object.freeze({
  topicMinScore: 0.22,
  topicMinSharedTerms: 2,
  topicTopTerms: 12,
  topicMaxEdgesPerNode: 2,
  similarityMinScore: 0.26,
  similarityMinSharedTerms: 3,
  similarityMaxEdgesPerSource: 2,
  similarityMaxEdgesPerTarget: 4,
})

/** Ein lokaler Textknoten samt Herkunftsbasis für abgeleitete Kanten. */
export interface ThematicTextNode {
  node: GraphNode
  text: string
  provenance: Omit<
    KnowledgeProvenance,
    'method' | 'confidence' | 'evidence' | 'score' | 'threshold' | 'sharedTerms' | 'targetTitle'
  >
}

export interface ThematicLinkResult {
  edges: GraphEdge[]
  /** Zahl tatsächlich verglichener Paare, nicht als „übersprungene Kanten“ zu verstehen. */
  evaluatedPairs: number
}

export interface TopicLinkOptions {
  minScore?: number
  minSharedTerms?: number
  topTerms?: number
  maxEdgesPerNode?: number
}

export interface SimilarityLinkOptions {
  minScore?: number
  minSharedTerms?: number
  maxEdgesPerSource?: number
  maxEdgesPerTarget?: number
  /** Verhindert Doppelbeziehungen, wenn bereits eine exakte Entity-Kante existiert. */
  excludedTargets?: ReadonlyMap<string, ReadonlySet<string>>
}

interface TermProfile {
  counts: Map<string, number>
  labels: Map<string, string>
  weights: Map<string, number>
  norm: number
  topTerms: string[]
  topWeight: number
}

interface PairScore {
  cosine: number
  topicOverlap: number
  shared: string[]
  sharedTop: string[]
}

interface TopicCandidate {
  left: ThematicTextNode
  right: ThematicTextNode
  score: PairScore
}

interface SimilarityCandidate {
  source: ThematicTextNode
  target: GraphNode
  score: PairScore
}

// Import-/Layout-Wörter dürfen keine inhaltliche Verbindung vortäuschen.
const NON_THEMATIC_TERMS = new Set([
  'abschnitt',
  'abbild',
  'beispiel',
  'dokument',
  'einleit',
  'kapitel',
  'literatur',
  'pdf',
  'quelle',
  'seit',
  'tabelle',
  'text',
  'verfass',
])

function roundedScore(value: number): number {
  return Math.round(value * 1000) / 1000
}

function termData(text: string): { counts: Map<string, number>; labels: Map<string, string> } {
  const counts = new Map<string, number>()
  const labelsByTerm = new Map<string, Map<string, number>>()
  for (const token of tokenize(text)) {
    const key = stem(token)
    if (key.length < 4 || /^\d+$/.test(key) || NON_THEMATIC_TERMS.has(key)) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
    const labels = labelsByTerm.get(key) ?? new Map<string, number>()
    labels.set(token, (labels.get(token) ?? 0) + 1)
    labelsByTerm.set(key, labels)
  }
  const labels = new Map<string, string>()
  for (const [key, variants] of labelsByTerm) {
    const best = [...variants].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0]))[0]
    if (best) labels.set(key, best[0])
  }
  return { counts, labels }
}

function profilesFor(texts: string[], topTerms: number): TermProfile[] {
  const raw = texts.map(termData)
  const documentFrequency = new Map<string, number>()
  for (const profile of raw) {
    for (const key of profile.counts.keys()) {
      documentFrequency.set(key, (documentFrequency.get(key) ?? 0) + 1)
    }
  }
  const documentCount = Math.max(1, raw.length)
  return raw.map(({ counts, labels }) => {
    const weights = new Map<string, number>()
    let squaredNorm = 0
    for (const [key, count] of counts) {
      const idf = Math.log((documentCount + 1) / ((documentFrequency.get(key) ?? 0) + 1)) + 1
      const weight = (1 + Math.log(count)) * idf
      weights.set(key, weight)
      squaredNorm += weight * weight
    }
    const ranked = [...weights].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    const selected = ranked.slice(0, Math.max(1, topTerms))
    return {
      counts,
      labels,
      weights,
      norm: Math.sqrt(squaredNorm),
      topTerms: selected.map(([key]) => key),
      topWeight: selected.reduce((sum, [, weight]) => sum + weight, 0),
    }
  })
}

function scoreProfiles(left: TermProfile, right: TermProfile): PairScore {
  const shared = [...left.weights.keys()].filter((key) => right.weights.has(key))
  let dot = 0
  for (const key of shared) dot += (left.weights.get(key) ?? 0) * (right.weights.get(key) ?? 0)

  const rightTop = new Set(right.topTerms)
  const sharedTop = left.topTerms.filter((key) => rightTop.has(key))
  let overlapWeight = 0
  for (const key of sharedTop) {
    overlapWeight += Math.min(left.weights.get(key) ?? 0, right.weights.get(key) ?? 0)
  }
  const overlapBase = Math.min(left.topWeight, right.topWeight)
  return {
    cosine: left.norm > 0 && right.norm > 0 ? dot / (left.norm * right.norm) : 0,
    topicOverlap: overlapBase > 0 ? overlapWeight / overlapBase : 0,
    shared: shared.sort((a, b) => {
      const weightA = Math.min(left.weights.get(a) ?? 0, right.weights.get(a) ?? 0)
      const weightB = Math.min(left.weights.get(b) ?? 0, right.weights.get(b) ?? 0)
      return weightB - weightA || a.localeCompare(b)
    }),
    sharedTop,
  }
}

function sharedLabels(keys: string[], left: TermProfile, right: TermProfile, max = 6): string[] {
  return keys.slice(0, max).map((key) => left.labels.get(key) ?? right.labels.get(key) ?? key)
}

function supportingSentence(text: string, sharedKeys: ReadonlySet<string>): string {
  const sentences = splitSentences(text)
  let best = ''
  let bestHits = 0
  for (const sentence of sentences) {
    const keys = new Set(termData(sentence).counts.keys())
    let hits = 0
    for (const key of sharedKeys) if (keys.has(key)) hits++
    if (hits > bestHits) {
      best = sentence
      bestHits = hits
    }
  }
  return (best || text).replace(/\s+/g, ' ').trim().slice(0, 145)
}

function metricEvidence(
  kind: 'Themenüberlappung' | 'Kosinus-Ähnlichkeit',
  score: number,
  threshold: number,
  labels: string[],
  leftText: string,
  rightText: string,
): string {
  const shared = new Set(labels.map((label) => stem(label)))
  const left = supportingSentence(leftText, shared)
  const right = supportingSentence(rightText, shared)
  const prefix = `${kind} ${score.toFixed(3)} ≥ ${threshold.toFixed(3)}; gemeinsam: ${labels.join(', ')}.`
  return `${prefix} A: „${left}“ B: „${right}“`.slice(0, 620)
}

function semanticProvenance(
  source: ThematicTextNode,
  target: GraphNode,
  method: 'topic-overlap' | 'lexical-similarity',
  score: number,
  threshold: number,
  labels: string[],
  evidence: string,
): KnowledgeProvenance {
  return {
    ...source.provenance,
    method,
    confidence: 'heuristic',
    evidence,
    targetTitle: target.title,
    score: roundedScore(score),
    threshold,
    sharedTerms: labels,
  }
}

/**
 * Verbindet Abschnitte nur dann thematisch, wenn mehrere ihrer jeweils
 * stärksten TF-IDF-Begriffe überlappen. Die Position im Dokument spielt für
 * die Auswahl ausdrücklich keine Rolle; bloße Nachbarschaft erzeugt nie eine
 * Kante. Pro Knoten werden nur die stärksten Kandidaten behalten.
 */
export function inferTopicEdges(
  sources: ThematicTextNode[],
  options: TopicLinkOptions = {},
): ThematicLinkResult {
  if (sources.length < 2) return { edges: [], evaluatedPairs: 0 }
  const minScore = options.minScore ?? THEMATIC_LINK_DEFAULTS.topicMinScore
  const minSharedTerms = options.minSharedTerms ?? THEMATIC_LINK_DEFAULTS.topicMinSharedTerms
  const topTerms = options.topTerms ?? THEMATIC_LINK_DEFAULTS.topicTopTerms
  const maxEdgesPerNode = options.maxEdgesPerNode ?? THEMATIC_LINK_DEFAULTS.topicMaxEdgesPerNode
  const profiles = profilesFor(sources.map((source) => source.text), topTerms)
  const candidates: TopicCandidate[] = []
  let evaluatedPairs = 0

  for (let leftIndex = 0; leftIndex < sources.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < sources.length; rightIndex++) {
      evaluatedPairs++
      const score = scoreProfiles(profiles[leftIndex], profiles[rightIndex])
      if (score.sharedTop.length < minSharedTerms || score.topicOverlap < minScore) continue
      candidates.push({ left: sources[leftIndex], right: sources[rightIndex], score })
    }
  }

  candidates.sort((a, b) =>
    b.score.topicOverlap - a.score.topicOverlap ||
    b.score.sharedTop.length - a.score.sharedTop.length ||
    a.left.node.id.localeCompare(b.left.node.id) ||
    a.right.node.id.localeCompare(b.right.node.id),
  )
  const degrees = new Map<string, number>()
  const edges: GraphEdge[] = []
  for (const candidate of candidates) {
    const leftDegree = degrees.get(candidate.left.node.id) ?? 0
    const rightDegree = degrees.get(candidate.right.node.id) ?? 0
    if (leftDegree >= maxEdgesPerNode || rightDegree >= maxEdgesPerNode) continue
    const leftProfile = profiles[sources.indexOf(candidate.left)]
    const rightProfile = profiles[sources.indexOf(candidate.right)]
    const labels = sharedLabels(candidate.score.sharedTop, leftProfile, rightProfile)
    const score = roundedScore(candidate.score.topicOverlap)
    const evidence = metricEvidence(
      'Themenüberlappung',
      score,
      minScore,
      labels,
      candidate.left.text,
      candidate.right.text,
    )
    edges.push({
      source: candidate.left.node.id,
      target: candidate.right.node.id,
      relation: 'teilt_thema_mit',
      label: 'teilt Thema mit',
      custom: true,
      provenance: [semanticProvenance(
        candidate.left,
        candidate.right.node,
        'topic-overlap',
        score,
        minScore,
        labels,
        evidence,
      )],
    })
    degrees.set(candidate.left.node.id, leftDegree + 1)
    degrees.set(candidate.right.node.id, rightDegree + 1)
  }
  return { edges, evaluatedPairs }
}

/**
 * Verknüpft neu importierte Texte mit bereits vorhandenem Wissen über eine
 * lokale TF-IDF-Kosinusähnlichkeit. Nur Paare mit mehreren gemeinsamen
 * Begriffen oberhalb der festen Schwelle werden übernommen. Das generische
 * Label behauptet bewusst keine Kausalität, Autorschaft oder Beeinflussung.
 */
export function inferSimilarityEdges(
  sources: ThematicTextNode[],
  targets: GraphNode[],
  options: SimilarityLinkOptions = {},
): ThematicLinkResult {
  if (sources.length === 0 || targets.length === 0) return { edges: [], evaluatedPairs: 0 }
  const minScore = options.minScore ?? THEMATIC_LINK_DEFAULTS.similarityMinScore
  const minSharedTerms = options.minSharedTerms ?? THEMATIC_LINK_DEFAULTS.similarityMinSharedTerms
  const maxEdgesPerSource = options.maxEdgesPerSource ?? THEMATIC_LINK_DEFAULTS.similarityMaxEdgesPerSource
  const maxEdgesPerTarget = options.maxEdgesPerTarget ?? THEMATIC_LINK_DEFAULTS.similarityMaxEdgesPerTarget
  const texts = [
    ...sources.map((source) => `${source.node.title} ${source.text}`),
    ...targets.map((target) => `${target.title} ${target.title} ${target.summary}`),
  ]
  const profiles = profilesFor(texts, THEMATIC_LINK_DEFAULTS.topicTopTerms)
  const sourceProfiles = profiles.slice(0, sources.length)
  const targetProfiles = profiles.slice(sources.length)
  const candidates: SimilarityCandidate[] = []
  let evaluatedPairs = 0

  for (const [sourceIndex, source] of sources.entries()) {
    const excluded = options.excludedTargets?.get(source.node.id)
    for (const [targetIndex, target] of targets.entries()) {
      if (target.id === source.node.id || excluded?.has(target.id)) continue
      evaluatedPairs++
      const score = scoreProfiles(sourceProfiles[sourceIndex], targetProfiles[targetIndex])
      if (score.shared.length < minSharedTerms || score.cosine < minScore) continue
      candidates.push({ source, target, score })
    }
  }

  candidates.sort((a, b) =>
    b.score.cosine - a.score.cosine ||
    b.score.shared.length - a.score.shared.length ||
    a.source.node.id.localeCompare(b.source.node.id) ||
    a.target.id.localeCompare(b.target.id),
  )
  const sourceDegrees = new Map<string, number>()
  const targetDegrees = new Map<string, number>()
  const edges: GraphEdge[] = []
  for (const candidate of candidates) {
    const sourceDegree = sourceDegrees.get(candidate.source.node.id) ?? 0
    const targetDegree = targetDegrees.get(candidate.target.id) ?? 0
    if (sourceDegree >= maxEdgesPerSource || targetDegree >= maxEdgesPerTarget) continue
    const sourceIndex = sources.indexOf(candidate.source)
    const targetIndex = targets.indexOf(candidate.target)
    const labels = sharedLabels(candidate.score.shared, sourceProfiles[sourceIndex], targetProfiles[targetIndex])
    const score = roundedScore(candidate.score.cosine)
    const evidence = metricEvidence(
      'Kosinus-Ähnlichkeit',
      score,
      minScore,
      labels,
      candidate.source.text,
      candidate.target.summary,
    )
    edges.push({
      source: candidate.source.node.id,
      target: candidate.target.id,
      relation: 'thematisch_aehnlich',
      label: 'ist thematisch ähnlich zu',
      custom: true,
      provenance: [semanticProvenance(
        candidate.source,
        candidate.target,
        'lexical-similarity',
        score,
        minScore,
        labels,
        evidence,
      )],
    })
    sourceDegrees.set(candidate.source.node.id, sourceDegree + 1)
    targetDegrees.set(candidate.target.id, targetDegree + 1)
  }
  return { edges, evaluatedPairs }
}

/** Stabiler, schneller Hash für IDs. Kein kryptographischer Integritätsbeleg. */
export function stableHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function edgeKey(edge: Pick<GraphEdge, 'source' | 'relation' | 'target'>): string {
  return `${edge.source}\u0000${edge.relation}\u0000${edge.target}`
}

export function emptyImportDelta(): KnowledgeImportDelta {
  return {
    addedNodeIds: [],
    updatedNodeIds: [],
    unchangedNodeIds: [],
    removedNodeIds: [],
    addedEdgeKeys: [],
    updatedEdgeKeys: [],
    unchangedEdgeKeys: [],
    removedEdgeKeys: [],
    skippedNodes: 0,
    skippedEdges: 0,
  }
}

export function provisionalDelta(nodes: GraphNode[], edges: GraphEdge[], graph: KnowledgeGraph): KnowledgeImportDelta {
  const delta = emptyImportDelta()
  const nodeIds = new Set(graph.nodes.map((node) => node.id))
  const edgeIds = new Set(graph.edges.map(edgeKey))
  for (const node of nodes) {
    if (nodeIds.has(node.id)) delta.updatedNodeIds.push(node.id)
    else delta.addedNodeIds.push(node.id)
  }
  for (const edge of edges) {
    const key = edgeKey(edge)
    if (edgeIds.has(key)) delta.unchangedEdgeKeys.push(key)
    else delta.addedEdgeKeys.push(key)
  }
  return delta
}

export function createImportReport(args: {
  sourceId: string
  sourceKind: KnowledgeSourceKind
  sourceTitle: string
  importedAt: number
  localOnly: boolean
  nodes: GraphNode[]
  edges: GraphEdge[]
  graph: KnowledgeGraph
  truncated?: boolean
  warnings?: string[]
  skippedReasons?: Record<string, number>
}): KnowledgeImportReport {
  const nonce = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${args.importedAt.toString(36)}-${stableHash(args.sourceId)}`
  const skippedReasons = { ...(args.skippedReasons ?? {}) }
  const delta = provisionalDelta(args.nodes, args.edges, args.graph)
  delta.skippedEdges = Object.values(skippedReasons).reduce((sum, count) => sum + count, 0)
  return {
    importId: `import:${nonce}`,
    sourceId: args.sourceId,
    sourceKind: args.sourceKind,
    sourceTitle: args.sourceTitle,
    importedAt: args.importedAt,
    localOnly: args.localOnly,
    candidateNodes: args.nodes.length,
    candidateEdges: args.edges.length,
    evidencedEdges: args.edges.filter((edge) => (edge.provenance?.length ?? 0) > 0).length,
    truncated: args.truncated ?? false,
    warnings: [...(args.warnings ?? [])],
    skippedReasons,
    delta,
  }
}

function provenanceKey(value: KnowledgeProvenance): string {
  return [
    value.sourceId,
    value.importScopeId ?? '',
    value.method,
    value.page ?? '',
    value.pageEnd ?? '',
    value.section ?? '',
    value.charStart ?? '',
    value.charEnd ?? '',
    value.revisionId ?? '',
    value.targetTitle ?? '',
    value.score ?? '',
    value.threshold ?? '',
    value.sharedTerms?.join('\u001f') ?? '',
    value.contentFingerprint ?? '',
    value.evidence ?? '',
  ].join('\u0000')
}

/** Vereinigt Herkunftsbelege deterministisch und ohne Duplikate. */
export function mergeProvenance(
  current: KnowledgeProvenance[] | undefined,
  additions: KnowledgeProvenance[] | undefined,
): KnowledgeProvenance[] | undefined {
  if (!current?.length && !additions?.length) return undefined
  const merged: KnowledgeProvenance[] = []
  const seen = new Set<string>()
  for (const value of [...(current ?? []), ...(additions ?? [])]) {
    if (!value?.sourceId || !value.method) continue
    const key = provenanceKey(value)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push({ ...value })
  }
  return merged.length ? merged : undefined
}

/** Kurzer Originalausschnitt um einen belegenden Textspan. */
export function evidenceExcerpt(text: string, start: number, end: number, maxChars = 320): string {
  const safeStart = Math.max(0, Math.min(start, text.length))
  const safeEnd = Math.max(safeStart, Math.min(end, text.length))
  const context = Math.max(0, Math.floor((maxChars - (safeEnd - safeStart)) / 2))
  let from = Math.max(0, safeStart - context)
  let to = Math.min(text.length, safeEnd + context)
  const beforeBoundary = text.lastIndexOf(' ', from)
  if (beforeBoundary >= 0 && beforeBoundary > from - 24) from = beforeBoundary + 1
  const afterBoundary = text.indexOf(' ', to)
  if (afterBoundary >= 0 && afterBoundary < to + 24) to = afterBoundary
  const compact = text.slice(from, to).replace(/\s+/g, ' ').trim()
  return `${from > 0 ? '…' : ''}${compact}${to < text.length ? '…' : ''}`
}
