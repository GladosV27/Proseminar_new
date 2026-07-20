import { useEffect, useMemo, useState } from 'react'
import type { AppCtx } from '../App'
import { ExtractiveEngine } from '../engine/llm'
import {
  NATIVE_LLM_MODELS,
  NativeLlmEngine,
  type NativeLlmCapabilities,
  type NativeModelStatus,
} from '../engine/nativeLlm'

function statusText(status?: NativeModelStatus): string {
  if (!status || status.state === 'missing') return 'Noch nicht auf diesem Gerät'
  if (status.state === 'ready') return 'Geprüft gespeichert'
  if (status.state === 'loaded') return 'Aktiv und offline bereit'
  if (status.state === 'partial') return 'Download kann fortgesetzt werden'
  if (status.state === 'downloading') return 'Wird heruntergeladen'
  if (status.state === 'corrupt') return 'Prüfung fehlgeschlagen'
  if (status.state === 'error') return status.error || 'Download fehlgeschlagen'
  return 'Datei muss erneut geprüft werden'
}

function formatStorage(bytes?: number): string {
  if (!bytes) return 'unbekannt'
  return `${(bytes / 1_000_000_000).toFixed(1).replace('.', ',')} GB frei`
}

/**
 * Bewusst reduzierte APK-Einstellungen. Die wissenschaftliche Modellmatrix
 * bleibt in der Web-App; auf dem Handy entscheidet die Geräteprüfung und ein
 * einziger Hauptknopf über den robustesten lokalen Pfad.
 */
