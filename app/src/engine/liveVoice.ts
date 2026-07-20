/**
 * Browser-native voice primitives for a turn-based conversation.
 *
 * Important privacy constraint: the Web Speech API does not let this app
 * guarantee where recognition or synthesis is processed. Depending on the
 * browser, operating system and selected voice, audio/text may be handled by
 * an online service. Callers should surface `VOICE_PRIVACY_NOTICE_DE` before
 * enabling the microphone.
 */

import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export const VOICE_PRIVACY_NOTICE_DE =
  'Spracherkennung und Vorlesen werden vom Browser bzw. Betriebssystem bereitgestellt. Je nach Gerät können dabei Online-Dienste des Anbieters genutzt werden; die App kann eine rein lokale Verarbeitung deshalb nicht garantieren.'

export type VoiceRecognitionErrorCode =
  | 'unsupported'
  | 'permission-denied'
  | 'service-blocked'
  | 'network'
  | 'no-speech'
  | 'audio-capture'
  | 'language-not-supported'
  | 'aborted'
  | 'busy'
  | 'unknown'

export class VoiceRecognitionError extends Error {
  readonly code: VoiceRecognitionErrorCode
  readonly browserCode?: string
  readonly recoverable: boolean

  constructor(
    code: VoiceRecognitionErrorCode,
    message: string,
    options: { browserCode?: string; recoverable?: boolean; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause })
    this.name = 'VoiceRecognitionError'
    this.code = code
    this.browserCode = options.browserCode
    this.recoverable = options.recoverable ?? false
  }
}

export interface VoiceCapabilities {
  recognition: boolean
  recognitionProvider: 'native-android' | 'web-speech' | 'none'
  synthesis: boolean
  /** This can never be inferred reliably from browser feature detection. */
  guaranteedOffline: false
  localGermanVoiceAvailable: boolean
  privacyNotice: string
}

interface RecognitionAlternativeLike {
  transcript: string
  confidence?: number
}

interface RecognitionResultLike {
  readonly length: number
  readonly isFinal: boolean
  [index: number]: RecognitionAlternativeLike
}

interface RecognitionResultListLike {
  readonly length: number
  [index: number]: RecognitionResultLike
}

interface RecognitionEventLike {
  readonly resultIndex?: number
  readonly results: RecognitionResultListLike
}

interface RecognitionErrorEventLike {
  readonly error?: string
  readonly message?: string
}

interface RecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onaudiostart: (() => void) | null
  onspeechstart: (() => void) | null
  onresult: ((event: RecognitionEventLike) => void) | null
  onerror: ((event: RecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

type RecognitionConstructor = new () => RecognitionLike

interface NativeSpeechTranscriptEvent {
  text: string
  final: boolean
  confidence?: number
}

interface NativeSpeechErrorEvent {
  error?: string
  nativeCode?: number
}

interface NativeSpeechStateEvent {
  state: RecognitionSessionState
}

interface NativeSpeechPlugin {
  isAvailable(): Promise<{ available: boolean }>
  startListening(options: { lang: string; interimResults: boolean }): Promise<{ started: boolean }>
  stopListening(): Promise<void>
  abortListening(): Promise<void>
  addListener(
    eventName: 'nativeSpeechTranscript',
    listener: (event: NativeSpeechTranscriptEvent) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'nativeSpeechError',
    listener: (event: NativeSpeechErrorEvent) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'nativeSpeechState',
    listener: (event: NativeSpeechStateEvent) => void,
  ): Promise<PluginListenerHandle>
}

const NativeSpeech = registerPlugin<NativeSpeechPlugin>('NoesisSpeech')

function nativeSpeechPlatform(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const candidate = window as unknown as {
    SpeechRecognition?: RecognitionConstructor
    webkitSpeechRecognition?: RecognitionConstructor
  }
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null
}

export function voiceRecognitionAvailable(): boolean {
  return nativeSpeechPlatform() || recognitionConstructor() !== null
}

export function speechSynthesisAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  )
}

export function getVoiceCapabilities(): VoiceCapabilities {
  const voices = speechSynthesisAvailable() ? window.speechSynthesis.getVoices() : []
  const nativeRecognition = nativeSpeechPlatform()
  const webRecognition = recognitionConstructor() !== null
  return {
    recognition: nativeRecognition || webRecognition,
    recognitionProvider: nativeRecognition ? 'native-android' : webRecognition ? 'web-speech' : 'none',
    synthesis: speechSynthesisAvailable(),
    guaranteedOffline: false,
    localGermanVoiceAvailable: voices.some(
      (voice) => voice.localService && voice.lang.toLowerCase().startsWith('de'),
    ),
    privacyNotice: VOICE_PRIVACY_NOTICE_DE,
  }
}

export interface VoiceTranscript {
  final: string
  interim: string
  combined: string
  confidence?: number
}

export type RecognitionSessionState = 'starting' | 'listening' | 'stopping' | 'ended' | 'aborted' | 'error'

