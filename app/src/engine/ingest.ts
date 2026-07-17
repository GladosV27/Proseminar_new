import type {
  GraphEdge,
  GraphNode,
  KnowledgeGraph,
  KnowledgeImportReport,
  KnowledgeProvenance,
  KnowledgeSourceKind,
} from '../data/types'
import type { PdfReadResult } from './pdf'
import {
  THEMATIC_LINK_DEFAULTS,
  createImportReport,
  evidenceExcerpt,
  inferSimilarityEdges,
  inferTopicEdges,
  stableHash,
  type ThematicTextNode,
} from './knowledge'
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Exakte, Unicode-fähige Namensnennung mit Wortgrenzen und Originalspan. */
function literalMention(text: string, name: string): { start: number; end: number } | null {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0 || normalize(name).replace(/[^a-z0-9]/g, '').length < 3) return null
  const expression = parts.map(escapeRegex).join('\\s+')
  const match = new RegExp(`(^|[^\\p{L}\\p{N}])(${expression})(?=$|[^\\p{L}\\p{N}])`, 'iu').exec(text)
  if (!match) return null
  const start = match.index + match[1].length
  return { start, end: start + match[2].length }
}

function mentionEdges(
  sourceId: string,
  text: string,
  graph: KnowledgeGraph,
  provenance: Omit<KnowledgeProvenance, 'method' | 'confidence' | 'evidence' | 'charStart' | 'charEnd'>,
  offset = 0,
): { edges: GraphEdge[]; ambiguous: number } {
  const owners = new Map<string, Set<string>>()
  for (const node of graph.nodes) {
    for (const name of [node.title, ...(node.aliases ?? [])]) {
      const key = normalize(name).replace(/\s+/g, ' ').trim()
      if (!owners.has(key)) owners.set(key, new Set())
      owners.get(key)!.add(node.id)
    }
  }

  const edges: GraphEdge[] = []
  let ambiguous = 0
  for (const node of graph.nodes) {
    if (node.id === sourceId) continue
    let evidence: { start: number; end: number } | null = null
    for (const name of [node.title, ...(node.aliases ?? [])].sort((a, b) => b.length - a.length)) {
      const span = literalMention(text, name)
      if (!span) continue
      const key = normalize(name).replace(/\s+/g, ' ').trim()
      if ((owners.get(key)?.size ?? 0) !== 1) {
        ambiguous++
        continue
      }
      evidence = span
      break
    }
    if (!evidence) continue
    edges.push({
      source: sourceId,
      target: node.id,
      relation: 'erwaehnt',
      label: 'erwähnt',
      custom: true,
      provenance: [{
        ...provenance,
        method: 'explicit-mention',
        confidence: 'verified',
        evidence: evidenceExcerpt(text, evidence.start, evidence.end),
        charStart: offset + evidence.start,
        charEnd: offset + evidence.end,
      }],
    })
  }
  return { edges, ambiguous }
}

function belongsToImportScope(node: GraphNode, sourceId: string): boolean {
  return node.provenance?.some((value) =>
    value.importScopeId === sourceId || value.sourceId === sourceId,
  ) ?? false
}

/**
 * Ein Reimport darf nicht mit seinem alten, gleich darauf zu ersetzenden Stand
 * verglichen werden. Alle anderen Basis- und Nutzerknoten bleiben als mögliche
 * lokale Ähnlichkeitsziele erhalten.
 */
function similarityTargets(graph: KnowledgeGraph, sourceId: string): GraphNode[] {
  return graph.nodes.filter((node) => !belongsToImportScope(node, sourceId))
}

function mentionExclusions(sourceId: string, edges: GraphEdge[]): Map<string, ReadonlySet<string>> {
  return new Map([[sourceId, new Set(edges.filter((edge) => edge.source === sourceId).map((edge) => edge.target))]])
}

function sourceProvenance(args: {
  sourceId: string
  sourceKind: KnowledgeSourceKind
  sourceTitle: string
  importedAt: number
  evidence?: string
  contentFingerprint?: string
}): KnowledgeProvenance {
  return {
    ...args,
    importScopeId: args.sourceId,
    method: 'source-text',
    confidence: 'verified',
  }
}

