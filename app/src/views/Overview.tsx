import type { AppCtx } from '../App'
import { COMMUNITIES } from '../data/graph'
import { QUESTIONS } from '../data/questions'
import { graphStats } from '../data/graph'
import { communityColor } from '../components/ForceGraph'

export default function Overview({ ctx }: { ctx: AppCtx }) {
  const stats = graphStats(ctx.graph)
  const communities = [...new Set(ctx.graph.nodes.map((n) => n.community))]

  return (
    <div>
      <div className="eyebrow">Proseminar · SoSe 2026 · TU Dortmund</div>
      <h1>Topologie macht kleines Wissen groß.</h1>
      <p className="lead">
        On-Device-LLMs können privat, nach dem Download offline und latenzarm arbeiten – aber sie sind wissensarm. Dieses
        Labor untersucht, ob <strong>Retrieval über einen kuratierten, typisierten Wissensgraphen</strong> die
        Antwortqualität eines kleinen lokalen Sprachmodells bei Multi-Hop-Fragen stärker verbessert als klassisches
        Vektor-RAG. Im Messmodus laufen Retrieval, Inferenz, Bewertung und Speicherung auf dem Gerät.
      </p>

      <div className="grid cols-4">
        <div className="card stat">
          <div className="num">{stats.nodes}</div>
          <div className="cap">Knoten (Artikel/Entitäten)</div>
        </div>
        <div className="card stat">
          <div className="num">{stats.edges}</div>
          <div className="cap">typisierte Kanten</div>
        </div>
        <div className="card stat">
          <div className="num">{stats.communities}</div>
          <div className="cap">Communities (manuell kuratiert)</div>
        </div>
        <div className="card stat">
          <div className="num">{QUESTIONS.length}</div>
          <div className="cap">Testfragen (stratifiziert)</div>
        </div>
      </div>

      <h2>Die drei Bedingungen</h2>
      <div className="grid cols-3">
        <div className="card">
          <h3>1 · Baseline</h3>
          <p className="hint" style={{ fontSize: 13.5 }}>
            Das LLM antwortet allein aus seinen Parametern – kein Kontext. Misst das »leere Gedächtnis« kleiner Modelle
            und die Halluzinationsneigung.
          </p>
        </div>
        <div className="card">
          <h3>2 · Vektor-RAG</h3>
          <p className="hint" style={{ fontSize: 13.5 }}>
            Top-k isolierte Text-Chunks per Kosinus-Ähnlichkeit (TF-IDF oder mehrsprachige dichte Embeddings). Explizite
            Beziehungen zwischen Entitäten werden nicht mitgeliefert – »Schnipsel statt Zusammenhang«.
          </p>
        </div>
        <div className="card">
          <h3>3 · Graph-RAG</h3>
          <p className="hint" style={{ fontSize: 13.5 }}>
            Entity-Linking → gescorte Traversierung des eingefrorenen Messgraphen → linearisierter Subgraph (Tripel +
            dieselben Zusammenfassungen). Beziehungen bleiben explizit erhalten – das ist die Multi-Hop-These.
          </p>
        </div>
      </div>

      <h2>Wissensinseln im Korpus</h2>
      <div className="grid cols-2">
        {COMMUNITIES.map((c) => (
          <div className="card" key={c.id}>
            <h3>
              <span
                className="sw"
                style={{
                  display: 'inline-block',
                  width: 11,
                  height: 11,
                  borderRadius: 3,
                  marginRight: 8,
                  background: communityColor(communities, c.id),
                }}
              />
              {c.name}
            </h3>
            <p className="hint" style={{ fontSize: 13 }}>{c.description}</p>
          </div>
        ))}
      </div>

      <h2>So führst du das Experiment durch</h2>
      <div className="card">
        <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8, fontSize: 14.5 }}>
          <li>
            Unter <strong>Modelle</strong> ein lokales LLM laden (WebGPU) – oder mit der deterministischen Demo-Engine
            starten.
          </li>
          <li>
            Im <strong>Assistenten</strong> einzelne Fragen unter allen drei Bedingungen ausprobieren und die
            Retrieval-Kontexte inspizieren.
          </li>
          <li>
            Im <strong>Experiment</strong> den kompletten Katalog ({QUESTIONS.length} Fragen × 3 Bedingungen) auf dem
            eingefrorenen Korpus laufen lassen; das Auto-Scoring lässt sich pro Antwort manuell überstimmen
            (Doppelbewertung).
          </li>
          <li>
            Unter <strong>Ergebnisse</strong> Genauigkeit nach Hop-Tiefe, Latenz und Enthaltungsverhalten vergleichen und
            als JSON/CSV für den Transparenz-Bericht exportieren.
          </li>
        </ol>
        <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={() => ctx.go('experiment')}>
            Experiment starten →
          </button>
          <button className="btn" onClick={() => ctx.go('explorer')}>
            Graph erkunden
          </button>
        </div>
      </div>

      <h2>Warum on-device?</h2>
      <p className="callout">
        Kein Wort verlässt das Gerät: Modellgewichte werden einmalig geladen und lokal gecacht, Retrieval und Inferenz
        laufen im Browser (WebGPU), Ergebnisse liegen im lokalen Speicher. Genau dieses Setting – privat, offline,
        1–3&nbsp;Mrd. Parameter – motiviert die Forschungsfrage: Kann Struktur ersetzen, was kleinen Modellen an
        Weltwissen fehlt?
      </p>
    </div>
  )
}
