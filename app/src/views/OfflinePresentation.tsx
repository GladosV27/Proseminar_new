import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppCtx } from '../App'
import { WASM_LLM_MODELS, WasmLLMEngine, WEBLLM_MODELS, WebLLMEngine } from '../engine/llm'
import { NATIVE_LLM_MODELS, NativeLlmEngine } from '../engine/nativeLlm'

interface ShellStatus {
  buildId: string
  cached: number
  total: number
  missing: string[]
}

interface StorageStatus {
  persisted: boolean | null
  usage: number | null
  quota: number | null
}

type CheckState = 'checking' | 'ready' | 'warning' | 'missing'

function formatBytes(value: number | null): string {
  if (value === null) return 'unbekannt'
  if (value < 1024 ** 2) return `${Math.round(value / 1024)} KB`
  if (value < 1024 ** 3) return `${Math.round(value / 1024 ** 2)} MB`
  return `${(value / 1024 ** 3).toFixed(1).replace('.', ',')} GB`
}

async function getShellStatus(): Promise<ShellStatus | null> {
  if (!('serviceWorker' in navigator)) return null
  const registration = await Promise.race<ServiceWorkerRegistration | null>([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 3500)),
  ])
  if (!registration) return null
  const worker = navigator.serviceWorker.controller ?? registration.active
  if (!worker) return null

  return new Promise((resolve) => {
    const channel = new MessageChannel()
    const timer = window.setTimeout(() => resolve(null), 2500)
    channel.port1.onmessage = (event: MessageEvent) => {
      window.clearTimeout(timer)
      const data = event.data
      if (data?.type !== 'OFFLINE_STATUS') return resolve(null)
      resolve({
        buildId: String(data.buildId ?? 'unbekannt'),
        cached: Number(data.cached ?? 0),
        total: Number(data.total ?? 0),
        missing: Array.isArray(data.missing) ? data.missing.map(String) : [],
      })
    }
    worker.postMessage({ type: 'GET_OFFLINE_STATUS' }, [channel.port2])
  })
}

async function getStorageStatus(): Promise<StorageStatus> {
  const [persisted, estimate]: [boolean | null, StorageEstimate] = await Promise.all([
    navigator.storage?.persisted?.().catch(() => false) ?? Promise.resolve(null),
    navigator.storage?.estimate?.().catch(() => ({} as StorageEstimate)) ?? Promise.resolve({} as StorageEstimate),
  ])
  return {
    persisted,
    usage: typeof estimate.usage === 'number' ? estimate.usage : null,
    quota: typeof estimate.quota === 'number' ? estimate.quota : null,
  }
}

