import { useState } from 'react'
import type { AppCtx } from '../App'
import { BASE_GRAPH } from '../data/graph'
import { denseReady, getDenseIndex, loadDenseModel } from '../engine/embeddings'
import { ExtractiveEngine, WEBLLM_MODELS, WebLLMEngine } from '../engine/llm'

export default function Models({ ctx }: { ctx: AppCtx }) {
  const [loading, setLoading] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ text: string; pct: number }>({ text: '', pct: 0 })
  const [error, setError] = useState<string | null>(null)
  const [embedLoading, setEmbedLoading] = useState(false)
  const [embedProgress, setEmbedProgress] = useState('')
  const [embedError, setEmbedError] = useState<string | null>(null)
  const [embedReady, setEmbedReady] = useState(() => denseReady())

  async function requestPersistentStorage() {
    try {
      await navigator.storage?.persist?.()
    } catch {
      // Browser dürfen persistente Speicherung ablehnen; der Cache bleibt trotzdem nutzbar.
    }
  }

  async function loadEmbeddings() {
    if (embedLoading || embedReady) return
    setEmbedLoading(true)
    setEmbedError(null)
    try {
      await loadDenseModel((text, pct) => setEmbedProgress(`${text} ${pct ? Math.round(pct * 100) + '%' : ''}`))
      // Index für den Experiment-Korpus direkt vorwärmen (einmalige Kosten)
      setEmbedProgress('Bette Experiment-Korpus ein …')
      await getDenseIndex(BASE_GRAPH).ensureBuilt((done, total) => setEmbedProgress(`Bette Korpus ein … ${done}/${total}`))
      await requestPersistentStorage()
      setEmbedReady(true)
      ctx.setRetrieval('dense')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!ctx.online) {
        setEmbedError('Offline-Modus: Das Embedding-Modell befindet sich noch nicht vollstÃ¤ndig im Browser-Cache. Schalte fÃ¼r den einmaligen Download kurz auf Online.')
      } else if (message.includes('Unexpected token') && message.includes('<')) {
        setEmbedError('Der Modellserver hat statt einer Modell-Datei eine Fehlerseite geliefert. Bitte die Seite einmal neu laden und den Download erneut starten.')
      } else {
        setEmbedError(message)
      }
    } finally {
      setEmbedLoading(false)
      setEmbedProgress('')
    }
  }

  async function loadModel(modelId: string) {
    if (loading) return
    if (!ctx.online) {
      try {
        if (!(await WebLLMEngine.isCached(modelId))) {
          setError('Offline-Modus: Dieses Modell ist noch nicht vollständig im Browser-Cache. Schalte nur für die einmalige Bereitstellung auf Online.')
          return
        }
      } catch (err) {
        setError(`Cache-Prüfung fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`)
        return
      }
    }
    setError(null)
    setLoading(modelId)
    setProgress({ text: 'Initialisiere …', pct: 0 })
    try {
      const engine = new WebLLMEngine(modelId)
      await engine.load((text, pct) => setProgress({ text, pct }))
      await requestPersistentStorage()
      ctx.setEngine(engine)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(null)
    }
  }

  return (
    <div>
      <div className="eyebrow">On-Device-Inferenz</div>
      <h1>Modelle</h1>
      <p className="lead">
        Wähle, welches Sprachmodell lokal auf deinem Gerät läuft. Im Online-Modus können Gewichte einmalig geladen und
        im Browser-Cache abgelegt werden. Im Offline-Modus bleiben Retrieval und bereits geladene Modelle lokal; neue
        Downloads und Live-Recherche sind gesperrt. Es gibt keinerlei Server-Inferenz.
      </p>

      <div className="callout" style={{ marginBottom: 14 }}>
        <strong>{ctx.online ? 'Online-Modus aktiv.' : 'Offline-Modus aktiv.'}</strong>{' '}
        {ctx.online
          ? 'Modell- und Embedding-Downloads sind erlaubt. Schalte nach der Bereitstellung wieder auf Offline.'
          : 'Vollständig zwischengespeicherte Modelle und Embeddings können geladen werden. Fehlt etwas im Cache, bleibt der Download gesperrt.'}
      </div>

      {!ctx.webgpu && (
        <div className="callout" style={{ marginBottom: 16 }}>
          <strong>WebGPU nicht verfügbar.</strong> Dein Browser/Gerät unterstützt kein WebGPU – echte LLM-Inferenz ist
          hier nicht möglich. Die deterministische <em>Demo-Engine</em> bleibt aktiv, damit Pipeline und Experiment
          vollständig nutzbar sind (Chrome/Edge ab Version 113 oder Chrome auf Android unterstützen WebGPU).
        </div>
      )}

      <div className="card" style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0 }}>Aktive Engine</h3>
          <span className="hint">{ctx.engine.label}</span>
        </div>
        {ctx.engine.id !== 'extractive' && (
          <button className="btn sm" onClick={() => ctx.setEngine(new ExtractiveEngine())}>
            Zur Demo-Engine wechseln
          </button>
        )}
      </div>

      {error && (
        <div className="callout" style={{ marginBottom: 14, borderColor: 'var(--bad)' }}>
          Fehler beim Laden: {error}
        </div>
      )}

      <div className="grid cols-2">
        <div className="card" style={{ borderColor: ctx.engine.id === 'extractive' ? 'var(--accent)' : undefined }}>
          <h3>Demo-Engine (extraktiv)</h3>
          <p className="hint" style={{ fontSize: 13 }}>
            Deterministischer Antworter ohne neuronales Modell: wählt die Kontextsätze mit der höchsten Termüberlappung.
            Reproduzierbar, läuft überall – untere Referenz und Test der Pipeline. In der Baseline ohne Kontext enthält
            sie sich grundsätzlich.
          </p>
          <button className="btn" disabled={ctx.engine.id === 'extractive'} onClick={() => ctx.setEngine(new ExtractiveEngine())}>
            {ctx.engine.id === 'extractive' ? '✓ Aktiv' : 'Aktivieren'}
          </button>
        </div>

        {WEBLLM_MODELS.map((m) => {
          const active = ctx.engine.id === m.id
          const isLoading = loading === m.id
          const recommendedForNoesis = m.id === 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'
          return (
            <div className="card" key={m.id} style={{ borderColor: active || recommendedForNoesis ? 'var(--accent)' : undefined }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <h3>{m.name}</h3>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {recommendedForNoesis && <span className="chip">Empfohlen für Noesis</span>}
                  <span className="chip">{m.params}</span>
                </div>
              </div>
              <p className="hint" style={{ fontSize: 13 }}>
                {m.note} · Speicherbedarf ca. {(m.vramMB / 1000).toFixed(1).replace('.', ',')} GB
              </p>
              <button className="btn primary" disabled={!ctx.webgpu || !!loading || active} onClick={() => loadModel(m.id)}>
                {active ? '✓ Aktiv' : isLoading ? 'Lädt …' : 'Laden & aktivieren'}
              </button>
              {isLoading && (
                <div style={{ marginTop: 10 }}>
                  <div className="progress">
                    <div style={{ width: `${progress.pct * 100}%` }} />
                  </div>
                  <div className="hint" style={{ marginTop: 4, fontSize: 11.5 }}>
                    {progress.text}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <h2>Retrieval-Embeddings (Vektor-RAG-Backend)</h2>
      <div className="card">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <h3 style={{ margin: 0 }}>Dichte Embeddings · multilingual MiniLM-L12</h3>
            <p className="hint" style={{ fontSize: 13, margin: '4px 0 0' }}>
              Methodisch entscheidend: TF-IDF matcht nur Wortstämme und ist gegen Paraphrasen (»der Verfasser der
              Phänomenologie«) fast blind. Erst mit semantischen Embeddings ist Vektor-RAG eine faire Baseline – sonst
              bliebe die Alternativerklärung »Graph gewinnt nur gegen schwaches Retrieval« offen. Läuft vollständig
              lokal (~120 MB, einmalig, wird gecacht).
            </p>
          </div>
          <div className="seg">
            <button className={ctx.retrieval === 'tfidf' ? 'on' : ''} onClick={() => ctx.setRetrieval('tfidf')}>
              TF-IDF
            </button>
            <button
              className={ctx.retrieval === 'dense' ? 'on' : ''}
              disabled={embedLoading}
              onClick={() => {
                if (embedReady) ctx.setRetrieval('dense')
                else void loadEmbeddings()
              }}
              title={embedReady ? '' : 'Klicken lädt das Embedding-Modell'}
            >
              Dense
            </button>
          </div>
          {!embedReady && (
            <button className="btn primary" disabled={embedLoading} onClick={loadEmbeddings}>
              {embedLoading ? 'Lädt …' : 'Embedding-Modell laden'}
            </button>
          )}
          {embedReady && <span className="chip">✓ geladen &amp; Korpus eingebettet</span>}
        </div>
        {embedLoading && embedProgress && (
          <div className="hint" style={{ marginTop: 8, fontSize: 12 }}>
            {embedProgress}
          </div>
        )}
        {embedError && (
          <div className="callout" style={{ marginTop: 10, borderColor: 'var(--bad)' }}>
            {embedError} – Hinweis: Der einmalige Download benötigt eine Internetverbindung.
          </div>
        )}
      </div>

      <h2>Hinweis zur Methodik</h2>
      <p className="hint" style={{ maxWidth: 70 + 'ch' }}>
        Für das Experiment wird die Temperatur auf 0 gesetzt (deterministisches Decoding), damit Unterschiede zwischen
        den Bedingungen nicht im Sampling-Rauschen untergehen. Alle Bedingungen nutzen dasselbe Modell, denselben
        System-Prompt und dasselbe Token-Limit – variiert wird ausschließlich der Retrieval-Kontext.
      </p>
    </div>
  )
}