export interface RecognitionSessionOptions {
  lang?: string
  /** Keep false for normal turn taking; true depends heavily on browser support. */
  continuous?: boolean
  interimResults?: boolean
  maxAlternatives?: number
  onTranscript?: (transcript: VoiceTranscript) => void
  onStateChange?: (state: RecognitionSessionState) => void
}

export interface RecognitionSession {
  readonly result: Promise<string>
  stop(): void
  abort(): void
  getState(): RecognitionSessionState
}

function normalizedParts(parts: Array<{ index: number; text: string; final: boolean; confidence?: number }>): VoiceTranscript {
  const sorted = [...parts].sort((a, b) => a.index - b.index)
  const final = sorted
    .filter((part) => part.final)
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join(' ')
  const interim = sorted
    .filter((part) => !part.final)
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join(' ')
  const confidence = [...sorted]
    .reverse()
    .find((part) => typeof part.confidence === 'number')?.confidence
  return {
    final,
    interim,
    combined: [final, interim].filter(Boolean).join(' ').trim(),
    confidence,
  }
}

function classifyRecognitionError(event: RecognitionErrorEventLike): VoiceRecognitionError {
  const browserCode = event.error?.toLowerCase() ?? 'unknown'
  const detail = event.message?.trim()

  switch (browserCode) {
    case 'not-allowed':
      return new VoiceRecognitionError(
        'permission-denied',
        'Der Mikrofonzugriff wurde nicht erlaubt. Bitte die Browser-Berechtigung prüfen.',
        { browserCode },
      )
    case 'service-not-allowed':
      return new VoiceRecognitionError(
        'service-blocked',
        'Der Browser hat seinen Spracherkennungsdienst blockiert oder nicht freigegeben.',
        { browserCode },
      )
    case 'network':
      return new VoiceRecognitionError(
        'network',
        'Die Spracherkennung konnte ihren Dienst nicht erreichen. Dieser Browser benötigt dafür möglicherweise Internet.',
        { browserCode, recoverable: true },
      )
    case 'no-speech':
      return new VoiceRecognitionError('no-speech', 'Es wurde keine Sprache erkannt.', {
        browserCode,
        recoverable: true,
      })
    case 'audio-capture':
      return new VoiceRecognitionError(
        'audio-capture',
        'Es ist kein verfügbares Mikrofon gefunden worden oder es wird bereits verwendet.',
        { browserCode, recoverable: true },
      )
    case 'language-not-supported':
      return new VoiceRecognitionError(
        'language-not-supported',
        'Die gewählte Sprache wird von der Spracherkennung dieses Browsers nicht unterstützt.',
        { browserCode },
      )
    case 'aborted':
      return new VoiceRecognitionError('aborted', 'Die Spracherkennung wurde beendet.', {
        browserCode,
        recoverable: true,
      })
    default:
      return new VoiceRecognitionError(
        'unknown',
        detail ? `Fehler der Spracherkennung: ${detail}` : `Fehler der Spracherkennung (${browserCode}).`,
        { browserCode, recoverable: true },
      )
  }
}

/**
 * Starts one recognition session. The promise resolves with the best final
 * transcript after normal browser end or `stop()`, and rejects on browser
 * errors or `abort()`.
 */
