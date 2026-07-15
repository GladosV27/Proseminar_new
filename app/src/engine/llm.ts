import { splitSentences, terms } from './text'
import type { MLCEngine } from '@mlc-ai/web-llm'

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

export interface LLMEngine {
  readonly id: string
  readonly label: string
  generate(system: string, user: string, onToken?: (partial: string) => void): Promise<GenerateResult>
}

// ────────────────────────── Demo-Engine (extraktiv, deterministisch) ──────────────────────────

export class ExtractiveEngine implements LLMEngine {
  readonly id = 'extractive'
  readonly label = 'Demo-Engine (extraktiv, ohne LLM)'

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
  private engine: MLCEngine | null = null

  constructor(private modelId: string) {
    this.id = modelId
    const m = WEBLLM_MODELS.find((x) => x.id === modelId)
    this.label = m ? m.name : modelId
  }

  static supported(): boolean {
    return typeof navigator !== 'undefined' && 'gpu' in navigator
  }

  /** Prüft vor einem Offline-Start, ob sämtliche Modellartefakte im Browser-Cache liegen. */
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

  async generate(system: string, user: string, onToken?: (partial: string) => void): Promise<GenerateResult> {
    if (!this.engine) throw new Error('Modell nicht geladen')
    const stream = (await this.engine.chat.completions.create({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0,
      max_tokens: 220,
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
}