export function ingestText(
  title: string,
  text: string,
  graph: KnowledgeGraph,
): { node: GraphNode; edges: GraphEdge[]; report: KnowledgeImportReport } {
  const cleanTitle = title.trim()
  const cleanText = text.trim()
  if (!cleanTitle || !cleanText) throw new Error('Titel und Text dürfen nicht leer sein.')
  const id = slug(title)
  const importedAt = Date.now()
  const sourceId = `manual-text:${stableHash(normalize(cleanTitle))}`
  const summary = splitSentences(cleanText).slice(0, 6).join(' ').slice(0, 900)
  const provenance = sourceProvenance({
    sourceId,
    sourceKind: 'manual-text',
    sourceTitle: cleanTitle,
    importedAt,
    evidence: summary || cleanText.slice(0, 320),
    contentFingerprint: `fnv1a:${stableHash(cleanText)}`,
  })
  const node: GraphNode = {
    id,
    title: cleanTitle,
    type: 'konzept',
    community: 'custom',
    summary: summary || cleanText.slice(0, 900),
    custom: true,
    provenance: [provenance],
  }
  const mentions = mentionEdges(id, cleanText, graph, provenance)
  const similarity = inferSimilarityEdges(
    [{ node, text: cleanText, provenance }],
    similarityTargets(graph, sourceId),
    { excludedTargets: mentionExclusions(id, mentions.edges) },
  )
  const edges = [...mentions.edges, ...similarity.edges]
  const warnings = cleanText.length > node.summary.length
    ? ['Der Notizknoten speichert nur eine Kurzfassung; Kanten behalten den belegenden Textausschnitt.']
    : []
  if (edges.length === 0) {
    warnings.push(
      `Keine eindeutige Entität und keine lokale Ähnlichkeit ≥ ${THEMATIC_LINK_DEFAULTS.similarityMinScore.toFixed(2)} gefunden; es wurde keine Beziehung geraten.`,
    )
  }
  const report = createImportReport({
    sourceId,
    sourceKind: 'manual-text',
    sourceTitle: cleanTitle,
    importedAt,
    localOnly: true,
    nodes: [node],
    edges,
    graph,
    truncated: cleanText.length > node.summary.length,
    warnings,
    skippedReasons: mentions.ambiguous ? { 'mehrdeutige Entitätsnennung': mentions.ambiguous } : {},
  })
  return { node, edges, report }
}

interface PdfChunk {
  text: string
  start: number
  end: number
  page?: number
}

function chunkSegment(text: string, baseOffset: number, maxChars: number, page?: number): PdfChunk[] {
  const chunks: PdfChunk[] = []
  let cursor = 0
  while (cursor < text.length) {
    while (/\s/.test(text[cursor] ?? '')) cursor++
    if (cursor >= text.length) break
    let end = Math.min(text.length, cursor + maxChars)
    if (end < text.length) {
      const minimum = cursor + Math.floor(maxChars * 0.55)
      const candidates = ['. ', '! ', '? ', '» ', '\n\n', '\n', ' ']
        .map((separator) => text.lastIndexOf(separator, end))
        .filter((position) => position >= minimum)
      if (candidates.length) end = Math.max(...candidates) + 1
    }
    if (end <= cursor) end = Math.min(text.length, cursor + maxChars)
    const raw = text.slice(cursor, end)
    const leading = raw.search(/\S/)
    const trailing = raw.match(/\s*$/)?.[0].length ?? 0
    const chunkText = leading >= 0 ? raw.slice(leading, raw.length - trailing) : ''
    if (chunkText) {
      chunks.push({
        text: chunkText,
        start: baseOffset + cursor + leading,
        end: baseOffset + end - trailing,
        page,
      })
    }
    cursor = end
  }
  return chunks
}

