import { useEffect, useMemo, useRef, useState } from 'react'
import type { KnowledgeGraph, RetrievalMode, TrialResult } from './data/types'
import { BASE_GRAPH } from './data/graph'
import { ExperimentRunner } from './engine/experiment'
import { ExtractiveEngine, WebLLMEngine, type LLMEngine } from './engine/llm'
import { setEmbeddingNetworkEnabled } from './engine/embeddings'
import {
  loadCustomKnowledge,
  loadResults,
  mergedGraph,
  saveCustomKnowledge,
  saveResults,
  type CustomKnowledge,
} from './engine/store'
import Overview from './views/Overview'
import Explorer from './views/Explorer'
import Assistant from './views/Assistant'
import Experiment from './views/Experiment'
import Rate from './views/Rate'
import Results from './views/Results'
import Models from './views/Models'
import Knowledge from './views/Knowledge'
import Quiz from './views/Quiz'
import LiveQuiz from './views/LiveQuiz'
import QrOverlay from './components/QrOverlay'

export type ViewId =
  | 'overview'
  | 'explorer'
  | 'assistant'
  | 'experiment'
  | 'rate'
  | 'results'
  | 'models'
  | 'knowledge'
  | 'quiz'
  | 'livequiz'

export interface ExperimentStatus {
  state: 'idle' | 'running' | 'cancelled' | 'completed'
  done: number
  total: number
  label: string
  runId: string | null
}

const ONLINE_MODE_KEY = 'graphrag-online-mode'

const NAV: { id: ViewId; label: string; ico: string }[] = [
  { id: 'overview', label: 'Übersicht', ico: '◈' },
  { id: 'explorer', label: 'Graph-Explorer', ico: '🕸' },
  { id: 'assistant', label: 'Assistent', ico: '💬' },
  { id: 'experiment', label: 'Experiment', ico: '🧪' },
  { id: 'rate', label: 'Bewerten', ico: '⚖' },
  { id: 'results', label: 'Ergebnisse', ico: '📊' },
  { id: 'quiz', label: 'Pfad-Quiz', ico: '🧩' },
  { id: 'livequiz', label: 'Live-Quiz', ico: '🎙' },
  { id: 'models', label: 'Modelle', ico: '⚙' },
  { id: 'knowledge', label: 'Wissen füttern', ico: '📥' },
]

export interface AppCtx {
  graph: KnowledgeGraph
  /** Runner über Basis- + Nutzerwissen (Assistent, Explorer) */
  runner: ExperimentRunner
  /** Runner ausschließlich über dem eingefrorenen Experiment-Korpus (Messläufe) */
  baseRunner: ExperimentRunner
  engine: LLMEngine
  setEngine: (e: LLMEngine) => void
  retrieval: RetrievalMode
  setRetrieval: (m: RetrievalMode) => void
  results: TrialResult[]
  setResults: (r: TrialResult[]) => void
  custom: CustomKnowledge
  setCustom: (c: CustomKnowledge) => void
  webgpu: boolean
  /** Schaltet bewusst alle netzwerkgebundenen Komfortfunktionen frei oder zu. */
  online: boolean
  setOnline: (online: boolean) => void
  experimentStatus: ExperimentStatus
  beginExperiment: (runId: string, total: number) => void
  updateExperiment: (done: number, label: string) => void
  finishExperiment: (state: 'cancelled' | 'completed') => void
  cancelExperiment: () => void
  experimentCancelled: () => boolean
  go: (v: ViewId) => void
}

