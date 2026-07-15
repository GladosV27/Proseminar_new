import type { GraphEdge, GraphNode, KnowledgeGraph } from '../data/types'
import type { LLMEngine } from './llm'
import { normalize } from './text'

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
  const index = new Map<string, string>()
  const put = (name: string, id: string) => {
    const key = normalize(name)
    if (key.length > 2 && !index.has(key)) index.set(key, id)
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
  return (name: string) => index.get(normalize(name.trim()))
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
): Promise<{ triples: ExtractedTriple[]; edges: GraphEdge[] }> {
  const gen = await engine.generate(EXTRACT_SYSTEM, `TEXT:\n${text.slice(0, 2500)}\n\nTRIPEL:`)
  const triples = parseTriples(gen.text)
  const resolve = buildResolver(graph, [newNode])

  const edges: GraphEdge[] = []
  for (const t of triples) {
    t.sourceId = resolve(t.subject)
    t.targetId = resolve(t.object)
    if (!t.sourceId || !t.targetId || t.sourceId === t.targetId) continue
    if (edges.some((e) => e.source === t.sourceId && e.target === t.targetId)) continue
    edges.push({
      source: t.sourceId,
      target: t.targetId,
      relation: normalize(t.relation).replace(/[^a-z0-9]+/g, '_').slice(0, 32) || 'bezug',
      label: t.relation,
      custom: true,
    })
  }
  return { triples, edges }
}
