import { splitSentences, terms } from './text'
import type { MLCEngine } from '@mlc-ai/web-llm'
import type { Wllama } from '@wllama/wllama'

/**
 * LLM-Abstraktion mit zwei austauschbaren Engines:
 *
 *  1. ExtractiveEngine (»Demo-Modus«): deterministischer, extraktiver
 *     Antworter ohne neuronales Modell. Läuft überall (auch ohne WebGPU),
 *     ist reproduzierbar und dient als untere Referenz sowie zum
 *     Durchspielen der kompletten Experiment-Pipeline.
 *
 *  2. WebLLMEngine: echtes On-Device-LLM via WebLLM/MLC – die Gewichte
 *     werden einmalig heruntergeladen und laufen danach vollständig lokal
 *     im Browser (WebGPU), auch auf Android-Smartphones. Es findet
 *     keinerlei Server-Inferenz statt; genau das ist das Setting des
 *     Experiments (privat · offline · latenzarm).
 */

export interface GenerateResult {
  text: string
  engine: string
}

export interface GenerateOptions {
  /** Per-call cap; experiment runs omit it and retain their frozen defaults. */
  maxTokens?: number
  /** Natürlicheres Sampling nur im Produktchat; Messläufe bleiben deterministisch. */
  sampling?: 'deterministic' | 'natural'
}

export interface LLMEngine {
  readonly id: string
  readonly label: string
  /** Ausführungsort – verhindert, dass private Extraktionsaufgaben versehentlich an Remote-Engines gehen. */
  readonly execution: 'local' | 'remote'
  generate(
    system: string,
    user: string,
    onToken?: (partial: string) => void,
    options?: GenerateOptions,
  ): Promise<GenerateResult>
  /** Unterbricht – sofern von der Engine unterstützt – eine laufende Generierung. */
  interrupt?(): Promise<void> | void
  /** Gibt große Modellressourcen beim Engine-Wechsel wieder frei. */
  dispose?(): Promise<void> | void
}

// ────────────────────────── Demo-Engine (extraktiv, deterministisch) ──────────────────────────

export class ExtractiveEngine implements LLMEngine {
  readonly id = 'extractive'
  readonly label = 'Demo-Engine (extraktiv, ohne LLM)'
  readonly execution = 'local' as const

  async generate(_system: string, user: string): Promise<GenerateResult> {
    // Kontext und Frage aus dem Prompt trennen
    const qMatch = user.match(/FRAGE:\s*([\s\S]*?)$/)
    const question = qMatch ? qMatch[1].trim() : user
    const ctxMatch = user.match(/KONTEXT:\s*([\s\S]*?)\n\nFRAGE:/)
    const context = ctxMatch ? ctxMatch[1] : ''

    const qt = new Set(terms(question))
    if (!context.trim()) {
      return {
        text: 'Ohne Kontext kann die Demo-Engine nicht antworten. (Im Baseline-Modus benötigt diese Frage ein echtes lokales Modell – bitte unter »Modelle« ein WebLLM-Modell laden.)',
        engine: this.id,
      }
    }

    // Beziehungszeilen und Satz-Kandidaten sammeln, nach Termüberlappung scoren
    const lines = context
      .split('\n')
      .filter((l) => l.trim().startsWith('•'))
      .map((l) => l.replace(/^•\s*/, ''))
    const sentences = splitSentences(context.replace(/^BEZIEHUNGEN[\s\S]*?ARTIKEL-AUSZÜGE:/m, ''))
    const candidates = [...lines, ...sentences]

    const scored = candidates
      .map((s) => {
        const st = new Set(terms(s))
        let score = 0
        for (const t of qt) if (st.has(t)) score++
        return { s: s.trim(), score, len: s.length }
      })
      .filter((c) => c.score > 0 && c.len > 15)
      .sort((a, b) => b.score - a.score || a.len - b.len)

    if (scored.length === 0) {
      return {
        text: 'Dazu finde ich im bereitgestellten Kontext keine Information. Ich enthalte mich, statt zu raten.',
        engine: this.id,
      }
    }
    const top = scored.slice(0, 2).map((c) => c.s)
    return { text: top.join(' '), engine: this.id }
  }
}

// ────────────────────────── WebLLM (echtes On-Device-LLM) ──────────────────────────

export interface WebLLMModel {
  id: string
  name: string
  params: string
  vramMB: number
  note: string
}

/** Teil des Messstands: Diese lokal gebündelte Runtime-Version wird dokumentiert. */
export const WEBLLM_VERSION = '0.2.79'

