import type {
  GraphEdge,
  GraphNode,
  KnowledgeGraph,
  KnowledgeImportReport,
  KnowledgeProvenance,
  TrialExecutionEnvironment,
  TrialResult,
} from '../data/types'
import { BASE_GRAPH } from '../data/graph'
import { QUESTIONS } from '../data/questions'
import { ALL_CONDITIONS, ORDER_STRATEGY, SYSTEM_PROMPT } from './experiment'
import { edgeKey, emptyImportDelta, mergeProvenance } from './knowledge'
import { readDurableSnapshot, writeDurableSnapshot } from './durableStorage'

/**
 * Lokale Persistenz (localStorage): Experiment-Ergebnisse und nutzereigenes
 * Wissen werden ausschließlich auf diesem Gerät gespeichert. Der getrennte
 * QR-Seminarmodus kann ausgewählte Promptauszüge online verarbeiten, schreibt
 * aber weder PDFs noch Wissensgraphen in ein Backend.
 */

const RESULTS_KEY = 'graphrag.results.v1'
const CUSTOM_KEY = 'graphrag.customKnowledge.v1'
const RESULTS_UPDATED_KEY = `${RESULTS_KEY}.updatedAt`
const CUSTOM_UPDATED_KEY = `${CUSTOM_KEY}.updatedAt`

export function captureExecutionEnvironment(): TrialExecutionEnvironment {
  const nav = navigator as Navigator & { deviceMemory?: number; gpu?: unknown }
  return {
    capturedAt: Date.now(),
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    origin: window.location.origin,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    deviceMemoryGiB: nav.deviceMemory ?? null,
    webgpu: Boolean(nav.gpu),
  }
}

function normalizeResults(raw: Partial<TrialResult>[]): TrialResult[] {
  return raw.map((r, i) => {
    const latencyMs = r.latencyMs ?? 0
    const latencyScope = r.latencyScope ?? 'generation-only'
    const runId = r.runId ?? 'legacy_unknown_run'
    return {
      ...r,
      id: r.id ?? `legacy_${i}_${r.timestamp ?? 0}`,
      runId,
      repetitionId: r.repetitionId ?? `${runId}_r${r.repetition ?? 1}`,
      repetition: r.repetition ?? 1,
      order: r.order ?? i + 1,
      seed: r.seed ?? null,
      questionOrder: r.questionOrder ?? null,
      conditionOrder: r.conditionOrder ?? null,
      orderStrategy: r.orderStrategy ?? 'legacy-order-unknown',
      retrieval: r.retrieval ?? 'tfidf',
      latencyMs,
      latencyScope,
      prepareMs: r.prepareMs ?? null,
      retrievalMs: r.retrievalMs ?? null,
      generationMs: r.generationMs ??
        (latencyScope === 'generation-only' ? latencyMs : Math.max(0, latencyMs - (r.prepareMs ?? 0))),
      evidenceRecall: r.evidenceRecall ?? null,
      evidencePrecision: r.evidencePrecision ?? null,
    } as TrialResult
  })
}

export function loadResults(): TrialResult[] {
  try {
    const raw: Partial<TrialResult>[] = JSON.parse(localStorage.getItem(RESULTS_KEY) ?? '[]')
    // Migration älterer Datensätze: Deren latencyMs begann erst vor der
    // Generierung. Sie werden deshalb explizit als generation-only markiert
    // und später nicht in End-to-End-Aggregate gemischt.
    return normalizeResults(raw)
  } catch {
    return []
  }
}

export function saveResults(results: TrialResult[]): void {
  localStorage.setItem(RESULTS_KEY, JSON.stringify(results))
  const updatedAt = Date.now()
  localStorage.setItem(RESULTS_UPDATED_KEY, String(updatedAt))
  void writeDurableSnapshot(RESULTS_KEY, results, updatedAt)
}

export interface CustomKnowledge {
  nodes: GraphNode[]
  edges: GraphEdge[]
  /** Letzte Importberichte; begrenzt, damit localStorage klein bleibt. */
  imports?: KnowledgeImportReport[]
}

export interface KnowledgeImportBatch {
  nodes: GraphNode[]
  edges: GraphEdge[]
  report: KnowledgeImportReport
}

export interface ApplyKnowledgeImportOptions {
  /** Entfernt den vorherigen Stand desselben Import-Scope vor dem Upsert. */
  replaceSource?: boolean
}

