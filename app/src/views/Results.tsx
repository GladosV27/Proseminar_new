import { type ChangeEvent, useMemo, useRef, useState } from 'react'
import type { AppCtx } from '../App'
import { exportChartPng } from '../components/exportPng'
import { CATEGORY_LABELS, QUESTIONS } from '../data/questions'
import { BASE_GRAPH } from '../data/graph'
import { aggregate, ALL_CONDITIONS, CONDITION_INFO, cohensKappa, effectiveScore, pairedComparison, questionClusterSummary } from '../engine/experiment'
import { exportResultsCsv, exportResultsJson, exportSubmissionBundle } from '../engine/store'
import {
  RESULTS_IMPORT_MAX_BYTES,
  parseResultsImport,
  planResultsImport,
  ResultsImportError,
  type ResultsImportMode,
  type ResultsImportPreview,
} from '../engine/resultsImport'
import { GroupedBars, HBar } from '../components/Charts'

const KNOWN_QUESTION_IDS = new Set(QUESTIONS.map((question) => question.id))

function download(name: string, content: string, type: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([content], { type }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

function wilson(k: number, n: number): [number, number] {
  if (!n) return [0, 0]
  const z = 1.96
  const p = k / n
  const d = 1 + (z * z) / n
  const centre = (p + (z * z) / (2 * n)) / d
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d
  return [Math.max(0, centre - half), Math.min(1, centre + half)]
}

export default function Results({ ctx }: { ctx: AppCtx }) {
  const engines = useMemo(() => [...new Set(ctx.results.map((r) => r.engine))], [ctx.results])
  const retrievals = useMemo(() => [...new Set(ctx.results.map((r) => r.retrieval))], [ctx.results])
  const runIds = useMemo(() => [...new Set(ctx.results.map((r) => r.runId))], [ctx.results])
  const latestRunId = ctx.results.at(-1)?.runId ?? ''
  const [engine, setEngine] = useState<string>('alle')
  const [retrieval, setRetrieval] = useState<string>('alle')
  const [run, setRun] = useState<string>('latest')
  const [showTable, setShowTable] = useState(false)
  const chartRef = useRef<HTMLDivElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [importPreview, setImportPreview] = useState<ResultsImportPreview | null>(null)
  const [importFileName, setImportFileName] = useState('')
  const [importMode, setImportMode] = useState<ResultsImportMode>('merge')
  const [importMessage, setImportMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const results = useMemo(
    () =>
      ctx.results.filter(
        (r) =>
          (run === 'alle' || (run === 'latest' ? r.runId === latestRunId : r.runId === run)) &&
          (engine === 'alle' || r.engine === engine) &&
          (retrieval === 'alle' || r.retrieval === retrieval),
      ),
    [ctx.results, engine, retrieval, run, latestRunId],
  )

  // nur Bedingungen zeigen, für die es Daten gibt (Reihenfolge fix)
  const conds = useMemo(() => ALL_CONDITIONS.filter((c) => results.some((r) => r.condition === c)), [results])
  const agg = useMemo(() => aggregate(results, conds), [results, conds])
  const comparisonResults = useMemo(
    () => ctx.results.filter((r) => (run === 'alle' || (run === 'latest' ? r.runId === latestRunId : r.runId === run)) && (retrieval === 'alle' || r.retrieval === retrieval)),
    [ctx.results, run, retrieval, latestRunId],
  )
  const comparison = useMemo(() => {
    const groups = new Map<string, typeof comparisonResults>()
    for (const result of comparisonResults) {
      const key = `${result.engine}\u001f${result.retrieval}\u001f${result.condition}`
      const rows = groups.get(key) ?? []
      rows.push(result)
      groups.set(key, rows)
    }
    return [...groups.values()].map((rs) => {
      const summary = questionClusterSummary(rs)
      const [lo, hi] = wilson(summary.correct, summary.n)
      return {
        model: rs[0].engine,
        retrieval: rs[0].retrieval,
        condition: rs[0].condition,
        ...summary,
        lo,
        hi,
      }
    })
  }, [comparisonResults])
  const paired = useMemo(() => [
    pairedComparison(comparisonResults, 'graph', 'vector'),
    pairedComparison(comparisonResults, 'graph', 'vector_budget'),
    pairedComparison(comparisonResults, 'graph', 'graph_no_edges'),
  ].filter((row) => row.pairs > 0), [comparisonResults])
  const kappa = useMemo(() => cohensKappa(ctx.results), [ctx.results])
  const importPlan = useMemo(
    () => importPreview ? planResultsImport(ctx.results, importPreview.results, importMode) : null,
    [ctx.results, importMode, importPreview],
  )

  const categories = Object.keys(CATEGORY_LABELS)
  const accByCat = useMemo(
    () =>
      conds.map((c) => ({
        name: CONDITION_INFO[c].short,
        color: CONDITION_INFO[c].color,
        values: categories.map((cat) => {
          const qids = new Set(QUESTIONS.filter((q) => q.category === cat).map((q) => q.id))
          const rs = results.filter((r) => r.condition === c && qids.has(r.questionId))
          if (!rs.length) return 0
          return questionClusterSummary(rs).accuracy
        }),
      })),
    [results, conds],
  )

  const clusterByCondition = useMemo(
    () => new Map(conds.map((condition) => [condition, questionClusterSummary(results.filter((result) => result.condition === condition))])),
    [results, conds],
  )

  const empty = results.length === 0

  function clearAllResults() {
    if (ctx.experimentStatus.state === 'running') return
    if (
      window.confirm(
        'Alle lokal gespeicherten Messdaten werden dauerhaft gelöscht. Exportiere vorher JSON oder CSV, wenn du die Testdaten behalten möchtest.',
      )
    ) {
      ctx.setResults([])
      setRun('latest')
    }
  }

  async function readImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setImportMessage(null)
    setImportPreview(null)
    setImportFileName(file.name)
    try {
      if (file.size > RESULTS_IMPORT_MAX_BYTES) throw new ResultsImportError('Die Datei ist größer als 25 MB.')
      const preview = parseResultsImport(await file.text(), file.name, KNOWN_QUESTION_IDS)
      setImportPreview(preview)
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error)
      setImportMessage({ kind: 'error', text: `Import abgelehnt: ${text}` })
    }
  }

  function applyImport() {
    if (!importPreview || !importPlan) return
    if (ctx.experimentStatus.state === 'running') {
      setImportMessage({ kind: 'error', text: 'Während eines laufenden Experiments können keine Messdaten importiert werden.' })
      return
    }
    const action = importMode === 'merge'
      ? `${importPlan.added} neue Trials hinzufügen und ${importPlan.duplicatesSkipped} Dubletten überspringen?`
      : importMode === 'replace-runs'
        ? `${importPlan.existingRemoved} vorhandene Trials aus denselben Messläufen ersetzen?`
        : `Wirklich alle ${ctx.results.length} lokalen Trials durch ${importPlan.added} importierte Trials ersetzen?`
    if (!window.confirm(action)) return
    try {
      ctx.setResults(importPlan.results)
      setEngine('alle')
      setRetrieval('alle')
      setRun('latest')
      setImportPreview(null)
      setImportMessage({
        kind: 'ok',
        text: `Import abgeschlossen: ${importPlan.added} hinzugefügt, ${importPlan.existingRemoved} ersetzt, ${importPlan.duplicatesSkipped} Dubletten übersprungen${importPlan.conflictsSkipped ? `, ${importPlan.conflictsSkipped} ID-Konflikte sicher verworfen` : ''}.`,
      })
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error)
      setImportMessage({ kind: 'error', text: `Import konnte nicht gespeichert werden: ${text}` })
    }
  }

  return (
    <div>
      <div className="eyebrow">Auswertung</div>
      <h1>Ergebnisse</h1>
      <p className="lead">
        Bestätigt sich die Hypothese? Entscheidend ist die Interaktion: Graph-RAG sollte seinen Vorsprung vor allem bei
        2-Hop- und 3-Hop-Fragen ausspielen. Die Evidenz-Diagnostik darunter zeigt, <em>warum</em> eine Bedingung gewinnt
        oder verliert – Retrieval-Versagen und Generierungs-Versagen werden getrennt sichtbar.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 430px' }}>
            <h3 style={{ marginTop: 0 }}>Messdaten auf dieses Gerät übertragen</h3>
            <p className="hint" style={{ marginBottom: 0 }}>
              Importiert den JSON-Export, die Semikolon-CSV oder das Abgabe-Paket. Jeder Trial wird vor dem Speichern
              typgeprüft; unbekannte Bedingungen, ungültige Scores und beschädigte Zahlen werden vollständig abgelehnt.
            </p>
          </div>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,.csv,application/json,text/csv"
            onChange={(event) => void readImportFile(event)}
            style={{ display: 'none' }}
          />
          <button className="btn" disabled={ctx.experimentStatus.state === 'running'} onClick={() => importInputRef.current?.click()}>
            ↑ Ergebnisdatei importieren
          </button>
        </div>

        {ctx.experimentStatus.state === 'running' && (
          <p className="hint" style={{ color: 'var(--bad)', marginBottom: 0 }}>
            Import ist bis zum Ende des laufenden Experiments gesperrt, damit dessen Resultatliste nicht überschrieben wird.
          </p>
        )}

        {importMessage && (
          <div className="callout" style={{ marginTop: 12, borderColor: importMessage.kind === 'error' ? 'var(--bad)' : 'var(--good)' }}>
            {importMessage.text}
          </div>
        )}

        {importPreview && importPlan && (
          <div style={{ marginTop: 16 }}>
            <div className="grid cols-3" style={{ marginBottom: 12 }}>
              <div><span className="hint">Datei</span><br /><strong>{importFileName}</strong></div>
              <div><span className="hint">Geprüfter Inhalt</span><br /><strong>{importPreview.results.length} Trials · {importPreview.runIds.length} Messlauf/-läufe</strong></div>
              <div><span className="hint">Format</span><br /><strong>{importPreview.format === 'submission-bundle' ? 'Abgabe-Paket' : importPreview.format.toUpperCase()}</strong></div>
            </div>
            <p className="hint" style={{ margin: '0 0 12px' }}>
              Engines: {importPreview.engines.join(' · ')} · Messläufe: {importPreview.runIds.join(' · ')}
            </p>
            {importPreview.warnings.map((warning) => (
              <div className="callout" key={warning} style={{ marginBottom: 8 }}><strong>Hinweis:</strong> {warning}</div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <select value={importMode} onChange={(event) => setImportMode(event.target.value as ResultsImportMode)} style={{ maxWidth: 360 }}>
                <option value="merge">Zusammenführen – lokale Werte behalten</option>
                <option value="replace-runs">Gleiche Messläufe vollständig ersetzen</option>
                <option value="replace-all">Alle lokalen Messdaten ersetzen</option>
              </select>
              <button className="btn" onClick={applyImport} disabled={ctx.experimentStatus.state === 'running'}>
                Import anwenden
              </button>
              <button className="btn sm" onClick={() => setImportPreview(null)}>Abbrechen</button>
              <span className="hint">
                Danach: {importPlan.results.length} lokal · +{importPlan.added} · −{importPlan.existingRemoved} · {importPlan.duplicatesSkipped} Dubletten
                {importPlan.conflictsSkipped ? ` · ${importPlan.conflictsSkipped} Konflikte` : ''}
              </span>
            </div>
          </div>
        )}
      </div>

      {empty ? (
        <div className="card">
          <p style={{ margin: 0 }}>
            Noch keine Messdaten{ctx.results.length > 0 ? ' für diese Filterkombination' : ''}. Starte einen Durchlauf im{' '}
            <a style={{ color: 'var(--accent-deep)', cursor: 'pointer', fontWeight: 600 }} onClick={() => ctx.go('experiment')}>
              Experiment
            </a>
            .
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <select value={engine} onChange={(e) => setEngine(e.target.value)} style={{ maxWidth: 300 }}>
              <option value="alle">Alle Engines ({engines.length})</option>
              {engines.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
            <select value={retrieval} onChange={(e) => setRetrieval(e.target.value)} style={{ maxWidth: 220 }}>
              <option value="alle">Alle Retrieval-Backends</option>
              {retrievals.map((r) => (
                <option key={r} value={r}>
                  {r === 'dense' ? 'Dichte Embeddings' : 'TF-IDF'}
                </option>
              ))}
            </select>
            <select value={run} onChange={(e) => setRun(e.target.value)} style={{ maxWidth: 310 }}>
              <option value="latest">Letzter Messlauf{latestRunId ? ` (${latestRunId})` : ''}</option>
              <option value="alle">Alle Messläufe (nur Überblick)</option>
              {runIds.map((id) => (
                <option key={id} value={id}>
                  Messlauf: {id}
                </option>
              ))}
            </select>
            <button className="btn sm" onClick={() => download('graphrag-ergebnisse.json', exportResultsJson(results), 'application/json')}>
              ⬇ JSON-Export
            </button>
            <button className="btn sm" onClick={() => download('graphrag-ergebnisse.csv', exportResultsCsv(results), 'text/csv')}>
              ⬇ CSV-Export
            </button>
            <button className="btn sm" onClick={() => download('graphrag-abgabe-paket.json', exportSubmissionBundle(results), 'application/json')}>
              ⬇ Abgabe-Paket
            </button>
            <button className="btn sm" onClick={() => setShowTable(!showTable)}>
              {showTable ? 'Tabelle ausblenden' : 'Als Tabelle anzeigen'}
            </button>
            <button
              className="btn sm"
              style={{ color: 'var(--bad)' }}
              disabled={ctx.experimentStatus.state === 'running'}
              title={ctx.experimentStatus.state === 'running' ? 'Erst den laufenden Messlauf beenden oder abbrechen.' : ''}
              onClick={clearAllResults}
            >
              Alle Messdaten löschen
            </button>
            {kappa.kappa !== null && <span className="chip">Bewertung: κ = {kappa.kappa.toFixed(2)} (n = {kappa.n})</span>}
          </div>

          {run === 'alle' && (
            <div className="callout" style={{ marginBottom: 14 }}>
              <strong>Hinweis:</strong> Diese Ansicht fasst mehrere Messläufe zusammen. Für die wissenschaftliche Auswertung
              verwende einen einzelnen vollständigen Messlauf und exportiere ihn separat.
            </div>
          )}

          {comparison.length > 0 && (
            <>
              <h2>Primäre Genauigkeit auf Frageebene</h2>
              <div className="card table-wrap">
                <table>
                  <thead><tr><th>Modell</th><th>Retrieval</th><th>Bedingung</th><th className="num">Fragen n</th><th className="num">korrekt</th><th className="num">95%-Intervall</th><th className="num">Trials</th></tr></thead>
                  <tbody>{comparison.map((row) => <tr key={`${row.model}-${row.retrieval}-${row.condition}`}><td className="mono" style={{ fontSize: 11.5 }}>{row.model}</td><td>{row.retrieval === 'dense' ? 'Dense' : 'TF-IDF'}</td><td>{CONDITION_INFO[row.condition].short}</td><td className="num">{row.n}{row.ties ? ` (+${row.ties} Gleichstand)` : ''}</td><td className="num"><strong>{row.correct}/{row.n} = {Math.round(row.accuracy * 100)}%</strong></td><td className="num">[{Math.round(row.lo * 100)}–{Math.round(row.hi * 100)}%]</td><td className="num">{row.trials}</td></tr>)}</tbody>
                </table>
                <p className="hint" style={{ margin: '10px 0 0' }}>
                  Primäre Einheit ist die einzigartige Frage: Wiederholungen werden je Run, Engine und Retrieval per Mehrheit
                  zusammengefasst. Das Wilson-Intervall verwendet deshalb die Fragecluster; die Trial-Zahl bleibt deskriptiv.
                </p>
              </div>
            </>
          )}

          {paired.length > 0 && (
            <>
              <h2>Gepaarte Effektanalyse</h2>
              <div className="card table-wrap">
                <table><thead><tr><th>Vergleich</th><th className="num">Fragepaare</th><th className="num">Trialpaare</th><th className="num">Δ Genauigkeit</th><th className="num">nur Graph korrekt</th><th className="num">nur Vergleich korrekt</th><th className="num">McNemar p</th></tr></thead><tbody>{paired.map((row) => <tr key={`${row.a}-${row.b}`}><td>{CONDITION_INFO[row.a].short} vs. {CONDITION_INFO[row.b].short}</td><td className="num">{row.pairs}{row.excludedTies ? ` (+${row.excludedTies} Gleichstand)` : ''}</td><td className="num">{row.trialPairs}</td><td className="num"><strong>{row.delta >= 0 ? '+' : ''}{Math.round(row.delta * 100)} Prozentpunkte</strong></td><td className="num">{row.aOnlyCorrect}</td><td className="num">{row.bOnlyCorrect}</td><td className="num">{row.mcnemarExactP === null ? '–' : row.mcnemarExactP.toFixed(4)}</td></tr>)}</tbody></table>
                <p className="hint" style={{ margin: '10px 0 0' }}>
                  McNemar und Genauigkeitsdifferenz verwenden gepaarte Fragecluster, nicht die deterministisch wiederholten
                  Trialzeilen. Trialpaare sind nur deskriptiv beziehungsweise für Laufzeitvergleiche gedacht.
                </p>
              </div>
            </>
          )}

          <div className="grid cols-3">
            {agg.map((a) => {
              const clusters = clusterByCondition.get(a.condition)
              return <div className="card stat" key={a.condition}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="sw" style={{ width: 11, height: 11, borderRadius: 3, background: CONDITION_INFO[a.condition].color, display: 'inline-block' }} />
                  <strong>{CONDITION_INFO[a.condition].short}</strong>
                </div>
                <div className="num">{Math.round((clusters?.accuracy ?? 0) * 100)}%</div>
                <div className="cap">
                  Fragecluster ({clusters?.correct ?? 0}/{clusters?.n ?? 0}) · Trials deskriptiv ({a.korrekt}/{a.n}) · E2E p50/p95 {a.latencyN ? `${a.medianLatency}/${a.p95Latency} ms` : '–'} · ⌀ Kontext{' '}
                  {a.meanContext} Zeichen
                </div>
              </div>
            })}
          </div>

          <h2>Genauigkeit nach Fragetyp</h2>
          <div className="card" ref={chartRef}>
            <GroupedBars
              categories={categories.map((c) => CATEGORY_LABELS[c])}
              series={accByCat}
              yMax={1.02}
              format={(v) => `${Math.round(v * 100)}%`}
            />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
              <p className="hint" style={{ margin: 0, flex: 1, minWidth: 260 }}>
                Kategorien verwenden ebenfalls die Mehrheitsentscheidung je Fragecluster. Bei »Unbeantwortbar« zählt die
                korrekte Enthaltung als Treffer – das misst Halluzinationsresistenz.
              </p>
              <button
                className="btn sm"
                onClick={() => chartRef.current && exportChartPng(chartRef.current, 'genauigkeit-nach-fragetyp.png').catch(console.error)}
              >
                📸 Als PNG exportieren
              </button>
            </div>
          </div>

          <h2>Evidenz-Diagnostik: Retrieval- vs. Generierungs-Versagen</h2>
          <div className="grid cols-2">
            <div className="card">
              <h3>⌀ Evidenz-Recall (Gold-Pfad im Kontext)</h3>
              <HBar
                rows={agg
                  .filter((a) => a.meanEvidenceRecall !== null)
                  .map((a) => ({ label: CONDITION_INFO[a.condition].short, value: Math.round((a.meanEvidenceRecall ?? 0) * 100) }))}
                color="var(--cat-1)"
                format={(v) => `${v}%`}
              />
              <p className="hint" style={{ marginTop: 8 }}>
                Niedrig → das Retrieval findet die nötige Evidenz nicht (Pipeline-Problem).
              </p>
            </div>
            <div className="card">
              <h3>Genauigkeit bei vollständiger Evidenz</h3>
              <HBar
                rows={agg
                  .filter((a) => a.accGivenFullEvidence !== null)
                  .map((a) => ({ label: CONDITION_INFO[a.condition].short, value: Math.round((a.accGivenFullEvidence ?? 0) * 100) }))}
                color="var(--cat-2)"
                format={(v) => `${v}%`}
              />
              <p className="hint" style={{ marginTop: 8 }}>
                Niedrig trotz vorhandener Evidenz → das Modell nutzt den Kontext nicht (Kontexttreue-Problem kleiner
                Modelle, vgl. RQ4).
              </p>
            </div>
          </div>

          <h2>Ressourcen-Trade-off</h2>
          <div className="grid cols-2">
            <div className="card">
              <h3>End-to-End p50 (ms)</h3>
              <HBar
                rows={agg.map((a) => ({ label: CONDITION_INFO[a.condition].short, value: a.medianLatency }))}
                color="var(--cat-1)"
                format={(v) => `${v} ms`}
              />
              <p className="hint" style={{ marginTop: 8 }}>
                Vorbereitung/Retrieval plus Generierung. Migrierte Altdaten ohne E2E-Messung sind ausgeschlossen.
              </p>
            </div>
            <div className="card">
              <h3>End-to-End p95 (ms)</h3>
              <HBar
                rows={agg.map((a) => ({ label: CONDITION_INFO[a.condition].short, value: a.p95Latency }))}
                color="var(--cat-4)"
                format={(v) => `${v} ms`}
              />
              <p className="hint" style={{ marginTop: 8 }}>
                95. Perzentil nach Nearest Rank: 95 % der gemessenen End-to-End-Laufzeiten liegen höchstens hier.
              </p>
            </div>
            <div className="card">
              <h3>Median Generierung (ms)</h3>
              <HBar
                rows={agg.map((a) => ({ label: CONDITION_INFO[a.condition].short, value: a.medianGeneration }))}
                color="var(--cat-3)"
                format={(v) => `${v} ms`}
              />
              <p className="hint" style={{ marginTop: 8 }}>
                Reine Laufzeit des Modells; Vorbereitung und Retrieval sind hier nicht enthalten.
              </p>
            </div>
            <div className="card">
              <h3>⌀ Kontextgröße (Zeichen)</h3>
              <HBar
                rows={agg.map((a) => ({ label: CONDITION_INFO[a.condition].short, value: a.meanContext }))}
                color="var(--cat-2)"
                format={(v) => String(v)}
              />
              <p className="hint" style={{ marginTop: 8 }}>
                »Vektor+Budget« sollte hier ungefähr bei Graph-RAG liegen. Das reduziert den Einfluss unterschiedlicher
                Kontextmengen; die Repräsentation bleibt dennoch verschieden.
              </p>
            </div>
          </div>

          <h2>Antwortverhalten</h2>
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Bedingung</th>
                  <th className="num">n</th>
                  <th className="num">korrekt</th>
                  <th className="num">teilweise</th>
                  <th className="num">falsch</th>
                  <th className="num">Enthaltung</th>
                  <th className="num">⌀ Ev-Recall</th>
                  <th className="num">Acc | Evidenz</th>
                </tr>
              </thead>
              <tbody>
                {agg.map((a) => (
                  <tr key={a.condition}>
                    <td>{CONDITION_INFO[a.condition].label}</td>
                    <td className="num">{a.n}</td>
                    <td className="num">{a.korrekt}</td>
                    <td className="num">{a.teilweise}</td>
                    <td className="num">{a.falsch}</td>
                    <td className="num">{a.enthaltung}</td>
                    <td className="num">{a.meanEvidenceRecall === null ? '–' : `${Math.round(a.meanEvidenceRecall * 100)}%`}</td>
                    <td className="num">{a.accGivenFullEvidence === null ? '–' : `${Math.round(a.accGivenFullEvidence * 100)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {showTable && (
            <>
              <h2>Alle Messwerte</h2>
              <div className="card table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Run / Wdh.</th>
                      <th className="num">Reihenfolge</th>
                      <th>Frage</th>
                      <th>Bedingung</th>
                      <th>Retrieval</th>
                      <th>Engine</th>
                      <th>Score</th>
                      <th className="num">E2E</th>
                      <th className="num">Vorbereitung</th>
                      <th className="num">Retrieval</th>
                      <th className="num">Generierung</th>
                      <th className="num">Ev-Recall</th>
                      <th>Antwort</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.id}>
                        <td className="mono" style={{ fontSize: 11.5 }} title={`Seed ${r.seed ?? 'unbekannt'} · ${r.orderStrategy}`}>
                          {r.runId} / {r.repetition}
                        </td>
                        <td className="num">{r.order}</td>
                        <td>{r.questionId}</td>
                        <td>{CONDITION_INFO[r.condition].short}</td>
                        <td>{r.retrieval}</td>
                        <td className="mono" style={{ fontSize: 11.5 }}>{r.engine}</td>
                        <td>
                          <span className={`chip score-${effectiveScore(r)}`}>{effectiveScore(r)}</span>
                        </td>
                        <td className="num" title={r.latencyScope === 'end-to-end' ? 'End-to-End' : 'Altdatum: nur Generierung'}>
                          {r.latencyScope === 'end-to-end' ? `${r.latencyMs} ms` : '–'}
                        </td>
                        <td className="num">{r.prepareMs === null ? '–' : `${r.prepareMs} ms`}</td>
                        <td className="num">{r.retrievalMs === null ? '–' : `${r.retrievalMs} ms`}</td>
                        <td className="num">{r.generationMs} ms</td>
                        <td className="num">{r.evidenceRecall === null ? '–' : `${Math.round(r.evidenceRecall * 100)}%`}</td>
                        <td style={{ fontSize: 12.5, maxWidth: 340 }}>{r.answer}<details style={{ marginTop: 6 }}><summary className="hint" style={{ cursor: 'pointer' }}>Evidenz ansehen ({r.retrievedIds.length} Knoten)</summary><div className="hint" style={{ marginTop: 5 }}>{r.retrievedIds.map((id) => BASE_GRAPH.nodes.find((node) => node.id === id)?.title ?? id).join(' · ') || 'Kein Kontext abgerufen'}</div></details></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