export function startRecognitionSession(options: RecognitionSessionOptions = {}): RecognitionSession {
  if (nativeSpeechPlatform()) return startNativeRecognitionSession(options)
  const Constructor = recognitionConstructor()
  if (!Constructor) {
    const error = new VoiceRecognitionError(
      'unsupported',
      'Dieser Browser unterstützt die Web-Speech-Spracherkennung nicht.',
    )
    return {
      result: Promise.reject(error),
      stop: () => undefined,
      abort: () => undefined,
      getState: () => 'error',
    }
  }

  const recognition = new Constructor()
  recognition.lang = options.lang ?? 'de-DE'
  recognition.continuous = options.continuous ?? false
  recognition.interimResults = options.interimResults ?? true
  recognition.maxAlternatives = Math.max(1, options.maxAlternatives ?? 1)

  let state: RecognitionSessionState = 'starting'
  let settled = false
  let abortRequested = false
  let resolveResult: (text: string) => void = () => undefined
  let rejectResult: (error: VoiceRecognitionError) => void = () => undefined
  const segments = new Map<number, { index: number; text: string; final: boolean; confidence?: number }>()

  const updateState = (next: RecognitionSessionState) => {
    state = next
    options.onStateChange?.(next)
  }

  const transcript = () => normalizedParts([...segments.values()])

  const cleanup = () => {
    recognition.onaudiostart = null
    recognition.onspeechstart = null
    recognition.onresult = null
    recognition.onerror = null
    recognition.onend = null
  }

  const resolveOnce = (text: string) => {
    if (settled) return
    settled = true
    updateState('ended')
    cleanup()
    resolveResult(text.trim())
  }

  const rejectOnce = (error: VoiceRecognitionError, terminalState: RecognitionSessionState = 'error') => {
    if (settled) return
    settled = true
    updateState(terminalState)
    cleanup()
    rejectResult(error)
  }

  const result = new Promise<string>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
  })

  recognition.onaudiostart = () => updateState('listening')
  recognition.onspeechstart = () => updateState('listening')
  recognition.onresult = (event) => {
    const start = Math.max(0, event.resultIndex ?? 0)
    for (let index = start; index < event.results.length; index += 1) {
      const item = event.results[index]
      const alternative = item?.[0]
      if (!item || !alternative) continue
      segments.set(index, {
        index,
        text: alternative.transcript ?? '',
        final: item.isFinal,
        confidence: alternative.confidence,
      })
    }
    options.onTranscript?.(transcript())
  }
  recognition.onerror = (event) => {
    const error = classifyRecognitionError(event)
    rejectOnce(error, error.code === 'aborted' ? 'aborted' : 'error')
  }
  recognition.onend = () => {
    if (abortRequested) {
      rejectOnce(
        new VoiceRecognitionError('aborted', 'Die Spracherkennung wurde beendet.', { recoverable: true }),
        'aborted',
      )
      return
    }
    const current = transcript()
    // A few implementations end before marking their last segment as final.
    resolveOnce(current.final || current.combined)
  }

  try {
    recognition.start()
  } catch (cause) {
    rejectOnce(
      new VoiceRecognitionError(
        'busy',
        'Die Spracherkennung konnte nicht gestartet werden. Möglicherweise läuft bereits eine Sitzung.',
        { recoverable: true, cause },
      ),
    )
  }

  return {
    result,
    stop: () => {
      if (settled || state === 'stopping') return
      updateState('stopping')
      try {
        recognition.stop()
      } catch (cause) {
        rejectOnce(
          new VoiceRecognitionError('unknown', 'Die Spracherkennung konnte nicht sauber beendet werden.', {
            recoverable: true,
            cause,
          }),
        )
      }
    },
    abort: () => {
      if (settled) return
      abortRequested = true
      try {
        recognition.abort()
      } catch (cause) {
        rejectOnce(
          new VoiceRecognitionError('aborted', 'Die Spracherkennung wurde beendet.', {
            recoverable: true,
            cause,
          }),
          'aborted',
        )
      }
    },
    getState: () => state,
  }
}

function startNativeRecognitionSession(options: RecognitionSessionOptions): RecognitionSession {
  let state: RecognitionSessionState = 'starting'
  let settled = false
  let latest = ''
  let abortRequested = false
  let stopRequested = false
  let nativeStarted = false
  let resolveResult: (text: string) => void = () => undefined
  let rejectResult: (error: VoiceRecognitionError) => void = () => undefined
  const handles: PluginListenerHandle[] = []

  const updateState = (next: RecognitionSessionState) => {
    state = next
    options.onStateChange?.(next)
  }
  const cleanup = async () => {
    const pending = handles.splice(0).map((handle) => handle.remove())
    await Promise.allSettled(pending)
  }
  const resolveOnce = (text: string) => {
    if (settled) return
    settled = true
    updateState('ended')
    void cleanup()
    resolveResult(text.trim())
  }
  const rejectOnce = (error: VoiceRecognitionError, terminal: RecognitionSessionState = 'error') => {
    if (settled) return
    settled = true
    updateState(terminal)
    void cleanup()
    rejectResult(error)
  }
  const result = new Promise<string>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
  })

  void (async () => {
    try {
      const transcriptHandle = await NativeSpeech.addListener('nativeSpeechTranscript', (event) => {
        latest = event.text.trim()
        const transcript: VoiceTranscript = event.final
          ? { final: latest, interim: '', combined: latest, confidence: event.confidence }
          : { final: '', interim: latest, combined: latest, confidence: event.confidence }
        options.onTranscript?.(transcript)
        if (event.final) resolveOnce(latest)
      })
      if (settled || abortRequested) { await transcriptHandle.remove(); return }
      handles.push(transcriptHandle)

      const errorHandle = await NativeSpeech.addListener('nativeSpeechError', (event) => {
        const error = classifyRecognitionError({ error: event.error })
        rejectOnce(error, error.code === 'aborted' ? 'aborted' : 'error')
      })
      if (settled || abortRequested) { await errorHandle.remove(); await cleanup(); return }
      handles.push(errorHandle)

      const stateHandle = await NativeSpeech.addListener('nativeSpeechState', (event) => {
        if (settled) return
        if (event.state === 'ended') resolveOnce(latest)
        else if (event.state === 'aborted' && abortRequested) {
          rejectOnce(new VoiceRecognitionError('aborted', 'Die Spracherkennung wurde beendet.', { recoverable: true }), 'aborted')
        } else updateState(event.state)
      })
      if (settled || abortRequested) { await stateHandle.remove(); await cleanup(); return }
      handles.push(stateHandle)

      const available = await NativeSpeech.isAvailable()
      if (settled || abortRequested) { await cleanup(); return }
      if (!available.available) throw new Error('Auf diesem Android-Gerät ist kein Spracherkennungsdienst verfügbar.')
      await NativeSpeech.startListening({
        lang: options.lang ?? 'de-DE',
        interimResults: options.interimResults ?? true,
      })
      nativeStarted = true
      if (settled || abortRequested) {
        await NativeSpeech.abortListening().catch(() => undefined)
        await cleanup()
      } else if (stopRequested) {
        await NativeSpeech.stopListening()
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      const denied = /Mikrofon|permission|PERMISSION_DENIED/i.test(message)
      rejectOnce(
        new VoiceRecognitionError(
          denied ? 'permission-denied' : 'service-blocked',
          denied ? 'Der Mikrofonzugriff wurde nicht erlaubt.' : message,
          { cause },
        ),
      )
    }
  })()

  return {
    result,
    stop: () => {
      if (settled || state === 'stopping') return
      stopRequested = true
      updateState('stopping')
      if (!nativeStarted) return
      void NativeSpeech.stopListening().catch((cause) => {
        rejectOnce(new VoiceRecognitionError('unknown', 'Die Spracherkennung konnte nicht sauber beendet werden.', {
          recoverable: true,
          cause,
        }))
      })
    },
    abort: () => {
      if (settled) return
      abortRequested = true
      void NativeSpeech.abortListening().catch(() => undefined)
      rejectOnce(new VoiceRecognitionError('aborted', 'Die Spracherkennung wurde beendet.', { recoverable: true }), 'aborted')
    },
    getState: () => state,
  }
}

