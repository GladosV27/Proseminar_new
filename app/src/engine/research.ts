import type { GraphEdge, GraphNode, KnowledgeGraph } from '../data/types'
import { apiGet, fetchIntro, fetchLinkedTitles, slug } from './ingest'
import { normalize, terms } from './text'

/**
 * Live-Recherche: Wenn das Gerät online ist, kann der Assistent das für eine
 * Frage nötige Wissen on demand aus der Wikipedia ziehen.
 *
 * Pipeline:
 *  1. Volltextsuche (MediaWiki `list=search`) mit der Nutzerfrage → Top-Artikel
 *  2. Intro-Auszüge der Treffer laden (Knoten)
 *  3. Pro Treffer die im Intro tatsächlich erwähnten verlinkten Nachbarn laden
 *     (filtert Datums-/Listen-Rauschen) → weitere Knoten + `verlinkt_auf`-Kanten
 *  4. Querkanten über Intro-Erwähnungen zwischen allen Recherche-Knoten
 *
 * Wichtig für die Methodik: Recherche-Wissen landet in der Community
 * `recherche` und ist damit klar vom eingefrorenen Experiment-Korpus getrennt.
 * Das Experiment (Messläufe) benutzt ausschließlich den Basis-Korpus; die
 * Live-Recherche ist eine Assistenz-Funktion (vgl. Ausarbeitung § 8).
 */

export const RESEARCH_COMMUNITY = 'recherche'

export interface ResearchProgress {
  step: string
  done: number
  total: number
}

export interface ResearchResult {
  nodes: GraphNode[]
  edges: GraphEdge[]
  /** Titel der Wikipedia-Artikel, auf die sich die Recherche stützt */
  sources: string[]
}

async function searchTitles(query: string, limit = 3): Promise<string[]> {
  const data = await apiGet({
    action: 'query',
    list: 'search',
    srsearch: query,
    srnamespace: '0',
    srlimit: String(limit),
  })
  return (data?.query?.search ?? []).map((s: { title: string }) => s.title)
}

/**
 * Recherchiert Wikipedia-Wissen zu einer Frage und liefert einen kleinen
 * Recherche-Cluster zurück. Bereits vorhandene Knoten (gleiche ID im
 * übergebenen Graphen) werden nicht dupliziert; stattdessen entstehen
 * Brückenkanten, wenn Recherche-Texte vorhandene Entitäten erwähnen.
 */
export async function researchQuestion(
  question: string,
  existing: KnowledgeGraph,
  opts: { hits?: number; neighborsPerHit?: number } = {},
  onProgress?: (p: ResearchProgress) => void,
): Promise<ResearchResult> {
  const hits = opts.hits ?? 2
  const neighborsPerHit = opts.neighborsPerHit ?? 4

  onProgress?.({ step: 'Suche passende Wikipedia-Artikel …', done: 0, total: 1 })
  const titles = await searchTitles(question, hits + 1)
  if (titles.length === 0) throw new Error('Die Wikipedia-Suche lieferte keine Treffer zu dieser Frage.')

  const existingIds = new Set(existing.nodes.map((n) => n.id))
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const sources: string[] = []

  const addNode = (title: string, extract: string): string => {
    const id = slug(title)
    if (!existingIds.has(id) && !nodes.some((n) => n.id === id)) {
      nodes.push({
        id,
        title,
        type: 'konzept',
        community: RESEARCH_COMMUNITY,
        summary: extract.slice(0, 1100),
        custom: true,
      })
    }
    return id
  }

  // Grobe Schätzung für die Fortschrittsanzeige
  const totalSteps = 1 + Math.min(hits, titles.length) * (1 + neighborsPerHit)
  let done = 1

  for (const title of titles.slice(0, hits)) {
    onProgress?.({ step: `Lade Artikel »${title}« …`, done, total: totalSteps })
    const root = await fetchIntro(title)
    done++
    if (!root || root.extract.length < 80) continue
    sources.push(root.title)
    const rootId = addNode(root.title, root.extract)

    const introNorm = normalize(root.extract)
    let linked: string[] = []
    try {
      linked = await fetchLinkedTitles(root.title)
    } catch {
      /* Nachbarn sind optional */
    }
    const relevant = linked.filter((t) => t.length > 3 && introNorm.includes(normalize(t))).slice(0, neighborsPerHit)

    for (const t of relevant) {
      onProgress?.({ step: `Lade Nachbar »${t}« …`, done, total: totalSteps })
      try {
        const page = await fetchIntro(t)
        if (page && page.extract.length > 120) {
          const nid = addNode(page.title, page.extract)
          if (nid !== rootId && !edges.some((e) => e.source === rootId && e.target === nid)) {
            edges.push({ source: rootId, target: nid, relation: 'verlinkt_auf', label: 'verlinkt auf', custom: true })
          }
        }
      } catch {
        /* einzelne Fehlschläge tolerieren */
      }
      done++
    }
  }

  if (nodes.length === 0) {
    throw new Error('Zu dieser Frage konnten keine verwertbaren Artikel geladen werden.')
  }

  // Querkanten unter den Recherche-Knoten + Brücken zu vorhandenen Knoten
  const mentionTargets = [...nodes, ...existing.nodes]
  for (const a of nodes) {
    const aNorm = normalize(a.summary)
    for (const b of mentionTargets) {
      if (a.id === b.id) continue
      if (b.title.length > 3 && aNorm.includes(normalize(b.title))) {
        if (!edges.some((e) => e.source === a.id && e.target === b.id)) {
          edges.push({ source: a.id, target: b.id, relation: 'erwaehnt', label: 'erwähnt', custom: true })
        }
      }
    }
  }

  onProgress?.({ step: 'Recherche abgeschlossen.', done: totalSteps, total: totalSteps })
  return { nodes, edges, sources }
}

/** Heuristik: Findet das lokale Wissen vermutlich keine Antwort? */
export function looksUncovered(question: string, graph: KnowledgeGraph): boolean {
  const qt = new Set(terms(question))
  let best = 0
  for (const n of graph.nodes) {
    const nt = new Set(terms(n.title + ' ' + n.summary))
    let s = 0
    for (const t of qt) if (nt.has(t)) s++
    if (s > best) best = s
  }
  return best < 2
}
