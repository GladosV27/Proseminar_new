import { useEffect, useRef, useState } from 'react'
import type { LLMEngine } from '../engine/llm'
import {
  inspectOllama,
  OllamaEngine,
  frozenOllamaConfig,
  type OllamaStatus,
} from '../engine/ollama'

interface Props {
  engine: LLMEngine
  setEngine: (engine: LLMEngine) => void
}

function bytes(value: number | undefined): string {
  if (!value) return '—'
  return `${(value / 1_000_000_000).toFixed(1).replace('.', ',')} GB`
}

export default function OllamaLabPanel({ engine, setEngine }: Props) {
  const config = frozenOllamaConfig()
  const [status, setStatus] = useState<OllamaStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const autoAttempted = useRef(false)
  const active = engine.id === `ollama:${config.model}` && Boolean(engine.getProvenance?.())

  async function activate(automatic = false) {
    if (loading || active) return
    setLoading(true)
    setError(null)
    try {
      const next = new OllamaEngine(config)
      await next.load((text) => setProgress(text))
      setEngine(next)
      setStatus(await inspectOllama(config))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(automatic ? `Automatische Aktivierung fehlgeschlagen: ${message}` : message)
    } finally {
      setLoading(false)
    }
  }

  async function check(autoActivate = false) {
    setChecking(true)
    setError(null)
    const next = await inspectOllama(config)
    setStatus(next)
    setChecking(false)
    if (autoActivate && next.reachable && next.modelInstalled && engine.id === 'extractive') {
      await activate(true)
    }
  }

  useEffect(() => {
    if (autoAttempted.current) return
    autoAttempted.current = true
    void check(true)
    // Der automatische Check soll genau einmal beim Öffnen des Labs laufen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const provenance = active ? engine.getProvenance?.() : null
  const model = status?.modelInfo

  return (
    <div className="card" style={{ borderColor: active ? 'var(--accent)' : undefined, marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow">Lokaler PC-Messstand</div>
          <h3 style={{ margin: '4px 0' }}>{config.model} über Ollama</h3>
          <p className="hint" style={{ margin: 0 }}>
            {active
              ? 'Bereit und vorgewärmt. Diese Konfiguration bleibt für den Messlauf unverändert.'
              : status?.message ?? 'Ollama wird automatisch auf diesem PC gesucht …'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <span className="chip">{active ? '● bereit' : status?.reachable ? '○ erkannt' : '○ nicht bereit'}</span>
          <button className="btn sm" disabled={checking || loading} onClick={() => void check(false)}>
            {checking ? 'Prüfe …' : 'Neu prüfen'}
          </button>
          <button
            className="btn primary sm"
            disabled={active || loading || !status?.reachable || !status.modelInstalled}
            onClick={() => void activate(false)}
          >
            {active ? '✓ Aktiv' : loading ? 'Wärme vor …' : 'Für Experiment aktivieren'}
          </button>
        </div>
      </div>

      {progress && loading && <p className="hint" role="status" style={{ marginBottom: 0 }}>{progress}</p>}
      {error && <div className="card" role="alert" style={{ marginTop: 10, padding: 12, borderColor: 'var(--bad)' }}>{error}</div>}

      <div className="grid cols-2" style={{ marginTop: 12 }}>
        <div className="hint mono" style={{ lineHeight: 1.7 }}>
          Endpoint&nbsp; {config.endpoint}<br />
          Modell&nbsp;&nbsp;&nbsp; {config.model}<br />
          Digest&nbsp;&nbsp;&nbsp; {(provenance?.digest ?? model?.digest ?? '—').slice(0, 18)}
        </div>
        <div className="hint mono" style={{ lineHeight: 1.7 }}>
          temp {config.temperature} · seed {config.seed} · think {String(config.think)}<br />
          ctx {config.numCtx} · output {config.numPredict} · keep {config.keepAlive}<br />
          Ollama {status?.version ?? '—'} · {model?.details?.quantization_level ?? 'Quantisierung —'}
        </div>
      </div>

      {(model?.size || provenance?.residentVramBytes) && (
        <p className="hint" style={{ margin: '8px 0 0' }}>
          Modelldatei {bytes(model?.size)} · von <code>/api/ps</code> gemeldete VRAM-Residenz{' '}
          {bytes(provenance?.residentVramBytes)}. Das ist ein Diagnosewert, keine Garantie für Vulkan-, ROCm- oder reine GPU-Ausführung.
        </p>
      )}
    </div>
  )
}