export type SpeechSynthesisErrorCode = 'unsupported' | 'cancelled' | 'synthesis-failed'

export class VoiceSynthesisError extends Error {
  readonly code: SpeechSynthesisErrorCode
  readonly browserCode?: string

  constructor(code: SpeechSynthesisErrorCode, message: string, browserCode?: string) {
    super(message)
    this.name = 'VoiceSynthesisError'
    this.code = code
    this.browserCode = browserCode
  }
}

export interface SpeakOptions {
  lang?: string
  rate?: number
  pitch?: number
  volume?: number
  /** Select a concrete browser/OS voice, as returned by listGermanVoices(). */
  voiceURI?: string
  /** Keep chunks modest; some mobile browsers drop very long utterances. */
  maxChunkLength?: number
  preferLocalVoice?: boolean
  /** Scales the deliberately short pauses between clauses and sentences. */
  pauseScale?: number
  /** Disable only when a strictly uniform, accessibility-oriented delivery is wanted. */
  naturalProsody?: boolean
  onChunkStart?: (chunk: string, index: number, total: number) => void
}

/** Stable, serialisable information for a voice picker in the UI. */
export interface GermanVoiceInfo {
  voiceURI: string
  name: string
  lang: string
  localService: boolean
  default: boolean
}

/** Preferences the controller applies to the next and all following answers. */
export type VoicePlaybackPreferences = Pick<
  SpeakOptions,
  'voiceURI' | 'rate' | 'pitch' | 'volume' | 'preferLocalVoice' | 'pauseScale' | 'naturalProsody'
>

export interface SpeechPlayback {
  readonly done: Promise<void>
  cancel(): void
}

async function availableVoices(timeoutMs = 750): Promise<SpeechSynthesisVoice[]> {
  if (!speechSynthesisAvailable()) return []
  const synth = window.speechSynthesis
  const initial = synth.getVoices()
  if (initial.length > 0) return initial

  return new Promise((resolve) => {
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      synth.removeEventListener('voiceschanged', finish)
      resolve(synth.getVoices())
    }
    const timer = window.setTimeout(finish, timeoutMs)
    synth.addEventListener('voiceschanged', finish, { once: true })
  })
}

function normalizeLanguageTag(value: string): string {
  return value.trim().replace('_', '-').toLowerCase()
}

function voiceScore(
  voice: SpeechSynthesisVoice,
  lang: string,
  preferLocal: boolean,
  originalIndex: number,
): number {
  const target = normalizeLanguageTag(lang)
  const language = target.split('-')[0]
  const voiceLang = normalizeLanguageTag(voice.lang)
  const searchableName = `${voice.name} ${voice.voiceURI}`.toLowerCase()
  let score = 0

  if (voiceLang === target) score += 100
  else if (voiceLang.startsWith(`${language}-`) || voiceLang === language) score += 55
  if (target === 'de-de' && /\b(deutsch|german|germany|de-de)\b/i.test(searchableName)) score += 12
  if (/\b(natural|neural|premium|enhanced|studio)\b/i.test(searchableName)) score += 14
  if (preferLocal && voice.localService) score += 18
  if (voice.default) score += 4

  // Keep browser order deterministic when two voices have otherwise equal metadata.
  return score - originalIndex / 10_000
}

