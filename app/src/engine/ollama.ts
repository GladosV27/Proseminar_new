import type { TrialGenerationMetrics, TrialModelProvenance } from '../data/types'
import type { GenerateOptions, GenerateResult, LLMEngine } from './llm'

export const OLLAMA_DEFAULTS = Object.freeze({
  endpoint: 'http://127.0.0.1:11434',
  model: 'qwen3:8b',
  temperature: 0,
  seed: 42,
  numCtx: 4096,
  numPredict: 160,
  think: false,
  keepAlive: '30m',
})

export interface OllamaConfig {
  endpoint: string
  model: string
  temperature: number
  seed: number
  numCtx: number
  numPredict: number
  think: boolean
  keepAlive: string
}

export interface OllamaModelInfo {
  name?: string
  model?: string
  digest?: string
  size?: number
  size_vram?: number
  details?: {
    parameter_size?: string
    quantization_level?: string
  }
}

interface OllamaTagsResponse { models?: OllamaModelInfo[] }
interface OllamaPsResponse { models?: OllamaModelInfo[] }
interface OllamaVersionResponse { version?: string }

interface OllamaStreamChunk {
  model?: string
  message?: { content?: string; thinking?: string }
  done?: boolean
  done_reason?: string
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
  prompt_eval_duration?: number
  eval_count?: number
  eval_duration?: number
  error?: string
}

export interface OllamaStatus {
  reachable: boolean
  localOrigin: boolean
  version: string | null
  modelInstalled: boolean
  modelInfo: OllamaModelInfo | null
  message: string
}