/** Kuratierte Auswahl kleiner Modelle (≤ 4 Mrd. Parameter), passend zum Proseminar-Setting. */
export const WEBLLM_MODELS: WebLLMModel[] = [
  {
    id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 1B Instruct',
    params: '1,2 Mrd.',
    vramMB: 880,
    note: 'Sehr schnell, guter Startpunkt auf Smartphones.',
  },
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 1.5B Instruct',
    params: '1,5 Mrd.',
    vramMB: 1600,
    note: 'Stark bei mehrsprachigen Aufgaben (auch Deutsch).',
  },
  {
    id: 'gemma-2-2b-it-q4f16_1-MLC',
    name: 'Gemma 2 2B Instruct',
    params: '2,6 Mrd.',
    vramMB: 1900,
    note: 'Google DeepMind – ausgewogene Qualität.',
  },
  {
    id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 3B Instruct',
    params: '3,2 Mrd.',
    vramMB: 2260,
    note: 'Beste Qualität in dieser Auswahl, braucht mehr Speicher.',
  },
  {
    id: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
    name: 'Phi 3.5 mini Instruct',
    params: '3,8 Mrd.',
    vramMB: 3670,
    note: 'Microsoft – »A capable LLM locally on your phone« (Referenz [6]).',
  },
]

export class WebLLMEngine implements LLMEngine {
  readonly id: string
  readonly label: string
  readonly execution = 'local' as const
  private engine: MLCEngine | null = null

  constructor(private modelId: string) {
    this.id = modelId
    const m = WEBLLM_MODELS.find((x) => x.id === modelId)
    this.label = m ? m.name : modelId
  }

  static supported(): boolean {
    return typeof navigator !== 'undefined' && 'gpu' in navigator
  }

  /**
   * Vorprüfung der von WebLLM erkannten Modellgewichte. Erst ein vollständiges
   * load() plus Probeantwort im Flugmodus belegt die Offline-Bereitschaft auch
   * für Konfiguration, Tokenizer und Runtime.
   */
  static async isCached(modelId: string): Promise<boolean> {
    const { hasModelInCache } = await import('@mlc-ai/web-llm')
    return hasModelInCache(modelId)
  }

  async load(onProgress: (text: string, pct: number) => void): Promise<void> {
    // Die Runtime wird als lokaler Code-Split geladen; Modellgewichte liegen nach
    // der einmaligen Bereitstellung im Browser-Cache.
    const { CreateMLCEngine } = await import('@mlc-ai/web-llm')
    const engine = await CreateMLCEngine(this.modelId, {
      initProgressCallback: (p: { text: string; progress: number }) => onProgress(p.text, p.progress),
    })
    this.engine = engine
  }

  async generate(
    system: string,
    user: string,
    onToken?: (partial: string) => void,
    options: GenerateOptions = {},
  ): Promise<GenerateResult> {
    if (!this.engine) throw new Error('Modell nicht geladen')
    const stream = (await this.engine.chat.completions.create({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0,
      max_tokens: Math.min(220, Math.max(32, options.maxTokens ?? 220)),
      stream: true,
    })) as AsyncIterable<{ choices: { delta?: { content?: string } }[] }>

    let text = ''
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content ?? ''
      if (delta) {
        text += delta
        onToken?.(text)
      }
    }
    return { text: text.trim(), engine: this.id }
  }

  async interrupt(): Promise<void> {
    await this.engine?.interruptGenerate()
  }
}

// ──────────────────── WebAssembly/CPU (Vulkan-unabhängig) ────────────────────

export interface WasmLLMModel {
  id: string
  name: string
  params: string
  downloadMB: number
  url: string
  note: string
}

/**
 * Kleine, offizielle GGUF-Quantisierung für Smartphones. Anders als WebLLM
 * nutzt diese Engine ausdrücklich keine GPU-Layer und umgeht damit Dawn,
 * WebGPU und den Vulkan-Treiber vollständig.
 */
export const WASM_LLM_MODELS: WasmLLMModel[] = [
  {
    id: 'wllama:qwen2.5-0.5b-instruct-q4-k-m',
    name: 'Qwen 2.5 0.5B Instruct · CPU',
    params: '0,5 Mrd.',
    downloadMB: 491,
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
    note: 'Vollständig lokale CPU-Inferenz über WebAssembly – ohne WebGPU oder Vulkan.',
  },
]

export const WASM_LLM_CONTEXT_TOKENS = 4096
const WASM_LLM_OUTPUT_TOKENS = 180
// Zeichen sind nur eine konservative Näherung für Tokens. Der Puffer hält
// Systemprompt, Chat-Template und Ausgabe sicher innerhalb von 4096 Tokens.
const WASM_LLM_PROMPT_CHAR_BUDGET = 10_500

export function compactWasmPrompt(system: string, user: string): string {
  const available = Math.max(2_000, WASM_LLM_PROMPT_CHAR_BUDGET - system.length)
  if (user.length <= available) return user

  const questionMarker = user.lastIndexOf('\n\nFRAGE:')
  const tail = questionMarker >= 0 ? user.slice(questionMarker) : user.slice(-800)
  const notice = '\n\n[… Kontext für das lokale Modell gekürzt …]'
  const headLength = Math.max(1_000, available - tail.length - notice.length)
  return `${user.slice(0, headLength)}${notice}${tail}`
}