function pdfChunks(source: string | PdfReadResult, maxChars: number, maxChunks: number): { chunks: PdfChunk[]; truncated: boolean } {
  const chunks: PdfChunk[] = []
  const segments = typeof source === 'string' || source.pages.length === 0
    ? [{ text: typeof source === 'string' ? source : source.text, charStart: 0, page: undefined }]
    : source.pages.map((page) => ({ text: page.text, charStart: page.charStart, page: page.page }))
  let truncated = typeof source !== 'string' && source.truncated
  for (const segment of segments) {
    for (const chunk of chunkSegment(segment.text, segment.charStart, maxChars, segment.page)) {
      if (chunks.length >= maxChunks) {
        truncated = true
        return { chunks, truncated }
      }
      chunks.push(chunk)
    }
  }
  return { chunks, truncated }
}

export interface PdfIngestOptions {
  /** Stabiler Replace-Scope, falls gleichnamige Dokumente getrennt bleiben sollen. */
  sourceId?: string
  maxChunkChars?: number
  maxChunks?: number
}

/**
 * Überführt lokal extrahierten PDF-Text in Dokument- und Abschnittsknoten.
 * Die Dokumentstruktur bleibt als Herkunftsanker erhalten. Inhaltliche Kanten
 * entstehen dagegen ausschließlich aus exakten Namensnennungen, gewichteter
 * Themenüberlappung oder Ähnlichkeit oberhalb dokumentierter Schwellen.
 */
