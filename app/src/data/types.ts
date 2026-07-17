// Zentrale Typdefinitionen für den Wissensgraphen und das Experiment.

export type NodeType = 'person' | 'werk' | 'konzept' | 'ort' | 'institution' | 'ereignis'

export interface GraphNode {
  id: string
  title: string
  type: NodeType
  /** manuell kuratierte thematische Community-Zuordnung */
  community: string
  /** Alternative Schreibweisen für Entity-Linking */
  aliases?: string[]
  /** Enzyklopädische Kurzzusammenfassung – dient zugleich als Retrieval-Chunk */
  summary: string
  /** true, wenn der Knoten vom Nutzer ergänzt wurde (Wissen füttern) */
  custom?: boolean
}

export interface GraphEdge {
  source: string
  target: string
  /** maschinenlesbarer Relationstyp, z.B. 'lehrer_von' */
  relation: string
  /** menschenlesbares Label, z.B. 'war Lehrer von' */
  label: string
  custom?: boolean
}

export interface KnowledgeGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface Community {
  id: string
  name: string
  description: string
}

export type QuestionCategory = 'single-hop' | 'multi-hop-2' | 'multi-hop-3' | 'vergleich' | 'unbeantwortbar'

export interface Question {
  id: string
  text: string
  category: QuestionCategory
  /** Minimale Zahl an Kanten im Evidenzpfad (0 = Fakt steht in einer einzigen Zusammenfassung) */
  hops: number
  goldAnswer: string
  /** Schlüsselbegriffe, die eine korrekte Antwort enthalten muss (Auto-Scoring) */
  mustContain: string[]
  /** Optionale Begriffe, von denen mindestens einer vorkommen sollte */
  anyOf?: string[]
  /** Knoten-IDs des Gold-Evidenzpfads */
  goldPath: string[]
  /** Erwartet das Modell eine Enthaltung? (Halluzinations-Probe) */
  expectAbstain?: boolean
}

/**
 * Bedingungen:
 *  - baseline:      nur parametrisches Wissen, kein Kontext (B0)
 *  - vector:        Top-k isolierte Chunks (B1)
 *  - graph:         linearisierter Subgraph (B2)
 *  - vector_budget: Kontrollbedingung – Vektor-RAG mit erhöhtem k, bis das
 *                   Kontextbudget dem Graph-Kontext derselben Frage entspricht
 *                   (kontrolliert die Konfundierung »mehr Text statt Struktur«)
 *  - hybrid:        Explorationsbedingung – Subgraph + zusätzliche Vektor-Chunks
 *  - graph_no_edges: Ablation – identische Graph-Knoten, aber ohne serialisierte
 *                    Relationskanten (isoliert den Beitrag expliziter Struktur)
 */
export type Condition = 'baseline' | 'vector' | 'graph' | 'vector_budget' | 'hybrid' | 'graph_no_edges'

export type Score = 'korrekt' | 'teilweise' | 'falsch' | 'enthaltung'

export type RetrievalMode = 'tfidf' | 'dense'

export type LatencyScope = 'end-to-end' | 'generation-only'

export interface TrialResult {
  /** stabile ID für Verblindung/Bewertung */
  id: string
  /** ID des zusammengehörigen Messlaufs (ein Klick auf »Durchlauf starten«) */
  runId: string
  /** stabile ID der Wiederholung innerhalb eines Messlaufs */
  repetitionId: string
  /** 1-basierte Wiederholungsnummer innerhalb des Messlaufs */
  repetition: number
  /** 1-basierte Ausführungsposition dieses Trials im Messlauf */
  order: number
  /** Seed der reproduzierbaren Reihenfolge (null bei migrierten Altdaten) */
  seed: number | null
  /** Position der Frage und Bedingung innerhalb der jeweiligen Wiederholung */
  questionOrder: number | null
  conditionOrder: number | null
  /** dokumentiert den verwendeten Randomisierungs-/Counterbalancing-Algorithmus */
  orderStrategy: string
  questionId: string
  condition: Condition
  answer: string
  contextChars: number
  retrievedIds: string[]
  /** End-to-End-Latenz: Vorbereitung/Retrieval + Generierung (bei neuen Trials) */
  latencyMs: number
  /** Einordnung von latencyMs; Altdaten enthielten nur die Generierungszeit */
  latencyScope: LatencyScope
  /** gesamte Vorbereitung inklusive Retrieval und Promptaufbau */
  prepareMs: number | null
  /** darin enthaltene Retrieval-/Subgraph-Extraktionszeit */
  retrievalMs: number | null
  /** reine Modellgenerierungszeit */
  generationMs: number
  autoScore: Score
  manualScore?: Score
  /** verblindete Bewertungen der Bewertenden A und B */
  blind?: { A?: Score; B?: Score }
  engine: string
  /** verwendetes Retrieval-Backend (tfidf | dense) */
  retrieval: RetrievalMode
  /** Anteil der Gold-Pfad-Knoten im übergebenen Kontext (null: kein Gold-Pfad) */
  evidenceRecall: number | null
  /** Anteil des übergebenen Kontexts, der zum Gold-Pfad gehört (null: kein Retrieval) */
  evidencePrecision: number | null
  timestamp: number
}