function rankVoices(
  voices: SpeechSynthesisVoice[],
  lang: string,
  preferLocal: boolean,
): SpeechSynthesisVoice[] {
  const language = normalizeLanguageTag(lang).split('-')[0]
  return voices
    .map((voice, index) => ({ voice, score: voiceScore(voice, lang, preferLocal, index) }))
    .filter(({ voice }) => {
      const voiceLang = normalizeLanguageTag(voice.lang)
      return voiceLang === language || voiceLang.startsWith(`${language}-`)
    })
    .sort((a, b) => b.score - a.score)
    .map(({ voice }) => voice)
}

function selectVoice(
  voices: SpeechSynthesisVoice[],
  lang: string,
  preferLocal: boolean,
  voiceURI?: string,
): SpeechSynthesisVoice | null {
  if (voiceURI) {
    const requested = voices.find((voice) => voice.voiceURI === voiceURI)
    if (requested) return requested
  }
  return rankVoices(voices, lang, preferLocal)[0] ?? null
}

/** Lists German voices in the same preference order used for playback. */
export async function listGermanVoices(
  lang = 'de-DE',
  preferLocalVoice = true,
): Promise<GermanVoiceInfo[]> {
  const voices = await availableVoices()
  return rankVoices(voices, lang, preferLocalVoice).map((voice) => ({
    voiceURI: voice.voiceURI,
    name: voice.name,
    lang: voice.lang,
    localService: voice.localService,
    default: voice.default,
  }))
}

interface SpeechSegment {
  text: string
  pauseAfterMs: number
  rateFactor: number
  pitchDelta: number
}

interface SentencePart {
  text: string
  paragraphEnd: boolean
}

type SentenceSegmenter = {
  segment(input: string): Iterable<{ segment: string }>
}

type SentenceSegmenterConstructor = new (
  locale?: string | string[],
  options?: { granularity: 'sentence' },
) => SentenceSegmenter

function speechParagraphs(text: string): string[] {
  const prepared = text
    .replace(/\r\n?/g, '\n')
    .replace(/```(?:[\w-]+)?\s*([\s\S]*?)```/g, '$1')
    .replace(/\[([^\]]+)]\([^\s)]+(?:\s+"[^"]*")?\)/g, '$1')
    .replace(/https?:\/\/\S+/gi, ' Weblink ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/gm, '\n')
    .replace(/[*_~]+/g, '')
    .replace(/\[(?:\d+(?:\s*[,;–-]\s*\d+)*)]/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(nbsp|amp|quot);/gi, (_, entity: string) => ({ nbsp: ' ', amp: ' und ', quot: ' ' })[entity.toLowerCase()] ?? ' ')
    .replace(/[|]+/g, ', ')
    .replace(/[\t\f\v]+/g, ' ')

  return prepared
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function sentencesIn(paragraph: string, lang: string): string[] {
  const segmenterConstructor = (Intl as typeof Intl & { Segmenter?: SentenceSegmenterConstructor }).Segmenter
  if (segmenterConstructor) {
    const segmenter = new segmenterConstructor(lang, { granularity: 'sentence' })
    return Array.from(segmenter.segment(paragraph), ({ segment }) => segment.trim()).filter(Boolean)
  }
  return (paragraph.match(/[^.!?…]+(?:[.!?…]+|$)/g) ?? [paragraph]).map((part) => part.trim()).filter(Boolean)
}

function splitAtWords(text: string, maxLength: number): string[] {
  const parts: string[] = []
  let current = ''
  for (const word of text.trim().split(/\s+/)) {
    if (!current) current = word
    else if (`${current} ${word}`.length <= maxLength) current += ` ${word}`
    else {
      parts.push(current)
      current = word
    }
  }
  if (current) parts.push(current)
  return parts
}

function splitLongSentence(sentence: string, maxLength: number): string[] {
  if (sentence.length <= maxLength) return [sentence]
  const clauses = sentence.match(/[^,;:–—]+(?:[,;:–—]+|$)/g) ?? [sentence]
  const parts: string[] = []
  let current = ''

  for (const rawClause of clauses) {
    const clause = rawClause.trim()
    if (!clause) continue
    if (!current && clause.length <= maxLength) current = clause
    else if (current && `${current} ${clause}`.length <= maxLength) current += ` ${clause}`
    else {
      if (current) parts.push(current)
      current = ''
      if (clause.length <= maxLength) current = clause
      else parts.push(...splitAtWords(clause, maxLength))
    }
  }
  if (current) parts.push(current)
  return parts
}

function spokenPunctuation(text: string, isFinalPart: boolean): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  if (/[.!?…,:;–—]$/.test(trimmed)) return trimmed
  return `${trimmed}${isFinalPart ? '.' : ','}`
}

function createSpeechSegments(text: string, lang: string, maxLength: number): SpeechSegment[] {
  const sentenceParts: SentencePart[] = []
  const paragraphs = speechParagraphs(text)
  paragraphs.forEach((paragraph) => {
    const sentences = sentencesIn(paragraph, lang)
    sentences.forEach((sentence, sentenceIndex) => {
      sentenceParts.push({
        text: sentence,
        paragraphEnd: sentenceIndex === sentences.length - 1,
      })
    })
  })

  const segments: SpeechSegment[] = []
  for (const sentencePart of sentenceParts) {
    const parts = splitLongSentence(sentencePart.text, maxLength)
    parts.forEach((part, partIndex) => {
      const isFinalPart = partIndex === parts.length - 1
      const spokenText = spokenPunctuation(part, isFinalPart)
      const isQuestion = isFinalPart && /\?$/.test(spokenText)
      const isParagraphEnd = isFinalPart && sentencePart.paragraphEnd
      let pauseAfterMs = isParagraphEnd ? 210 : isFinalPart ? 115 : 65
      if (/[;:]$/.test(spokenText)) pauseAfterMs = Math.max(pauseAfterMs, 85)
      if (/,$/.test(spokenText)) pauseAfterMs = Math.max(pauseAfterMs, 60)
      segments.push({
        text: spokenText,
        pauseAfterMs,
        rateFactor: isQuestion ? 0.98 : /[;:]$/.test(spokenText) ? 0.985 : 1,
        pitchDelta: isQuestion ? 0.025 : 0,
      })
    })
  }
  return segments
}

function speakUtterance(
  synth: SpeechSynthesis,
  chunk: string,
  options: Required<Pick<SpeakOptions, 'lang' | 'rate' | 'pitch' | 'volume'>>,
  voice: SpeechSynthesisVoice | null,
  isCancelled: () => boolean,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isCancelled()) {
      reject(new VoiceSynthesisError('cancelled', 'Das Vorlesen wurde beendet.'))
      return
    }
    const utterance = new SpeechSynthesisUtterance(chunk)
    utterance.lang = options.lang
    utterance.rate = options.rate
    utterance.pitch = options.pitch
    utterance.volume = options.volume
    if (voice) utterance.voice = voice
    utterance.onend = () => resolve()
    utterance.onerror = (event) => {
      const browserCode = event.error
      if (isCancelled() || browserCode === 'canceled' || browserCode === 'interrupted') {
        reject(new VoiceSynthesisError('cancelled', 'Das Vorlesen wurde beendet.', browserCode))
      } else {
        reject(
          new VoiceSynthesisError(
            'synthesis-failed',
            `Das Vorlesen ist fehlgeschlagen${browserCode ? ` (${browserCode})` : ''}.`,
            browserCode,
          ),
        )
      }
    }
    synth.speak(utterance)
  })
}