export function ingestPdfDocument(
  title: string,
  source: string | PdfReadResult,
  graph: KnowledgeGraph,
  options: PdfIngestOptions = {},
): { nodes: GraphNode[]; edges: GraphEdge[]; chunks: number; report: KnowledgeImportReport } {
  const cleanTitle = title.trim()
  if (!cleanTitle) throw new Error('Der PDF-Titel darf nicht leer sein.')
  const fullText = typeof source === 'string' ? source : source.text
  const importedAt = Date.now()
  const contentFingerprint = typeof source === 'string' ? `fnv1a:${stableHash(fullText)}` : source.fingerprint
  // Der Fingerprint verhindert, dass zwei verschiedene PDFs mit identischem
  // Dateinamen einander still ersetzen. Ein identischer Reimport bleibt
  // dagegen idempotent und kann seinen Source-Scope sauber aktualisieren.
  const sourceId = options.sourceId ?? `pdf-local:${contentFingerprint}`
  const documentId = `${slug(`pdf ${cleanTitle}`)}_${stableHash(sourceId)}`
  const chunked = pdfChunks(source, options.maxChunkChars ?? 1100, options.maxChunks ?? 128)
  const sections = chunked.chunks
  if (sections.length === 0) throw new Error('Aus dem PDF konnte kein verwertbarer Text gelesen werden.')

  const rootProvenance = sourceProvenance({
    sourceId,
    sourceKind: 'pdf',
    sourceTitle: cleanTitle,
    importedAt,
    evidence: sections[0].text.slice(0, 320),
    contentFingerprint,
  })

  const nodes: GraphNode[] = [
    {
      id: documentId,
      title: `PDF: ${cleanTitle}`,
      type: 'konzept',
      community: 'custom',
      summary: sections[0].text.slice(0, 900),
      custom: true,
      provenance: [rootProvenance],
    },
  ]
  const edges: GraphEdge[] = []
  const sectionSources: ThematicTextNode[] = []
  const excludedTargets = new Map<string, ReadonlySet<string>>()
  let ambiguousMentions = 0
  for (const [index, section] of sections.entries()) {
    const id = `${documentId}_abschnitt_${index + 1}`
    const sectionBase = {
      sourceId,
      importScopeId: sourceId,
      sourceKind: 'pdf' as const,
      sourceTitle: cleanTitle,
      importedAt,
      page: section.page,
      section: index + 1,
      charStart: section.start,
      charEnd: section.end,
      contentFingerprint,
    }
    const sectionProvenance: KnowledgeProvenance = {
      ...sectionBase,
      method: 'source-text',
      confidence: 'verified',
      evidence: section.text.slice(0, 320),
    }
    const sectionNode: GraphNode = {
      id,
      title: `${cleanTitle} · Abschnitt ${index + 1}`,
      type: 'konzept',
      community: 'custom',
      summary: section.text,
      custom: true,
      provenance: [sectionProvenance],
    }
    nodes.push(sectionNode)
    sectionSources.push({ node: sectionNode, text: section.text, provenance: sectionBase })
    const structuralProvenance: KnowledgeProvenance = {
      ...sectionBase,
      method: 'document-structure',
      confidence: 'verified',
      evidence: `Abschnitt ${index + 1}${section.page ? ` auf Seite ${section.page}` : ''}`,
    }
    edges.push({
      source: documentId,
      target: id,
      relation: 'enthaelt_abschnitt',
      label: 'enthält Abschnitt',
      custom: true,
      provenance: [structuralProvenance],
    })
    const mentions = mentionEdges(id, section.text, graph, sectionBase, section.start)
    edges.push(...mentions.edges)
    excludedTargets.set(id, new Set(mentions.edges.map((edge) => edge.target)))
    ambiguousMentions += mentions.ambiguous
  }

  // Dokumentinterne Topic-Kanten hängen nur von den Texten ab – nicht davon,
  // ob zwei Abschnitte zufällig nebeneinander stehen.
  const topicLinks = inferTopicEdges(sectionSources)
  // Brücken in den bereits vorhandenen Graphen werden lokal über TF-IDF
  // bestimmt. Exakte Entity-Nennungen haben Vorrang und werden nicht durch
  // eine zweite, schwächere Ähnlichkeitskante dupliziert.
  const similarityLinks = inferSimilarityEdges(
    sectionSources,
    similarityTargets(graph, sourceId),
    { excludedTargets },
  )
  edges.push(...topicLinks.edges, ...similarityLinks.edges)

  const warnings: string[] = []
  if (chunked.truncated) warnings.push('Der Dokumentimport wurde an einem lokalen Speicherlimit gekürzt.')
  const semanticEdgeCount = edges.filter((edge) =>
    edge.relation === 'erwaehnt' ||
    edge.relation === 'teilt_thema_mit' ||
    edge.relation === 'thematisch_aehnlich',
  ).length
  if (semanticEdgeCount === 0) {
    warnings.push(
      `Neben der belegten Dokumentstruktur wurde keine sichere Entity-, Topic- (≥ ${THEMATIC_LINK_DEFAULTS.topicMinScore.toFixed(2)}) oder Ähnlichkeitskante (≥ ${THEMATIC_LINK_DEFAULTS.similarityMinScore.toFixed(2)}) gefunden; es wurde keine Beziehung geraten.`,
    )
  }
  const report = createImportReport({
    sourceId,
    sourceKind: 'pdf',
    sourceTitle: cleanTitle,
    importedAt,
    localOnly: true,
    nodes,
    edges,
    graph,
    truncated: chunked.truncated,
    warnings,
    skippedReasons: ambiguousMentions ? { 'mehrdeutige Entitätsnennung': ambiguousMentions } : {},
  })
  return { nodes, edges, chunks: sections.length, report }
}

// ────────────────────────── Wikipedia-Import (Themen-Lernen) ──────────────────────────

export interface WikiImportProgress {
  step: string
  done: number
  total: number
}

export interface WikiPage {
  title: string
  extract: string
  pageId?: number
  revisionId?: number
  url?: string
}

const API = 'https://de.wikipedia.org/w/api.php'

export async function apiGet(params: Record<string, string>): Promise<any> {
  const url = `${API}?${new URLSearchParams({ ...params, format: 'json', origin: '*' })}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Wikipedia-API: HTTP ${res.status}`)
  const body = await res.text()
  try {
    return JSON.parse(body)
  } catch {
    throw new Error('Die Wikipedia-API lieferte keine gültigen JSON-Daten. Prüfe Netzwerk, Filter oder Captive Portal.')
  }
}