export default function OfflinePresentation({ ctx }: { ctx: AppCtx }) {
  const [shell, setShell] = useState<ShellStatus | null>(null)
  const [storage, setStorage] = useState<StorageStatus>({ persisted: null, usage: null, quota: null })
  const [cachedModels, setCachedModels] = useState<string[]>([])
  const [checking, setChecking] = useState(true)
  const [smoke, setSmoke] = useState<{ state: 'idle' | 'running' | 'passed' | 'failed'; text: string }>({
    state: 'idle',
    text: '',
  })
  const [demoStep, setDemoStep] = useState(0)

  const demoSteps = [
    { label: '1 · Wissen ergänzen', view: 'chat' as const, prefill: 'Füge Simone de Beauvoir in deinen Wissensbaum hinzu' },
    { label: '2 · Zusammenhang fragen', view: 'chat' as const, prefill: 'Wie hängen Simone de Beauvoir und Jean-Paul Sartre zusammen?' },
    { label: '3 · Graph zeigen', view: 'explorer' as const },
    { label: '4 · Verfahren vergleichen', view: 'arena' as const },
    { label: '5 · Ergebnisse einordnen', view: 'results' as const },
  ]

  function openDemoStep(index: number) {
    const step = demoSteps[index]
    setDemoStep(index)
    if (step.prefill) sessionStorage.setItem('noesis.chat.prefill.v1', step.prefill)
    ctx.go(step.view)
  }

  const refresh = useCallback(async () => {
    setChecking(true)
    const [nextShell, nextStorage, cacheChecks] = await Promise.all([
      import.meta.env.PROD ? getShellStatus().catch(() => null) : Promise.resolve(null),
      getStorageStatus(),
      Promise.all(
        [...WEBLLM_MODELS, ...WASM_LLM_MODELS, ...NATIVE_LLM_MODELS].map(async (model) => ({
          id: model.id,
          cached: await (NATIVE_LLM_MODELS.some((native) => native.id === model.id)
            ? NativeLlmEngine.isDownloaded(model.id)
            : model.id.startsWith('wllama:')
              ? WasmLLMEngine.isCached(model.id)
              : WebLLMEngine.isCached(model.id)).catch(() => false),
        })),
      ),
    ])
    setShell(nextShell)
    setStorage(nextStorage)
    setCachedModels(cacheChecks.filter((item) => item.cached).map((item) => item.id))
    setChecking(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const activeModel = [...WEBLLM_MODELS, ...WASM_LLM_MODELS, ...NATIVE_LLM_MODELS].find((model) =>
    model.id === ctx.engine.id || `native:${model.id}` === ctx.engine.id,
  )
  const nativePlatform = NativeLlmEngine.supported()
  const activeCpuModel = nativePlatform && ctx.engine.id.startsWith('native:')
    || WASM_LLM_MODELS.some((model) => model.id === ctx.engine.id)
  const fixedOrigin = nativePlatform || window.location.origin === 'http://localhost:4173'
  const shellReady = nativePlatform || Boolean(shell && shell.total > 0 && shell.missing.length === 0 && shell.cached >= shell.total)
  const modelReady = Boolean(activeModel)
  const browserOffline = navigator.onLine === false
  const freeBytes = storage.quota !== null && storage.usage !== null ? storage.quota - storage.usage : null

  const checks = useMemo(
    () => [
      {
        label: 'App vollständig lokal',
        detail: nativePlatform
          ? 'Web-App und native Laufzeit sind fest in der installierten APK gebündelt'
          : import.meta.env.PROD
          ? shellReady
            ? `${shell!.cached}/${shell!.total} Dateien · Build ${shell!.buildId}`
            : shell
              ? `${shell.missing.length} Datei(en) fehlen im Offline-Cache`
              : 'Service Worker antwortet noch nicht'
          : 'Im Entwicklungsserver nicht messbar – Produktions-Launcher verwenden',
        state: (checking ? 'checking' : shellReady ? 'ready' : import.meta.env.PROD ? 'missing' : 'warning') as CheckState,
      },
      {
        label: 'Lokales Sprachmodell aktiv',
        detail: activeModel
          ? `${activeModel.name} wurde in dieser Sitzung vollständig initialisiert`
          : cachedModels.length
            ? `${cachedModels.length} Modellgewicht(e) erkannt; unter „Modelle“ vollständig laden`
            : 'Noch kein echtes Modell vorbereitet – die Demo-Engine klingt nicht wie ein Chatbot',
        state: (checking ? 'checking' : activeModel ? 'ready' : 'missing') as CheckState,
      },
      {
        label: 'Lokale Probeantwort bestanden',
        detail:
          smoke.state === 'passed'
            ? 'Das aktive Modell hat in dieser Sitzung erfolgreich Text erzeugt'
            : smoke.state === 'running'
              ? 'Probeantwort läuft …'
              : smoke.state === 'failed'
                ? `Probe fehlgeschlagen: ${smoke.text}`
                : 'Nach dem Modellstart einmal die Probeantwort ausführen',
        state: (smoke.state === 'passed' ? 'ready' : smoke.state === 'running' ? 'checking' : 'missing') as CheckState,
      },
      {
        label: 'Lokales Inferenz-Backend',
        detail: activeCpuModel
          ? 'WebAssembly/CPU aktiv · kein WebGPU- oder Vulkan-Zugriff'
          : ctx.webgpu
            ? 'WebGPU wird vom Browser gemeldet; der GPU-Vortest bleibt zusätzlich erforderlich'
            : 'Weder CPU-Modell aktiv noch WebGPU verfügbar',
        state: (activeCpuModel || ctx.webgpu ? 'ready' : 'missing') as CheckState,
      },
      {
        label: 'Speicher gegen Bereinigung geschützt',
        detail:
          storage.persisted === true
            ? `${formatBytes(storage.usage)} belegt · ${formatBytes(freeBytes)} frei`
            : `Browser-Persistenz noch nicht zugesichert · ${formatBytes(freeBytes)} frei`,
        state: (checking ? 'checking' : storage.persisted ? 'ready' : 'warning') as CheckState,
      },
      {
        label: 'Fester Vortrags-Origin',
        detail: fixedOrigin
          ? nativePlatform
            ? 'Installierte APK – App und Modell liegen im privaten, festen App-Speicher'
            : 'localhost:4173 – Modell- und App-Cache gehören zu genau diesem Origin'
          : `${window.location.origin} – Vorbereitung und Vortrag müssen dieselbe Adresse nutzen`,
        state: (fixedOrigin ? 'ready' : 'warning') as CheckState,
      },
      {
        label: 'Netzwerk bewusst getrennt',
        detail: !ctx.online
          ? browserOffline
            ? 'App-Schalter offline und Browser meldet keine Verbindung'
            : 'App-Schalter offline; für den echten Test zusätzlich WLAN ausschalten'
          : 'Online-Funktionen sind noch freigeschaltet',
        state: (!ctx.online && browserOffline ? 'ready' : !ctx.online ? 'warning' : 'missing') as CheckState,
      },
    ],
    [activeCpuModel, activeModel, browserOffline, cachedModels.length, checking, ctx.online, ctx.webgpu, fixedOrigin, freeBytes, shell, shellReady, smoke, storage],
  )

  const criticalReady =
    shellReady &&
    modelReady &&
    (activeCpuModel || ctx.webgpu) &&
    !ctx.online &&
    smoke.state === 'passed' &&
    fixedOrigin &&
    browserOffline

  async function persistStorage() {
    try {
      await navigator.storage?.persist?.()
    } finally {
      setStorage(await getStorageStatus())
    }
  }

  async function runSmokeTest() {
    if (!modelReady || smoke.state === 'running') return
    setSmoke({ state: 'running', text: 'Das lokale Modell erzeugt eine kurze Probeantwort …' })
    try {
      const result = await ctx.engine.generate(
        'Antworte knapp auf Deutsch und verwende nur den bereitgestellten Kontext.',
        'KONTEXT:\nNoesis verbindet einen lokalen Wissensgraphen mit einem lokalen Sprachmodell.\n\nFRAGE: Was verbindet Noesis?',
      )
      if (!result.text.trim()) throw new Error('Das Modell lieferte keinen Text.')
      setSmoke({ state: 'passed', text: `Probe bestanden: „${result.text.slice(0, 160)}${result.text.length > 160 ? '…' : ''}“` })
    } catch (err) {
      setSmoke({ state: 'failed', text: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <div className="offline-page">
      <div className="eyebrow">Bühnenmodus · lokaler Preflight</div>
      <div className="offline-heading">
        <div>
          <h1>Ist Noesis wirklich offline bereit?</h1>
          <p className="lead">
            Ein grüner Schalter allein beweist nichts. Dieser Check trennt App-Dateien, Modell, Browser-Speicher und den
            echten Flugmodus-Test sichtbar voneinander.
          </p>
        </div>
        <div className={`readiness-orb ${criticalReady ? 'ready' : ''}`} aria-label={criticalReady ? 'Bühnenbereit' : 'Noch nicht bühnenbereit'}>
          <strong>{criticalReady ? 'Bereit' : 'Prüfen'}</strong>
          <span>{checks.filter((item) => item.state === 'ready').length}/{checks.length}</span>
        </div>
      </div>

      <div className="readiness-grid">
        {checks.map((item) => (
          <div className={`readiness-item ${item.state}`} key={item.label}>
            <span className="status-mark">{item.state === 'ready' ? '✓' : item.state === 'checking' ? '…' : item.state === 'warning' ? '!' : '×'}</span>
            <div>
              <strong>{item.label}</strong>
              <p>{item.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="offline-actions">
        <button className="btn" disabled={checking} onClick={() => void refresh()}>{checking ? 'Prüfe …' : 'Erneut prüfen'}</button>
        {storage.persisted !== true && (
          <button className="btn" onClick={() => void persistStorage()}>Speicher schützen</button>
        )}
        {!modelReady && (
          <button className="btn primary" onClick={() => ctx.go('models')}>Lokales Modell vorbereiten</button>
        )}
        {modelReady && (
          <button className="btn" disabled={smoke.state === 'running'} onClick={() => void runSmokeTest()}>
            {smoke.state === 'running' ? 'Probe läuft …' : 'Lokale Probeantwort'}
          </button>
        )}
        {ctx.online && <button className="btn primary" onClick={() => ctx.setOnline(false)}>Jetzt offline schalten</button>}
        {criticalReady && <button className="btn primary" onClick={() => ctx.go('chat')}>Gespräch öffnen</button>}
      </div>

      {smoke.state !== 'idle' && (
        <div className={`smoke-result ${smoke.state}`} role="status">{smoke.text}</div>
      )}

      <div className="card demo-director">
        <div className="demo-director-head">
          <div>
            <div className="eyebrow">Bühnenregie</div>
            <h2>Die komplette Geschichte in fünf Klicks</h2>
          </div>
          <span>{demoStep + 1}/{demoSteps.length}</span>
        </div>
        <div className="demo-director-steps">
          {demoSteps.map((step, index) => (
            <button
              type="button"
              className={demoStep === index ? 'active' : ''}
              onClick={() => openDemoStep(index)}
              key={step.label}
            >
              <span>{step.label}</span>
              <small>{step.prefill ?? (step.view === 'explorer' ? 'frei navigieren und Kante wählen' : step.view === 'arena' ? 'A/B-Blindvergleich öffnen' : 'Messdaten und Grenzen zeigen')}</small>
            </button>
          ))}
        </div>
        <p className="hint">Chat-Beispiele werden nur in das Eingabefeld eingesetzt und niemals automatisch abgesendet. Du behältst auf der Bühne die Kontrolle.</p>
      </div>

      <div className="offline-truth">
        <span>Was „offline“ hier ehrlich bedeutet</span>
        <p>
          Nach einer einmaligen Vorbereitung auf demselben Browserprofil laufen App, Graph-Retrieval und LLM-Inferenz
          ohne Server-Inferenz. Neue Wikipedia-Recherche und erstmalige Modell-Downloads benötigen weiterhin Internet.
          Der belastbare Abschluss ist ein Neustart mit ausgeschaltetem WLAN – nicht nur dieser Software-Schalter.
        </p>
      </div>
    </div>
  )
}