export default function App() {
  const [view, setView] = useState<ViewId>(() =>
    new URLSearchParams(window.location.search).has('live') ? 'livequiz' : 'overview',
  )
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  )
  const [custom, setCustomState] = useState<CustomKnowledge>(() => loadCustomKnowledge())
  const [results, setResultsState] = useState<TrialResult[]>(() => loadResults())
  const [engine, setEngine] = useState<LLMEngine>(() => new ExtractiveEngine())
  const [retrieval, setRetrieval] = useState<RetrievalMode>('tfidf')
  const [showQr, setShowQr] = useState(false)
  const [online, setOnline] = useState(() => localStorage.getItem(ONLINE_MODE_KEY) === 'online')
  const [experimentStatus, setExperimentStatus] = useState<ExperimentStatus>({ state: 'idle', done: 0, total: 0, label: '', runId: null })
  const experimentCancelRef = useRef(false)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    localStorage.setItem(ONLINE_MODE_KEY, online ? 'online' : 'offline')
    setEmbeddingNetworkEnabled(online)
  }, [online])

  const graph = useMemo(() => mergedGraph(custom), [custom])
  const runner = useMemo(() => new ExperimentRunner(graph), [graph])
  // Messläufe laufen IMMER auf dem eingefrorenen Basis-Korpus – Nutzer- und
  // Recherche-Wissen kann die Experimente nicht kontaminieren.
  const baseRunner = useMemo(() => new ExperimentRunner(BASE_GRAPH), [])
  const webgpu = useRef(WebLLMEngine.supported()).current

  const ctx: AppCtx = {
    graph,
    runner,
    baseRunner,
    engine,
    setEngine,
    retrieval,
    setRetrieval,
    results,
    setResults: (r) => {
      setResultsState(r)
      saveResults(r)
    },
    custom,
    setCustom: (c) => {
      setCustomState(c)
      saveCustomKnowledge(c)
    },
    webgpu,
    online,
    setOnline,
    experimentStatus,
    beginExperiment: (runId, total) => {
      experimentCancelRef.current = false
      setExperimentStatus({ state: 'running', done: 0, total, label: 'Starte …', runId })
    },
    updateExperiment: (done, label) => setExperimentStatus((current) => ({ ...current, done, label })),
    finishExperiment: (state) => setExperimentStatus((current) => ({ ...current, state, label: state === 'completed' ? 'Abgeschlossen' : 'Abgebrochen' })),
    cancelExperiment: () => {
      experimentCancelRef.current = true
      setExperimentStatus((current) => current.state === 'running' ? { ...current, label: 'Abbruch nach aktuellem Trial …' } : current)
    },
    experimentCancelled: () => experimentCancelRef.current,
    go: setView,
  }

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand">
          Graph-<em>RAG</em> Lab
        </div>
        <div className="brand-sub">Kuratierter Wissensgraph · On-Device-Experiment</div>
        {NAV.map((n) => (
          <button key={n.id} className={`nav-item ${view === n.id ? 'active' : ''}`} onClick={() => setView(n.id)}>
            <span className="ico">{n.ico}</span>
            {n.label}
          </button>
        ))}
        {experimentStatus.state === 'running' && (
          <div className="callout" style={{ margin: '8px 10px 0', padding: '8px 10px', fontSize: 12 }}>
            <strong>Messlauf läuft</strong><br />
            {experimentStatus.done}/{experimentStatus.total} · {experimentStatus.label}
            <button className="btn sm" onClick={() => ctx.cancelExperiment()} style={{ marginTop: 6 }}>Abbrechen</button>
          </div>
        )}
        <div className="sidebar-foot">
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn sm" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? '☀ Hell' : '☾ Dunkel'}
            </button>
            <button className="btn sm" title="App-Link als QR-Code teilen" onClick={() => setShowQr(true)}>
              📱 QR
            </button>
            <button
              className="btn sm"
              title={online ? 'Online-Modus: Downloads und Wikipedia-Recherche erlaubt' : 'Offline-Modus: kein Nachladen und keine Live-Recherche'}
              onClick={() => setOnline(!online)}
            >
              {online ? '🌐 Online' : '✈ Offline'}
            </button>
          </div>
          <div style={{ marginTop: 10 }}>
            Proseminar SoSe 2026
            <br />
            TU Dortmund · S. Y. Adigüzel
          </div>
        </div>
      </nav>
      <main className="main">
        {view === 'overview' && <Overview ctx={ctx} />}
        {view === 'explorer' && <Explorer ctx={ctx} />}
        {view === 'assistant' && <Assistant ctx={ctx} />}
        {view === 'experiment' && <Experiment ctx={ctx} />}
        {view === 'rate' && <Rate ctx={ctx} />}
        {view === 'results' && <Results ctx={ctx} />}
        {view === 'quiz' && <Quiz ctx={ctx} />}
        {view === 'livequiz' && <LiveQuiz />}
        {view === 'models' && <Models ctx={ctx} />}
        {view === 'knowledge' && <Knowledge ctx={ctx} />}
      </main>
      {showQr && <QrOverlay onClose={() => setShowQr(false)} />}
    </div>
  )
}