export interface AppliedKnowledgeImport {
  knowledge: CustomKnowledge
  report: KnowledgeImportReport
}

function validNode(value: unknown): value is GraphNode {
  const node = value as Partial<GraphNode>
  return Boolean(node && typeof node.id === 'string' && node.id && typeof node.title === 'string' && node.title && typeof node.summary === 'string')
}

function validEdge(value: unknown): value is GraphEdge {
  const edge = value as Partial<GraphEdge>
  return Boolean(
    edge &&
      typeof edge.source === 'string' && edge.source &&
      typeof edge.target === 'string' && edge.target &&
      typeof edge.relation === 'string' && edge.relation &&
      typeof edge.label === 'string' && edge.label,
  )
}

function sanitizeCustomKnowledge(value: Partial<CustomKnowledge> | null | undefined): CustomKnowledge {
  const nodeMap = new Map<string, GraphNode>()
  for (const node of value?.nodes ?? []) {
    if (!validNode(node)) continue
    const current = nodeMap.get(node.id)
    nodeMap.set(node.id, current
      ? { ...current, provenance: mergeProvenance(current.provenance, node.provenance) }
      : { ...node, custom: true })
  }
  const knownIds = new Set([...BASE_GRAPH.nodes.map((node) => node.id), ...nodeMap.keys()])
  const edgeMap = new Map<string, GraphEdge>()
  for (const edge of value?.edges ?? []) {
    if (!validEdge(edge) || edge.source === edge.target || !knownIds.has(edge.source) || !knownIds.has(edge.target)) continue
    const key = edgeKey(edge)
    const current = edgeMap.get(key)
    edgeMap.set(key, current
      ? { ...current, provenance: mergeProvenance(current.provenance, edge.provenance) }
      : { ...edge, custom: true })
  }
  return {
    nodes: [...nodeMap.values()],
    edges: [...edgeMap.values()],
    imports: Array.isArray(value?.imports) ? value!.imports!.slice(-30) : undefined,
  }
}

export function loadCustomKnowledge(): CustomKnowledge {
  try {
    const k = JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? 'null') as Partial<CustomKnowledge> | null
    if (k && Array.isArray(k.nodes) && Array.isArray(k.edges)) return sanitizeCustomKnowledge(k)
  } catch {
    /* ignore */
  }
  return { nodes: [], edges: [] }
}

