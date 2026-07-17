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
import Conversation from './views/Conversation'
import OfflinePresentation from './views/OfflinePresentation'
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
  | 'chat'
  | 'offline'
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

type AppMode = 'product' | 'study'

const ONLINE_MODE_KEY = 'graphrag-online-mode'
const APP_MODE_KEY = 'graphrag-app-mode'
const PREFERRED_MODEL_KEY = 'graphrag-preferred-model'

const PRODUCT_NAV: { id: ViewId; label: string; ico: string }[] = [
  { id: 'chat', label: 'Gespräch', ico: '✦' },
  { id: 'explorer', label: 'Wissensraum', ico: '⌘' },
  { id: 'offline', label: 'Vortragscheck', ico: '✓' },
]

const STUDY_NAV: { id: ViewId; label: string; ico: string }[] = [
  { id: 'chat', label: 'Produkt-Chat', ico: '✦' },
  { id: 'overview', label: 'Übersicht', ico: '◈' },
  { id: 'explorer', label: 'Graph-Explorer', ico: '⌘' },
  { id: 'assistant', label: 'Bedingungen testen', ico: '◫' },
  { id: 'experiment', label: 'Experiment', ico: '△' },
  { id: 'rate', label: 'Bewerten', ico: '⚖' },
  { id: 'results', label: 'Ergebnisse', ico: '▥' },
  { id: 'models', label: 'Modelle', ico: '⚙' },
  { id: 'knowledge', label: 'Wissen einpflegen', ico: '＋' },
  { id: 'quiz', label: 'Pfad-Quiz', ico: '◇' },
  { id: 'livequiz', label: 'Live-Quiz', ico: '◎' },
  { id: 'offline', label: 'Vortragscheck', ico: '✓' },
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
  const liveQuiz = new URLSearchParams(window.location.search).has('live')
  const [view, setView] = useState<ViewId>(() => (liveQuiz ? 'livequiz' : 'chat'))
  const [appMode, setAppMode] = useState<AppMode>(() =>
    liveQuiz || sessionStorage.getItem(APP_MODE_KEY) === 'study' ? 'study' : 'product',
  )
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  )
  const [custom, setCustomState] = useState<CustomKnowledge>(() => loadCustomKnowledge())
  const [results, setResultsState] = useState<TrialResult[]>(() => loadResults())
  const [engine, setEngineState] = useState<LLMEngine>(() => new ExtractiveEngine())
  const [engineRestore, setEngineRestore] = useState<{ state: 'idle' | 'loading' | 'error'; text: string }>({
    state: 'idle',
    text: '',
  })
  const [retrieval, setRetrieval] = useState<RetrievalMode>('tfidf')
  const [showQr, setShowQr] = useState(false)
  const [online, setOnline] = useState(() => localStorage.getItem(ONLINE_MODE_KEY) === 'online')
  const [experimentStatus, setExperimentStatus] = useState<ExperimentStatus>({
    state: 'idle',
    done: 0,
    total: 0,
    label: '',
    runId: null,
  })
  const experimentCancelRef = useRef(false)
  const restoreStartedRef = useRef(false)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    localStorage.setItem(ONLINE_MODE_KEY, online ? 'online' : 'offline')
    setEmbeddingNetworkEnabled(online)
  }, [online])

  useEffect(() => {
    sessionStorage.setItem(APP_MODE_KEY, appMode)
  }, [appMode])

  const graph = useMemo(() => mergedGraph(custom), [custom])
  const runner = useMemo(() => new ExperimentRunner(graph), [graph])
  // Messläufe laufen IMMER auf dem eingefrorenen Basis-Korpus – Nutzer- und
  // Recherche-Wissen kann die Experimente nicht kontaminieren.
  const baseRunner = useMemo(() => new ExperimentRunner(BASE_GRAPH), [])
  const webgpu = useRef(WebLLMEngine.supported()).current

  // Ein bereits vollständig bereitgestelltes Modell wird beim festen
  // Vortrags-Launcher automatisch aus dem Browser-Cache wiederhergestellt.
  useEffect(() => {
    if (restoreStartedRef.current || !webgpu) return
    restoreStartedRef.current = true
    const modelId = localStorage.getItem(PREFERRED_MODEL_KEY)
    if (!modelId) return

    void (async () => {
      try {
        if (!(await WebLLMEngine.isCached(modelId))) return
        setEngineRestore({ state: 'loading', text: 'Lokales Sprachmodell wird aus dem Cache geladen …' })
        const restored = new WebLLMEngine(modelId)
        await restored.load((text, pct) =>
          setEngineRestore({
            state: 'loading',
            text: `${text}${pct > 0 ? ` · ${Math.round(pct * 100)} %` : ''}`,
          }),
        )
        setEngineState(restored)
        setEngineRestore({ state: 'idle', text: '' })
      } catch (err) {
        setEngineRestore({
          state: 'error',
          text: `Das vorbereitete Modell konnte nicht automatisch geladen werden: ${err instanceof Error ? err.message : String(err)}`,
        })
      }
    })()
  }, [webgpu])

  function switchMode(next: AppMode) {
    setAppMode(next)
    if (next === 'product' && !PRODUCT_NAV.some((item) => item.id === view)) setView('chat')
  }

  const nav = appMode === 'product' ? PRODUCT_NAV : STUDY_NAV
  const ctx: AppCtx = {
    graph,
    runner,
    baseRunner,
    engine,
    setEngine: (next) => {
      setEngineState(next)
      if (next.id !== 'extractive') localStorage.setItem(PREFERRED_MODEL_KEY, next.id)
    },
    retrieval,
    setRetrieval,
    results,
    setResults: (next) => {
      setResultsState(next)
      saveResults(next)
    },
    custom,
    setCustom: (next) => {
      setCustomState(next)
      saveCustomKnowledge(next)
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
    finishExperiment: (state) =>
      setExperimentStatus((current) => ({
        ...current,
        state,
        label: state === 'completed' ? 'Abgeschlossen' : 'Abgebrochen',
      })),
    cancelExperiment: () => {
      experimentCancelRef.current = true
      setExperimentStatus((current) =>
        current.state === 'running' ? { ...current, label: 'Abbruch nach aktuellem Trial …' } : current,
      )
    },
    experimentCancelled: () => experimentCancelRef.current,
    go: setView,
  }

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand"><em>Fable</em></div>
        <div className="brand-sub">
          {appMode === 'product'
            ? 'Wissen im Zusammenhang · lokal erklärt'
            : 'Graph-RAG · wissenschaftlicher Studienmodus'}
        </div>
        {nav.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${view === item.id ? 'active' : ''}`}
            onClick={() => setView(item.id)}
          >
            <span className="ico">{item.ico}</span>
            {item.label}
          </button>
        ))}
        {experimentStatus.state === 'running' && (
          <div className="callout experiment-running">
            <strong>Messlauf läuft</strong><br />
            {experimentStatus.done}/{experimentStatus.total} · {experimentStatus.label}
            <button className="btn sm" onClick={() => ctx.cancelExperiment()}>Abbrechen</button>
          </div>
        )}
        <div className="sidebar-foot">
          <div className="sidebar-actions">
            <button className="btn sm" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? '☀ Hell' : '☾ Dunkel'}
            </button>
            <button className="btn sm" title="App-Link als QR-Code teilen" onClick={() => setShowQr(true)}>QR</button>
            <button
              className={`btn sm ${online ? 'online-active' : ''}`}
              title={
                online
                  ? 'Online: Downloads und Wikipedia-Recherche erlaubt'
                  : 'Offline: kein Nachladen und keine Live-Recherche'
              }
              onClick={() => setOnline(!online)}
            >
              {online ? '● Online' : '○ Offline'}
            </button>
          </div>
          <button
            className="mode-switch"
            onClick={() => switchMode(appMode === 'product' ? 'study' : 'product')}
            title={
              appMode === 'product'
                ? 'Experiment, Bewertung und technische Werkzeuge öffnen'
                : 'Zur reduzierten Vortrags-App wechseln'
            }
          >
            <span>{appMode === 'product' ? 'Studienmodus öffnen' : 'Zur Vortrags-App'}</span>
            <small>{appMode === 'product' ? 'Methodik & Werkzeuge' : 'Nur das fertige Produkt'}</small>
          </button>
          <div className="seminar-meta">
            Proseminar SoSe 2026<br />
            TU Dortmund · S. Y. Adigüzel
          </div>
        </div>
      </nav>

      <main className="main">
        {engineRestore.state !== 'idle' && (
          <div className={`restore-banner ${engineRestore.state}`} role="status">
            <span className="restore-dot" />
            <span>{engineRestore.text}</span>
            {engineRestore.state === 'error' && (
              <button className="btn sm" onClick={() => setView('models')}>Modelle öffnen</button>
            )}
          </div>
        )}
        <div hidden={view !== 'chat'}><Conversation ctx={ctx} /></div>
        {view === 'offline' && <OfflinePresentation ctx={ctx} />}
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