/** Starts sequential speech synthesis and exposes an awaitable completion. */
export function startSpeechPlayback(text: string, options: SpeakOptions = {}): SpeechPlayback {
  if (!speechSynthesisAvailable()) {
    return {
      done: Promise.reject(
        new VoiceSynthesisError('unsupported', 'Dieser Browser unterstützt das Vorlesen nicht.'),
      ),
      cancel: () => undefined,
    }
  }

  const synth = window.speechSynthesis
  let cancelled = false
  let finished = false
  let rejectCancellation: (error: VoiceSynthesisError) => void = () => undefined
  const lang = options.lang ?? 'de-DE'
  const rate = Math.min(2, Math.max(0.5, options.rate ?? 1))
  const pitch = Math.min(2, Math.max(0, options.pitch ?? 1))
  const volume = Math.min(1, Math.max(0, options.volume ?? 1))
  const maxChunkLength = Math.max(80, options.maxChunkLength ?? 220)
  const pauseScale = Math.min(3, Math.max(0, options.pauseScale ?? 1))
  const naturalProsody = options.naturalProsody ?? true
  const segments = createSpeechSegments(text, lang, maxChunkLength)

  const sequence = (async () => {
    if (segments.length === 0) return
    const voices = await availableVoices()
    if (cancelled) throw new VoiceSynthesisError('cancelled', 'Das Vorlesen wurde beendet.')
    const voice = selectVoice(voices, lang, options.preferLocalVoice ?? true, options.voiceURI)
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index]
      options.onChunkStart?.(segment.text, index, segments.length)
      const segmentRate = Math.min(2, Math.max(0.5, rate * (naturalProsody ? segment.rateFactor : 1)))
      const segmentPitch = Math.min(2, Math.max(0, pitch + (naturalProsody ? segment.pitchDelta : 0)))
      await speakUtterance(
        synth,
        segment.text,
        { lang, rate: segmentRate, pitch: segmentPitch, volume },
        voice,
        () => cancelled,
      )
      if (cancelled) throw new VoiceSynthesisError('cancelled', 'Das Vorlesen wurde beendet.')
      if (naturalProsody && index < segments.length - 1 && segment.pauseAfterMs > 0 && pauseScale > 0) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, Math.round(segment.pauseAfterMs * pauseScale))
        })
        if (cancelled) throw new VoiceSynthesisError('cancelled', 'Das Vorlesen wurde beendet.')
      }
    }
  })()
  const cancellation = new Promise<never>((_, reject) => {
    rejectCancellation = reject
  })
  // Einige mobile Browser feuern nach speechSynthesis.cancel() weder onend
  // noch onerror. Das explizite Race garantiert trotzdem ein abgeschlossenes
  // Promise und verhindert hängende Voice-Turns.
  const done = Promise.race([sequence, cancellation]).finally(() => {
    finished = true
  })

  return {
    done,
    cancel: () => {
      if (cancelled || finished) return
      cancelled = true
      synth.cancel()
      rejectCancellation(new VoiceSynthesisError('cancelled', 'Das Vorlesen wurde beendet.'))
    },
  }
}

