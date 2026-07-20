import piperDataUrl from '@diffusionstudio/piper-wasm/build/piper_phonemize.data?url'
import piperWasmUrl from '@diffusionstudio/piper-wasm/build/piper_phonemize.wasm?url'
import onnxWasmUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url'
import onnxJspiWasmUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jspi.wasm?url'
import { VoiceSynthesisError, type SpeechPlayback } from './liveVoice'

export const PIPER_GERMAN_VOICE_ID = 'de_DE-thorsten-medium'
/** Voice model plus phonemizer and one ONNX/WASM runtime, rounded for the UI. */
export const PIPER_GERMAN_DOWNLOAD_MB = 100

// Pin the exact, tested Piper artifact instead of following a mutable branch.
// The expected size also prevents an HTML error page or interrupted download
// from being persisted under an .onnx filename.
const PIPER_VOICE_REVISION = '840e38a7e26d813bd6221b78cfbaefa3585b3f71'
const PIPER_VOICE_FILE = `${PIPER_GERMAN_VOICE_ID}.onnx`
const PIPER_CONFIG_FILE = `${PIPER_VOICE_FILE}.json`
const PIPER_MODEL_BYTES = 63_201_294
const PIPER_VOICE_BASE = `https://huggingface.co/diffusionstudio/piper-voices/resolve/${PIPER_VOICE_REVISION}/de/de_DE/thorsten/medium`

type PiperModule = typeof import('@mintplex-labs/piper-tts-web')
type PiperSession = Awaited<ReturnType<PiperModule['TtsSession']['create']>>

let modulePromise: Promise<PiperModule> | null = null
let sessionPromise: Promise<PiperSession> | null = null

function piper(): Promise<PiperModule> {
  modulePromise ??= import('@mintplex-labs/piper-tts-web')
  return modulePromise
}

function cleanSpeechText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/[*_#>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function piperDirectory(): Promise<FileSystemDirectoryHandle> {
  if (!navigator.storage?.getDirectory) {
    throw new Error('Der lokale Sprachspeicher wird von diesem WebView nicht unterstützt.')
  }
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle('piper', { create: true })
}

async function removeCachedVoice(): Promise<void> {
  try {
    const directory = await piperDirectory()
    await Promise.all([PIPER_VOICE_FILE, PIPER_CONFIG_FILE].map(async (name) => {
      try {
        await directory.removeEntry(name)
      } catch (error) {
        if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error
      }
    }))
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error
  }
}

function validPiperConfig(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const config = value as {
    audio?: { sample_rate?: unknown }
    espeak?: { voice?: unknown }
    inference?: { noise_scale?: unknown; length_scale?: unknown; noise_w?: unknown }
  }
  return (
    typeof config.audio?.sample_rate === 'number' && config.audio.sample_rate > 8_000 &&
    typeof config.espeak?.voice === 'string' && config.espeak.voice.length > 0 &&
    typeof config.inference?.noise_scale === 'number' &&
    typeof config.inference?.length_scale === 'number' &&
    typeof config.inference?.noise_w === 'number'
  )
}

async function cachedVoiceIsValid(): Promise<boolean> {
  try {
    const directory = await piperDirectory()
    const [modelHandle, configHandle] = await Promise.all([
      directory.getFileHandle(PIPER_VOICE_FILE),
      directory.getFileHandle(PIPER_CONFIG_FILE),
    ])
    const [model, config] = await Promise.all([modelHandle.getFile(), configHandle.getFile()])
    if (model.size !== PIPER_MODEL_BYTES || config.size < 500 || config.size > 50_000) return false
    return validPiperConfig(JSON.parse(await config.text()))
  } catch {
    return false
  }
}

async function fetchChecked(url: string): Promise<Response> {
  const response = await fetch(url, { cache: 'no-store', redirect: 'follow' })
  if (!response.ok) throw new Error(`Sprachdatei konnte nicht geladen werden (HTTP ${response.status}).`)
  return response
}

async function downloadConfig(): Promise<void> {
  const response = await fetchChecked(`${PIPER_VOICE_BASE}/${PIPER_CONFIG_FILE}`)
  const text = await response.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Der Server lieferte keine gültige Piper-Konfiguration.')
  }
  if (!validPiperConfig(parsed)) throw new Error('Die Piper-Konfiguration ist unvollständig oder inkompatibel.')
  const directory = await piperDirectory()
  const handle = await directory.getFileHandle(PIPER_CONFIG_FILE, { create: true })
  const writable = await handle.createWritable()
  await writable.write(text)
  await writable.close()
}

