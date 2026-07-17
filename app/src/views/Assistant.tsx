import { useEffect, useMemo, useState } from 'react'
import type { AppCtx } from '../App'
import type { Condition, GraphEdge, GraphNode } from '../data/types'
import { BASE_GRAPH } from '../data/graph'
import { QUESTIONS } from '../data/questions'
import ForceGraph from '../components/ForceGraph'
import { dictate, speak, speaking, speechRecognitionAvailable, stopSpeaking, ttsAvailable } from '../components/speech'
import { ALL_CONDITIONS, CONDITION_INFO, ExperimentRunner, type PreparedTrial } from '../engine/experiment'
import { looksUncovered, researchQuestion, type ResearchProgress } from '../engine/research'

type Scope = 'basis' | 'erweitert'

export default function Assistant({ ctx }: { ctx: AppCtx }) {
  const [question, setQuestion] = useState('')
  const [condition, setCondition] = useState<Condition>('graph')
  const [scope, setScope] = useState<Scope>('erweitert')
  const [online, setOnline] = useState(false)
  const [answer, setAnswer] = useState<string | null>(null)
  const [prepared, setPrepared] = useState<PreparedTrial | null>(null)
  const [latency, setLatency] = useState<number | null>(null)
  const [charRate, setCharRate] = useState<number | null>(null)
  const [listening, setListening] = useState(false)
  const [reading, setReading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [researchProgress, setResearchProgress] = useState<ResearchProgress | null>(null)
  const [researchError, setResearchError] = useState<string | null>(null)
  // Recherche-Wissen der Sitzung – bewusst getrennt vom Basis-Korpus und
  // erst auf Klick dauerhaft ins Nutzerwissen übernommen.
  const [research, setResearch] = useState<{ nodes: GraphNode[]; edges: GraphEdge[]; sources: string[] }>({
    nodes: [],
    edges: [],
    sources: [],
  })

  useEffect(() => {
    if (!ctx.online) setOnline(false)
  }, [ctx.online])

  // Aktive Wissensbasis: Experiment-Korpus pur oder erweitert (inkl. eigenem
  // Wissen), jeweils plus das in dieser Sitzung recherchierte Wissen.
  const activeGraph = useMemo(() => {
    const base = scope === 'basis' ? BASE_GRAPH : ctx.graph
    if (research.nodes.length === 0) return base
    const ids = new Set(base.nodes.map((n) => n.id))
    return {
      nodes: [...base.nodes, ...research.nodes.filter((n) => !ids.has(n.id))],
      edges: [...base.edges, ...research.edges],
    }
  }, [scope, ctx.graph, research])

  const activeRunner = useMemo(() => new ExperimentRunner(activeGraph), [activeGraph])

  const subgraph = useMemo(() => {
    if (!prepared?.subgraph) return null
    const ids = new Set(prepared.subgraph.nodes)
    return {
      nodes: activeGraph.nodes.filter((n) => ids.has(n.id)),
      edges: activeGraph.edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
    }
  }, [prepared, activeGraph])

  async function ask(q?: string, forceResearch = false) {
    const text = (q ?? question).trim()
    if (!text || busy) return
    setBusy(true)
    setAnswer(null)
    setPrepared(null)
    setLatency(null)
    setResearchError(null)

    let graph = activeGraph
    let runner = activeRunner

    try {
      // Live-Recherche: nur wenn eingeschaltet, nicht in der Baseline (dort
      // gibt es per Definition keinen Kontext) und nur wenn das lokale Wissen
      // die Frage voraussichtlich nicht abdeckt – oder auf ausdrücklichen Wunsch.
      const wantResearch =
        ctx.online && online && condition !== 'baseline' && navigator.onLine !== false && (forceResearch || looksUncovered(text, graph))
      if (wantResearch) {
        try {
          const found = await researchQuestion(text, graph, {}, setResearchProgress)
          const merged = {
            nodes: [...research.nodes, ...found.nodes.filter((n) => !research.nodes.some((x) => x.id === n.id))],
            edges: [...research.edges, ...found.edges],
            sources: [...new Set([...research.sources, ...found.sources])],
          }
          setResearch(merged)
          const ids = new Set(graph.nodes.map((n) => n.id))
          graph = {
            nodes: [...graph.nodes, ...found.nodes.filter((n) => !ids.has(n.id))],
            edges: [...graph.edges, ...found.edges],
          }
          runner = new ExperimentRunner(graph)
        } catch (err) {
          setResearchError(err instanceof Error ? err.message : String(err))
        } finally {
          setResearchProgress(null)
        }
      }

      setAnswer('')
      setCharRate(null)
      const prep = await runner.prepare(text, condition, { retrieval: ctx.retrieval })
      setPrepared(prep)
      const t0 = performance.now()
      let firstToken = 0
      const res = await ctx.engine.generate(
        'Du bist ein präziser Wissensassistent auf einem Smartphone. Antworte auf Deutsch, in höchstens drei Sätzen. Wenn der Kontext die Antwort nicht enthält oder du sie nicht sicher weißt, sage ausdrücklich: »Dazu habe ich keine gesicherte Information.«',
        prep.userPrompt,
        (partial) => {
          if (!firstToken) firstToken = performance.now()
          setAnswer(partial)
        },
      )
      const t1 = performance.now()
      setAnswer(res.text)
      setLatency(Math.round(t1 - t0))
      // Live-»Tacho«: Zeichen/s der Generierungsphase (nur bei echtem Streaming aussagekräftig)
      if (firstToken && t1 - firstToken > 300 && res.text.length > 40) {
        setCharRate(Math.round(res.text.length / ((t1 - firstToken) / 1000)))
      }
    } catch (err) {
      setAnswer(`Fehler: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  async function startDictation() {
    if (listening || busy) return
    setListening(true)
    try {
      const { promise } = dictate((interim) => setQuestion(interim))
      const finalText = await promise
      setListening(false)
      if (finalText) {
        setQuestion(finalText)
        await ask(finalText)
      }
    } catch (err) {
      setListening(false)
      setResearchError(err instanceof Error ? err.message : String(err))
    }
  }

  function toggleReadAloud() {
    if (speaking()) {
      stopSpeaking()
      setReading(false)
      return
    }
    if (answer) {
      speak(answer)
      setReading(true)
      // Status zurücksetzen, sobald die Ausgabe endet
      const check = setInterval(() => {
        if (!speaking()) {
          setReading(false)
          clearInterval(check)
        }
      }, 400)
    }
  }

  function keepResearch() {
    if (research.nodes.length === 0) return
    const existing = new Set(ctx.custom.nodes.map((n) => n.id))
    ctx.setCustom({
      nodes: [...ctx.custom.nodes, ...research.nodes.filter((n) => !existing.has(n.id))],
      edges: [...ctx.custom.edges, ...research.edges],
    })
    setResearch({ nodes: [], edges: [], sources: [] })
    setScope('erweitert')
  }

  return (
    <div>
      <div className="eyebrow">Interaktiv</div>
      <h1>Wissensassistent</h1>
      <p className="lead">
        Stelle eine Frage und vergleiche live, was die drei Bedingungen aus demselben lokalen Modell herausholen. Der
        verwendete Kontext und (bei Graph-RAG) der extrahierte Subgraph werden vollständig offengelegt.
      </p>

      <div className="card">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <div className="seg">
            {ALL_CONDITIONS.map((c) => (
              <button key={c} className={condition === c ? 'on' : ''} onClick={() => setCondition(c)} title={CONDITION_INFO[c].label}>
                {CONDITION_INFO[c].short}
              </button>
            ))}
          </div>
          <span className="chip">Engine: {ctx.engine.label}</span>
          <span className="chip">Retrieval: {ctx.retrieval === 'dense' ? 'Dense' : 'TF-IDF'}</span>
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            Wissensbasis:
            <select value={scope} onChange={(e) => setScope(e.target.value as Scope)} style={{ width: 'auto', padding: '5px 8px', fontSize: 13 }}>
              <option value="erweitert">Erweitert (Korpus + eigenes Wissen)</option>
              <option value="basis">Nur Experiment-Korpus (eingefroren)</option>
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={online} disabled={!ctx.online} onChange={(e) => setOnline(e.target.checked)} />
            🌐 Live-Recherche: fehlendes Wissen bei Bedarf aus Wikipedia ziehen
          </label>
          <span className="chip">{activeGraph.nodes.length} Knoten aktiv</span>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="z. B. An welcher Universität lehrte der Verfasser der »Phänomenologie des Geistes« zuletzt?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ask()}
          />
          {speechRecognitionAvailable() && (
            <button
              className="btn"
              title="Frage diktieren"
              onClick={startDictation}
              disabled={busy}
              style={listening ? { borderColor: 'var(--accent)', color: 'var(--accent-deep)', animation: 'pulse-mic 1s infinite' } : undefined}
            >
              {listening ? '● hört zu …' : '🎙'}
            </button>
          )}
          <button className="btn primary" disabled={busy || !question.trim()} onClick={() => ask()}>
            {busy ? '…' : 'Fragen'}
          </button>
        </div>

        <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[QUESTIONS[10], QUESTIONS[21], QUESTIONS[23], QUESTIONS[35]].map((q) => (
            <button
              key={q.id}
              className="btn sm"
              onClick={() => {
                setQuestion(q.text)
                ask(q.text)
              }}
            >
              {q.text.length > 64 ? q.text.slice(0, 61) + '…' : q.text}
            </button>
          ))}
        </div>

        {researchProgress && (
          <div style={{ marginTop: 12 }}>
            <div className="progress">
              <div style={{ width: `${(researchProgress.done / Math.max(1, researchProgress.total)) * 100}%` }} />
            </div>
            <div className="hint" style={{ marginTop: 4 }}>
              🌐 {researchProgress.step}
            </div>
          </div>
        )}
        {researchError && (
          <div className="callout" style={{ marginTop: 12, borderColor: 'var(--bad)' }}>
            Live-Recherche fehlgeschlagen: {researchError} – beantwortet wird mit dem lokalen Wissen.
          </div>
        )}
      </div>

      {research.sources.length > 0 && (
        <div className="card" style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h3 style={{ margin: 0 }}>🌐 Recherchiertes Wissen (nur diese Sitzung)</h3>
            <div className="hint" style={{ marginTop: 4 }}>
              {research.nodes.length} Artikel aus Wikipedia: {research.sources.join(' · ')}
            </div>
          </div>
          <button className="btn sm primary" onClick={keepResearch}>
            Dauerhaft behalten
          </button>
          <button className="btn sm" onClick={() => setResearch({ nodes: [], edges: [], sources: [] })}>
            Verwerfen
          </button>
        </div>
      )}

      {answer !== null && (
        <div className="card" style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <h3>Antwort · {CONDITION_INFO[condition].label}</h3>
            {latency !== null && (
              <span className="chip">
                ⏱ {latency} ms · Kontext {prepared?.context.length ?? 0} Zeichen
                {charRate !== null && ` · ⚡ ${charRate} Z./s`}
              </span>
            )}
          </div>
          <div className="answer-block">{answer || '…'}</div>

          {!busy && answer && ttsAvailable() && (
            <div style={{ marginTop: 10 }}>
              <button className="btn sm" onClick={toggleReadAloud}>
                {reading ? '◼ Stopp' : '🔊 Vorlesen'}
              </button>
            </div>
          )}

          {!busy && ctx.online && online && condition !== 'baseline' && (
            <div style={{ marginTop: 10 }}>
              <button className="btn sm" onClick={() => ask(undefined, true)}>
                🌐 Trotzdem recherchieren & erneut antworten
              </button>
            </div>
          )}

          {prepared && prepared.condition !== 'baseline' && (
            <details>
              <summary>Verwendeter Kontext anzeigen ({prepared.retrievedIds.length} Quellen)</summary>
              <div className="ctx-block">{prepared.context}</div>
            </details>
          )}

          {subgraph && subgraph.nodes.length > 0 && (
            <>
              <h3 style={{ marginTop: 14 }}>Extrahierter Subgraph</h3>
              <div style={{ border: '1px solid var(--line)', borderRadius: 10 }}>
                <ForceGraph graph={subgraph} height={280} pulse={busy} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
