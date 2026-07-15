import { useState } from 'react'
import type { AppCtx } from '../App'
import { extractTriples } from '../engine/extract'
import { importWikipediaTopic, ingestPdfDocument, ingestText, type WikiImportProgress } from '../engine/ingest'
import { readPdfText, type PdfReadProgress } from '../engine/pdf'

export default function Knowledge({ ctx }: { ctx: AppCtx }) {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [useLlmExtraction, setUseLlmExtraction] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [topic, setTopic] = useState('')
  const [wikiBusy, setWikiBusy] = useState(false)
  const [wikiProgress, setWikiProgress] = useState<WikiImportProgress | null>(null)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfProgress, setPdfProgress] = useState<PdfReadProgress | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const customNodes = ctx.custom.nodes

  async function addNote() {
    if (!title.trim() || !text.trim() || extracting) return
    const { node, edges } = ingestText(title, text, ctx.graph)

    // Optional: das LOKALE LLM extrahiert typisierte Tripel aus dem Text –
    // der Graph baut sich selbst (Ausarbeitung § 8). Nur eindeutig auflösbare
    // Tripel werden übernommen; Erwähnungs-Kanten bleiben der Fallback.
    let llmEdges: typeof edges = []
    let llmNote = ''
    if (useLlmExtraction && ctx.engine.id !== 'extractive') {
      setExtracting(true)
      try {
        const { triples, edges: extracted } = await extractTriples(ctx.engine, text, ctx.graph, node)
        llmEdges = extracted.filter(
          (e) => !edges.some((x) => x.source === e.source && x.target === e.target),
        )
        llmNote = ` Das LLM hat ${triples.length} Tripel vorgeschlagen, davon ${llmEdges.length} eindeutig aufgelöst und übernommen.`
      } catch (err) {
        llmNote = ` (Tripel-Extraktion fehlgeschlagen: ${err instanceof Error ? err.message : String(err)})`
      } finally {
        setExtracting(false)
      }
    }

    ctx.setCustom({
      nodes: [...ctx.custom.nodes.filter((n) => n.id !== node.id), node],
      edges: [...ctx.custom.edges.filter((e) => e.source !== node.id), ...edges, ...llmEdges],
    })
    setMessage(`»${node.title}« hinzugefügt – automatisch verknüpft mit ${edges.length} vorhandenen Entitäten.${llmNote}`)
    setTitle('')
    setText('')
  }

  async function learnTopic() {
    if (!topic.trim() || wikiBusy) return
    if (!ctx.online) {
      setError('Offline-Modus: Wikipedia-Import ist gesperrt. Schalte den globalen Schalter nur für diesen bewussten Import auf Online.')
      return
    }
    setWikiBusy(true)
    setError(null)
    setMessage(null)
    try {
      const { nodes, edges } = await importWikipediaTopic(topic.trim(), 8, setWikiProgress)
      const existing = new Set(ctx.custom.nodes.map((n) => n.id))
      ctx.setCustom({
        nodes: [...ctx.custom.nodes, ...nodes.filter((n) => !existing.has(n.id))],
        edges: [...ctx.custom.edges, ...edges],
      })
      setMessage(
        `Thema »${topic}« gelernt: ${nodes.length} Artikel und ${edges.length} Beziehungen als neuer Cluster übernommen. Der Assistent kann jetzt Fragen dazu beantworten.`,
      )
      setTopic('')
    } catch (err) {
      setError(
        (err instanceof Error ? err.message : String(err)) +
          ' – Hinweis: Der Import benötigt eine Internetverbindung zur Wikipedia-API.',
      )
    } finally {
      setWikiBusy(false)
      setWikiProgress(null)
    }
  }

  async function addPdf() {
    if (!pdfFile || pdfBusy) return
    setPdfBusy(true)
    setPdfProgress(null)
    setError(null)
    setMessage(null)
    try {
      const parsed = await readPdfText(pdfFile, setPdfProgress)
      const title = pdfFile.name.replace(/\.pdf$/i, '') || 'Lokales PDF'
      const { nodes, edges, chunks } = ingestPdfDocument(title, parsed.text, ctx.graph)
      const newIds = new Set(nodes.map((node) => node.id))
      const preservedNodes = ctx.custom.nodes.filter((node) => !newIds.has(node.id))
      const preservedEdges = ctx.custom.edges.filter((edge) => !newIds.has(edge.source) && !newIds.has(edge.target))
      const mergedEdges = [...preservedEdges, ...edges].filter(
        (edge, index, all) => all.findIndex((other) => other.source === edge.source && other.target === edge.target && other.relation === edge.relation) === index,
      )
      ctx.setCustom({ nodes: [...preservedNodes, ...nodes], edges: mergedEdges })
      setMessage(
        `PDF »${pdfFile.name}« lokal gelesen: ${parsed.pagesRead}/${parsed.totalPages} Seiten, ${chunks} Abschnittsknoten und ${edges.length} belegte Kanten hinzugefügt.${parsed.truncated ? ' Der Import wurde aus Speichergründen begrenzt.' : ''}`,
      )
      setPdfFile(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPdfBusy(false)
      setPdfProgress(null)
    }
  }

  function removeNode(id: string) {
    ctx.setCustom({
      nodes: ctx.custom.nodes.filter((n) => n.id !== id),
      edges: ctx.custom.edges.filter((e) => e.source !== id && e.target !== id),
    })
  }

  return (
    <div>
      <div className="eyebrow">Erweiterung · außerhalb des Experiments</div>
      <h1>Wissen füttern</h1>
      <p className="lead">
        Eigene Notizen werden lokal zu Knoten im Graphen und automatisch mit vorhandenen Entitäten verknüpft. Optional
        kann die App im Online-Modus ein Thema aus Wikipedia importieren; die übernommenen Daten bleiben danach lokal.
      </p>

      {message && <div className="callout" style={{ marginBottom: 14 }}>{message}</div>}
      {error && (
        <div className="callout" style={{ marginBottom: 14, borderColor: 'var(--bad)' }}>
          {error}
        </div>
      )}

      <div className="grid cols-2">
        <div className="card">
          <h3>📝 Eigene Notizen einspeisen</h3>
          <p className="hint" style={{ fontSize: 13 }}>
            Text einfügen (Vorlesungsnotizen, Zusammenfassungen, Dokumente). Erwähnungen bekannter Entitäten werden als
            Kanten erkannt.
          </p>
          <label className="field">Titel</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Novalis" />
          <label className="field" style={{ marginTop: 10 }}>
            Inhalt
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Novalis (1772–1801) war der wichtigste Dichter der Jenaer Frühromantik und stand in engem Austausch mit Fichte und Schelling …"
          />
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 12.5, marginTop: 10, color: 'var(--ink-2)' }}>
            <input
              type="checkbox"
              checked={useLlmExtraction}
              onChange={(e) => setUseLlmExtraction(e.target.checked)}
              disabled={ctx.engine.id === 'extractive'}
              style={{ marginTop: 2 }}
            />
            <span>
              🧠 Beziehungen zusätzlich mit dem lokalen LLM extrahieren (Subjekt | Relation | Objekt)
              {ctx.engine.id === 'extractive' && (
                <em style={{ display: 'block', color: 'var(--muted)' }}>
                  – benötigt ein geladenes WebLLM-Modell (Ansicht »Modelle«)
                </em>
              )}
            </span>
          </label>
          <button className="btn primary" style={{ marginTop: 10 }} disabled={!title.trim() || !text.trim() || extracting} onClick={addNote}>
            {extracting ? 'Extrahiere Tripel …' : 'Zum Graphen hinzufügen'}
          </button>
        </div>

        <div className="card">
          <h3>🌐 Thema von Wikipedia lernen</h3>
          <p className="hint" style={{ fontSize: 13 }}>
            Die App lädt den Artikel und seine relevantesten Nachbarn über die offizielle MediaWiki-API. Jede Kante
            entspricht einem tatsächlich vorhandenen MediaWiki-Link; bloße Namensnennungen erzeugen keine Kante.
          </p>
          <label className="field">Thema (deutscher Wikipedia-Titel)</label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="z. B. Quantencomputer, Bauhaus, Immunsystem …"
            onKeyDown={(e) => e.key === 'Enter' && learnTopic()}
            disabled={!ctx.online}
          />
          <button className="btn primary" style={{ marginTop: 10 }} disabled={!topic.trim() || wikiBusy || !ctx.online} onClick={learnTopic}>
            {wikiBusy ? 'Lerne …' : 'Thema lernen'}
          </button>
          {!ctx.online && <p className="hint" style={{ marginTop: 8 }}>Offline-Modus: Import gesperrt.</p>}
          {wikiProgress && (
            <div style={{ marginTop: 10 }}>
              <div className="progress">
                <div style={{ width: `${(wikiProgress.done / Math.max(1, wikiProgress.total)) * 100}%` }} />
              </div>
              <div className="hint" style={{ marginTop: 4, fontSize: 11.5 }}>
                {wikiProgress.step}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>PDF lokal als Wissen einpflegen</h3>
        <p className="hint" style={{ fontSize: 13 }}>
          Die PDF wird ausschließlich in diesem Browser gelesen. Sie wird in einen Dokumentknoten und kompakte
          Abschnittsknoten zerlegt. Kanten zu vorhandenem Wissen entstehen nur bei expliziten Namensnennungen; die
          Abschnittsreihenfolge bleibt ebenfalls als Kante erhalten.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => setPdfFile(event.target.files?.[0] ?? null)}
            disabled={pdfBusy}
            style={{ maxWidth: 380 }}
          />
          <button className="btn primary" disabled={!pdfFile || pdfBusy} onClick={addPdf}>
            {pdfBusy ? 'PDF wird gelesen …' : 'PDF lokal einpflegen'}
          </button>
          {pdfFile && <span className="chip">{pdfFile.name} · {(pdfFile.size / 1024 / 1024).toFixed(1)} MB</span>}
        </div>
        {pdfProgress && (
          <div style={{ marginTop: 10 }}>
            <div className="progress">
              <div style={{ width: `${(pdfProgress.page / Math.max(1, pdfProgress.totalPages)) * 100}%` }} />
            </div>
            <div className="hint" style={{ marginTop: 4 }}>
              Lese Seite {pdfProgress.page} von {pdfProgress.totalPages} …
            </div>
          </div>
        )}
      </div>

      <h2>Eigenes Wissen ({customNodes.length} Knoten)</h2>
      {customNodes.length === 0 ? (
        <p className="hint">Noch nichts hinzugefügt. Der Basiskorpus (Deutscher Idealismus) bleibt davon unberührt.</p>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Titel</th>
                <th>Cluster</th>
                <th>Auszug</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {customNodes.map((n) => (
                <tr key={n.id}>
                  <td style={{ fontWeight: 600 }}>{n.title}</td>
                  <td>
                    <span className="chip">
                      {n.community === 'custom'
                        ? 'Notiz'
                        : n.community === 'recherche'
                          ? 'Live-Recherche'
                          : n.community.replace('wiki_', 'Wikipedia · ')}
                    </span>
                  </td>
                  <td style={{ fontSize: 12.5, maxWidth: 420 }}>{n.summary.slice(0, 140)}…</td>
                  <td>
                    <button className="btn sm" onClick={() => removeNode(n.id)}>
                      Entfernen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Methodischer Hinweis</h2>
      <p className="hint" style={{ maxWidth: '70ch' }}>
        Diese Funktionen sind bewusst <strong>außerhalb</strong> des wissenschaftlichen Experiments angesiedelt: Der
        Messkorpus bleibt eingefroren und versioniert, damit die Ergebnisse reproduzierbar sind. Nutzerwissen erweitert
        nur den Assistent-Modus – ein schöner Ausblick darauf, was ein privater On-Device-Wissensassistent im Alltag
        leisten könnte.
      </p>
    </div>
  )
}
