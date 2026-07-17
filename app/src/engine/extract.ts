import type { GraphEdge, GraphNode, KnowledgeGraph } from '../data/types'
import type { LLMEngine } from './llm'
import { evidenceExcerpt } from './knowledge'
import { normalize, splitSentences, terms } from './text'

/**
 * LLM-basierte Tripel-Extraktion: Das LOKALE Sprachmodell liest einen Text
 * und extrahiert typisierte Beziehungen (Subjekt | Relation | Objekt).
 *
 * Damit baut sich der Wissensgraph selbst – der Beleg dafür, dass die
 * manuelle Kuratierung des Messkorpus eine Reproduzierbarkeits-Entscheidung
 * war und keine Notwendigkeit des Ansatzes (Ausarbeitung § 8): Die Pipeline
 * Text → Graph ist vollständig on-device automatisierbar.
 *
 * Konservative Übernahme: Es werden nur Tripel übernommen, deren Subjekt und
 * Objekt sich eindeutig auf bekannte Knoten (inkl. des neuen) auflösen lassen –
 * lieber weniger Kanten als halluzinierte.
 */

const EXTRACT_SYSTEM = [
  'Du extrahierst Wissensgraph-Tripel aus deutschem Text.',
  'Antworte AUSSCHLIESSLICH mit Tripeln, eine pro Zeile, im Format:',
  'Subjekt | Relation | Objekt',
  'Verwende als Subjekt und Objekt nur Namen, die wörtlich im Text vorkommen.',
  'Die Relation ist ein kurzes Verb oder eine Verbphrase (z. B. »studierte bei«, »verfasste«, »kritisierte«).',
  'Maximal 8 Tripel. Keine Erklärungen, keine Nummerierung.',
].join(' ')

export interface ExtractedTriple {
  subject: string
  relation: string
  object: string
  /** aufgelöste Knoten-IDs (nur gesetzt, wenn eindeutig zuordenbar) */
  sourceId?: string
  targetId?: string
}

function buildResolver(graph: KnowledgeGraph, extraNodes: GraphNode[]): (name: string) => string | undefined {
  const index = new Map<string, Set<string>>()
  const put = (name: string, id: string) => {
    const key = normalize(name)
    if (key.length <= 2) return
    if (!index.has(key)) index.set(key, new Set())
    index.get(key)!.add(id)
  }
  for (const n of [...graph.nodes, ...extraNodes]) {
    put(n.title, n.id)
    for (const a of n.aliases ?? []) put(a, n.id)
    // Nachname als Alias für Personen (»Hegel« → Georg Wilhelm Friedrich Hegel)
    if (n.type === 'person') {
      const parts = n.title.split(' ')
      if (parts.length > 1) put(parts[parts.length - 1], n.id)
    }
  }
  return (name: string) => {
    const matches = index.get(normalize(name.trim()))
    return matches?.size === 1 ? [...matches][0] : undefined
  }
}

function literalInText(text: string, value: string): boolean {
  const escaped = value.trim().split(/\s+/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')
  return Boolean(escaped && new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(text))
}

function supportingSentence(text: string, triple: ExtractedTriple): { sentence: string; start: number } | null {
  let cursor = 0
  for (const sentence of splitSentences(text)) {
    const start = text.indexOf(sentence, cursor)
    cursor = Math.max(cursor, start + sentence.length)
    if (!literalInText(sentence, triple.subject) || !literalInText(sentence, triple.object)) continue
    const sentenceTerms = new Set(terms(sentence))
    const relationTerms = terms(triple.relation)
    const relationSupported = relationTerms.length > 0
      ? relationTerms.some((term) => sentenceTerms.has(term))
      : normalize(sentence).includes(normalize(triple.relation))
    if (relationSupported) return { sentence, start: Math.max(0, start) }
  }
  return null
}

export function parseTriples(raw: string): ExtractedTriple[] {
  return raw
    .split('\n')
    .map((l) => l.replace(/^[-*\d.)\s]+/, '').trim())
    .filter((l) => l.split('|').length === 3)
    .map((l) => {
      const [subject, relation, object] = l.split('|').map((x) => x.trim())
      return { subject, relation, object }
    })
    .filter((t) => t.subject && t.relation && t.object && t.relation.length < 60)
    .slice(0, 8)
}

export async function extractTriples(
  engine: LLMEngine,
  text: string,
  graph: KnowledgeGraph,
  newNode: GraphNode,
): Promise<{ triples: ExtractedTriple[]; edges: GraphEdge[]; evidenceRejected: number }> {
  if (engine.execution !== 'local') {
    throw new Error('Private Tripel-Extraktion ist ausschließlich mit einem lokalen Modell erlaubt.')
  }
  const gen = await engine.generate(EXTRACT_SYSTEM, `TEXT:\n${text.slice(0, 2500)}\n\nTRIPEL:`)
  const triples = parseTriples(gen.text)
  const resolve = buildResolver(graph, [newNode])

  const edges: GraphEdge[] = []
  let evidenceRejected = 0
  for (const t of triples) {
    t.sourceId = resolve(t.subject)
    t.targetId = resolve(t.object)
    const support = supportingSentence(text, t)
    if (!t.sourceId || !t.targetId || t.sourceId === t.targetId || !support) {
      evidenceRejected++
      continue
    }
    const relation = normalize(t.relation).replace(/[^a-z0-9]+/g, '_').slice(0, 32) || 'bezug'
    if (edges.some((e) => e.source === t.sourceId && e.target === t.targetId && e.relation === relation)) continue
    const inherited = newNode.provenance?.[0]
    edges.push({
      source: t.sourceId,
      target: t.targetId,
      relation,
      label: t.relation,
      custom: true,
      provenance: [{
        sourceId: inherited?.sourceId ?? `local-llm:${newNode.id}`,
        importScopeId: inherited?.importScopeId ?? inherited?.sourceId ?? `local-llm:${newNode.id}`,
        sourceKind: inherited?.sourceKind ?? 'local-llm',
        sourceTitle: inherited?.sourceTitle ?? newNode.title,
        importedAt: Date.now(),
        method: 'llm-triple',
        confidence: 'model-assisted',
        evidence: evidenceExcerpt(text, support.start, support.start + support.sentence.length),
        charStart: support.start,
        charEnd: support.start + support.sentence.length,
        contentFingerprint: inherited?.contentFingerprint,
      }],
    })
  }
  return { triples, edges, evidenceRejected }
}
