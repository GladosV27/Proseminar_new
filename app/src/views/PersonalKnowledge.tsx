import { useMemo, useRef, useState, type DragEvent } from 'react'
import type { AppCtx } from '../App'
import ForceGraph from '../components/ForceGraph'
import type { GraphEdge, GraphNode, KnowledgeImportReport } from '../data/types'
import { ingestPdfDocument, ingestText } from '../engine/ingest'
import { readPdfText, type PdfReadProgress } from '../engine/pdf'
import { applyKnowledgeImport } from '../engine/store'

type ImportMode = 'text' | 'pdf'
const PRIVATE_SOURCE_KINDS = new Set(['manual-text', 'pdf', 'local-llm'])

interface ImportResult {
  kind: ImportMode
  title: string
  nodeIds: string[]
  edgeKeys: string[]
  report: KnowledgeImportReport
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

export default function PersonalKnowledge({ ctx }: { ctx: AppCtx }) {
  const [mode, setMode] = useState<ImportMode>('text')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfProgress, setPdfProgress] = useState<PdfReadProgress | null>(null)
  const [busy, setBusy] = useState(false)
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
  const rootEntries = useMemo(
    () => personalNodes.filter((node) => !/_abschnitt_\d+$/.test(node.id)),
    [personalNodes],
  )
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
    const imported = new Set(result.nodeIds)
    const importEdges = new Set(result.edgeKeys)
    return ctx.graph.edges.filter(
      (edge) => importEdges.has(edgeKey(edge)) && imported.has(edge.source) !== imported.has(edge.target),
    )
  }, [ctx.graph.edges, result])

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

  function addText(): void {
    const cleanTitle = title.trim()
    const cleanText = text.trim()
    if (!cleanTitle || !cleanText || busy) return

    setError(null)
    try {
      const imported = ingestText(cleanTitle, cleanText, ctx.graph)
      const applied = applyKnowledgeImport(ctx.custom, {
        nodes: [imported.node],
        edges: imported.edges,
        report: imported.report,
      })
      assertNoIdCollision(applied.report)
      ctx.setCustom(applied.knowledge)
      const nodeIds = [...new Set([
        ...applied.report.delta.addedNodeIds,
        ...applied.report.delta.updatedNodeIds,
        ...applied.report.delta.unchangedNodeIds,
      ])]
      const edgeKeys = [...new Set([
        ...applied.report.delta.addedEdgeKeys,
        ...applied.report.delta.updatedEdgeKeys,
        ...applied.report.delta.unchangedEdgeKeys,
      ])]
      setResult({
        kind: 'text',
        title: imported.node.title,
        nodeIds,
        edgeKeys,
        report: applied.report,
      })
      setSelected(nodeIds[0] ?? null)
      setTitle('')
      setText('')
      revealGraph()
    } catch (err) {
      setError(friendlyError(err))
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
      ctx.setCustom(applied.knowledge)
      const nodeIds = [...new Set([
        ...applied.report.delta.addedNodeIds,
        ...applied.report.delta.updatedNodeIds,
        ...applied.report.delta.unchangedNodeIds,
      ])]
      const edgeKeys = [...new Set([
        ...applied.report.delta.addedEdgeKeys,
        ...applied.report.delta.updatedEdgeKeys,
        ...applied.report.delta.unchangedEdgeKeys,
      ])]
      setResult({
        kind: 'pdf',
        title: pdfFile.name,
        nodeIds,
        edgeKeys,
        report: applied.report,
        pages: parsed.pagesRead,
        truncated: applied.report.truncated,
      })
      setSelected(imported.nodes[0]?.id ?? null)
      setPdfFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      revealGraph()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
      setPdfProgress(null)
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
          <div className="eyebrow">Dein Wissen · nur auf diesem Gerät</div>
          <h1>Mach Noesis zu deinem Wissensraum</h1>
          <p className="lead">
            Füge einen eigenen Text oder eine PDF hinzu. Noesis zerlegt den Inhalt in Wissensknoten und verbindet
            eindeutige Namensnennungen mit dem vorhandenen Graphen.
          </p>
        </div>
        <div className="personal-local-seal" aria-label="Verarbeitung ausschließlich lokal">
          <span aria-hidden="true">⌂</span>
          <strong>Lokal eingelesen</strong>
          <small>kein Datei-Upload</small>
        </div>
      </header>

      <div className="personal-privacy-note">
        <strong>Deine Datei verlässt den Browser nicht.</strong>
        <span>
          Der extrahierte Text wird – begrenzt auf 140.000 Zeichen – unverschlüsselt in diesem Browserprofil
          gespeichert; die PDF-Originaldatei selbst wird weder hochgeladen noch dauerhaft abgelegt.
          {seminarOnline
            ? ' Erst wenn du im Chat „Eigenes Wissen freigeben“ aktivierst, können pro Frage bis zu 5.000 Zeichen lokal ausgewählter Belegstellen an das Seminar-Modell gesendet werden.'
            : ' Auch spätere Antworten nutzen dieses Wissen direkt aus dem lokalen Graphen.'}
        </span>
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
                Beziehungen entstehen nur, wenn bekannte Personen, Werke oder Begriffe im Text ausdrücklich genannt
                werden. Noesis erfindet keine Verbindung.
              </p>
              <button className="btn primary personal-import-action" type="button" disabled={!title.trim() || !text.trim()} onClick={addText}>
                Zum Wissensgraphen hinzufügen
              </button>
            </div>
          ) : (
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
                Datenschutzgründen nicht aus dem Netz nachgeladen.
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
            {result && <span className="personal-new-legend"><i /> Dieser Import und seine Anschlüsse</span>}
          </div>

          {result ? (
            <div className="personal-import-result" role="status">
              <div className="personal-result-mark" aria-hidden="true">✓</div>
              <div>
                <strong>„{result.title}“ ist jetzt Teil deines Graphen.</strong>
                <p>
                  {deltaText(result.report)}. {result.report.evidencedEdges} geprüfte Importkanten; davon{' '}
                  {bridges.length} Brücken zum bisherigen Wissen.
                  {result.pages ? ` ${result.pages} PDF-Seiten wurden gelesen.` : ''}
                  {result.truncated ? ' Der Import wurde zum Schutz des Gerätes begrenzt.' : ''}
                </p>
                {result.report.delta.skippedEdges + result.report.delta.skippedNodes > 0 && (
                  <p className="hint">
                    {result.report.delta.skippedNodes} Knoten und {result.report.delta.skippedEdges} Kanten wurden wegen
                    Konflikten, fehlender Belege oder ungültiger Endpunkte nicht übernommen.
                  </p>
                )}
                {result.report.warnings.map((warning) => (
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
                    {' · '}{selectedProvenance.method === 'explicit-mention' ? 'explizite Nennung' : 'Quelltext'}
                  </small>
                  {selectedProvenance.evidence && <blockquote>{selectedProvenance.evidence}</blockquote>}
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
          <p className="hint">Diese Brücken beruhen auf ausdrücklichen Namensnennungen im importierten Text.</p>
          <ul>
            {bridges.slice(0, 10).map((edge) => (
              <li key={edgeKey(edge)}>
                <strong>{relationText(edge)}</strong>
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
              {personalNodes.length} eigene Wissensknoten · ca. {humanFileSize(personalStorageBytes)} · nur in diesem Browserprofil
            </p>
          </div>
          {personalNodes.length > 0 && (
            <button className="btn sm" type="button" onClick={clearPersonalKnowledge}>Alles löschen</button>
          )}
        </div>
        {rootEntries.length === 0 ? (
          <div className="personal-library-empty">Noch keine eigenen Texte oder PDFs gespeichert.</div>
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
          </div>
        )}
      </section>
    </section>
  )
}
