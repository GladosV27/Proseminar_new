import type { GraphEdge, GraphNode, KnowledgeGraph } from '../data/types'
import { normalize, splitSentences } from './text'

/**
 * »Wissen füttern« – zwei Wege, den lokalen Graphen zu erweitern:
 *
 *  1. ingestText(): eigene Notizen/Dokumente werden zu Knoten; Erwähnungen
 *     vorhandener Entitäten werden automatisch als Kanten verlinkt.
 *     Alles bleibt auf dem Gerät (localStorage) – kein Upload.
 *
 *  2. importWikipediaTopic(): die App macht sich selbstständig zu einem
 *     Thema »schlauer«: Sie lädt Intro-Auszüge des Artikels und seiner
 *     verlinkten Nachbarn über die offizielle MediaWiki-API (CORS,
 *     origin=*) und baut daraus einen neuen Cluster. Das ist exakt die
 *     in der Präsentation skizzierte Pipeline Wikipedia → Subgraph,
 *     nur zur Laufzeit statt vorab.
 */

export function slug(title: string): string {
  return (
    'u_' +
    normalize(title)
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48)
  )
}

export function ingestText(
  title: string,
  text: string,
  graph: KnowledgeGraph,
): { node: GraphNode; edges: GraphEdge[] } {
  const id = slug(title)
  const summary = splitSentences(text).slice(0, 6).join(' ').slice(0, 900)
  const node: GraphNode = {
    id,
    title: title.trim(),
    type: 'konzept',
    community: 'custom',
    summary: summary || text.slice(0, 900),
    custom: true,
  }
  const edges: GraphEdge[] = []
  const t = ' ' + normalize(text) + ' '
  for (const other of graph.nodes) {
    if (other.id === id) continue
    const names = [other.title, ...(other.aliases ?? [])]
    if (names.some((n) => t.includes(' ' + normalize(n) + ' ') || t.includes(normalize(n) + ','))) {
      edges.push({ source: id, target: other.id, relation: 'erwaehnt', label: 'erwähnt', custom: true })
    }
  }
  return { node, edges }
}

// ────────────────────────── Wikipedia-Import (Themen-Lernen) ──────────────────────────

/** Fügt nur bei expliziter Namensnennung eine Kante zu bestehendem Wissen hinzu. */
function pdfMentionEdges(sourceId: string, text: string, graph: KnowledgeGraph): GraphEdge[] {
  const edges: GraphEdge[] = []
  const normalizedText = ' ' + normalize(text) + ' '
  for (const other of graph.nodes) {
    if (other.id === sourceId) continue
    const names = [other.title, ...(other.aliases ?? [])]
    if (names.some((name) => normalizedText.includes(' ' + normalize(name) + ' ') || normalizedText.includes(normalize(name) + ','))) {
      edges.push({ source: sourceId, target: other.id, relation: 'erwaehnt', label: 'erwähnt', custom: true })
    }
  }
  return edges
}

function pdfChunks(text: string, maxChars = 850, maxChunks = 24): string[] {
  const compact = text.replace(/\s+/g, ' ').trim()
  const sentences = splitSentences(compact)
  const units = sentences.length > 1 ? sentences : compact.match(new RegExp(`.{1,${maxChars}}(?:\\s|$)`, 'g')) ?? [compact]
  const chunks: string[] = []
  let current = ''
  for (const unit of units) {
    const part = unit.trim()
    if (!part) continue
    if (current && current.length + part.length + 1 > maxChars) {
      chunks.push(current)
      current = ''
      if (chunks.length >= maxChunks) break
    }
    current = current ? `${current} ${part}` : part
  }
  if (current && chunks.length < maxChunks) chunks.push(current)
  return chunks
}

/**
 * Überführt lokal extrahierten PDF-Text in Dokument- und Abschnittsknoten.
 * Kanten entstehen nur aus Dokumentstruktur oder expliziten Namensnennungen.
 */
export function ingestPdfDocument(
  title: string,
  text: string,
  graph: KnowledgeGraph,
): { nodes: GraphNode[]; edges: GraphEdge[]; chunks: number } {
  const documentId = slug(`pdf ${title}`)
  const sections = pdfChunks(text)
  if (sections.length === 0) throw new Error('Aus dem PDF konnte kein verwertbarer Text gelesen werden.')

  const nodes: GraphNode[] = [
    {
      id: documentId,
      title: `PDF: ${title}`,
      type: 'konzept',
      community: 'custom',
      summary: sections[0].slice(0, 900),
      custom: true,
    },
  ]
  const edges: GraphEdge[] = []
  let previousId: string | null = null
  for (const [index, section] of sections.entries()) {
    const id = `${documentId}_abschnitt_${index + 1}`
    nodes.push({
      id,
      title: `${title} · Abschnitt ${index + 1}`,
      type: 'konzept',
      community: 'custom',
      summary: section,
      custom: true,
    })
    edges.push({ source: documentId, target: id, relation: 'enthaelt_abschnitt', label: 'enthält Abschnitt', custom: true })
    if (previousId) edges.push({ source: previousId, target: id, relation: 'folgt_auf', label: 'folgt auf', custom: true })
    edges.push(...pdfMentionEdges(id, section, graph))
    previousId = id
  }
  return { nodes, edges, chunks: sections.length }
}