export class WasmLLMEngine implements LLMEngine {
  readonly id: string
  readonly label: string
  readonly execution = 'local' as const
  private runtime: Wllama | null = null
  private abortController: AbortController | null = null

  constructor(private modelId = WASM_LLM_MODELS[0].id) {
    this.id = modelId
    this.label = WASM_LLM_MODELS.find((model) => model.id === modelId)?.name ?? modelId
  }

  static supported(): boolean {
    if (typeof window === 'undefined' || typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') return false
    try {
      // wllama 3 / aktuelles llama.cpp benötigt Memory64. Der Test allokiert
      // nur eine 64-KiB-Seite, bevor ein 491-MB-Download gestartet werden darf.
      new WebAssembly.Memory({ address: 'i64', initial: 1n } as unknown as WebAssembly.MemoryDescriptor)
      return true
    } catch {
      return false
    }
  }

  static async isCached(modelId = WASM_LLM_MODELS[0].id): Promise<boolean> {
    const model = WASM_LLM_MODELS.find((candidate) => candidate.id === modelId)
    if (!model) return false
    const { ModelManager } = await import('@wllama/wllama')
    const cached = await new ModelManager().getModels()
    return cached.some((entry) => entry.url === model.url && entry.size >= model.downloadMB * 1_000_000 * 0.98)
  }

  async load(onProgress: (text: string, pct: number) => void): Promise<void> {
    const model = WASM_LLM_MODELS.find((candidate) => candidate.id === this.modelId)
    if (!model) throw new Error(`Unbekanntes CPU-Modell: ${this.modelId}`)
    if (!WasmLLMEngine.supported()) {
      throw new Error('Dieser Browser unterstützt die benötigte WebAssembly-Memory64-Laufzeit nicht. Bitte aktuelles Chrome verwenden.')
    }

    onProgress('Lade lokale WebAssembly-Laufzeit …', 0)
    const [{ Wllama, LoggerWithoutDebug }, wasmModule] = await Promise.all([
      import('@wllama/wllama'),
      import('@wllama/wllama/esm/wasm/wllama.wasm?url'),
    ])
    const runtime = new Wllama(
      { default: wasmModule.default },
      { allowOffline: true, parallelDownloads: 1, logger: LoggerWithoutDebug, suppressNativeLog: true },
    )

    // Mehrere WASM-Threads sind nur mit Cross-Origin-Isolation sicher
    // verfügbar. Der lokale Vortragsserver setzt COOP/COEP; GitHub Pages
    // kann diese Header nicht setzen und bleibt deshalb bei einem Thread.
    const cpuThreads = globalThis.crossOriginIsolated
      ? Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 1))
      : 1

    await runtime.loadModelFromUrl(model.url, {
      // Erzwingt den Vulkan-unabhängigen Pfad. Auf GitHub Pages ist bewusst
      // ein Thread gesetzt, weil dort keine COOP/COEP-Header konfigurierbar sind.
      n_gpu_layers: 0,
      n_threads: cpuThreads,
      n_ctx: WASM_LLM_CONTEXT_TOKENS,
      n_batch: cpuThreads > 1 ? 256 : 128,
      useCache: true,
      progressCallback: ({ loaded, total }) => {
        const pct = total > 0 ? Math.min(1, loaded / total) : 0
        onProgress(
          pct >= 1
            ? 'Modell wird auf der CPU initialisiert …'
            : `Modell wird lokal gespeichert · ${Math.round(loaded / 1_000_000)} / ${Math.round(total / 1_000_000)} MB`,
          pct,
        )
      },
    })
    this.runtime = runtime
    onProgress('CPU-Modell ist lokal bereit', 1)
  }

  async generate(
    system: string,
    user: string,
    onToken?: (partial: string) => void,
    options: GenerateOptions = {},
  ): Promise<GenerateResult> {
    if (!this.runtime) throw new Error('CPU-Modell nicht geladen')
    const fittedUserPrompt = compactWasmPrompt(system, user)
    this.abortController = new AbortController()
    try {
      const stream = await this.runtime.createChatCompletion({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: fittedUserPrompt },
        ],
        temperature: 0,
        seed: 42,
        max_tokens: Math.min(
          WASM_LLM_OUTPUT_TOKENS,
          Math.max(32, options.maxTokens ?? WASM_LLM_OUTPUT_TOKENS),
        ),
        cache_prompt: true,
        abortSignal: this.abortController.signal,
        stream: true,
      })
      let text = ''
      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content ?? ''
        if (delta) {
          text += delta
          onToken?.(text)
        }
      }
      return { text: text.trim(), engine: this.id }
    } finally {
      this.abortController = null
    }
  }

  interrupt(): void {
    this.abortController?.abort()
  }

  async dispose(): Promise<void> {
    this.abortController?.abort()
    await this.runtime?.exit()
    this.runtime = null
  }
}
