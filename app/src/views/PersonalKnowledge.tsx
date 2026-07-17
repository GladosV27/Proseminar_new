import { useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import type { AppCtx } from '../App'
import ForceGraph from '../components/ForceGraph'
import type { GraphEdge, GraphNode, KnowledgeImportReport } from '../data/types'
import { ingestPdfDocument, ingestText } from '../engine/ingest'
import { readPdfText, type PdfReadProgress } from '../engine/pdf'
import {
  PERSONAL_WIKIPEDIA_LIMITS,
  pullPersonalWikipedia,
  pullRecognizedWikipediaTopics,
  recognizeWikipediaTopics,
  searchPersonalWikipedia,
  type RecognizedWikipediaTopic,
  type WikipediaPullProgress,
  type WikipediaSearchHit,
} from '../engine/personalWikipedia'
import { applyKnowledgeImport, mergedGraph, type CustomKnowledge } from '../engine/store'

type ImportMode = 'text' | 'pdf' | 'wikipedia'
const PRIVATE_SOURCE_KINDS = new Set(['manual-text', 'pdf', 'local-llm'])

interface ImportResult {
  kind: ImportMode
  title: string
  nodeIds: string[]
  edgeKeys: string[]
  report: KnowledgeImportReport
  secondaryReport?: KnowledgeImportReport
  autoTopics?: RecognizedWikipediaTopic[]
  pages?: number
  truncated?: boolean
}

function edgeKey(edge: GraphEdge): string {
  return `${edge.source}\u0000${edge.relation}\u0000${edge.target}`
}

function uniqueEdges(edges: GraphEdge[]): GraphEdge[] {
  const seen = new Set<string>()
  return edges.filter((edge) => {
    const key = edgeKey(edge)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function humanFileSize(bytes: number): string {
  if (bytes === 0) return '0 KB'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

function friendlyError(error: unknown): string {
  if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
    return 'Der lokale Browser-Speicher ist voll. Entferne einen älteren Eintrag oder verwende eine kürzere Datei.'
  }
  return error instanceof Error ? error.message : String(error)
}

function deltaText(report: KnowledgeImportReport): string {
  const { delta } = report
  const parts: string[] = []
  if (delta.addedNodeIds.length) parts.push(`${delta.addedNodeIds.length} Knoten neu`)
  if (delta.updatedNodeIds.length) parts.push(`${delta.updatedNodeIds.length} Knoten aktualisiert`)
  if (delta.removedNodeIds.length) parts.push(`${delta.removedNodeIds.length} alte Knoten entfernt`)
  if (delta.addedEdgeKeys.length) parts.push(`${delta.addedEdgeKeys.length} Kanten neu`)
  if (delta.updatedEdgeKeys.length) parts.push(`${delta.updatedEdgeKeys.length} Kanten aktualisiert`)
  if (delta.removedEdgeKeys.length) parts.push(`${delta.removedEdgeKeys.length} alte Kanten entfernt`)
  return parts.length ? parts.join(' · ') : 'Keine inhaltliche Änderung – dieser Stand war bereits gespeichert.'
}

function assertNoIdCollision(report: KnowledgeImportReport): void {
  const collision = Object.entries(report.skippedReasons).find(
    ([reason, count]) => count > 0 && reason.startsWith('ID-Kollision'),
  )
  if (collision) {
    throw new Error('Dieser Titel kollidiert mit einer bereits vorhandenen Quelle. Verwende bitte einen eindeutigeren Titel oder Dateinamen.')
  }
}

function reportNodeIds(report: KnowledgeImportReport): string[] {
  return [...new Set([
    ...report.delta.addedNodeIds,
    ...report.delta.updatedNodeIds,
    ...report.delta.unchangedNodeIds,
  ])]
}

function reportEdgeKeys(report: KnowledgeImportReport): string[] {
  return [...new Set([
    ...report.delta.addedEdgeKeys,
    ...report.delta.updatedEdgeKeys,
    ...report.delta.unchangedEdgeKeys,
  ])]
}

function evidenceType(edge: GraphEdge): string {
  const provenance = edge.provenance?.[0]
  if (provenance?.method === 'mediawiki-link') return 'verifizierter MediaWiki-Link'
  if (provenance?.method === 'explicit-mention') return 'explizite Namensnennung'
  if (provenance?.confidence === 'heuristic') return 'heuristische thematische Nähe'
  if (provenance?.method === 'document-structure') return 'belegte Dokumentstruktur'
  return provenance?.confidence === 'verified' ? 'verifizierter Beleg' : 'Herkunft siehe Beleg'
}

interface OptionalEnrichment {
  knowledge: CustomKnowledge
  report?: KnowledgeImportReport
  focusNodeIds: string[]
  edgeKeys: string[]
  topics: RecognizedWikipediaTopic[]
  warning?: string
}

export default function PersonalKnowledge({ ctx }: { ctx: AppCtx }) {
  const [mode, setMode] = useState<ImportMode>('text')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfProgress, setPdfProgress] = useState<PdfReadProgress | null>(null)
  const [busy, setBusy] = useState(false)
  const [autoWikipedia, setAutoWikipedia] = useState(false)
  const [wikiQuery, setWikiQuery] = useState('')
  const [wikiHits, setWikiHits] = useState<WikipediaSearchHit[]>([])
  const [selectedWikiKeys, setSelectedWikiKeys] = useState<string[]>([])
  const [wikiBusy, setWikiBusy] = useState(false)
  const [wikiProgress, setWikiProgress] = useState<WikipediaPullProgress | null>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const graphCardRef = useRef<HTMLDivElement>(null)
  const seminarOnline = ctx.engine.id === 'seminar-online'

  const personalNodes = useMemo(
    () => ctx.custom.nodes.filter((node) => node.community === 'custom'),
    [ctx.custom.nodes],
  )
  const wikipediaNodes = useMemo(
    () => ctx.custom.nodes.filter((node) => node.provenance?.some(
      (value) => value.sourceKind === 'wikipedia' || value.sourceKind === 'wikipedia-research',
    )),
    [ctx.custom.nodes],
  )
  const rootEntries = useMemo(
    () => personalNodes.filter((node) => !/_abschnitt_\d+$/.test(node.id)),
    [personalNodes],
  )
  const wikipediaImports = useMemo(() => {
    const seen = new Set<string>()
    return [...(ctx.custom.imports ?? [])].reverse().filter((report) => {
      if (
        (report.sourceKind !== 'wikipedia' && report.sourceKind !== 'wikipedia-research') ||
        seen.has(report.sourceId)
      ) return false
      seen.add(report.sourceId)
      return true
    })
  }, [ctx.custom.imports])
  const personalStorageBytes = useMemo(() => {
    const ids = new Set(personalNodes.map((node) => node.id))
    const edges = ctx.custom.edges.filter((edge) => ids.has(edge.source) || ids.has(edge.target))
    return new Blob([JSON.stringify({ nodes: personalNodes, edges })]).size
  }, [ctx.custom.edges, personalNodes])
  const highlightedIds = result?.nodeIds
  const selectedNode = selected ? ctx.graph.nodes.find((node) => node.id === selected) ?? null : null
  const selectedProvenance = selectedNode?.provenance?.[0]

  const growthGraph = useMemo(() => {
    if (!result || result.nodeIds.length === 0) return ctx.graph
    const focus = new Set(result.nodeIds)
    for (const edge of ctx.graph.edges) {
      if (focus.has(edge.source) || focus.has(edge.target)) {
        focus.add(edge.source)
        focus.add(edge.target)
      }
    }
    return {
      nodes: ctx.graph.nodes.filter((node) => focus.has(node.id)),
      edges: ctx.graph.edges.filter((edge) => focus.has(edge.source) && focus.has(edge.target)),
    }
  }, [ctx.graph, result])

  const bridges = useMemo(() => {
    if (!result) return []
    const imported = new Set([
      ...reportNodeIds(result.report),
      ...(result.secondaryReport ? reportNodeIds(result.secondaryReport) : []),
    ])
    const importEdges = new Set(result.edgeKeys)
    return ctx.graph.edges.filter(
      (edge) => importEdges.has(edgeKey(edge)) && imported.has(edge.source) !== imported.has(edge.target),
    )
  }, [ctx.graph.edges, result])

  const resultReports = result
    ? [result.report, ...(result.secondaryReport ? [result.secondaryReport] : [])]
    : []
  const resultWarnings = resultReports.flatMap((report) => report.warnings)
  const resultEdgeKeySet = new Set(result?.edgeKeys ?? [])
  const resultEdges = result ? ctx.graph.edges.filter((edge) => resultEdgeKeySet.has(edgeKey(edge))) : []
  const resultVerifiedEdges = resultEdges.filter(
    (edge) => edge.provenance?.some((value) => value.confidence === 'verified'),
  ).length
  const resultHeuristicEdges = resultEdges.filter(
    (edge) => edge.provenance?.some((value) => value.confidence === 'heuristic'),
  ).length

  function revealGraph(): void {
    if (window.matchMedia('(max-width: 860px)').matches) {
      window.setTimeout(() => graphCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
    }
  }

  function acceptPdf(file: File | null): void {
    setError(null)
    if (!file) {
      setPdfFile(null)
      return
    }
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setPdfFile(null)
      setError('Bitte wähle eine PDF-Datei aus.')
      return
    }
    setPdfFile(file)
  }

  function onDrop(event: DragEvent<HTMLLabelElement>): void {
    event.preventDefault()
    setDragging(false)
    acceptPdf(event.dataTransfer.files?.[0] ?? null)
  }

  async function optionallyEnrichWithWikipedia(
    knowledge: CustomKnowledge,
    importedEdges: GraphEdge[],
  ): Promise<OptionalEnrichment> {
    const fallback: OptionalEnrichment = {
      knowledge,
      focusNodeIds: [],
      edgeKeys: [],
      topics: [],
    }
    if (!autoWikipedia) return fallback
    if (!ctx.online) {
      return { ...fallback, warning: 'Der lokale Import wurde gespeichert; Wikipedia blieb aus, weil der Online-Modus ausgeschaltet ist.' }
    }

    const graphAfterLocalImport = mergedGraph(knowledge)
    const topics = recognizeWikipediaTopics(importedEdges, graphAfterLocalImport, 3)
    if (!topics.length) {
      return {
        ...fallback,
        topics,
        warning: 'Der lokale Import wurde gespeichert; es gab keinen eindeutig erkannten, ausdrücklich genannten Graphbegriff für Wikipedia.',
      }
    }

    try {
      const pulled = await pullRecognizedWikipediaTopics(topics, graphAfterLocalImport, {
        neighborsPerRoot: 1,
        maxPages: 6,
        maxRelations: 32,
        onProgress: setWikiProgress,
      })
      const applied = applyKnowledgeImport(knowledge, pulled)
      assertNoIdCollision(applied.report)
      return {
        knowledge: applied.knowledge,
        report: applied.report,
        focusNodeIds: pulled.focusNodeIds,
        edgeKeys: reportEdgeKeys(applied.report),
        topics,
      }
    } catch (wikiError) {
      return {
        ...fallback,
        topics,
        warning: `Der lokale Import wurde gespeichert; die optionale Wikipedia-Ergänzung scheiterte: ${friendlyError(wikiError)}`,
      }
    } finally {
      setWikiProgress(null)
    }
  }

  async function addText(): Promise<void> {
    const cleanTitle = title.trim()
    const cleanText = text.trim()
    if (!cleanTitle || !cleanText || busy) return

    setBusy(true)
    setError(null)
    try {
      const imported = ingestText(cleanTitle, cleanText, ctx.graph)
      const applied = applyKnowledgeImport(ctx.custom, {
        nodes: [imported.node],
        edges: imported.edges,
        report: imported.report,
      })
      assertNoIdCollision(applied.report)
      const enrichment = await optionallyEnrichWithWikipedia(applied.knowledge, imported.edges)
      ctx.setCustom(enrichment.knowledge)
      const nodeIds = [...new Set([...reportNodeIds(applied.report), ...enrichment.focusNodeIds])]
      const edgeKeys = [...new Set([...reportEdgeKeys(applied.report), ...enrichment.edgeKeys])]
      setResult({
        kind: 'text',
        title: imported.node.title,
        nodeIds,
        edgeKeys,
        report: applied.report,
        secondaryReport: enrichment.report,
        autoTopics: enrichment.topics,
      })
      setSelected(nodeIds[0] ?? null)
      setTitle('')
      setText('')
      if (enrichment.warning) setError(enrichment.warning)
      revealGraph()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  async function addPdf(): Promise<void> {
    if (!pdfFile || busy) return
    setBusy(true)
    setError(null)
    setPdfProgress(null)
    try {
      const parsed = await readPdfText(pdfFile, setPdfProgress)
      const documentTitle = pdfFile.name.replace(/\.pdf$/i, '') || 'Lokales PDF'
      const imported = ingestPdfDocument(documentTitle, parsed, ctx.graph)
      const applied = applyKnowledgeImport(ctx.custom, imported)
      assertNoIdCollision(applied.report)
      const enrichment = await optionallyEnrichWithWikipedia(applied.knowledge, imported.edges)
      ctx.setCustom(enrichment.knowledge)
      const nodeIds = [...new Set([...reportNodeIds(applied.report), ...enrichment.focusNodeIds])]
      const edgeKeys = [...new Set([...reportEdgeKeys(applied.report), ...enrichment.edgeKeys])]
      setResult({
        kind: 'pdf',
        title: pdfFile.name,
        nodeIds,
        edgeKeys,
        report: applied.report,
        secondaryReport: enrichment.report,
        autoTopics: enrichment.topics,
        pages: parsed.pagesRead,
        truncated: applied.report.truncated || enrichment.report?.truncated,
      })
      setSelected(imported.nodes[0]?.id ?? null)
      setPdfFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (enrichment.warning) setError(enrichment.warning)
      revealGraph()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
      setPdfProgress(null)
    }
  }

  async function searchWikipedia(): Promise<void> {
    if (!wikiQuery.trim() || wikiBusy) return
    if (!ctx.online) {
      setError('Schalte den Online-Modus bewusst ein, bevor du Wikipedia durchsuchst.')
      return
    }
    setWikiBusy(true)
    setWikiProgress(null)
    setError(null)
    try {
      const hits = await searchPersonalWikipedia(wikiQuery)
      setWikiHits(hits)
      setSelectedWikiKeys(hits[0] ? [hits[0].key] : [])
      if (!hits.length) setError('Wikipedia lieferte keine passenden Artikel. Versuche einen genaueren Begriff.')
    } catch (err) {
      setWikiHits([])
      setSelectedWikiKeys([])
      setError(friendlyError(err))
    } finally {
      setWikiBusy(false)
    }
  }

  function onWikipediaSearchKey(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== 'Enter') return
    event.preventDefault()
    void searchWikipedia()
  }

  function toggleWikipediaHit(key: string): void {
    setError(null)
    setSelectedWikiKeys((current) => {
      if (current.includes(key)) return current.filter((value) => value !== key)
      if (current.length >= PERSONAL_WIKIPEDIA_LIMITS.selectedRoots) {
        setError(`Pro Abruf kannst du höchstens ${PERSONAL_WIKIPEDIA_LIMITS.selectedRoots} Startartikel auswählen.`)
        return current
      }
      return [...current, key]
    })
  }

  async function addWikipedia(): Promise<void> {
    if (!ctx.online || wikiBusy || selectedWikiKeys.length === 0) return
    const selectedHits = wikiHits.filter((hit) => selectedWikiKeys.includes(hit.key))
    if (!selectedHits.length) return
    setWikiBusy(true)
    setWikiProgress(null)
    setError(null)
    try {
      const pulled = await pullPersonalWikipedia(selectedHits, ctx.graph, {
        onProgress: setWikiProgress,
      })
      const applied = applyKnowledgeImport(ctx.custom, pulled)
      assertNoIdCollision(applied.report)
      ctx.setCustom(applied.knowledge)
      const nodeIds = [...new Set([...pulled.focusNodeIds, ...reportNodeIds(applied.report)])]
      const edgeKeys = reportEdgeKeys(applied.report)
      setResult({
        kind: 'wikipedia',
        title: pulled.selectedTitles.join(' · '),
        nodeIds,
        edgeKeys,
        report: applied.report,
        truncated: applied.report.truncated,
      })
      setSelected(nodeIds[0] ?? null)
      revealGraph()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setWikiBusy(false)
      setWikiProgress(null)
    }
  }

  function removeEntry(entry: GraphNode): void {
    if (!window.confirm(`„${entry.title}“ wirklich aus dem lokalen Wissen entfernen?`)) return
    const scopes = new Set(
      (entry.provenance ?? []).map((value) => value.importScopeId ?? value.sourceId).filter(Boolean),
    )
    const legacyIds = new Set(
      ctx.custom.nodes
        .filter((node) => node.id === entry.id || node.id.startsWith(`${entry.id}_abschnitt_`))
        .map((node) => node.id),
    )
    const belongsToEntry = (node: GraphNode): boolean =>
      scopes.size > 0
        ? Boolean(node.provenance?.some((value) => scopes.has(value.importScopeId ?? value.sourceId)))
        : legacyIds.has(node.id)
    const keptNodes = ctx.custom.nodes.flatMap((node) => {
      if (!belongsToEntry(node)) return [node]
      if (scopes.size === 0) return []
      const provenance = node.provenance?.filter(
        (value) => !scopes.has(value.importScopeId ?? value.sourceId),
      )
      return provenance?.length ? [{ ...node, provenance }] : []
    })
    const removedIds = new Set(
      ctx.custom.nodes.filter((node) => !keptNodes.some((kept) => kept.id === node.id)).map((node) => node.id),
    )
    const keptEdges = ctx.custom.edges.flatMap((edge) => {
      if (removedIds.has(edge.source) || removedIds.has(edge.target)) return []
      if (scopes.size === 0) return legacyIds.has(edge.source) || legacyIds.has(edge.target) ? [] : [edge]
      const hasScope = edge.provenance?.some(
        (value) => scopes.has(value.importScopeId ?? value.sourceId),
      ) ?? false
      if (!hasScope) return [edge]
      const provenance = edge.provenance?.filter(
        (value) => !scopes.has(value.importScopeId ?? value.sourceId),
      )
      return provenance?.length ? [{ ...edge, provenance }] : []
    })
    ctx.setCustom({
      nodes: keptNodes,
      edges: uniqueEdges(keptEdges),
      imports: ctx.custom.imports?.filter((item) => !scopes.has(item.sourceId)),
    })
    if (result?.nodeIds.some((id) => removedIds.has(id))) setResult(null)
    if (selected && removedIds.has(selected)) setSelected(null)
  }

  function removeWikipediaImport(report: KnowledgeImportReport): void {
    if (!window.confirm(`Wikipedia-Abruf „${report.sourceTitle}“ wirklich aus dem lokalen Graphen entfernen?`)) return
    const scope = report.sourceId
    const belongsToScope = (value: { sourceId: string; importScopeId?: string }) =>
      value.importScopeId === scope || value.sourceId === scope
    const keptNodes = ctx.custom.nodes.flatMap((node) => {
      const provenance = node.provenance?.filter((value) => !belongsToScope(value))
      if ((provenance?.length ?? 0) === (node.provenance?.length ?? 0)) return [node]
      return provenance?.length ? [{ ...node, provenance }] : []
    })
    const keptNodeIds = new Set(keptNodes.map((node) => node.id))
    const removedIds = new Set(ctx.custom.nodes.filter((node) => !keptNodeIds.has(node.id)).map((node) => node.id))
    const keptEdges = ctx.custom.edges.flatMap((edge) => {
      if (removedIds.has(edge.source) || removedIds.has(edge.target)) return []
      const provenance = edge.provenance?.filter((value) => !belongsToScope(value))
      if ((provenance?.length ?? 0) === (edge.provenance?.length ?? 0)) return [edge]
      return provenance?.length ? [{ ...edge, provenance }] : []
    })
    ctx.setCustom({
      nodes: keptNodes,
      edges: uniqueEdges(keptEdges),
      imports: ctx.custom.imports?.filter((item) => item.sourceId !== scope),
    })
    if (result?.report.sourceId === scope || result?.secondaryReport?.sourceId === scope) setResult(null)
    if (selected && removedIds.has(selected)) setSelected(null)
  }

  function clearPersonalKnowledge(): void {
    if (!personalNodes.length) return
    if (!window.confirm('Alle eigenen Texte und PDFs aus diesem Browserprofil entfernen?')) return
    const ids = new Set(personalNodes.map((node) => node.id))
    const remainingEdges = ctx.custom.edges.flatMap((edge) => {
      if (ids.has(edge.source) || ids.has(edge.target)) return []
      const hasPrivateEvidence = edge.provenance?.some((value) => PRIVATE_SOURCE_KINDS.has(value.sourceKind)) ?? false
      if (!hasPrivateEvidence) return [edge]
      const provenance = edge.provenance?.filter((value) => !PRIVATE_SOURCE_KINDS.has(value.sourceKind))
      return provenance?.length ? [{ ...edge, provenance }] : []
    })
    ctx.setCustom({
      nodes: ctx.custom.nodes.filter((node) => !ids.has(node.id)),
      edges: remainingEdges,
      imports: ctx.custom.imports?.filter(
        (item) => item.sourceKind !== 'manual-text' && item.sourceKind !== 'pdf',
      ),
    })
    setResult(null)
    if (selected && ids.has(selected)) setSelected(null)
  }

  function relationText(edge: GraphEdge): string {
    const source = ctx.graph.nodes.find((node) => node.id === edge.source)?.title ?? edge.source
    const target = ctx.graph.nodes.find((node) => node.id === edge.target)?.title ?? edge.target
    return `${source} — ${edge.label} → ${target}`
  }

  return (
    <section className="personal-knowledge-view">
      <header className="personal-knowledge-hero">
        <div>
          <div className="eyebrow">Dein Wissen · lokal und nachvollziehbar erweitert</div>
          <h1>Mach Noesis zu deinem Wissensraum</h1>
          <p className="lead">
            Füge einen eigenen Text oder eine PDF hinzu oder hole ausgewählte öffentliche Wikipedia-Artikel ab.
            Jede Verbindung zeigt, ob sie auf einer Nennung, einer Heuristik oder einem verifizierten MediaWiki-Link beruht.
          </p>
        </div>
        <div
          className="personal-local-seal"
          aria-label={mode === 'wikipedia' ? 'Öffentlicher MediaWiki-Abruf' : 'Verarbeitung ausschließlich lokal'}
        >
          <span aria-hidden="true">{mode === 'wikipedia' ? '◎' : '⌂'}</span>
          <strong>{mode === 'wikipedia' ? 'Öffentliche Quelle' : 'Lokal eingelesen'}</strong>
          <small>{mode === 'wikipedia' ? 'bewusster MediaWiki-Abruf' : 'kein Datei-Upload'}</small>
        </div>
      </header>

      <div className="personal-privacy-note">
        {mode === 'wikipedia' ? (
          <>
            <strong>Wikipedia-Wissen wird erst nach deiner Auswahl abgerufen.</strong>
            <span>
              MediaWiki erhält nur deine Suchphrase und die gewählten Artikeltitel. Auszüge, URLs, Seiten- und
              Revisions-IDs werden anschließend in diesem Browserprofil gespeichert; dein privater Graph wird nicht übertragen.
            </span>
          </>
        ) : (
          <>
            <strong>Deine Datei verlässt den Browser nicht.</strong>
            <span>
              Der extrahierte Text wird – begrenzt auf 140.000 Zeichen – unverschlüsselt in diesem Browserprofil
              gespeichert; die PDF-Originaldatei selbst wird weder hochgeladen noch dauerhaft abgelegt.
              {seminarOnline
                ? ' Erst wenn du im Chat „Eigenes Wissen freigeben“ aktivierst, können pro Frage bis zu 5.000 Zeichen lokal ausgewählter Belegstellen an das Seminar-Modell gesendet werden.'
                : ' Auch spätere Antworten nutzen dieses Wissen direkt aus dem lokalen Graphen.'}
            </span>
          </>
        )}
      </div>

      <div className="personal-knowledge-layout">
        <div className="card personal-import-card">
          <div className="personal-import-heading">
            <div>
              <span className="personal-step">01</span>
              <h2>Wissen hinzufügen</h2>
            </div>
            <div className="seg" aria-label="Art des lokalen Wissens">
              <button type="button" className={mode === 'text' ? 'on' : ''} onClick={() => setMode('text')}>
                Text
              </button>
              <button type="button" className={mode === 'pdf' ? 'on' : ''} onClick={() => setMode('pdf')}>
                PDF
              </button>
              <button type="button" className={mode === 'wikipedia' ? 'on' : ''} onClick={() => setMode('wikipedia')}>
                Wikipedia
              </button>
            </div>
          </div>

          {mode === 'text' ? (
            <div className="personal-text-form">
              <label className="field" htmlFor="personal-knowledge-title">Titel</label>
              <input
                id="personal-knowledge-title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="z. B. Meine Notizen zu Hannah Arendt"
              />
              <label className="field" htmlFor="personal-knowledge-text">Inhalt</label>
              <textarea
                id="personal-knowledge-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Füge hier Notizen, eine Zusammenfassung oder einen kurzen Quellentext ein …"
              />
              <p className="hint">
                Eindeutige Namensnennungen erzeugen belegte Kanten. Zusätzlich darf eine konservative lokale
                TF-IDF-Heuristik „thematisch ähnlich“ markieren, wenn mehrere gemeinsame Schlüsselbegriffe die feste
                Schwelle überschreiten; sie behauptet keine historische oder kausale Beziehung.
              </p>
              <button className="btn primary personal-import-action" type="button" disabled={!title.trim() || !text.trim() || busy} onClick={() => void addText()}>
                {busy ? 'Wissen wird verarbeitet …' : 'Zum Wissensgraphen hinzufügen'}
              </button>
            </div>
          ) : mode === 'pdf' ? (
            <div className="personal-pdf-form">
              <label
                className={`personal-dropzone ${dragging ? 'dragging' : ''}`}
                onDragEnter={(event) => {
                  event.preventDefault()
                  setDragging(true)
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(event) => acceptPdf(event.target.files?.[0] ?? null)}
                  disabled={busy}
                />
                <span className="personal-dropzone-icon" aria-hidden="true">PDF</span>
                {pdfFile ? (
                  <>
                    <strong>{pdfFile.name}</strong>
                    <small>{humanFileSize(pdfFile.size)} · bereit zum lokalen Einlesen</small>
                  </>
                ) : (
                  <>
                    <strong>PDF hier ablegen oder auswählen</strong>
                    <small>bis 30 MB · maximal 80 Seiten werden gelesen</small>
                  </>
                )}
              </label>
              <p className="hint">
                Textbasierte PDFs funktionieren direkt. Bei eingescannten Bildseiten wäre OCR nötig; diese wird aus
                Datenschutzgründen nicht aus dem Netz nachgeladen. Abschnitte werden nicht mehr nach ihrer Reihenfolge,
                sondern über gemeinsame gewichtete Themenbegriffe miteinander verbunden.
              </p>
              {pdfProgress && (
                <div className="personal-pdf-progress" role="status">
                  <div className="progress">
                    <div style={{ width: `${(pdfProgress.page / Math.max(1, pdfProgress.totalPages)) * 100}%` }} />
                  </div>
                  <span>Seite {pdfProgress.page} von {pdfProgress.totalPages} wird lokal gelesen …</span>
                </div>
              )}
              <button className="btn primary personal-import-action" type="button" disabled={!pdfFile || busy} onClick={() => void addPdf()}>
                {busy ? 'PDF wird lokal verarbeitet …' : 'PDF zum Wissensgraphen hinzufügen'}
              </button>
            </div>
          ) : (
            <div className="personal-text-form">
              <div className="callout" style={{ margin: 0 }}>
                <strong>Bewusster Online-Abruf</strong>
                <p style={{ marginBottom: 0 }}>
                  Nur deine Suchphrase und anschließend die ausgewählten Artikeltitel gehen an die offizielle
                  deutschsprachige MediaWiki-API. Eigene Texte, PDFs und dein vollständiger Graph werden nicht übertragen.
                </p>
              </div>

              {!ctx.online ? (
                <div>
                  <p className="hint">Der globale Offline-Schalter blockiert den Wikipedia-Abruf.</p>
                  <button className="btn" type="button" onClick={() => ctx.setOnline(true)}>
                    Online-Nachladen erlauben
                  </button>
                </div>
              ) : (
                <>
                  <label className="field" htmlFor="personal-wikipedia-query">Wikipedia durchsuchen</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8 }}>
                    <input
                      id="personal-wikipedia-query"
                      type="search"
                      value={wikiQuery}
                      maxLength={PERSONAL_WIKIPEDIA_LIMITS.queryChars}
                      onChange={(event) => setWikiQuery(event.target.value)}
                      onKeyDown={onWikipediaSearchKey}
                      placeholder="z. B. Hannah Arendt oder Erkenntnistheorie"
                      disabled={wikiBusy}
                    />
                    <button className="btn" type="button" disabled={wikiQuery.trim().length < 2 || wikiBusy} onClick={() => void searchWikipedia()}>
                      {wikiBusy && !wikiProgress ? 'Suche …' : 'Suchen'}
                    </button>
                  </div>

                  {wikiHits.length > 0 && (
                    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                      <legend className="field">
                        Bis zu {PERSONAL_WIKIPEDIA_LIMITS.selectedRoots} Startartikel auswählen
                      </legend>
                      <div className="personal-library-grid">
                        {wikiHits.map((hit) => {
                          const checked = selectedWikiKeys.includes(hit.key)
                          const selectionFull = selectedWikiKeys.length >= PERSONAL_WIKIPEDIA_LIMITS.selectedRoots
                          return (
                            <label className="personal-library-item" key={hit.key} style={{ cursor: 'pointer', alignItems: 'flex-start' }}>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={!checked && selectionFull}
                                onChange={() => toggleWikipediaHit(hit.key)}
                                style={{ marginTop: 4 }}
                              />
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <strong>{hit.title}</strong>
                                <p>{hit.extract || 'Kein Einleitungsauszug verfügbar.'}</p>
                                <small>
                                  Wikipedia · Seite {hit.pageId}
                                  {hit.disambiguation ? ' · Begriffsklärung (nicht empfohlen)' : ''}
                                </small>
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    </fieldset>
                  )}

                  {wikiProgress && (
                    <div className="personal-pdf-progress" role="status">
                      <div className="progress">
                        <div style={{ width: `${(wikiProgress.done / Math.max(1, wikiProgress.total)) * 100}%` }} />
                      </div>
                      <span>{wikiProgress.step}</span>
                    </div>
                  )}

                  <p className="hint">
                    Pro Abruf: höchstens {PERSONAL_WIKIPEDIA_LIMITS.pagesPerPull} Artikel und{' '}
                    {PERSONAL_WIKIPEDIA_LIMITS.relationsPerPull} Relationen. Eine Kante entsteht nur, wenn MediaWiki
                    im Quellartikel tatsächlich einen internen Link auf das Ziel meldet.
                  </p>
                  <button
                    className="btn primary personal-import-action"
                    type="button"
                    disabled={selectedWikiKeys.length === 0 || wikiBusy}
                    onClick={() => void addWikipedia()}
                  >
                    {wikiBusy && wikiProgress ? 'Artikel und Links werden geprüft …' : 'Auswahl in den Wissensgraphen holen'}
                  </button>
                </>
              )}
            </div>
          )}

          {mode !== 'wikipedia' && (
            <div className="callout" style={{ marginTop: 16 }}>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: ctx.online ? 'pointer' : 'default' }}>
                <input
                  type="checkbox"
                  checked={autoWikipedia}
                  disabled={!ctx.online || busy}
                  onChange={(event) => setAutoWikipedia(event.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <span>
                  <strong>Erkannte Themen einmalig mit Wikipedia ergänzen</strong><br />
                  <small>
                    Optional und standardmäßig aus: Nach dem lokalen Import werden höchstens drei bereits bekannte,
                    ausdrücklich genannte Entitätsnamen an MediaWiki gesendet – niemals dein Text oder die PDF.
                  </small>
                </span>
              </label>
              {!ctx.online && (
                <button className="btn sm" type="button" style={{ marginTop: 10 }} onClick={() => ctx.setOnline(true)}>
                  Online-Nachladen erlauben
                </button>
              )}
              {wikiProgress && (
                <p className="hint" role="status" style={{ marginBottom: 0 }}>{wikiProgress.step}</p>
              )}
            </div>
          )}

          {error && <div className="callout personal-import-error" role="alert">{error}</div>}
        </div>

        <div className="card personal-growth-card" ref={graphCardRef}>
          <div className="personal-growth-heading">
            <div>
              <span className="personal-step">02</span>
              <h2>Sieh dein Wissen wachsen</h2>
            </div>
            <div className="personal-graph-counts">
              <span><strong>{ctx.graph.nodes.length}</strong> Knoten</span>
              <span><strong>{ctx.graph.edges.length}</strong> Kanten</span>
            </div>
          </div>

          <div className="personal-graph-canvas">
            <ForceGraph
              graph={growthGraph}
              height={390}
              highlightIds={highlightedIds}
              highlightEdgeKeys={result?.edgeKeys}
              selected={selected}
              onSelect={setSelected}
              pulse={Boolean(result)}
            />
            {result && (
              <div className="personal-graph-legends">
                <span className="personal-new-legend"><i /> Dieser Import</span>
                <span className="personal-heuristic-legend"><i /> gestrichelt = thematische Heuristik</span>
              </div>
            )}
          </div>

          {result ? (
            <div className="personal-import-result" role="status">
              <div className="personal-result-mark" aria-hidden="true">✓</div>
              <div>
                <strong>„{result.title}“ ist jetzt Teil deines Graphen.</strong>
                <p>
                  {deltaText(result.report)}. {resultVerifiedEdges} verifizierte oder strukturell belegte Kanten und{' '}
                  {resultHeuristicEdges} ausdrücklich heuristische Themenkanten; davon {bridges.length} Brücken zum
                  bisherigen Wissen.
                  {result.pages ? ` ${result.pages} PDF-Seiten wurden gelesen.` : ''}
                  {result.truncated ? ' Der Import wurde zum Schutz des Gerätes begrenzt.' : ''}
                </p>
                {result.secondaryReport && (
                  <p className="hint">
                    Wikipedia-Ergänzung: {deltaText(result.secondaryReport)}. Freigegebene Themen:{' '}
                    {result.autoTopics?.map((topic) => topic.title).join(', ') || 'keine'}.
                  </p>
                )}
                {resultReports.reduce((sum, report) => sum + report.delta.skippedEdges + report.delta.skippedNodes, 0) > 0 && (
                  <p className="hint">
                    {resultReports.reduce((sum, report) => sum + report.delta.skippedNodes, 0)} Knoten und{' '}
                    {resultReports.reduce((sum, report) => sum + report.delta.skippedEdges, 0)} Kanten wurden wegen
                    Konflikten, fehlender Belege oder ungültiger Endpunkte nicht übernommen.
                  </p>
                )}
                {resultWarnings.map((warning) => (
                  <p className="hint" key={warning}>{warning}</p>
                ))}
              </div>
            </div>
          ) : (
            <p className="personal-graph-empty">
              Nach dem Hinzufügen werden neue Knoten hervorgehoben. Du siehst sofort, ob und wo dein Inhalt mit dem
              bisherigen Wissen verbunden ist.
            </p>
          )}

          {selectedNode && (
            <div className="personal-selected-node">
              <span className="chip">Ausgewählter Knoten</span>
              <strong>{selectedNode.title}</strong>
              <p>{selectedNode.summary}</p>
              {selectedProvenance && (
                <div className="personal-selected-evidence">
                  <small>
                    Beleg aus „{selectedProvenance.sourceTitle}“
                    {selectedProvenance.page ? ` · Seite ${selectedProvenance.page}` : ''}
                    {' · '}
                    {selectedProvenance.method === 'explicit-mention'
                      ? 'explizite Nennung'
                      : selectedProvenance.method === 'mediawiki-link'
                        ? 'verifizierter MediaWiki-Link'
                        : selectedProvenance.confidence === 'heuristic'
                          ? 'heuristische Einordnung'
                          : 'Quelltext'}
                  </small>
                  {selectedProvenance.evidence && <blockquote>{selectedProvenance.evidence}</blockquote>}
                  {selectedProvenance.url && (
                    <a href={selectedProvenance.url} target="_blank" rel="noreferrer">Wikipedia-Quelle öffnen ↗</a>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {result && (
        <div className="personal-next-step">
          <div>
            <span className="personal-step">03</span>
            <strong>Dein neues Wissen ist sofort im Gespräch verfügbar.</strong>
            <p>Frage Noesis danach oder erkunde die entstandenen Beziehungen im großen Wissensraum.</p>
          </div>
          <div>
            <button className="btn primary" type="button" onClick={() => ctx.go('chat')}>Darüber sprechen</button>
            <button className="btn" type="button" onClick={() => ctx.go('explorer')}>Im Wissensraum öffnen</button>
          </div>
        </div>
      )}

      {bridges.length > 0 && (
        <div className="card personal-bridges-card">
          <h2>Neu entstandene Verbindungen</h2>
          <p className="hint">
            Der Belegtyp steht an jeder Kante: explizite Nennung, heuristische thematische Nähe oder ein von
            MediaWiki tatsächlich ausgelieferter interner Link.
          </p>
          <ul>
            {bridges.slice(0, 10).map((edge) => (
              <li key={edgeKey(edge)}>
                <strong>{relationText(edge)}</strong>
                <small>{evidenceType(edge)}</small>
                {edge.provenance?.[0]?.evidence && <small>Beleg: {edge.provenance[0].evidence}</small>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="personal-library">
        <div className="personal-library-heading">
          <div>
            <h2>Auf diesem Gerät gespeichert</h2>
            <p className="hint">
              {personalNodes.length} eigene Wissensknoten · {wikipediaNodes.length} Wikipedia-Knoten · ca.{' '}
              {humanFileSize(personalStorageBytes)} privater Inhalt · nur in diesem Browserprofil
            </p>
          </div>
          {personalNodes.length > 0 && (
            <button className="btn sm" type="button" onClick={clearPersonalKnowledge}>Eigene Texte/PDFs löschen</button>
          )}
        </div>
        {rootEntries.length === 0 && wikipediaImports.length === 0 ? (
          <div className="personal-library-empty">Noch keine eigenen Texte, PDFs oder Wikipedia-Auszüge gespeichert.</div>
        ) : (
          <div className="personal-library-grid">
            {rootEntries.map((entry) => {
              const sections = personalNodes.filter((node) => node.id.startsWith(`${entry.id}_abschnitt_`)).length
              return (
                <article className="personal-library-item" key={entry.id}>
                  <div>
                    <span>{entry.title.startsWith('PDF:') ? 'PDF' : 'TEXT'}</span>
                    <strong>{entry.title.replace(/^PDF:\s*/, '')}</strong>
                    <p>{entry.summary.slice(0, 155)}{entry.summary.length > 155 ? '…' : ''}</p>
                  </div>
                  <div className="personal-library-actions">
                    {sections > 0 && <small>{sections} Abschnitte</small>}
                    <button className="btn sm" type="button" onClick={() => removeEntry(entry)}>
                      Entfernen
                    </button>
                  </div>
                </article>
              )
            })}
            {wikipediaImports.map((report) => {
              const representative = wikipediaNodes.find((node) => node.provenance?.some(
                (value) => (value.importScopeId ?? value.sourceId) === report.sourceId,
              ))
              return (
                <article className="personal-library-item" key={`wiki-${report.sourceId}`}>
                  <div>
                    <span>{report.sourceKind === 'wikipedia-research' ? 'WIKIPEDIA · AUTO' : 'WIKIPEDIA'}</span>
                    <strong>{report.sourceTitle}</strong>
                    <p>
                      {representative
                        ? `${representative.summary.slice(0, 155)}${representative.summary.length > 155 ? '…' : ''}`
                        : 'Belegte MediaWiki-Beziehungen zu bereits vorhandenen Graphknoten.'}
                    </p>
                  </div>
                  <div className="personal-library-actions">
                    <small>{report.candidateNodes} Artikel · {report.evidencedEdges} belegte Kanten</small>
                    <button className="btn sm" type="button" onClick={() => removeWikipediaImport(report)}>
                      Entfernen
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </section>
  )
}
