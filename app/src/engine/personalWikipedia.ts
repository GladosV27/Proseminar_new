import type {
  GraphEdge,
  GraphNode,
  KnowledgeGraph,
  KnowledgeImportReport,
  KnowledgeProvenance,
} from '../data/types'
import { createImportReport, stableHash } from './knowledge'
import { normalize, terms } from './text'

/**
 * Persönlicher Wikipedia-Pull über die offizielle deutschsprachige
 * MediaWiki Action API. Private Texte werden nie an den Endpunkt geschickt:
 * Die Suche erhält nur die vom Nutzer eingegebene Suchphrase bzw. einen lokal
 * erkannten, ausdrücklich freigegebenen Entitätsnamen.
 */

const MEDIAWIKI_API = 'https://de.wikipedia.org/w/api.php'

export const PERSONAL_WIKIPEDIA_LIMITS = Object.freeze({
  searchResults: 6,
  selectedRoots: 3,
  neighborsPerRoot: 2,
  pagesPerPull: 9,
  // MediaWiki liefert prop=links titelweise paginiert. 160 brach bei großen
  // Artikeln bereits vor zentralen Namen ab; 500 entspricht einer vollen
  // API-Seite und bleibt durch das separate Kantenlimit kontrolliert.
  linksPerPage: 500,
  relationsPerPull: 48,
  summaryChars: 1_100,
  queryChars: 120,
})

export interface WikipediaSearchHit {
  key: string
  pageId: number
  title: string
  extract: string
  url: string
  revisionId?: number
  disambiguation: boolean
}

export interface WikipediaPullProgress {
  step: string
  done: number
  total: number
}

export interface WikipediaPullOptions {
  maxRoots?: number
  neighborsPerRoot?: number
  maxPages?: number
  maxLinksPerPage?: number
  maxRelations?: number
  onProgress?: (progress: WikipediaPullProgress) => void
  signal?: AbortSignal
}

export interface WikipediaPullResult {
  nodes: GraphNode[]
  edges: GraphEdge[]
  report: KnowledgeImportReport
  /** Auch bereits vorhandene Graphknoten, die durch den Pull beteiligt sind. */
  focusNodeIds: string[]
  pages: Array<{ id: string; pageId?: number; title: string; url?: string }>
  selectedTitles: string[]
}

export interface RecognizedWikipediaTopic {
  id: string
  title: string
  mentions: number
  reason: string
}

interface ApiPage {
  pageid?: number
  ns?: number
  title?: string
  extract?: string
  canonicalurl?: string
  fullurl?: string
  lastrevid?: number
  index?: number
  missing?: boolean
  pageprops?: { disambiguation?: string }
}

interface PageDetail {
  pageId?: number
  title: string
  requestedTitle: string
  extract: string
  url?: string
  revisionId?: number
  disambiguation: boolean
}

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(minimum, Math.min(maximum, Math.floor(value!)))
}

