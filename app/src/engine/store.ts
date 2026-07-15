import type { GraphEdge, GraphNode, KnowledgeGraph, TrialResult } from '../data/types'
import { BASE_GRAPH } from '../data/graph'
import { QUESTIONS } from '../data/questions'
import { ALL_CONDITIONS, ORDER_STRATEGY, SYSTEM_PROMPT } from './experiment'

/**
 * Lokale Persistenz (localStorage) – die App speichert alles ausschließlich
 * auf dem Gerät: Experiment-Ergebnisse und nutzereigenes Wissen.
 * Es gibt bewusst kein Backend (Privacy-by-Design, vgl. Motivation).
 */

const RESULTS_KEY = 'graphrag.results.v1'
const CUSTOM_KEY = 'graphrag.customKnowledge.v1'

export function loadResults(): TrialResult[] {
  try {
    const raw: Partial<TrialResult>[] = JSON.parse(localStorage.getItem(RESULTS_KEY) ?? '[]')
    // Migration älterer Datensätze: Deren latencyMs begann erst vor der
    // Generierung. Sie werden deshalb explizit als generation-only markiert
    // und später nicht in End-to-End-Aggregate gemischt.
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
        generationMs:
          r.generationMs ??
          (latencyScope === 'generation-only' ? latencyMs : Math.max(0, latencyMs - (r.prepareMs ?? 0))),
        evidenceRecall: r.evidenceRecall ?? null,
        evidencePrecision: r.evidencePrecision ?? null,
      } as TrialResult
    })
  } catch {
    return []
  }
}

export function saveResults(results: TrialResult[]): void {
  localStorage.setItem(RESULTS_KEY, JSON.stringify(results))
}

export interface CustomKnowledge {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export function loadCustomKnowledge(): CustomKnowledge {
  try {
    const k = JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? 'null')
    if (k && Array.isArray(k.nodes) && Array.isArray(k.edges)) return k
  } catch {
    /* ignore */
  }
  return { nodes: [], edges: [] }
}

export function saveCustomKnowledge(k: CustomKnowledge): void {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(k))
}

/** Basisgraph + Nutzerwissen zu einem Arbeitsgraphen zusammenführen. */
export function mergedGraph(custom: CustomKnowledge): KnowledgeGraph {
  const ids = new Set(BASE_GRAPH.nodes.map((n) => n.id))
  const nodes = [...BASE_GRAPH.nodes, ...custom.nodes.filter((n) => !ids.has(n.id))]
  return { nodes, edges: [...BASE_GRAPH.edges, ...custom.edges] }
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
        environment: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          language: navigator.language,
          hardwareConcurrency: navigator.hardwareConcurrency ?? null,
          deviceMemoryGiB: nav.deviceMemory ?? null,
          webgpu: Boolean(nav.gpu),
        },
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
    'id;runId;repetitionId;repetition;order;seed;questionOrder;conditionOrder;orderStrategy;questionId;condition;retrieval;engine;autoScore;manualScore;blindA;blindB;latencyMs;latencyScope;prepareMs;retrievalMs;generationMs;contextChars;evidenceRecall;evidencePrecision;retrievedIds;timestamp;answer'
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
      '"' + r.answer.replace(/"/g, '""').replace(/\n/g, ' ') + '"',
    ].join(';'),
  )
  return [head, ...rows].join('\n')
}
