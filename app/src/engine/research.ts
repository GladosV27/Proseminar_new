import type { GraphEdge, GraphNode, KnowledgeGraph, KnowledgeImportReport, KnowledgeProvenance } from '../data/types'
import { apiGet, fetchIntro, fetchLinkedTitles, slug, type WikiPage } from './ingest'
import { createImportReport, stableHash } from './knowledge'
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
 *  4. Quer- und Brückenkanten nur dann, wenn MediaWiki den Link tatsächlich
 *     im Quellartikel ausliefert – bloße Namensnennungen reichen nicht aus.
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
  report: KnowledgeImportReport
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
 * übergebenen Graphen) werden nicht dupliziert; Brückenkanten entstehen nur,
 * wenn MediaWiki im jeweiligen Quellartikel tatsächlich auf die Entität linkt.
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
  const verifiedLinks = new Map<string, Set<string>>()
  const researchedPages = new Map<string, WikiPage>()
  const importedAt = Date.now()
  const importScopeId = `wikipedia-research:${stableHash(normalize(question))}`

  const provenanceFor = (
    page: WikiPage,
    method: 'source-text' | 'mediawiki-link',
    targetTitle?: string,
  ): KnowledgeProvenance => ({
    sourceId: `wikipedia:${page.pageId ?? stableHash(normalize(page.title))}`,
    importScopeId,
    sourceKind: 'wikipedia-research',
    sourceTitle: page.title,
    importedAt,
    method,
    confidence: 'verified',
    evidence: method === 'source-text'
      ? page.extract.slice(0, 320)
      : `${page.title} verlinkt in MediaWiki auf ${targetTitle}.`,
    url: page.url,
    pageId: page.pageId,
    revisionId: page.revisionId,
    targetTitle,
  })

  const addNode = (page: WikiPage): string => {
    const id = slug(page.title)
    if (!existingIds.has(id) && !nodes.some((n) => n.id === id)) {
      nodes.push({
        id,
        title: page.title,
        type: 'konzept',
        community: RESEARCH_COMMUNITY,
        summary: page.extract.slice(0, 1100),
        custom: true,
        provenance: [provenanceFor(page, 'source-text')],
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
    const rootId = addNode(root)
    researchedPages.set(rootId, root)

    const introNorm = normalize(root.extract)
    let linked: string[] = []
    try {
      linked = await fetchLinkedTitles(root.title)
    } catch {
      /* Nachbarn sind optional */
    }
    verifiedLinks.set(rootId, new Set(linked.map(normalize)))
    const relevant = linked.filter((t) => t.length > 3 && introNorm.includes(normalize(t))).slice(0, neighborsPerHit)

    for (const t of relevant) {
      onProgress?.({ step: `Lade Nachbar »${t}« …`, done, total: totalSteps })
      try {
        const page = await fetchIntro(t)
        if (page && page.extract.length > 120) {
          const nid = addNode(page)
          researchedPages.set(nid, page)
          if (nid !== rootId && !edges.some((e) => e.source === rootId && e.target === nid)) {
            edges.push({
              source: rootId,
              target: nid,
              relation: 'mediawiki_verlinkt_auf',
              label: 'MediaWiki-Link',
              custom: true,
              provenance: [provenanceFor(root, 'mediawiki-link', page.title)],
            })
          }
        }
      } catch {
        /* einzelne Fehlschläge tolerieren */
      }
      done++
    }
  }

  // Auch für die aufgenommenen Nachbarartikel deren echte Linklisten laden.
  // So entsteht kein bloßer Stern um den Suchtreffer, sondern ein kleiner,
  // relational belegter Subgraph. Die Zahl bleibt durch hits/neighborsPerHit
  // eng begrenzt; die Requests laufen parallel.
  await Promise.all(
    [...researchedPages.entries()].map(async ([id, page]) => {
      if (verifiedLinks.has(id)) return
      try {
        verifiedLinks.set(id, new Set((await fetchLinkedTitles(page.title, 200)).map(normalize)))
      } catch {
        verifiedLinks.set(id, new Set())
      }
    }),
  )

  // Quer- und Brückenkanten nur aus verifizierten MediaWiki-Links. Dadurch
  // behauptet der Wissensbaum keine Relation allein aufgrund einer zufälligen
  // Namensnennung im Text.
  const targets = [...nodes, ...existing.nodes]
  for (const [sourceId, links] of verifiedLinks) {
    for (const target of targets) {
      if (sourceId === target.id) continue
      const names = [target.title, ...(target.aliases ?? [])].map(normalize)
      if (!names.some((name) => links.has(name))) continue
      const alreadyKnown = existing.edges.some(
        (edge) =>
          edge.source === sourceId &&
          edge.target === target.id &&
          edge.relation === 'mediawiki_verlinkt_auf',
      )
      if (!alreadyKnown && !edges.some((edge) => edge.source === sourceId && edge.target === target.id)) {
        const sourcePage = researchedPages.get(sourceId)
        edges.push({
          source: sourceId,
          target: target.id,
          relation: 'mediawiki_verlinkt_auf',
          label: 'MediaWiki-Link',
          custom: true,
          provenance: sourcePage ? [provenanceFor(sourcePage, 'mediawiki-link', target.title)] : undefined,
        })
      }
    }
  }

  if (nodes.length === 0 && edges.length === 0 && sources.length === 0) {
    throw new Error('Zu dieser Frage konnten keine verwertbaren Artikel geladen werden.')
  }

  onProgress?.({ step: 'Recherche abgeschlossen.', done: totalSteps, total: totalSteps })
  const report = createImportReport({
    sourceId: importScopeId,
    sourceKind: 'wikipedia-research',
    sourceTitle: sources.join(' · ') || question.slice(0, 120),
    importedAt,
    localOnly: false,
    nodes,
    edges,
    graph: existing,
  })
  return { nodes, edges, sources, report }
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