export default function MobileSettings({ ctx }: { ctx: AppCtx }) {
  const [capabilities, setCapabilities] = useState<NativeLlmCapabilities | null>(null)
  const [statuses, setStatuses] = useState<Record<string, NativeModelStatus>>({})
  const [loading, setLoading] = useState<string | null>(null)
  const [progress, setProgress] = useState({ text: '', pct: 0 })
  const [error, setError] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    const [nextCapabilities, nextStatuses] = await Promise.all([
      NativeLlmEngine.capabilities(),
      Promise.all(NATIVE_LLM_MODELS.map((model) => NativeLlmEngine.status(model.id))),
    ])
    setCapabilities(nextCapabilities)
    setStatuses(Object.fromEntries(nextStatuses.map((status) => [status.modelId, status])))
  }

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      NativeLlmEngine.capabilities(),
      Promise.all(NATIVE_LLM_MODELS.map((model) => NativeLlmEngine.status(model.id))),
    ]).then(([nextCapabilities, nextStatuses]) => {
      if (cancelled) return
      setCapabilities(nextCapabilities)
      setStatuses(Object.fromEntries(nextStatuses.map((status) => [status.modelId, status])))
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason))
    })
    return () => { cancelled = true }
  }, [])

  const recommended = useMemo(() => {
    const id = capabilities?.recommendedModelId
    return NATIVE_LLM_MODELS.find((model) => model.id === id)
      ?? NATIVE_LLM_MODELS.find((model) => model.tier === 'compatibility')
      ?? NATIVE_LLM_MODELS[0]
  }, [capabilities?.recommendedModelId])

  const recommendedStatus = statuses[recommended.id]
  const recommendedActive = ctx.engine.id === `native:${recommended.id}` && recommendedStatus?.state === 'loaded'

  async function prepareModel(modelId: string): Promise<void> {
    if (loading) return
    setError(null)
    setLoading(modelId)
    setProgress({ text: 'Gerät und privaten Speicher prüfen …', pct: 0 })
    const restoreOffline = !ctx.online
    try {
      if (capabilities?.supported === false) {
        throw new Error(capabilities.reason || 'Dieses Gerät unterstützt die native 64-Bit-Inferenz nicht.')
      }
      let downloaded = await NativeLlmEngine.isDownloaded(modelId)
      if (!downloaded) {
        // Der Klick ist die ausdrückliche Zustimmung zum einmaligen Download.
        // Nach erfolgreicher Bereitstellung wird ein zuvor aktiver Offline-Modus
        // automatisch wiederhergestellt.
        if (restoreOffline) ctx.setOnline(true)
        await NativeLlmEngine.download(modelId, (text, pct) => setProgress({ text, pct }))
        downloaded = true
      }
      if (!downloaded) throw new Error('Das Modell konnte nicht vollständig verifiziert werden.')
      const engine = new NativeLlmEngine(modelId)
      await engine.load((text, pct) => setProgress({ text, pct }))
      ctx.setEngine(engine)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      await refresh().catch(() => undefined)
      const currentNative = ctx.engine.id.startsWith('native:')
        ? ctx.engine.id.slice('native:'.length)
        : null
      if (currentNative && (await NativeLlmEngine.status(currentNative)).state !== 'loaded') {
        ctx.setEngine(new ExtractiveEngine())
      }
    } finally {
      if (restoreOffline) ctx.setOnline(false)
      setLoading(null)
    }
  }

  return (
    <section className="mobile-settings-view">
      <header className="mobile-settings-hero">
        <div className="eyebrow">Noesis auf diesem Gerät</div>
        <h1>Einrichten – und dann offline bleiben</h1>
        <p className="lead">
          Noesis wählt anhand von RAM und Architektur das sinnvollste lokale Modell. Nach dem einmaligen Download
          bleiben Fragen, Dokumente, Wissensgraph und Antworten im privaten App-Speicher.
        </p>
      </header>

      <div className={`mobile-offline-state ${ctx.online ? 'online' : 'offline'}`} role="status">
        <span aria-hidden="true">{ctx.online ? '◎' : '✓'}</span>
        <div>
          <strong>{ctx.online ? 'Online-Nachladen erlaubt' : 'Vollständig offline'}</strong>
          <small>
            {ctx.online
              ? 'Nur Modell-Downloads und ein bewusst gestarteter Wikipedia-Abruf dürfen das Netz verwenden.'
              : 'Noesis sendet keine Fragen, PDFs oder Graphdaten an einen Modellserver.'}
          </small>
        </div>
        <button className="btn sm" type="button" onClick={() => ctx.setOnline(!ctx.online)}>
          {ctx.online ? 'Offline gehen' : 'Online erlauben'}
        </button>
      </div>

      <article className="card mobile-best-model">
        <div className="mobile-best-model-head">
          <div>
            <span className="chip">Für dieses Gerät empfohlen</span>
            <h2>{recommended.name}</h2>
          </div>
          <div className="mobile-device-score" aria-label="Erkannte Gerätewerte">
            <strong>{capabilities?.totalRamMB ? `${Math.round(capabilities.totalRamMB / 1024)} GB` : '–'}</strong>
            <small>RAM · {formatStorage(capabilities?.freeStorageBytes)}</small>
          </div>
        </div>
        <p>
          {recommended.note} Der geprüfte Download ist etwa {recommended.downloadMB.toLocaleString('de-DE')} MB groß.
        </p>
        <div className="mobile-model-status">
          <span className={recommendedActive ? 'ready' : ''} />
          {statusText(recommendedStatus)}
        </div>
        <button
          className="btn primary mobile-best-model-action"
          type="button"
          disabled={!capabilities || loading !== null || capabilities.supported === false || recommendedActive}
          onClick={() => void prepareModel(recommended.id)}
        >
          {!capabilities
            ? 'Gerät wird geprüft …'
            : recommendedActive
            ? '✓ Bestes Modell ist aktiv'
            : loading === recommended.id
              ? 'Modell wird vorbereitet …'
              : recommendedStatus?.state === 'ready'
                ? 'Bestes Modell aktivieren'
                : 'Bestes Modell für dieses Gerät einrichten'}
        </button>
        {loading === recommended.id && (
          <div className="mobile-model-progress" role="status">
            <div className="progress"><div style={{ width: `${Math.max(0, Math.min(1, progress.pct)) * 100}%` }} /></div>
            <small>{progress.text}</small>
          </div>
        )}
        {capabilities?.supported === false && (
          <div className="callout mobile-settings-error">{capabilities.reason}</div>
        )}
        {error && <div className="callout mobile-settings-error" role="alert">{error}</div>}
      </article>

      <div className="mobile-settings-grid">
        <button className="card mobile-settings-link" type="button" onClick={() => ctx.go('knowledge')}>
          <span aria-hidden="true">＋</span>
          <div><strong>Wissen & Backup</strong><small>Texte, PDFs und Wikipedia verwalten oder sichern</small></div>
          <b aria-hidden="true">›</b>
        </button>
        <button className="card mobile-settings-link" type="button" onClick={() => ctx.go('chat')}>
          <span aria-hidden="true">⌁</span>
          <div><strong>Antwortweg</strong><small>Automatisch, Vektor, Graph oder Hybrid im Chat wählen</small></div>
          <b aria-hidden="true">›</b>
        </button>
      </div>

      <details className="card mobile-advanced-models">
        <summary>Erweiterte Modellwahl</summary>
        <p className="hint">
          Nur nötig, wenn du bewusst mehr Qualität oder einen kleineren, schnelleren Kompatibilitätsmodus testen willst.
        </p>
        {NATIVE_LLM_MODELS.map((model) => {
          const status = statuses[model.id]
          const active = ctx.engine.id === `native:${model.id}` && status?.state === 'loaded'
          const insufficientRam = Boolean(capabilities?.totalRamMB && capabilities.totalRamMB < model.minimumRamMB)
          return (
            <div className="mobile-advanced-model" key={model.id}>
              <div>
                <strong>{model.name}</strong>
                <small>{statusText(status)} · {model.downloadMB.toLocaleString('de-DE')} MB</small>
              </div>
              <button
                className="btn sm"
                type="button"
                disabled={!capabilities || loading !== null || active || insufficientRam}
                onClick={() => void prepareModel(model.id)}
              >
                {active ? 'Aktiv' : loading === model.id ? 'Lädt …' : insufficientRam ? 'Zu wenig RAM' : 'Verwenden'}
              </button>
              {loading === model.id && (
                <div className="progress"><div style={{ width: `${Math.max(0, Math.min(1, progress.pct)) * 100}%` }} /></div>
              )}
            </div>
          )
        })}
      </details>

      <p className="mobile-settings-footnote">
        Native LiteRT-LM-CPU-Inferenz · Android 7+ · ARM64 · kein WebGPU/Vulkan. Das lokale Mobilmodell ist ein
        Produktmodus und wird nicht stillschweigend als wissenschaftliches Experimentmodell verwendet.
      </p>
    </section>
  )
}
