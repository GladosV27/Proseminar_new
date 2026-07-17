import piperDataUrl from '@diffusionstudio/piper-wasm/build/piper_phonemize.data?url'
import piperWasmUrl from '@diffusionstudio/piper-wasm/build/piper_phonemize.wasm?url'
import onnxWasmUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url'
import onnxJspiWasmUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jspi.wasm?url'
import { VoiceSynthesisError, type SpeechPlayback } from './liveVoice'

export const PIPER_GERMAN_VOICE_ID = 'de_DE-thorsten-medium'
/** Voice model plus phonemizer and one ONNX/WASM runtime, rounded for the UI. */
export const PIPER_GERMAN_DOWNLOAD_MB = 100

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
  try {
    const { stored } = await piper()
    return (await stored()).includes(PIPER_GERMAN_VOICE_ID)
  } catch {
    return false
  }
}

export async function installGermanNeuralVoice(
  onProgress?: (percent: number) => void,
): Promise<void> {
  const { download } = await piper()
  await download(PIPER_GERMAN_VOICE_ID, ({ loaded, total }) => {
    if (total > 0) onProgress?.(Math.min(96, Math.round((loaded / total) * 96)))
  })
  // A tiny synthesis primes ONNX and the phonemizer too. Their same-origin
  // assets then remain in the PWA runtime cache for offline use.
  const prepared = await session()
  await prepared.predict('Noesis ist bereit.')
  onProgress?.(100)
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
