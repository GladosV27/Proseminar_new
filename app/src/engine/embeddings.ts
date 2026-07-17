import type { KnowledgeGraph } from '../data/types'
import type { RetrievedChunk } from './vectorRag'

/**
 * Dichte Embeddings für Vektor-RAG (transformers.js, ONNX im Browser).
 *
 * Methodischer Zweck (Ausarbeitung § 4.2): TF-IDF matcht nur Wortstämme und
 * ist gegenüber Paraphrasen (»der Verfasser der Phänomenologie« statt
 * »Hegel«) nahezu blind. Erst mit einer semantischen Vektor-Baseline ist die
 * Kernhypothese H3 identifiziert – sonst bliebe die Alternativerklärung
 * »Graph-RAG gewinnt nur gegen ein lexikalisch schwaches Retrieval« offen.
 *
 * Modell: paraphrase-multilingual-MiniLM-L12-v2 (mehrsprachig, ~118 MB
 * quantisiert), läuft vollständig lokal; der Download wird vom Browser
 * gecacht. Embeddings einzelner Texte werden global gecacht, sodass beim
 * Wechsel des Arbeitsgraphen nur neue Knoten eingebettet werden.
 */

const MODEL_ID = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'
/** Teil des Messstands: lokal gebündelte Transformers.js-Version. */
export const TRANSFORMERS_VERSION = '3.8.1'

type FeaturePipeline = (texts: string[], opts: object) => Promise<{ tolist(): number[][] }>

let pipe: FeaturePipeline | null = null
let loadingPromise: Promise<void> | null = null
let embeddingNetworkEnabled = true
let transformers: typeof import('@huggingface/transformers') | null = null

/** Blockiert im Offline-Modus jede Nachladung von Hugging Face. */
export function setEmbeddingNetworkEnabled(enabled: boolean): void {
  embeddingNetworkEnabled = enabled
  if (transformers) {
    transformers.env.allowRemoteModels = enabled
    transformers.env.allowLocalModels = true
  }
}

/** globaler Text→Vektor-Cache (Texte sind kurz, 75–150 Chunks: unkritisch) */
const vecCache = new Map<string, number[]>()

export function denseReady(): boolean {
  return pipe !== null
}

export async function loadDenseModel(onProgress: (text: string, pct: number) => void): Promise<void> {
  if (pipe) return
  if (!loadingPromise) {
    loadingPromise = (async () => {
      const mod = await import('@huggingface/transformers')
      transformers = mod
      mod.env.allowRemoteModels = embeddingNetworkEnabled
      mod.env.allowLocalModels = true
      const p = await mod.pipeline('feature-extraction', MODEL_ID, {
        // Dieses Modell veröffentlicht eine ONNX-Datei namens `model_int8.onnx`.
        // `q8` würde dagegen auf eine nicht vorhandene Datei zeigen und eine
        // HTML-404-Seite als vermeintliches JSON einlesen.
        dtype: 'int8',
        progress_callback: (ev: { status?: string; file?: string; progress?: number }) => {
          if (ev.status === 'progress' && typeof ev.progress === 'number') {
            onProgress(`Lade ${ev.file ?? 'Modell'} …`, ev.progress / 100)
          } else if (ev.status) {
            onProgress(ev.status, 0)
          }
        },
      })
      pipe = (texts: string[], opts: object) => p(texts, opts) as Promise<{ tolist(): number[][] }>
    })().catch((err) => {
      loadingPromise = null
      throw err
    })
  }
  await loadingPromise
}

async function embed(texts: string[]): Promise<number[][]> {
  if (!pipe) throw new Error('Embedding-Modell nicht geladen (Modelle → Embeddings).')
  const missing = texts.filter((t) => !vecCache.has(t))
  const BATCH = 8
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH)
    const out = await pipe(batch, { pooling: 'mean', normalize: true })
    const vectors = out.tolist()
    batch.forEach((t, j) => vecCache.set(t, vectors[j]))
  }
  return texts.map((t) => vecCache.get(t)!)
}

function dot(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

export class DenseIndex {
  private built = false
  private docs: { id: string; title: string; text: string; vec: number[] }[] = []

  constructor(private graph: KnowledgeGraph) {}

  async ensureBuilt(onProgress?: (done: number, total: number) => void): Promise<void> {
    if (this.built) return
    const nodes = this.graph.nodes
    const texts = nodes.map((n) => `${n.title}. ${n.summary}`)
    // in Häppchen einbetten, damit die UI Fortschritt zeigen kann
    const STEP = 8
    for (let i = 0; i < texts.length; i += STEP) {
      await embed(texts.slice(i, i + STEP))
      onProgress?.(Math.min(i + STEP, texts.length), texts.length)
    }
    const vecs = await embed(texts)
    this.docs = nodes.map((n, i) => ({ id: n.id, title: n.title, text: n.summary, vec: vecs[i] }))
    this.built = true
  }

  async retrieve(query: string, k = 4): Promise<RetrievedChunk[]> {
    await this.ensureBuilt()
    const [qv] = await embed([query])
    return this.docs
      .map((d) => ({ id: d.id, title: d.title, text: d.text, score: dot(qv, d.vec) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
  }
}

/** Ein DenseIndex pro Arbeitsgraph (WeakMap: verschwindet mit dem Graphen). */
const indexCache = new WeakMap<KnowledgeGraph, DenseIndex>()

export function getDenseIndex(graph: KnowledgeGraph): DenseIndex {
  let idx = indexCache.get(graph)
  if (!idx) {
    idx = new DenseIndex(graph)
    indexCache.set(graph, idx)
  }
  return idx
}