function canonicalUrl(title: string): string {
  return `https://de.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
}

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function uniqueBy<T>(values: T[], keyOf: (value: T) => string): T[] {
  const seen = new Set<string>()
  return values.filter((value) => {
    const key = keyOf(value)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function abortError(): DOMException {
  return new DOMException('Der Wikipedia-Abruf wurde abgebrochen.', 'AbortError')
}

async function mediaWikiGet(params: Record<string, string>, signal?: AbortSignal): Promise<any> {
  if (signal?.aborted) throw abortError()
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 15_000)
  const relayAbort = () => controller.abort()
  signal?.addEventListener('abort', relayAbort, { once: true })
  const query = new URLSearchParams({
    ...params,
    action: params.action ?? 'query',
    format: 'json',
    formatversion: '2',
    origin: '*',
    utf8: '1',
    maxlag: '5',
  })

  try {
    const response = await fetch(`${MEDIAWIKI_API}?${query}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Wikipedia ist derzeit nicht erreichbar (HTTP ${response.status}).`)
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().includes('json')) {
      throw new Error('Wikipedia lieferte keine JSON-Antwort. Prüfe Netzwerk, Filter oder Anmeldeseite des WLANs.')
    }
    const data = await response.json()
    if (data?.error) {
      const detail = compact(String(data.error.info ?? data.error.code ?? 'unbekannter API-Fehler'))
      throw new Error(`Wikipedia-API: ${detail}`)
    }
    return data
  } catch (error) {
    if (signal?.aborted) throw abortError()
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Der Wikipedia-Abruf hat zu lange gedauert. Bitte erneut versuchen.')
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
    signal?.removeEventListener('abort', relayAbort)
  }
}

function pageFromApi(page: ApiPage, requestedTitle: string): PageDetail | null {
  const title = compact(page.title ?? '')
  const extract = compact(page.extract ?? '')
  if (!title || page.missing || page.ns !== 0) return null
  return {
    pageId: typeof page.pageid === 'number' ? page.pageid : undefined,
    title,
    requestedTitle,
    extract,
    url: page.canonicalurl ?? page.fullurl ?? canonicalUrl(title),
    revisionId: typeof page.lastrevid === 'number' ? page.lastrevid : undefined,
    disambiguation: Boolean(page.pageprops && 'disambiguation' in page.pageprops),
  }
}

async function fetchPage(title: string, signal?: AbortSignal): Promise<PageDetail | null> {
  const requestedTitle = compact(title).slice(0, PERSONAL_WIKIPEDIA_LIMITS.queryChars)
  if (!requestedTitle) return null
  const data = await mediaWikiGet({
    prop: 'extracts|info|pageprops',
    titles: requestedTitle,
    redirects: '1',
    exintro: '1',
    explaintext: '1',
    exsectionformat: 'plain',
    inprop: 'url',
  }, signal)
  const page = (data?.query?.pages as ApiPage[] | undefined)?.find((candidate) => !candidate.missing)
  return page ? pageFromApi(page, requestedTitle) : null
}

async function fetchPageLinks(title: string, limit: number, signal?: AbortSignal): Promise<string[]> {
  const links: string[] = []
  const seen = new Set<string>()
  let continuation: string | undefined

  do {
    const remaining = limit - links.length
    if (remaining <= 0) break
    const data = await mediaWikiGet({
      prop: 'links',
      titles: title,
      redirects: '1',
      plnamespace: '0',
      pllimit: String(Math.min(500, remaining)),
      ...(continuation ? { plcontinue: continuation } : {}),
    }, signal)
    const pages = data?.query?.pages as Array<{ links?: Array<{ ns?: number; title?: string }> }> | undefined
    for (const page of pages ?? []) {
      for (const link of page.links ?? []) {
        const linkedTitle = compact(link.title ?? '')
        const key = normalize(linkedTitle)
        if (!linkedTitle || link.ns !== 0 || seen.has(key)) continue
        seen.add(key)
        links.push(linkedTitle)
        if (links.length >= limit) break
      }
    }
    continuation = data?.continue?.plcontinue
  } while (continuation && links.length < limit)

  return links
}

/** Sucht nur nach der bewusst eingegebenen Phrase und liefert Klartext-Auszüge. */
export async function searchPersonalWikipedia(
  query: string,
  options: { limit?: number; signal?: AbortSignal } = {},
): Promise<WikipediaSearchHit[]> {
  const cleanQuery = compact(query).slice(0, PERSONAL_WIKIPEDIA_LIMITS.queryChars)
  if (cleanQuery.length < 2) throw new Error('Gib mindestens zwei Zeichen für die Wikipedia-Suche ein.')
  const limit = boundedInteger(options.limit, PERSONAL_WIKIPEDIA_LIMITS.searchResults, 1, 8)
  const data = await mediaWikiGet({
    generator: 'search',
    gsrsearch: cleanQuery,
    gsrnamespace: '0',
    gsrlimit: String(limit),
    gsrsort: 'relevance',
    prop: 'extracts|info|pageprops',
    exintro: '1',
    explaintext: '1',
    exsectionformat: 'plain',
    inprop: 'url',
  }, options.signal)

  const pages = ((data?.query?.pages ?? []) as ApiPage[])
    .filter((page) => !page.missing && page.ns === 0 && typeof page.pageid === 'number' && page.title)
    .sort((a, b) => (a.index ?? Number.MAX_SAFE_INTEGER) - (b.index ?? Number.MAX_SAFE_INTEGER))

  return uniqueBy(
    pages.map((page) => ({
      key: `wikipedia:${page.pageid}`,
      pageId: page.pageid!,
      title: compact(page.title!),
      extract: compact(page.extract ?? '').slice(0, 440),
      url: page.canonicalurl ?? page.fullurl ?? canonicalUrl(page.title!),
      revisionId: typeof page.lastrevid === 'number' ? page.lastrevid : undefined,
      disambiguation: Boolean(page.pageprops && 'disambiguation' in page.pageprops),
    })),
    (page) => String(page.pageId),
  ).slice(0, limit)
}

function pageKey(page: Pick<PageDetail, 'pageId' | 'title'>): string {
  return page.pageId ? `id:${page.pageId}` : `title:${normalize(page.title)}`
}

function neighborScore(title: string, extract: string): number {
  if (/^(liste|portal|kategorie)\b/i.test(title) || /^\d{1,4}$/.test(title)) return -1
  const normalizedTitle = normalize(title)
  const normalizedExtract = normalize(extract)
  if (normalizedExtract.includes(normalizedTitle)) return 100 + normalizedTitle.length
  const titleTerms = new Set(terms(title))
  if (titleTerms.size === 0) return -1
  const extractTerms = new Set(terms(extract))
  let overlap = 0
  for (const term of titleTerms) if (extractTerms.has(term)) overlap += 1
  return overlap === titleTerms.size ? 20 + overlap : overlap > 0 ? overlap : -1
}

function graphNameIndex(graph: KnowledgeGraph): Map<string, GraphNode[]> {
  const result = new Map<string, GraphNode[]>()
  for (const node of graph.nodes) {
    for (const value of [node.title, ...(node.aliases ?? [])]) {
      const key = normalize(value).replace(/\s+/g, ' ').trim()
      if (!key) continue
      const candidates = result.get(key) ?? []
      if (!candidates.some((candidate) => candidate.id === node.id)) candidates.push(node)
      result.set(key, candidates)
    }
  }
  return result
}

function existingPageNode(page: PageDetail, graph: KnowledgeGraph, names: Map<string, GraphNode[]>): GraphNode | null {
  if (page.pageId) {
    const byPageId = graph.nodes.find((node) => node.provenance?.some(
      (value) => value.pageId === page.pageId || value.sourceId === `wikipedia:${page.pageId}`,
    ))
    if (byPageId) return byPageId
  }
  for (const title of [page.title, page.requestedTitle]) {
    const matches = (names.get(normalize(title).replace(/\s+/g, ' ').trim()) ?? [])
      .filter((node) => node.community !== 'custom' || sourceMatchesWikipedia(node))
    if (matches.length === 1) return matches[0]
  }
  return null
}

function wikiNodeId(page: PageDetail): string {
  return page.pageId
    ? `wiki_${page.pageId}`
    : `wiki_${stableHash(normalize(page.title))}`
}

function pageProvenance(
  page: PageDetail,
  importScopeId: string,
  importedAt: number,
): KnowledgeProvenance {
  return {
    sourceId: `wikipedia:${page.pageId ?? stableHash(normalize(page.title))}`,
    importScopeId,
    sourceKind: 'wikipedia',
    sourceTitle: page.title,
    importedAt,
    method: 'source-text',
    confidence: 'verified',
    evidence: page.extract.slice(0, 320),
    url: page.url,
    pageId: page.pageId,
    revisionId: page.revisionId,
  }
}

function linkProvenance(
  source: PageDetail,
  targetTitle: string,
  importScopeId: string,
  importedAt: number,
): KnowledgeProvenance {
  return {
    sourceId: `wikipedia:${source.pageId ?? stableHash(normalize(source.title))}`,
    importScopeId,
    sourceKind: 'wikipedia',
    sourceTitle: source.title,
    importedAt,
    method: 'mediawiki-link',
    confidence: 'verified',
    evidence: `Der MediaWiki-Artikel „${source.title}“ enthält einen internen Link auf „${targetTitle}“.`,
    url: source.url,
    pageId: source.pageId,
    revisionId: source.revisionId,
    targetTitle,
  }
}

function sourceMatchesWikipedia(node: GraphNode): boolean {
  return node.provenance?.some(
    (value) => value.sourceKind === 'wikipedia' || value.sourceKind === 'wikipedia-research',
  ) ?? false
}

function sourceMatchesManualWikipedia(node: GraphNode): boolean {
  return node.provenance?.some((value) => value.sourceKind === 'wikipedia') ?? false
}

/**
 * Lädt ausgewählte Artikel sowie wenige belegte Nachbarn. Jede erzeugte Kante
 * setzt voraus, dass `prop=links` den Zielartikel im Quellartikel ausliefert.
 */
export async function pullPersonalWikipedia(
  selected: Array<Pick<WikipediaSearchHit, 'title'>> | string[],
  existingGraph: KnowledgeGraph,
  options: WikipediaPullOptions = {},
): Promise<WikipediaPullResult> {
  const maxRoots = boundedInteger(options.maxRoots, PERSONAL_WIKIPEDIA_LIMITS.selectedRoots, 1, 3)
  const neighborsPerRoot = boundedInteger(
    options.neighborsPerRoot,
    PERSONAL_WIKIPEDIA_LIMITS.neighborsPerRoot,
    0,
    4,
  )
  const maxPages = Math.max(
    maxRoots,
    boundedInteger(options.maxPages, PERSONAL_WIKIPEDIA_LIMITS.pagesPerPull, 1, 12),
  )
  const maxLinks = boundedInteger(options.maxLinksPerPage, PERSONAL_WIKIPEDIA_LIMITS.linksPerPage, 20, 800)
  const maxRelations = boundedInteger(options.maxRelations, PERSONAL_WIKIPEDIA_LIMITS.relationsPerPull, 1, 80)
  const rawTitles = selected.map((value) => compact(typeof value === 'string' ? value : value.title))
  const requestedTitles = uniqueBy(rawTitles.filter(Boolean), (value) => normalize(value)).slice(0, maxRoots)
  if (requestedTitles.length === 0) throw new Error('Wähle mindestens einen Wikipedia-Artikel aus.')

  const estimatedTotal = requestedTitles.length * (2 + neighborsPerRoot) + maxPages
  let progress = 0
  const update = (step: string) => options.onProgress?.({ step, done: progress, total: estimatedTotal })
  const warnings: string[] = []
  let failedPages = 0
  let failedLinkLists = 0
  let truncated = rawTitles.length > requestedTitles.length

  const roots: PageDetail[] = []
  for (const title of requestedTitles) {
    update(`Lade ausgewählten Artikel „${title}“ …`)
    const page = await fetchPage(title, options.signal)
    progress += 1
    if (!page || page.extract.length < 80) {
      failedPages += 1
      continue
    }
    if (page.disambiguation) {
      warnings.push(`„${page.title}“ ist eine Begriffsklärung und wurde nicht als Wissensknoten übernommen.`)
      continue
    }
    roots.push(page)
  }
  if (roots.length === 0) throw new Error('Keiner der ausgewählten Wikipedia-Artikel lieferte einen verwertbaren Einleitungstext.')

  const pages = new Map<string, PageDetail>()
  const linksByPage = new Map<string, Set<string>>()
  for (const root of roots) pages.set(pageKey(root), root)

  for (const root of roots) {
    update(`Prüfe belegte Links in „${root.title}“ …`)
    let links: string[] = []
    try {
      links = await fetchPageLinks(root.title, maxLinks, options.signal)
      linksByPage.set(pageKey(root), new Set(links.map((title) => normalize(title))))
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      failedLinkLists += 1
      linksByPage.set(pageKey(root), new Set())
    }
    progress += 1

    const neighbors = links
      .map((title) => ({ title, score: neighborScore(title, root.extract) }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'de'))
      .slice(0, neighborsPerRoot)

    for (const neighbor of neighbors) {
      if (pages.size >= maxPages) {
        truncated = true
        break
      }
      update(`Lade belegten Nachbarn „${neighbor.title}“ …`)
      try {
        const page = await fetchPage(neighbor.title, options.signal)
        if (page && !page.disambiguation && page.extract.length >= 80) pages.set(pageKey(page), page)
        else failedPages += 1
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error
        failedPages += 1
      }
      progress += 1
    }
  }

  // Linklisten der Nachbarn belegen Querbeziehungen und Brücken. Die Anzahl
  // der Requests und Titel bleibt durch maxPages/maxLinks strikt begrenzt.
  for (const page of pages.values()) {
    const key = pageKey(page)
    if (linksByPage.has(key)) continue
    update(`Prüfe Querverbindungen von „${page.title}“ …`)
    try {
      linksByPage.set(key, new Set((await fetchPageLinks(page.title, maxLinks, options.signal)).map(normalize)))
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      failedLinkLists += 1
      linksByPage.set(key, new Set())
    }
    progress += 1
  }

  const importedAt = Date.now()
  // Derselbe Satz Startartikel behält denselben Replace-Scope. So entfernt
  // ein Reimport auch Nachbarn/Relationen, die Wikipedia inzwischen nicht
  // mehr ausliefert, statt still einen zweiten Import anzulegen.
  const pageSignature = roots
    .map((page) => String(page.pageId ?? normalize(page.title)))
    .sort()
    .join('|')
  const importScopeId = `wikipedia-personal:${stableHash(pageSignature)}`
  const names = graphNameIndex(existingGraph)
  const resolved = new Map<string, { id: string; page: PageDetail; existing: GraphNode | null }>()
  const nodes: GraphNode[] = []

  for (const page of pages.values()) {
    const existing = existingPageNode(page, existingGraph, names)
    const id = existing?.id ?? wikiNodeId(page)
    resolved.set(pageKey(page), { id, page, existing })
    // Basis- und persönliche Knoten werden nicht überschrieben. Bereits aus
    // Wikipedia stammende Nutzerknoten dürfen dagegen idempotent aktualisieren.
    if (!existing || (existing.custom && sourceMatchesManualWikipedia(existing))) {
      nodes.push({
        id,
        title: page.title,
        type: existing?.type ?? 'konzept',
        community: existing?.community ?? `wiki_personal_${stableHash(normalize(roots[0].title))}`,
        aliases: existing?.aliases,
        summary: page.extract.slice(0, PERSONAL_WIKIPEDIA_LIMITS.summaryChars),
        custom: true,
        provenance: [pageProvenance(page, importScopeId, importedAt)],
      })
    }
  }

  const edges: GraphEdge[] = []
  const edgeKeys = new Set<string>()
  let omittedRelations = 0
  const addVerifiedEdge = (sourceId: string, targetId: string, source: PageDetail, linkedTitle: string) => {
    if (sourceId === targetId) return
    const key = `${sourceId}\u0000mediawiki_verlinkt_auf\u0000${targetId}`
    if (edgeKeys.has(key)) return
    if (edges.length >= maxRelations) {
      omittedRelations += 1
      truncated = true
      return
    }
    edgeKeys.add(key)
    edges.push({
      source: sourceId,
      target: targetId,
      relation: 'mediawiki_verlinkt_auf',
      label: 'MediaWiki-Link',
      custom: true,
      provenance: [linkProvenance(source, linkedTitle, importScopeId, importedAt)],
    })
  }

  for (const source of resolved.values()) {
    const links = linksByPage.get(pageKey(source.page)) ?? new Set<string>()
    // Beziehungen innerhalb des importierten Teilgraphen.
    for (const target of resolved.values()) {
      if (source.id === target.id) continue
      const titles = [target.page.title, target.page.requestedTitle].map(normalize)
      const linkedTitle = titles.find((title) => links.has(title))
      if (linkedTitle) addVerifiedEdge(source.id, target.id, source.page, target.page.title)
    }
    // Verifizierte Brücken zu bereits vorhandenem Wissen. Mehrdeutige Namen
    // erzeugen keine Kante, weil der Zielknoten dann nicht sicher bestimmbar ist.
    for (const [name, candidates] of names) {
      const entityCandidates = candidates.filter(
        (candidate) => candidate.community !== 'custom' || sourceMatchesWikipedia(candidate),
      )
      if (!links.has(name) || entityCandidates.length !== 1) continue
      addVerifiedEdge(source.id, entityCandidates[0].id, source.page, entityCandidates[0].title)
    }
  }

  if (failedPages) warnings.push(`${failedPages} Seite(n) lieferten keinen verwertbaren Artikeltext.`)
  if (failedLinkLists) warnings.push(`${failedLinkLists} Linkliste(n) konnten nicht geprüft werden; daraus wurden keine Kanten erzeugt.`)
  if (omittedRelations) warnings.push(`${omittedRelations} weitere belegte Beziehung(en) wurden am Sicherheitslimit abgeschnitten.`)
  warnings.push('Quelle: deutschsprachige Wikipedia (CC BY-SA); gespeichert werden Auszug, URL, Seiten- und Revisions-ID.')

  const report = createImportReport({
    sourceId: importScopeId,
    sourceKind: 'wikipedia',
    sourceTitle: roots.map((page) => page.title).join(' · '),
    importedAt,
    localOnly: false,
    nodes,
    edges,
    graph: existingGraph,
    truncated,
    warnings,
    skippedReasons: omittedRelations ? { 'Pull-Limit für belegte Relationen': omittedRelations } : {},
  })
  const focusNodeIds = uniqueBy(
    [...resolved.values()].map((value) => value.id).concat(edges.flatMap((edge) => [edge.source, edge.target])),
    (value) => value,
  )
  options.onProgress?.({ step: 'Wikipedia-Wissen ist zum Übernehmen bereit.', done: estimatedTotal, total: estimatedTotal })
  return {
    nodes: uniqueBy(nodes, (node) => node.id),
    edges,
    report,
    focusNodeIds,
    pages: [...resolved.values()].map((value) => ({
      id: value.id,
      pageId: value.page.pageId,
      title: value.page.title,
      url: value.page.url,
    })),
    selectedTitles: roots.map((page) => page.title),
  }
}

/**
 * Lokale, konservative Themenerkennung: Nur bereits erzeugte Kanten mit
 * belegter expliziter Nennung werden zu Vorschlägen. Es wird kein Freitext
 * und kein PDF-Inhalt an Wikipedia gesendet.
 */
export function recognizeWikipediaTopics(
  importedEdges: GraphEdge[],
  graph: KnowledgeGraph,
  limit = 3,
): RecognizedWikipediaTopic[] {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]))
  const counts = new Map<string, number>()
  for (const edge of importedEdges) {
    const explicitlyMentioned = edge.relation === 'erwaehnt' && edge.provenance?.some(
      (value) => value.method === 'explicit-mention' && value.confidence === 'verified',
    )
    if (!explicitlyMentioned || !nodes.has(edge.target)) continue
    counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([id, mentions]) => ({
      id,
      title: nodes.get(id)!.title,
      mentions,
      reason: mentions === 1 ? 'einmal ausdrücklich genannt' : `${mentions}-mal ausdrücklich genannt`,
    }))
    .sort((a, b) => b.mentions - a.mentions || a.title.localeCompare(b.title, 'de'))
    .slice(0, boundedInteger(limit, 3, 1, 5))
}

/** Wiederverwendbarer Auto-Pull: Aufrufer müssen die Themen vorher sichtbar freigeben. */
export async function pullRecognizedWikipediaTopics(
  topics: RecognizedWikipediaTopic[],
  existingGraph: KnowledgeGraph,
  options: WikipediaPullOptions = {},
): Promise<WikipediaPullResult> {
  const allowed = uniqueBy(topics, (topic) => normalize(topic.title)).slice(0, 3)
  if (!allowed.length) throw new Error('Im lokalen Import wurde kein eindeutig bekannter Themenname erkannt.')
  return pullPersonalWikipedia(allowed.map((topic) => topic.title), existingGraph, {
    ...options,
    maxRoots: Math.min(options.maxRoots ?? allowed.length, allowed.length),
  })
}