export function saveCustomKnowledge(k: CustomKnowledge): CustomKnowledge {
  const normalized = sanitizeCustomKnowledge(k)
  // Alte Aufrufer kennen `imports` noch nicht; vorhandene Berichte bleiben
  // deshalb erhalten, wenn das Feld beim nächsten UI-Update fehlt.
  if (k.imports === undefined) {
    try {
      const previous = JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? 'null') as Partial<CustomKnowledge> | null
      if (Array.isArray(previous?.imports)) normalized.imports = previous.imports.slice(-30)
    } catch {
      /* defekte Altmetadaten werden verworfen */
    }
  }
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(normalized))
    const updatedAt = Date.now()
    localStorage.setItem(CUSTOM_UPDATED_KEY, String(updatedAt))
    void writeDurableSnapshot(CUSTOM_KEY, normalized, updatedAt)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Das lokale Wissen konnte nicht im Browser gespeichert werden (Speicherlimit). ${detail}`)
  }
  return normalized
}

/**
 * IndexedDB ist der robuste Langzeitspeicher für größere Graphen. localStorage
 * bleibt als synchroner Start-Snapshot und Rückfall erhalten; beim Start gewinnt
 * immer der nach Zeitstempel neuere, erfolgreich validierte Stand.
 */
export async function loadDurableState(): Promise<{ custom?: CustomKnowledge; results?: TrialResult[] }> {
  const [durableCustom, durableResults] = await Promise.all([
    readDurableSnapshot<Partial<CustomKnowledge>>(CUSTOM_KEY),
    readDurableSnapshot<Partial<TrialResult>[]>(RESULTS_KEY),
  ])
  const localCustomUpdated = Number(localStorage.getItem(CUSTOM_UPDATED_KEY) ?? 0)
  const localResultsUpdated = Number(localStorage.getItem(RESULTS_UPDATED_KEY) ?? 0)
  const result: { custom?: CustomKnowledge; results?: TrialResult[] } = {}

  if (durableCustom && durableCustom.updatedAt > localCustomUpdated) {
    const custom = sanitizeCustomKnowledge(durableCustom.value)
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom))
    localStorage.setItem(CUSTOM_UPDATED_KEY, String(durableCustom.updatedAt))
    result.custom = custom
  } else if (!durableCustom || localCustomUpdated > durableCustom.updatedAt) {
    const custom = loadCustomKnowledge()
    if (custom.nodes.length || custom.edges.length) void writeDurableSnapshot(CUSTOM_KEY, custom, localCustomUpdated || Date.now())
  }

  if (durableResults && durableResults.updatedAt > localResultsUpdated) {
    const results = normalizeResults(durableResults.value)
    localStorage.setItem(RESULTS_KEY, JSON.stringify(results))
    localStorage.setItem(RESULTS_UPDATED_KEY, String(durableResults.updatedAt))
    result.results = results
  } else if (!durableResults || localResultsUpdated > durableResults.updatedAt) {
    const results = loadResults()
    if (results.length) void writeDurableSnapshot(RESULTS_KEY, results, localResultsUpdated || Date.now())
  }
  return result
}

function inImportScope(provenance: KnowledgeProvenance, sourceId: string): boolean {
  return provenance.importScopeId === sourceId || provenance.sourceId === sourceId
}

function coreNode(node: GraphNode): string {
  return JSON.stringify({ title: node.title, type: node.type, community: node.community, aliases: node.aliases ?? [], summary: node.summary })
}

/**
 * Zentraler, idempotenter Import-Commit. Er ersetzt auf Wunsch den kompletten
 * alten Source-Scope (auch verschwundene PDF-Abschnitte), prüft ID-Kollisionen
 * mit dem Basisgraphen, verwirft unbelegte/dangling Kanten und liefert das
 * tatsächliche Delta. Die Funktion schreibt nicht ins Netz und mutiert ihre
 * Eingaben nicht; Persistenz erfolgt anschließend über `saveCustomKnowledge`.
 */
export function applyKnowledgeImport(
  current: CustomKnowledge,
  batch: KnowledgeImportBatch,
  options: ApplyKnowledgeImportOptions = {},
): AppliedKnowledgeImport {
  const clean = sanitizeCustomKnowledge(current)
  const originalNodes = new Map(clean.nodes.map((node) => [node.id, node]))
  const originalEdges = new Map(clean.edges.map((edge) => [edgeKey(edge), edge]))
  const delta = emptyImportDelta()
  // Bereits beim Parsen verworfene/mehrdeutige Kandidaten gehören ebenfalls
  // in das tatsächliche UI-Delta; zusätzliche Commit-Fehler werden addiert.
  delta.skippedNodes = batch.report.delta.skippedNodes
  delta.skippedEdges = batch.report.delta.skippedEdges
  const skippedReasons = { ...batch.report.skippedReasons }
  const scopeId = batch.report.sourceId
  let nodes: GraphNode[] = clean.nodes.map((node) => ({ ...node, provenance: node.provenance?.map((value) => ({ ...value })) }))
  let edges: GraphEdge[] = clean.edges.map((edge) => ({ ...edge, provenance: edge.provenance?.map((value) => ({ ...value })) }))

  if (options.replaceSource !== false) {
    nodes = nodes.flatMap((node) => {
      const hadScope = node.provenance?.some((value) => inImportScope(value, scopeId)) ?? false
      if (!hadScope) return [node]
      const provenance = node.provenance?.filter((value) => !inImportScope(value, scopeId))
      if (provenance?.length) return [{ ...node, provenance }]
      delta.removedNodeIds.push(node.id)
      return []
    })
    edges = edges.flatMap((edge) => {
      const hadScope = edge.provenance?.some((value) => inImportScope(value, scopeId)) ?? false
      if (!hadScope) return [edge]
      const provenance = edge.provenance?.filter((value) => !inImportScope(value, scopeId))
      if (provenance?.length) return [{ ...edge, provenance }]
      delta.removedEdgeKeys.push(edgeKey(edge))
      return []
    })
  }

  const baseIds = new Set(BASE_GRAPH.nodes.map((node) => node.id))
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const rejectedNodeIds = new Set<string>()
  for (const candidate of batch.nodes) {
    if (!validNode(candidate)) {
      delta.skippedNodes++
      continue
    }
    if (baseIds.has(candidate.id)) {
      // Gleicher Titel aus anderer Quellart darf den eingefrorenen Basisknoten
      // weder ersetzen noch unbemerkt als eigener Knoten erscheinen.
      delta.skippedNodes++
      skippedReasons['ID-Kollision mit Basisgraph'] = (skippedReasons['ID-Kollision mit Basisgraph'] ?? 0) + 1
      continue
    }
    const existing = nodeMap.get(candidate.id)
    if (!existing) {
      nodeMap.set(candidate.id, { ...candidate, custom: true })
      const previous = originalNodes.get(candidate.id)
      if (previous) {
        delta.removedNodeIds = delta.removedNodeIds.filter((id) => id !== candidate.id)
        if (coreNode(previous) === coreNode(candidate)) delta.unchangedNodeIds.push(candidate.id)
        else delta.updatedNodeIds.push(candidate.id)
      } else {
        delta.addedNodeIds.push(candidate.id)
      }
      continue
    }
    const existingKinds = new Set(existing.provenance?.map((value) => value.sourceKind) ?? [])
    const candidateKinds = new Set(candidate.provenance?.map((value) => value.sourceKind) ?? [])
    if (existingKinds.size && candidateKinds.size && ![...candidateKinds].some((kind) => existingKinds.has(kind))) {
      rejectedNodeIds.add(candidate.id)
      delta.skippedNodes++
      skippedReasons['ID-Kollision zwischen Quellarten'] =
        (skippedReasons['ID-Kollision zwischen Quellarten'] ?? 0) + 1
      continue
    }
    const merged = { ...existing, ...candidate, custom: true, provenance: mergeProvenance(existing.provenance, candidate.provenance) }
    nodeMap.set(candidate.id, merged)
    if (coreNode(existing) === coreNode(merged)) delta.unchangedNodeIds.push(candidate.id)
    else delta.updatedNodeIds.push(candidate.id)
  }

  const knownIds = new Set([...baseIds, ...nodeMap.keys()])
  const edgeMap = new Map(edges.map((edge) => [edgeKey(edge), edge]))
  for (const candidate of batch.edges) {
    if (
      !validEdge(candidate) ||
      candidate.source === candidate.target ||
      rejectedNodeIds.has(candidate.source) ||
      rejectedNodeIds.has(candidate.target) ||
      !knownIds.has(candidate.source) ||
      !knownIds.has(candidate.target) ||
      !candidate.provenance?.length
    ) {
      delta.skippedEdges++
      continue
    }
    const key = edgeKey(candidate)
    const existing = edgeMap.get(key)
    if (!existing) {
      edgeMap.set(key, { ...candidate, custom: true })
      const previous = originalEdges.get(key)
      if (previous) {
        delta.removedEdgeKeys = delta.removedEdgeKeys.filter((value) => value !== key)
        const provenance = mergeProvenance(previous.provenance, candidate.provenance)
        if ((provenance?.length ?? 0) === (previous.provenance?.length ?? 0)) delta.unchangedEdgeKeys.push(key)
        else delta.updatedEdgeKeys.push(key)
      } else {
        delta.addedEdgeKeys.push(key)
      }
      continue
    }
    const provenance = mergeProvenance(existing.provenance, candidate.provenance)
    edgeMap.set(key, { ...existing, ...candidate, custom: true, provenance })
    if ((provenance?.length ?? 0) === (existing.provenance?.length ?? 0)) delta.unchangedEdgeKeys.push(key)
    else delta.updatedEdgeKeys.push(key)
  }

  // Durch Source-Replacement entfernte Knoten dürfen keine Alt-Kanten hinterlassen.
  for (const [key, edge] of edgeMap) {
    if (!knownIds.has(edge.source) || !knownIds.has(edge.target)) {
      edgeMap.delete(key)
      if (!delta.removedEdgeKeys.includes(key)) delta.removedEdgeKeys.push(key)
    }
  }

  const report: KnowledgeImportReport = {
    ...batch.report,
    warnings: [...batch.report.warnings],
    skippedReasons,
    delta,
  }
  const imports = [...(clean.imports ?? []).filter((item) => item.importId !== report.importId), report].slice(-30)
  return {
    knowledge: { nodes: [...nodeMap.values()], edges: [...edgeMap.values()], imports },
    report,
  }
}

/** Basisgraph + Nutzerwissen zu einem Arbeitsgraphen zusammenführen. */
export function mergedGraph(custom: CustomKnowledge): KnowledgeGraph {
  const clean = sanitizeCustomKnowledge(custom)
  const ids = new Set(BASE_GRAPH.nodes.map((node) => node.id))
  const nodes = [...BASE_GRAPH.nodes, ...clean.nodes.filter((node) => !ids.has(node.id))]
  const knownIds = new Set(nodes.map((node) => node.id))
  const edgeMap = new Map<string, GraphEdge>()
  for (const edge of [...BASE_GRAPH.edges, ...clean.edges]) {
    if (!knownIds.has(edge.source) || !knownIds.has(edge.target) || edge.source === edge.target) continue
    const key = edgeKey(edge)
    const existing = edgeMap.get(key)
    edgeMap.set(key, existing
      ? { ...existing, provenance: mergeProvenance(existing.provenance, edge.provenance) }
      : edge)
  }
  return { nodes, edges: [...edgeMap.values()] }
}

export function exportResultsJson(results: TrialResult[]): string {
  const nav = navigator as Navigator & { deviceMemory?: number; gpu?: unknown }
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      tool: 'graph-rag-lab/1.2',
      schemaVersion: 3,
      reproducibility: {
        systemPrompt: SYSTEM_PROMPT,
        conditions: ALL_CONDITIONS,
        corpus: { nodes: BASE_GRAPH.nodes.length, edges: BASE_GRAPH.edges.length, frozen: true },
        questions: { n: QUESTIONS.length, ids: QUESTIONS.map((q) => q.id) },
        exportEnvironment: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          language: navigator.language,
          hardwareConcurrency: navigator.hardwareConcurrency ?? null,
          deviceMemoryGiB: nav.deviceMemory ?? null,
          webgpu: Boolean(nav.gpu),
        },
        environmentNote: 'exportEnvironment beschreibt nur das Exportgerät; die tatsächliche Messumgebung steht pro Trial in executionEnvironment.',
      },
      timing: {
        latencyMs: 'End-to-End: Vorbereitung einschließlich Retrieval plus Generierung',
        prepareMs: 'Vorbereitung einschließlich Retrieval und Promptaufbau',
        retrievalMs: 'Retrieval bzw. Subgraph-Extraktion innerhalb der Vorbereitung',
        generationMs: 'reine Modellgenerierung',
        legacyNote: 'latencyScope=generation-only kennzeichnet migrierte Altdaten ohne End-to-End-Messung',
      },
      ordering: {
        strategy: ORDER_STRATEGY,
        note: 'runId, repetitionId, repetition, order und seed erlauben die Rekonstruktion jedes Messlaufs',
      },
      results,
    },
    null,
    2,
  )
}

export function exportSubmissionBundle(results: TrialResult[]): string {
  return JSON.stringify({
    README: 'Reproduzierbarkeitspaket: metadata_and_results enthält Rohdaten und Messstand; csv ist die flache Prüftabelle. Quizdaten sind ausgeschlossen.',
    metadata_and_results: JSON.parse(exportResultsJson(results)),
    csv: exportResultsCsv(results),
  }, null, 2)
}

export function exportResultsCsv(results: TrialResult[]): string {
  const head =
    'id;runId;repetitionId;repetition;order;seed;questionOrder;conditionOrder;orderStrategy;questionId;condition;retrieval;engine;autoScore;manualScore;blindA;blindB;latencyMs;latencyScope;prepareMs;retrievalMs;generationMs;contextChars;evidenceRecall;evidencePrecision;retrievedIds;timestamp;executionEnvironment;answer'
  const rows = results.map((r) =>
    [
      r.id,
      r.runId,
      r.repetitionId,
      r.repetition,
      r.order,
      r.seed ?? '',
      r.questionOrder ?? '',
      r.conditionOrder ?? '',
      r.orderStrategy,
      r.questionId,
      r.condition,
      r.retrieval,
      r.engine,
      r.autoScore,
      r.manualScore ?? '',
      r.blind?.A ?? '',
      r.blind?.B ?? '',
      r.latencyMs,
      r.latencyScope,
      r.prepareMs ?? '',
      r.retrievalMs ?? '',
      r.generationMs,
      r.contextChars,
      r.evidenceRecall ?? '',
      r.evidencePrecision ?? '',
      r.retrievedIds.join('|'),
      r.timestamp,
      `"${JSON.stringify(r.executionEnvironment ?? null).replace(/"/g, '""')}"`,
      '"' + r.answer.replace(/"/g, '""').replace(/\n/g, ' ') + '"',
    ].join(';'),
  )
  return [head, ...rows].join('\n')
}
