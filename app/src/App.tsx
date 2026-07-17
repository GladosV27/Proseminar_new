import { useEffect, useMemo, useRef, useState } from 'react'
import type { KnowledgeGraph, RetrievalMode, TrialResult } from './data/types'
import { BASE_GRAPH } from './data/graph'
import { ExperimentRunner } from './engine/experiment'
import { ExtractiveEngine, WasmLLMEngine, WebLLMEngine, type LLMEngine } from './engine/llm'
import { setEmbeddingNetworkEnabled } from './engine/embeddings'
import { SeminarOnlineEngine, seminarOnlineConfigured, seminarRoomCode } from './engine/seminarOnline'
import {
  loadCustomKnowledge,
  loadDurableState,
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
import PersonalKnowledge from './views/PersonalKnowledge'
import Quiz from './views/Quiz'
import LiveQuiz from './views/LiveQuiz'
import Arena from './views/Arena'
import CollaborativeGraph from './views/CollaborativeGraph'
import QrOverlay from './components/QrOverlay'

export type ViewId =
  | 'chat'
  | 'offline'
  | 'overview'
  | 'explorer'
  | 'assistant'
  | 'arena'
  | 'collab'
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

export interface BackgroundTaskStatus {
  state: 'idle' | 'running' | 'completed' | 'error'
  label: string
  done: number
  total: number
}

type AppMode = 'product' | 'study'

const ONLINE_MODE_KEY = 'graphrag-online-mode'
const APP_MODE_KEY = 'graphrag-app-mode'
const PREFERRED_MODEL_KEY = 'graphrag-preferred-model'

const PRODUCT_NAV: { id: ViewId; label: string; ico: string }[] = [
  { id: 'chat', label: 'Gespräch', ico: '✦' },
  { id: 'knowledge', label: 'Eigenes Wissen', ico: '＋' },
  { id: 'explorer', label: 'Wissensraum', ico: '⌘' },
  { id: 'offline', label: 'Vortragscheck', ico: '✓' },
]

const STUDY_NAV: { id: ViewId; label: string; ico: string }[] = [
  { id: 'chat', label: 'Produkt-Chat', ico: '✦' },
  { id: 'overview', label: 'Übersicht', ico: '◈' },
  { id: 'explorer', label: 'Graph-Explorer', ico: '⌘' },
  { id: 'assistant', label: 'Bedingungen testen', ico: '◫' },
  { id: 'arena', label: 'Live-Arena', ico: '⚔' },
  { id: 'collab', label: 'Seminargraph', ico: '◎' },
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
  backgroundTask: BackgroundTaskStatus
  updateBackgroundTask: (task: BackgroundTaskStatus) => void
  go: (v: ViewId) => void
}

export default function App() {
  const initialParams = new URLSearchParams(window.location.search)
  const liveQuiz = initialParams.has('live')
  const collaborativeRoom = initialParams.has('graphroom')
  const [seminarRoom] = useState(() => seminarRoomCode())
  const seminarOnline = seminarOnlineConfigured(seminarRoom)
  const [view, setView] = useState<ViewId>(() => (liveQuiz ? 'livequiz' : collaborativeRoom ? 'collab' : 'chat'))
  // Der Fokusmodus folgt der aktuellen Ansicht, nicht dem nur beim Start
  // gelesenen Query-Parameter. Sonst bliebe ein QR-Gast nach dem Verlassen
  // bis zum nächsten Reload ohne Seitennavigation gefangen.
  const sharedSession = view === 'livequiz' || (collaborativeRoom && view === 'collab')
  const [appMode, setAppMode] = useState<AppMode>(() =>
    liveQuiz || collaborativeRoom || sessionStorage.getItem(APP_MODE_KEY) === 'study' ? 'study' : 'product',
  )
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  )
  const [custom, setCustomState] = useState<CustomKnowledge>(() => loadCustomKnowledge())
  const [results, setResultsState] = useState<TrialResult[]>(() => loadResults())
  const [engine, setEngineState] = useState<LLMEngine>(() =>
    seminarOnline && seminarRoom ? new SeminarOnlineEngine(seminarRoom) : new ExtractiveEngine(),
  )
  const [engineRestore, setEngineRestore] = useState<{ state: 'idle' | 'loading' | 'error'; text: string }>({
    state: 'idle',
    text: '',
  })
  const [retrieval, setRetrieval] = useState<RetrievalMode>('tfidf')
  const [showQr, setShowQr] = useState(false)
  const [online, setOnline] = useState(() =>
    seminarOnline || localStorage.getItem(ONLINE_MODE_KEY) === 'online',
  )
  const [experimentStatus, setExperimentStatus] = useState<ExperimentStatus>({
    state: 'idle',
    done: 0,
    total: 0,
    label: '',
    runId: null,
  })
  const [backgroundTask, setBackgroundTask] = useState<BackgroundTaskStatus>({
    state: 'idle', label: '', done: 0, total: 0,
  })
  const experimentCancelRef = useRef(false)
  const restoreStartedRef = useRef(false)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    let cancelled = false
    void loadDurableState().then((state) => {
      if (cancelled) return
      if (state.custom) setCustomState(state.custom)
      if (state.results) setResultsState(state.results)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    // Der zeitlich begrenzte QR-Modus darf die dauerhafte Offline-Präferenz
    // dieses Browserprofils nicht unbemerkt überschreiben.
    if (!seminarOnline) localStorage.setItem(ONLINE_MODE_KEY, online ? 'online' : 'offline')
    setEmbeddingNetworkEnabled(online)
  }, [online, seminarOnline])

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
    if (restoreStartedRef.current || seminarOnline) return
    restoreStartedRef.current = true
    const modelId = localStorage.getItem(PREFERRED_MODEL_KEY)
    if (!modelId) return

    void (async () => {
      try {
        const cpuModel = modelId.startsWith('wllama:')
        if (cpuModel) {
          if (!WasmLLMEngine.supported() || !(await WasmLLMEngine.isCached(modelId))) return
        } else {
          if (!webgpu || !(await WebLLMEngine.isCached(modelId))) return
        }
        setEngineRestore({ state: 'loading', text: 'Lokales Sprachmodell wird aus dem Cache geladen …' })
        const restored = cpuModel ? new WasmLLMEngine(modelId) : new WebLLMEngine(modelId)
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
  }, [seminarOnline, webgpu])

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
      if (engine.id !== next.id) void engine.dispose?.()
      setEngineState(next)
      if (next.id !== 'extractive' && next.id !== 'seminar-online') {
        localStorage.setItem(PREFERRED_MODEL_KEY, next.id)
      }
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
      // Erst persistent speichern: Bei vollem Browser-Speicher darf die UI
      // keinen erfolgreichen Import vortäuschen, der nach Reload verloren ist.
      const persisted = saveCustomKnowledge(next)
      setCustomState(persisted)
    },
    webgpu,
    online,
    setOnline: (next) => setOnline(seminarOnline ? true : next),
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
    backgroundTask,
    updateBackgroundTask: setBackgroundTask,
    go: setView,
  }

  function exitLiveQuiz() {
    const url = new URL(window.location.href)
    url.searchParams.delete('live')
    window.history.replaceState({}, '', url)
    setView('chat')
  }

  return (
    <div className={`app${sharedSession ? ' shared-session-app' : ''}`}>
      {!sharedSession && <nav className="sidebar">
        <div className="brand"><em>Noesis</em></div>
        <div className="brand-sub">
          {appMode === 'product'
            ? 'Wissen im Zusammenhang · transparent erklärt'
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
        {backgroundTask.state === 'running' && (
          <div className="callout background-task-running" role="status">
            <strong>Hintergrundaufgabe</strong><br />
            {backgroundTask.label}
            {backgroundTask.total > 0 && (
              <div className="progress"><div style={{ width: `${Math.min(100, backgroundTask.done / backgroundTask.total * 100)}%` }} /></div>
            )}
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
                seminarOnline
                  ? 'QR-Seminarmodus: Antworten kommen vom gemeinsamen Online-Modell; Import und Retrieval bleiben lokal.'
                  : online
                    ? 'Online: Downloads und Wikipedia-Recherche erlaubt'
                    : 'Offline: Noesis lädt nichts nach; der möglicherweise online arbeitende Browser-Sprachdienst bleibt gesperrt'
              }
              onClick={() => {
                if (!seminarOnline) setOnline(!online)
              }}
              aria-disabled={seminarOnline}
            >
              {seminarOnline ? '● Seminar online' : online ? '● Online' : '○ Offline'}
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
      </nav>}

      <main className={`main${sharedSession ? ' shared-session-main' : ''}`}>
        {engineRestore.state !== 'idle' && (
          <div className={`restore-banner ${engineRestore.state}`} role="status">
            <span className="restore-dot" />
            <span>{engineRestore.text}</span>
            {engineRestore.state === 'error' && (
              <button className="btn sm" onClick={() => setView('models')}>Modelle öffnen</button>
            )}
          </div>
        )}
        <div hidden={view !== 'chat'}><Conversation ctx={ctx} active={view === 'chat'} /></div>
        {view === 'offline' && <OfflinePresentation ctx={ctx} />}
        {view === 'overview' && <Overview ctx={ctx} />}
        {view === 'explorer' && <Explorer ctx={ctx} />}
        {view === 'assistant' && <Assistant ctx={ctx} />}
        {view === 'arena' && <Arena ctx={ctx} />}
        {view === 'collab' && <CollaborativeGraph ctx={ctx} />}
        {view === 'experiment' && <Experiment ctx={ctx} />}
        {view === 'rate' && <Rate ctx={ctx} />}
        {view === 'results' && <Results ctx={ctx} />}
        {view === 'quiz' && <Quiz ctx={ctx} />}
        {view === 'livequiz' && <LiveQuiz onExit={exitLiveQuiz} />}
        {view === 'models' && <Models ctx={ctx} />}
        {view === 'knowledge' && (appMode === 'product' ? <PersonalKnowledge ctx={ctx} /> : <Knowledge ctx={ctx} />)}
      </main>
      {showQr && <QrOverlay onClose={() => setShowQr(false)} />}
    </div>
  )
}