export async function fetchIntro(title: string): Promise<WikiPage | null> {
  const data = await apiGet({
    action: 'query',
    prop: 'extracts|info',
    inprop: 'url',
    exintro: '1',
    explaintext: '1',
    redirects: '1',
    titles: title,
  })
  const pages = data?.query?.pages ?? {}
  for (const key of Object.keys(pages)) {
    const p = pages[key]
    if (p?.extract) {
      return {
        title: p.title,
        extract: p.extract as string,
        pageId: typeof p.pageid === 'number' ? p.pageid : undefined,
        revisionId: typeof p.lastrevid === 'number' ? p.lastrevid : undefined,
        url: typeof p.canonicalurl === 'string' ? p.canonicalurl : undefined,
      }
    }
  }
  return null
}

export async function fetchLinkedTitles(title: string, limit = 200): Promise<string[]> {
  const out: string[] = []
  let continuation: string | undefined

  do {
    const data = await apiGet({
      action: 'query',
      prop: 'links',
      plnamespace: '0',
      pllimit: String(Math.min(500, Math.max(1, limit - out.length))),
      redirects: '1',
      titles: title,
      ...(continuation ? { plcontinue: continuation } : {}),
    })
    const pages = data?.query?.pages ?? {}
    for (const key of Object.keys(pages)) {
      for (const link of pages[key]?.links ?? []) {
        if (!out.includes(link.title)) out.push(link.title)
        if (out.length >= limit) return out
      }
    }
    continuation = data?.continue?.plcontinue
  } while (continuation && out.length < limit)

  return out.slice(0, limit)
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
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[]; report: KnowledgeImportReport }> {
  onProgress?.({ step: `Lade Artikel »${topic}« …`, done: 0, total: neighbors + 1 })
  const root = await fetchIntro(topic)
  if (!root) throw new Error(`Artikel »${topic}« nicht gefunden.`)

  const importedAt = Date.now()
  const importScopeId = `wikipedia-topic:${stableHash(normalize(root.title))}`
  const provenanceFor = (page: WikiPage, method: 'source-text' | 'mediawiki-link', targetTitle?: string): KnowledgeProvenance => ({
    sourceId: `wikipedia:${page.pageId ?? stableHash(normalize(page.title))}`,
    importScopeId,
    sourceKind: 'wikipedia',
    sourceTitle: page.title,
    importedAt,
    method,
    confidence: 'verified',
    evidence: method === 'source-text' ? page.extract.slice(0, 320) : `${page.title} verlinkt auf ${targetTitle}.`,
    url: page.url,
    pageId: page.pageId,
    revisionId: page.revisionId,
    targetTitle,
  })

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
      provenance: [provenanceFor(root, 'source-text')],
    },
  ]
  const edges: GraphEdge[] = []
  const pagesById = new Map<string, WikiPage>([[slug(root.title), root]])
  let failedPages = 0

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
            provenance: [provenanceFor(page, 'source-text')],
          })
          pagesById.set(nid, page)
          edges.push({
            source: slug(root.title),
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
      failedPages++
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
          const sourcePage = pagesById.get(a.id)
          edges.push({
            source: a.id,
            target: b.id,
            relation: 'mediawiki_verlinkt_auf',
            label: 'MediaWiki-Link',
            custom: true,
            provenance: sourcePage ? [provenanceFor(sourcePage, 'mediawiki-link', b.title)] : undefined,
          })
        }
      }
    }
  }

  onProgress?.({ step: 'Fertig.', done: relevant.length + 1, total: relevant.length + 1 })
  const report = createImportReport({
    sourceId: importScopeId,
    sourceKind: 'wikipedia',
    sourceTitle: root.title,
    importedAt,
    localOnly: false,
    nodes,
    edges,
    graph: { nodes: [], edges: [] },
    warnings: failedPages ? [`${failedPages} verlinkte Wikipedia-Seite(n) konnten nicht geladen werden.`] : [],
    skippedReasons: failedPages ? { 'Wikipedia-Seite nicht ladbar': failedPages } : {},
  })
  return { nodes, edges, report }
}