/** Convenience wrapper for callers that only need an awaitable Promise. */
export function speakText(text: string, options: SpeakOptions = {}): Promise<void> {
  return startSpeechPlayback(text, options).done
}

export function cancelAllSpeech(): void {
  if (!speechSynthesisAvailable()) return
  window.speechSynthesis.cancel()
}

export type LiveVoicePhase = 'idle' | 'listening' | 'thinking' | 'speaking' | 'paused' | 'error'

export interface LiveVoiceSnapshot {
  phase: LiveVoicePhase
  finalTranscript: string
  interimTranscript: string
  lastUserText: string
  error: VoiceRecognitionError | VoiceSynthesisError | null
}

export interface TurnBasedVoiceControllerOptions {
  /** Called after a completed speech turn; return the answer that should be read aloud. */
  onTurn: (transcript: string) => Promise<string | null | undefined>
  onSnapshot?: (snapshot: LiveVoiceSnapshot) => void
  onTurnError?: (error: unknown) => void
  onCancelTurn?: () => void
  lang?: string
  speakResponses?: boolean
  autoContinue?: boolean
  playback?: VoicePlaybackPreferences
  /** Optional local/neural output implementation. Falls back to Web Speech. */
  startPlayback?: (text: string, options: SpeakOptions) => SpeechPlayback
  /** Quiet hand-off between the final spoken segment and a fresh microphone session. */
  turnGapMs?: number
  /** Lets the device speaker decay before listening after a barge-in. */
  bargeInDelayMs?: number
}

/**
 * Orchestrates listen → process → speak → listen without recording while the
 * answer is playing. This deliberate half-duplex design avoids feeding the
 * synthetic voice back into the microphone on phones.
 */
export class TurnBasedVoiceController {
  private readonly options: TurnBasedVoiceControllerOptions
  private active = false
  private paused = false
  private generation = 0
  private recognition: RecognitionSession | null = null
  private playback: SpeechPlayback | null = null
  private playbackPreferences: VoicePlaybackPreferences
  private restartTimer: number | null = null
  private snapshot: LiveVoiceSnapshot = {
    phase: 'idle',
    finalTranscript: '',
    interimTranscript: '',
    lastUserText: '',
    error: null,
  }

  constructor(options: TurnBasedVoiceControllerOptions) {
    this.options = options
    this.playbackPreferences = { ...options.playback }
  }

  getSnapshot(): LiveVoiceSnapshot {
    return { ...this.snapshot }
  }

  /** Merges voice/rate settings without interrupting the current spoken answer. */
  setPlaybackPreferences(preferences: VoicePlaybackPreferences): void {
    this.playbackPreferences = { ...this.playbackPreferences, ...preferences }
  }

  getPlaybackPreferences(): VoicePlaybackPreferences {
    return { ...this.playbackPreferences }
  }

  start(): void {
    if (this.active && !this.paused) return
    if (!voiceRecognitionAvailable()) {
      const error = new VoiceRecognitionError(
        'unsupported',
        'Dieser Browser unterstützt die Web-Speech-Spracherkennung nicht.',
      )
      this.active = false
      this.paused = false
      this.update({ phase: 'error', error })
      return
    }
    this.clearScheduledListen()
    this.active = true
    this.paused = false
    this.generation += 1
    this.listen(this.generation)
  }

  pause(): void {
    if (!this.active) return
    this.clearScheduledListen()
    this.paused = true
    this.generation += 1
    this.recognition?.abort()
    this.recognition = null
    this.playback?.cancel()
    this.playback = null
    this.update({ phase: 'paused', finalTranscript: '', interimTranscript: '' })
  }

  resume(): void {
    if (!this.active || !this.paused) return
    this.clearScheduledListen()
    this.paused = false
    this.generation += 1
    const generation = this.generation
    this.update({ finalTranscript: '', interimTranscript: '', error: null })
    // Chrome/Android meldet sonst bei sehr schnellem Pause→Fortsetzen
    // gelegentlich noch eine laufende Recognition-Instanz ("busy").
    this.scheduleListen(generation, 220)
  }

