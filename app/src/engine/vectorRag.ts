import type { KnowledgeGraph } from '../data/types'
import { terms } from './text'

/**
 * Vektor-RAG-Bedingung: klassisches Retrieval über isolierte Text-Chunks.
 *
 * Jede Knoten-Zusammenfassung ist ein Chunk. Die Repräsentation ist ein
 * TF-IDF-Vektor (Bag-of-Words mit Stammformen), Ähnlichkeit = Kosinus.
 * Entscheidend für das Experiment: Diese Bedingung sieht NUR isolierte
 * Fragmente – keinerlei Kanten-/Strukturinformation. Für die volle Studie
 * auf dem Smartphone wird dieselbe Schnittstelle mit dichten Embeddings
 * (z.B. all-MiniLM via ONNX/transformers.js) bedient; die Chunk-Basis und
 * das Top-k-Protokoll bleiben identisch.
 */

export interface RetrievedChunk {
  id: string
  title: string
  text: string
  score: number
}

interface DocVec {
  id: string
  title: string
  text: string
  tf: Map<string, number>
  norm: number
}

export class VectorIndex {
  private docs: DocVec[] = []
  private df = new Map<string, number>()
  private n = 0

  constructor(graph: KnowledgeGraph) {
    for (const node of graph.nodes) {
      const tf = new Map<string, number>()
      for (const t of terms(node.title + ' ' + node.summary)) tf.set(t, (tf.get(t) ?? 0) + 1)
      this.docs.push({ id: node.id, title: node.title, text: node.summary, tf, norm: 0 })
      for (const t of new Set(tf.keys())) this.df.set(t, (this.df.get(t) ?? 0) + 1)
    }
    this.n = this.docs.length
    for (const d of this.docs) {
      let sq = 0
      for (const [t, f] of d.tf) sq += (f * this.idf(t)) ** 2
      d.norm = Math.sqrt(sq) || 1
    }
  }

  private idf(t: string): number {
    return Math.log(1 + this.n / (1 + (this.df.get(t) ?? 0)))
  }

  retrieve(query: string, k = 4): RetrievedChunk[] {
    const qtf = new Map<string, number>()
    for (const t of terms(query)) qtf.set(t, (qtf.get(t) ?? 0) + 1)
    let qnorm = 0
    for (const [t, f] of qtf) qnorm += (f * this.idf(t)) ** 2
    qnorm = Math.sqrt(qnorm) || 1

    const scored = this.docs.map((d) => {
      let dot = 0
      for (const [t, f] of qtf) {
        const df = d.tf.get(t)
        if (df) dot += f * this.idf(t) * df * this.idf(t)
      }
      return { id: d.id, title: d.title, text: d.text, score: dot / (d.norm * qnorm) }
    })
    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
  }
}

/** Serialisiert die Top-k-Chunks als Kontextblock für den Prompt. */
export function vectorContext(chunks: RetrievedChunk[]): string {
  return chunks.map((c, i) => `[${i + 1}] ${c.title}\n${c.text}`).join('\n\n')
}