function normalizeEndpoint(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function modelMatches(info: OllamaModelInfo, model: string): boolean {
  const names = [info.name, info.model].filter(Boolean)
  return names.some((name) => name === model || (model.endsWith(':latest') && name === model.slice(0, -7)))
}

function milliseconds(nanoseconds: number | undefined): number | undefined {
  return typeof nanoseconds === 'number' && Number.isFinite(nanoseconds)
    ? Math.round((nanoseconds / 1_000_000) * 10) / 10
    : undefined
}

function finitePositive(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function errorDetail(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > 300 ? `${clean.slice(0, 297)}…` : clean
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = globalThis.setTimeout(() => controller.abort('timeout'), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`Ollama antwortet nach ${Math.round(timeoutMs / 1000)} s nicht.`)
    throw error
  } finally {
    globalThis.clearTimeout(timer)
  }
}

async function fetchJson<T>(endpoint: string, path: string, init: RequestInit = {}, timeoutMs = 4_000): Promise<T> {
  let response: Response
  try {
    response = await fetchWithTimeout(`${endpoint}${path}`, init, timeoutMs)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Ollama ist unter ${endpoint} nicht erreichbar (${detail}). `
      + 'Starte Noesis über „NOESIS_LAB_STARTEN.cmd“; das Experiment wechselt nicht auf ein Ersatzmodell.',
    )
  }
  if (!response.ok) {
    const detail = errorDetail(await response.text())
    throw new Error(`Ollama ${path}: HTTP ${response.status}${detail ? ` – ${detail}` : ''}`)
  }
  return response.json() as Promise<T>
}

/** Das PC-Experiment darf nur von der lokalen Lab-Seite auf Ollama zugreifen.
 * Damit wird ein GitHub-Pages→localhost-Mischbetrieb weder vorausgesetzt noch
 * versehentlich als reproduzierbarer Aufbau ausgegeben. */
export function isLocalLabOrigin(): boolean {
  if (typeof window === 'undefined') return true
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(window.location.hostname)
}

export function frozenOllamaConfig(overrides: Partial<OllamaConfig> = {}): Readonly<OllamaConfig> {
  const envEndpoint = import.meta.env?.VITE_OLLAMA_BASE_URL as string | undefined
  return Object.freeze({
    ...OLLAMA_DEFAULTS,
    ...(envEndpoint ? { endpoint: envEndpoint } : {}),
    ...overrides,
    endpoint: normalizeEndpoint(overrides.endpoint ?? envEndpoint ?? OLLAMA_DEFAULTS.endpoint),
  })
}

export async function inspectOllama(config: Readonly<OllamaConfig> = frozenOllamaConfig()): Promise<OllamaStatus> {
  if (!isLocalLabOrigin()) {
    return {
      reachable: false,
      localOrigin: false,
      version: null,
      modelInstalled: false,
      modelInfo: null,
      message: 'Das Experimentierlabor wird ausschließlich über den lokalen Starter ausgeführt.',
    }
  }
  try {
    const [version, tags] = await Promise.all([
      fetchJson<OllamaVersionResponse>(config.endpoint, '/api/version'),
      fetchJson<OllamaTagsResponse>(config.endpoint, '/api/tags'),
    ])
    const modelInfo = tags.models?.find((candidate) => modelMatches(candidate, config.model)) ?? null
    return {
      reachable: true,
      localOrigin: true,
      version: version.version ?? null,
      modelInstalled: Boolean(modelInfo),
      modelInfo,
      message: modelInfo
        ? `${config.model} ist lokal installiert.`
        : `${config.model} fehlt. Einmalig im Terminal ausführen: ollama pull ${config.model}`,
    }
  } catch (error) {
    return {
      reachable: false,
      localOrigin: true,
      version: null,
      modelInstalled: false,
      modelInfo: null,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

function metricsFromChunk(chunk: OllamaStreamChunk, ttftMs: number | undefined): TrialGenerationMetrics {
  const evalDuration = chunk.eval_duration
  const completionTokens = finitePositive(chunk.eval_count)
  const tokensPerSecond = completionTokens !== undefined && evalDuration && evalDuration > 0
    ? Math.round((completionTokens / (evalDuration / 1_000_000_000)) * 10) / 10
    : undefined
  return {
    ...(ttftMs !== undefined ? { ttftMs: Math.round(ttftMs * 10) / 10 } : {}),
    ...(finitePositive(chunk.prompt_eval_count) !== undefined ? { promptTokens: chunk.prompt_eval_count } : {}),
    ...(completionTokens !== undefined ? { completionTokens } : {}),
    ...(tokensPerSecond !== undefined ? { tokensPerSecond } : {}),
    ...(milliseconds(chunk.load_duration) !== undefined ? { modelLoadMs: milliseconds(chunk.load_duration) } : {}),
    ...(milliseconds(chunk.prompt_eval_duration) !== undefined ? { promptEvalMs: milliseconds(chunk.prompt_eval_duration) } : {}),
    ...(milliseconds(chunk.total_duration) !== undefined ? { modelTotalMs: milliseconds(chunk.total_duration) } : {}),
  }
}

export class OllamaEngine implements LLMEngine {
  readonly id: string
  readonly label: string
  readonly execution = 'local' as const
  readonly config: Readonly<OllamaConfig>
  private abortController: AbortController | null = null
  private provenance: TrialModelProvenance | null = null

  constructor(overrides: Partial<OllamaConfig> = {}) {
    this.config = frozenOllamaConfig(overrides)
    this.id = `ollama:${this.config.model}`
    this.label = `${this.config.model} · Ollama lokal`
  }

  getProvenance(): TrialModelProvenance | null {
    return this.provenance ? structuredClone(this.provenance) : null
  }

  /** Prüft Modell und Runtime und lädt die Gewichte einmal vor dem Messlauf.
   * Fehler werden nach außen gereicht; es gibt absichtlich keinen Fallback. */
  async load(onProgress: (text: string, pct: number) => void = () => {}): Promise<void> {
    onProgress('Prüfe lokalen Ollama-Dienst …', 0.1)
    const status = await inspectOllama(this.config)
    if (!status.localOrigin || !status.reachable) throw new Error(status.message)
    if (!status.modelInstalled || !status.modelInfo) throw new Error(status.message)

    onProgress(`Wärme ${this.config.model} vor …`, 0.45)
    await fetchJson<Record<string, unknown>>(
      this.config.endpoint,
      '/api/generate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          prompt: '',
          stream: false,
          keep_alive: this.config.keepAlive,
          options: { num_ctx: this.config.numCtx },
        }),
      },
      10 * 60_000,
    )

    let residentVramBytes: number | undefined
    try {
      const ps = await fetchJson<OllamaPsResponse>(this.config.endpoint, '/api/ps')
      residentVramBytes = ps.models?.find((candidate) => modelMatches(candidate, this.config.model))?.size_vram
    } catch {
      // /api/ps ist eine reine Diagnose. Seine Abwesenheit darf einen gültigen Messstand nicht blockieren.
    }

    this.provenance = {
      provider: 'ollama',
      model: this.config.model,
      ...(status.modelInfo.digest ? { digest: status.modelInfo.digest } : {}),
      ...(status.version ? { runtime: `Ollama ${status.version}` } : {}),
      endpoint: this.config.endpoint,
      ...(status.modelInfo.details?.parameter_size ? { parameterSize: status.modelInfo.details.parameter_size } : {}),
      ...(status.modelInfo.details?.quantization_level ? { quantization: status.modelInfo.details.quantization_level } : {}),
      ...(status.modelInfo.size ? { modelSizeBytes: status.modelInfo.size } : {}),
      ...(residentVramBytes !== undefined ? { residentVramBytes } : {}),
      parameters: {
        temperature: this.config.temperature,
        seed: this.config.seed,
        numCtx: this.config.numCtx,
        numPredict: this.config.numPredict,
        think: this.config.think,
        keepAlive: this.config.keepAlive,
      },
    }
    onProgress(`${this.config.model} ist warm und für den Messlauf fixiert.`, 1)
  }

  async generate(
    system: string,
    user: string,
    onToken?: (partial: string) => void,
    options: GenerateOptions = {},
  ): Promise<GenerateResult> {
    if (!this.provenance) throw new Error('Ollama wurde noch nicht geprüft und vorgewärmt. Messlauf nicht gestartet.')
    if (this.abortController) throw new Error('Ollama verarbeitet bereits eine Anfrage.')

    const controller = new AbortController()
    this.abortController = controller
    const requestStarted = performance.now()
    const timeout = globalThis.setTimeout(() => controller.abort('timeout'), 3 * 60_000)
    try {
      const response = await fetch(`${this.config.endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          stream: true,
          think: this.config.think,
          keep_alive: this.config.keepAlive,
          options: {
            temperature: this.config.temperature,
            seed: this.config.seed,
            num_ctx: this.config.numCtx,
            num_predict: Math.min(this.config.numPredict, Math.max(32, options.maxTokens ?? this.config.numPredict)),
          },
        }),
      })
      if (!response.ok || !response.body) {
        const detail = errorDetail(await response.text())
        throw new Error(`Ollama-Generierung fehlgeschlagen: HTTP ${response.status}${detail ? ` – ${detail}` : ''}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let text = ''
      let firstTokenAt: number | undefined
      let finalChunk: OllamaStreamChunk | null = null

      const processLine = (line: string) => {
        if (!line.trim()) return
        let chunk: OllamaStreamChunk
        try {
          chunk = JSON.parse(line) as OllamaStreamChunk
        } catch {
          throw new Error(`Ollama lieferte ungültiges Streaming-JSON: ${errorDetail(line)}`)
        }
        if (chunk.error) throw new Error(`Ollama: ${chunk.error}`)
        const delta = chunk.message?.content ?? ''
        if (delta) {
          if (firstTokenAt === undefined) firstTokenAt = performance.now()
          text += delta
          onToken?.(text)
        }
        if (chunk.done) finalChunk = chunk
      }

      while (true) {
        const { done, value } = await reader.read()
        buffer += decoder.decode(value, { stream: !done })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) processLine(line)
        if (done) break
      }
      if (buffer.trim()) processLine(buffer)
      if (!finalChunk) throw new Error('Ollama hat den Stream ohne Abschlussmetadaten beendet.')
      if (!text.trim()) throw new Error('Ollama hat keine finale Antwort geliefert (Thinking-Inhalt wird nicht als Antwort gewertet).')

      return {
        text: text.trim(),
        engine: this.id,
        metrics: metricsFromChunk(finalChunk, firstTokenAt === undefined ? undefined : firstTokenAt - requestStarted),
        provenance: this.getProvenance() ?? undefined,
      }
    } catch (error) {
      if (controller.signal.aborted && controller.signal.reason === 'timeout') {
        throw new Error('Ollama-Anfrage nach 180 Sekunden abgebrochen. Der Lauf bleibt als fortsetzbarer Checkpoint erhalten.')
      }
      throw error
    } finally {
      globalThis.clearTimeout(timeout)
      this.abortController = null
    }
  }

  interrupt(): void {
    this.abortController?.abort('user')
  }
}