  /** Ends the voice session. An in-flight model request is signalled separately. */
  stop(): void {
    this.clearScheduledListen()
    this.active = false
    this.paused = false
    this.generation += 1
    this.recognition?.abort()
    this.recognition = null
    this.playback?.cancel()
    this.playback = null
    this.options.onCancelTurn?.()
    this.update({
      phase: 'idle',
      finalTranscript: '',
      interimTranscript: '',
      lastUserText: '',
      error: null,
    })
  }

  /** Stops the spoken answer, then opens the microphone after a short echo-safe delay. */
  interruptSpeech(): void {
    if (!this.active || this.paused || this.snapshot.phase !== 'speaking' || !this.playback) return
    this.clearScheduledListen()
    this.recognition?.abort()
    this.recognition = null
    this.playback?.cancel()
    this.playback = null
    this.generation += 1
    this.scheduleListen(this.generation, Math.max(80, this.options.bargeInDelayMs ?? 180))
  }

  private update(patch: Partial<LiveVoiceSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    this.options.onSnapshot?.({ ...this.snapshot })
  }

  private shouldContinue(generation: number): boolean {
    return this.active && !this.paused && generation === this.generation
  }

  private clearScheduledListen(): void {
    if (this.restartTimer === null) return
    window.clearTimeout(this.restartTimer)
    this.restartTimer = null
  }

  private scheduleListen(generation: number, delayMs: number): void {
    this.clearScheduledListen()
    this.restartTimer = window.setTimeout(() => {
      this.restartTimer = null
      if (!this.shouldContinue(generation)) return
      this.listen(generation)
    }, Math.max(0, delayMs))
  }

  private scheduleNextListen(generation: number, delayMs: number): void {
    if (!this.shouldContinue(generation)) return
    this.generation += 1
    this.scheduleListen(this.generation, delayMs)
  }

  private listen(generation: number): void {
    if (!this.shouldContinue(generation)) return
    this.update({
      phase: 'listening',
      finalTranscript: '',
      interimTranscript: '',
      error: null,
    })
    const recognition = startRecognitionSession({
      lang: this.options.lang ?? 'de-DE',
      continuous: false,
      interimResults: true,
      onTranscript: (transcript) => {
        if (!this.shouldContinue(generation)) return
        this.update({
          finalTranscript: transcript.final,
          interimTranscript: transcript.interim,
        })
      },
    })
    this.recognition = recognition

    void recognition.result
      .then(async (transcript) => {
        if (!this.shouldContinue(generation)) return
        this.recognition = null
        const clean = transcript.trim()
        if (!clean) {
          this.restartAfterEmptyTurn(generation)
          return
        }
        this.update({
          phase: 'thinking',
          finalTranscript: clean,
          interimTranscript: '',
          lastUserText: clean,
        })
        const answer = await this.options.onTurn(clean)
        if (!this.shouldContinue(generation)) return
        const shouldSpeak = (this.options.speakResponses ?? true) && Boolean(answer?.trim())
        if (shouldSpeak && answer) {
          this.update({ phase: 'speaking' })
          const playbackOptions = {
            lang: this.options.lang ?? 'de-DE',
            ...this.playbackPreferences,
          }
          const playback = this.options.startPlayback
            ? this.options.startPlayback(answer, playbackOptions)
            : startSpeechPlayback(answer, playbackOptions)
          this.playback = playback
          try {
            await playback.done
          } catch (error) {
            if (!this.shouldContinue(generation)) return
            if (error instanceof VoiceSynthesisError) {
              if (error.code !== 'cancelled') this.options.onTurnError?.(error)
              // Vorlesen ist Komfort, nicht Voraussetzung für den Dialog:
              // Die Textantwort bleibt erhalten und der nächste Sprachzug
              // beginnt auch dann, wenn die Gerätestimme ausfällt.
            } else {
              throw error
            }
          } finally {
            if (this.playback === playback) this.playback = null
          }
        }
        if (!this.shouldContinue(generation)) return
        if (this.options.autoContinue ?? true) {
          this.scheduleNextListen(generation, Math.max(80, this.options.turnGapMs ?? 220))
        } else {
          this.paused = true
          this.update({ phase: 'paused' })
        }
      })
      .catch((error: unknown) => this.handleError(error, generation))
  }

  private restartAfterEmptyTurn(generation: number): void {
    if (!this.shouldContinue(generation)) return
    this.scheduleNextListen(generation, 180)
  }

  private handleError(error: unknown, generation: number): void {
    if (!this.shouldContinue(generation)) return
    this.recognition = null
    if (error instanceof VoiceRecognitionError && error.code === 'aborted') return
    this.options.onTurnError?.(error)

    if (error instanceof VoiceRecognitionError && error.code === 'no-speech') {
      this.restartAfterEmptyTurn(generation)
      return
    }

    const normalized =
      error instanceof VoiceRecognitionError || error instanceof VoiceSynthesisError
        ? error
        : new VoiceRecognitionError('unknown', 'Der Sprachdialog ist unerwartet fehlgeschlagen.', {
            recoverable: true,
            cause: error,
          })
    this.paused = true
    this.update({ phase: 'error', error: normalized })
  }
}