async function downloadModel(onProgress?: (percent: number) => void): Promise<void> {
  const response = await fetchChecked(`${PIPER_VOICE_BASE}/${PIPER_VOICE_FILE}`)
  const advertisedSize = Number(response.headers.get('Content-Length') ?? 0)
  if (advertisedSize > 0 && advertisedSize !== PIPER_MODEL_BYTES) {
    throw new Error(`Unerwartete Piper-Dateigröße (${advertisedSize} statt ${PIPER_MODEL_BYTES} Bytes).`)
  }
  if (!response.body) throw new Error('Der Browser stellte keinen Download-Datenstrom bereit.')

  const directory = await piperDirectory()
  const handle = await directory.getFileHandle(PIPER_VOICE_FILE, { create: true })
  const writable = await handle.createWritable()
  const reader = response.body.getReader()
  let received = 0
  let prefix = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      if (received === 0) prefix = new TextDecoder().decode(value.slice(0, 160)).trimStart().toLowerCase()
      received += value.byteLength
      if (received > PIPER_MODEL_BYTES) throw new Error('Die Piper-Datei ist größer als das geprüfte Modell.')
      await writable.write(value)
      onProgress?.(Math.min(90, Math.round((received / PIPER_MODEL_BYTES) * 90)))
    }
    if (received !== PIPER_MODEL_BYTES) {
      throw new Error(`Piper-Download unvollständig (${received} von ${PIPER_MODEL_BYTES} Bytes).`)
    }
    if (prefix.startsWith('<') || prefix.startsWith('{') || prefix.startsWith('version https://git-lfs')) {
      throw new Error('Der Server lieferte eine Fehlerseite statt des Piper-Modells.')
    }
    await writable.close()
  } catch (error) {
    await writable.abort().catch(() => undefined)
    await directory.removeEntry(PIPER_VOICE_FILE).catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
}

async function resetSession(): Promise<void> {
  sessionPromise = null
  const { TtsSession } = await piper()
  TtsSession._instance = null
}

async function session(progress?: (loaded: number, total: number) => void): Promise<PiperSession> {
  if (!sessionPromise) {
    sessionPromise = piper().then(({ TtsSession }) => TtsSession.create({
      voiceId: PIPER_GERMAN_VOICE_ID,
      progress: ({ loaded, total }) => progress?.(loaded, total),
      wasmPaths: {
        // ONNX accepts a filename map at runtime. The package type still exposes
        // the older string-only signature, hence the narrow cast.
        onnxWasm: {
          'ort-wasm-simd-threaded.wasm': onnxWasmUrl,
          'ort-wasm-simd-threaded.jspi.wasm': onnxJspiWasmUrl,
        } as unknown as string,
        piperData: piperDataUrl,
        piperWasm: piperWasmUrl,
      },
    })).catch((error) => {
      sessionPromise = null
      throw error
    })
  }
  return sessionPromise
}

export async function isGermanNeuralVoiceStored(): Promise<boolean> {
  const valid = await cachedVoiceIsValid()
  if (!valid) await removeCachedVoice().catch(() => undefined)
  return valid
}

export async function installGermanNeuralVoice(
  onProgress?: (percent: number) => void,
): Promise<void> {
  await resetSession()
  await removeCachedVoice()
  try {
    onProgress?.(1)
    await downloadConfig()
    await downloadModel(onProgress)
    if (!(await cachedVoiceIsValid())) throw new Error('Die heruntergeladene Piper-Stimme bestand die lokale Prüfung nicht.')
    onProgress?.(94)
    // A tiny synthesis validates the protobuf graph and primes ONNX plus the
    // phonemizer. The WASM files are bundled as same-origin APK assets.
    const prepared = await session()
    await prepared.predict('Noesis ist bereit.')
    onProgress?.(100)
  } catch (error) {
    await resetSession().catch(() => undefined)
    await removeCachedVoice().catch(() => undefined)
    throw error
  }
}

export function startGermanNeuralPlayback(text: string, rate = 1): SpeechPlayback {
  let cancelled = false
  let finished = false
  let audio: HTMLAudioElement | null = null
  let objectUrl: string | null = null
  let rejectCancellation: (error: VoiceSynthesisError) => void = () => undefined

  const synthesis = (async () => {
    const clean = cleanSpeechText(text)
    if (!clean) return
    const prepared = await session()
    if (cancelled) throw new VoiceSynthesisError('cancelled', 'Das Vorlesen wurde beendet.')
    const blob = await prepared.predict(clean)
    if (cancelled) throw new VoiceSynthesisError('cancelled', 'Das Vorlesen wurde beendet.')
    objectUrl = URL.createObjectURL(blob)
    audio = new Audio(objectUrl)
    audio.playbackRate = Math.min(1.15, Math.max(0.85, rate))
    await new Promise<void>((resolve, reject) => {
      if (!audio) return reject(new Error('Audio konnte nicht initialisiert werden.'))
      audio.onended = () => resolve()
      audio.onerror = () => reject(new Error('Die lokale Audiodatei konnte nicht abgespielt werden.'))
      void audio.play().catch(reject)
    })
  })().catch((error: unknown) => {
    if (error instanceof VoiceSynthesisError) throw error
    throw new VoiceSynthesisError(
      'synthesis-failed',
      `Die lokale Neural-Stimme konnte nicht erzeugt werden: ${error instanceof Error ? error.message : String(error)}`,
    )
  })

  const cancellation = new Promise<never>((_, reject) => {
    rejectCancellation = reject
  })
  const done = Promise.race([synthesis, cancellation]).finally(() => {
    finished = true
    audio?.pause()
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  })

  return {
    done,
    cancel: () => {
      if (cancelled || finished) return
      cancelled = true
      audio?.pause()
      rejectCancellation(new VoiceSynthesisError('cancelled', 'Das Vorlesen wurde beendet.'))
    },
  }
}
