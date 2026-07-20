import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import type { GenerateOptions, GenerateResult, LLMEngine } from './llm'
import { compactPromptToCharacterBudget } from './promptBudget'

export interface NativeLlmModel {
  id: string
  name: string
  params: string
  downloadMB: number
  minimumRamMB: number
  tier: 'quality' | 'compatibility'
  note: string
}

/**
 * Kuratierte native Android-Modelle. Die Gewichte werden nicht in die APK
 * eingebettet, sondern nach einem expliziten Download mit SHA-256-Prüfung im
 * privaten App-Speicher abgelegt.
 */
export const NATIVE_LLM_MODELS: NativeLlmModel[] = [
  {
    id: 'gemma-4-e2b-it',
    name: 'Gemma 4 E2B IT · Mobile Quality',
    params: 'E2B',
    downloadMB: 2_589,
    minimumRamMB: 7_000,
    tier: 'quality',
    note: 'Aktuelle Qualitätswahl für leistungsfähige Android-Handys; native LiteRT-LM-Inferenz ohne WebGPU oder Vulkan.',
  },
  {
    id: 'qwen3-0.6b-mobile',
    name: 'Qwen 3 0.6B · Mobile Lite',
    params: '0,6 Mrd.',
    downloadMB: 348,
    minimumRamMB: 3_400,
    tier: 'compatibility',
    note: 'No-Think-INT4: schneller, direkter Kompatibilitätspfad für Geräte, auf denen das Qualitätsmodell wegen RAM oder Speicher nicht sinnvoll läuft.',
  },
]

export interface NativeLlmCapabilities {
  native?: boolean
  runtime?: string
  backend?: string
  avoidsVulkan?: boolean
  supported: boolean
  apiLevel?: number
  abis?: string[]
  totalRamMB?: number
  availableRamMB?: number
  freeStorageBytes?: number
  cpuCores?: number
  cpuThreads?: number
  recommendedModelId?: string
  reason?: string
}

export interface NativeModelStatus {
  modelId: string
  state: 'missing' | 'partial' | 'downloading' | 'ready' | 'loaded' | 'unverified' | 'corrupt' | 'error'
  loaded?: number
  total?: number
  pct?: number
  error?: string
}

interface DownloadProgressEvent {
  modelId: string
  loaded: number
  total: number
  pct?: number
  text?: string
}

interface TokenEvent {
  requestId: string
  delta?: string
  text?: string
}

interface NativeLlmPlugin {
  capabilities(): Promise<NativeLlmCapabilities>
  listModels(): Promise<{ models: NativeLlmModel[] }>
  getModelStatus(options: { modelId: string }): Promise<NativeModelStatus>
  downloadModel(options: { modelId: string }): Promise<{ modelId: string; started: boolean; state: string }>
  loadModel(options: { modelId: string }): Promise<NativeModelStatus>
  generate(options: {
    requestId: string
    system: string
    user: string
    maxTokens: number
    deterministic: boolean
  }): Promise<GenerateResult>
  interrupt(options?: { requestId?: string }): Promise<void>
  dispose(options?: { modelId?: string }): Promise<void>
  addListener(
    eventName: 'nativeLlmDownloadProgress',
    listener: (event: DownloadProgressEvent) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'nativeLlmToken',
    listener: (event: TokenEvent) => void,
  ): Promise<PluginListenerHandle>
}

const NativeLlm = registerPlugin<NativeLlmPlugin>('NoesisNativeLlm')

function rawModelId(engineOrModelId: string): string {
  return engineOrModelId.startsWith('native:') ? engineOrModelId.slice('native:'.length) : engineOrModelId
}

function makeRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `noesis-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export class NativeLlmEngine implements LLMEngine {
  readonly id: string
  readonly label: string
  readonly execution = 'local' as const
  private activeRequestId: string | null = null

  constructor(private readonly modelId = NATIVE_LLM_MODELS[0].id) {
    this.id = `native:${modelId}`
    this.label = NATIVE_LLM_MODELS.find((model) => model.id === modelId)?.name ?? modelId
  }

  static supported(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
  }

  static async capabilities(): Promise<NativeLlmCapabilities> {
    if (!NativeLlmEngine.supported()) {
      return { native: false, supported: false, reason: 'Die native Engine ist nur in der Android-APK verfügbar.' }
    }
    return NativeLlm.capabilities()
  }

  static async status(modelId: string): Promise<NativeModelStatus> {
    if (!NativeLlmEngine.supported()) return { modelId: rawModelId(modelId), state: 'missing' }
    return NativeLlm.getModelStatus({ modelId: rawModelId(modelId) })
  }

  static async isDownloaded(modelId: string): Promise<boolean> {
    const status = await NativeLlmEngine.status(modelId)
    return status.state === 'ready' || status.state === 'loaded'
  }

  static async download(
    modelId: string,
    onProgress: (text: string, pct: number) => void,
  ): Promise<NativeModelStatus> {
    if (!NativeLlmEngine.supported()) throw new Error('Der native Modell-Download ist nur in der Android-APK verfügbar.')
    const rawId = rawModelId(modelId)
    const listener = await NativeLlm.addListener('nativeLlmDownloadProgress', (event) => {
      if (event.modelId !== rawId) return
      const eventPct = Number(event.pct)
      const pct = Number.isFinite(eventPct)
        ? Math.max(0, Math.min(1, eventPct))
        : event.total > 0
          ? Math.max(0, Math.min(1, event.loaded / event.total))
          : 0
      const loadedMB = Math.round(event.loaded / 1_000_000)
      const totalMB = Math.round(event.total / 1_000_000)
      onProgress(event.text ?? `Modell wird sicher geladen · ${loadedMB} / ${totalMB} MB`, pct)
    })
    try {
      await NativeLlm.downloadModel({ modelId: rawId })
      const startedAt = Date.now()
      while (true) {
        const status = await NativeLlm.getModelStatus({ modelId: rawId })
        if (status.state === 'ready' || status.state === 'loaded') return status
        if (status.state === 'error' || status.state === 'corrupt') {
          throw new Error(status.error || 'Der native Modelldownload ist fehlgeschlagen.')
        }
        if (Date.now() - startedAt > 2 * 60 * 60 * 1_000) {
          throw new Error('Der Modelldownload hat nach zwei Stunden noch keinen vollständigen, geprüften Stand erreicht.')
        }
        await new Promise((resolve) => setTimeout(resolve, 600))
      }
    } finally {
      await listener.remove()
    }
  }

  async load(onProgress: (text: string, pct: number) => void): Promise<void> {
    if (!NativeLlmEngine.supported()) throw new Error('Die native LiteRT-LM-Engine ist nur in der Android-APK verfügbar.')
    if (!(await NativeLlmEngine.isDownloaded(this.modelId))) {
      throw new Error('Das native Modell ist noch nicht vollständig heruntergeladen und geprüft.')
    }
    onProgress('Initialisiere native CPU-Inferenz …', 0.15)
    await NativeLlm.loadModel({ modelId: this.modelId })
    onProgress('Native LiteRT-LM-Engine ist offline bereit', 1)
  }

  async generate(
    system: string,
    user: string,
    onToken?: (partial: string) => void,
    options: GenerateOptions = {},
  ): Promise<GenerateResult> {
    if (!NativeLlmEngine.supported()) throw new Error('Die native LiteRT-LM-Engine ist nicht verfügbar.')
    const requestId = makeRequestId()
    this.activeRequestId = requestId
    let accumulated = ''
    let queued = ''
    let animationFrame: number | null = null

    const flush = () => {
      animationFrame = null
      if (queued) onToken?.(queued)
    }
    const listener = await NativeLlm.addListener('nativeLlmToken', (event) => {
      if (event.requestId !== requestId) return
      accumulated = event.text ?? `${accumulated}${event.delta ?? ''}`
      queued = accumulated
      if (animationFrame === null && typeof requestAnimationFrame === 'function') {
        animationFrame = requestAnimationFrame(flush)
      } else if (typeof requestAnimationFrame !== 'function') {
        flush()
      }
    })

    try {
      const result = await NativeLlm.generate({
        requestId,
        system,
        user: compactPromptToCharacterBudget(user, this.modelId === 'qwen3-0.6b-mobile' ? 1_800 : 10_500),
        maxTokens: Math.min(this.modelId === 'qwen3-0.6b-mobile' ? 128 : 220, Math.max(32, options.maxTokens ?? 180)),
        deterministic: options.sampling !== 'natural',
      })
      if (animationFrame !== null) cancelAnimationFrame(animationFrame)
      queued = result.text || accumulated
      flush()
      return { text: (result.text || accumulated).trim(), engine: this.id }
    } finally {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame)
      await listener.remove()
      if (this.activeRequestId === requestId) this.activeRequestId = null
    }
  }

  async interrupt(): Promise<void> {
    await NativeLlm.interrupt(this.activeRequestId ? { requestId: this.activeRequestId } : {})
  }

  async dispose(): Promise<void> {
    this.activeRequestId = null
    // Die Capacitor-Bridge verwaltet genau eine native Engine. Beim Wechsel
    // A -> B ist B bereits geladen, bevor App.tsx die alte Instanz A entsorgt.
    // Die Modell-ID verhindert, dass A dabei versehentlich die neue Engine B
    // schließt.
    await NativeLlm.dispose({ modelId: this.modelId })
  }
}