export interface WikiImportProgress {
  step: string
  done: number
  total: number
}

export interface WikiPage {
  title: string
  extract: string
}

const API = 'https://de.wikipedia.org/w/api.php'

export async function apiGet(params: Record<string, string>): Promise<any> {
  const url = `${API}?${new URLSearchParams({ ...params, format: 'json', origin: '*' })}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Wikipedia-API: HTTP ${res.status}`)
  return res.json()
}

export async function fetchIntro(title: string): Promise<WikiPage | null> {
  const data = await apiGet({
    action: 'query',
    prop: 'extracts',
    exintro: '1',
    explaintext: '1',
    redirects: '1',
    titles: title,
  })
  const pages = data?.query?.pages ?? {}
  for (const key of Object.keys(pages)) {
    const p = pages[key]
    if (p?.extract) return { title: p.title, extract: p.extract as string }
  }
  return null
}

export async function fetchLinkedTitles(title: string, limit = 60): Promise<string[]> {
  const data = await apiGet({
    action: 'query',
    prop: 'links',
    plnamespace: '0',
    pllimit: String(limit),
    redirects: '1',
    titles: title,
  })
  const pages = data?.query?.pages ?? {}
  const out: string[] = []
  for (const key of Object.keys(pages)) {
    for (const l of pages[key]?.links ?? []) out.push(l.title)
  }
  return out
}

/**
 * Baut zur Laufzeit einen Mini-Cluster: Startartikel + bis zu `neighbors`
 * verlinkte Artikel, deren Titel im Intro des Startartikels tatsächlich
 * vorkommen (das filtert Listen-/Datums-Rauschen wirksam heraus).
 */
export async function importWikipediaTopic(
  topic: string,
  neighbors = 8,
  onProgress?: (p: WikiImportProgress) => void,
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  onProgress?.({ step: `Lade Artikel »${topic}« …`, done: 0, total: neighbors + 1 })
  const root = await fetchIntro(topic)
  if (!root) throw new Error(`Artikel »${topic}« nicht gefunden.`)

  const introNorm = normalize(root.extract)
  const linked = await fetchLinkedTitles(root.title)
  const relevant = linked
    .filter((t) => t.length > 3 && introNorm.includes(normalize(t)))
    .slice(0, neighbors)

  const communityId = 'wiki_' + slug(root.title)
  const nodes: GraphNode[] = [
    {
      id: slug(root.title),
      title: root.title,
      type: 'konzept',
      community: communityId,
      summary: root.extract.slice(0, 1100),
      custom: true,
    },
  ]
  const edges: GraphEdge[] = []

  let done = 1
  for (const t of relevant) {
    onProgress?.({ step: `Lade Nachbar »${t}« …`, done, total: relevant.length + 1 })
    try {
      const page = await fetchIntro(t)
      if (page && page.extract.length > 120) {
        const nid = slug(page.title)
        if (!nodes.some((n) => n.id === nid)) {
          nodes.push({
            id: nid,
            title: page.title,
            type: 'konzept',
            community: communityId,
            summary: page.extract.slice(0, 900),
            custom: true,
          })
          edges.push({
            source: slug(root.title),
            target: nid,
            relation: 'mediawiki_verlinkt_auf',
            label: 'MediaWiki-Link',
            custom: true,
          })
        }
      }
    } catch {
      /* einzelne Fehlschläge tolerieren */
    }
    done++
  }

  // Querkanten ausschließlich bei einem tatsächlichen MediaWiki-Link.
  const mediaWikiLinks = new Map<string, Set<string>>()
  for (const node of nodes) {
    try {
      mediaWikiLinks.set(node.id, new Set((await fetchLinkedTitles(node.title)).map(normalize)))
    } catch {
      mediaWikiLinks.set(node.id, new Set())
    }
  }

  for (const a of nodes) {
    for (const b of nodes) {
      if (a.id === b.id) continue
      if (mediaWikiLinks.get(a.id)?.has(normalize(b.title))) {
        if (!edges.some((e) => e.source === a.id && e.target === b.id)) {
          edges.push({ source: a.id, target: b.id, relation: 'mediawiki_verlinkt_auf', label: 'MediaWiki-Link', custom: true })
        }
      }
    }
  }

  onProgress?.({ step: 'Fertig.', done: relevant.length + 1, total: relevant.length + 1 })
  return { nodes, edges }
}
