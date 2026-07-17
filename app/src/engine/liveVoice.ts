/**
 * Browser-native voice primitives for a turn-based conversation.
 *
 * Important privacy constraint: the Web Speech API does not let this app
 * guarantee where recognition or synthesis is processed. Depending on the
 * browser, operating system and selected voice, audio/text may be handled by
 * an online service. Callers should surface `VOICE_PRIVACY_NOTICE_DE` before
 * enabling the microphone.
 */

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

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const candidate = window as unknown as {
    SpeechRecognition?: RecognitionConstructor
    webkitSpeechRecognition?: RecognitionConstructor
  }
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null
}

export function voiceRecognitionAvailable(): boolean {
  return recognitionConstructor() !== null
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
  return {
    recognition: voiceRecognitionAvailable(),
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
  /** Keep chunks modest; some mobile browsers drop very long utterances. */
  maxChunkLength?: number
  preferLocalVoice?: boolean
  onChunkStart?: (chunk: string, index: number, total: number) => void
}

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

function selectVoice(voices: SpeechSynthesisVoice[], lang: string, preferLocal: boolean): SpeechSynthesisVoice | null {
  const target = lang.toLowerCase()
  const language = target.split('-')[0]
  const ranked = voices
    .map((voice) => {
      const voiceLang = voice.lang.toLowerCase()
      let score = 0
      if (voiceLang === target) score += 10
      else if (voiceLang.startsWith(`${language}-`) || voiceLang === language) score += 5
      if (preferLocal && voice.localService) score += 2
      if (voice.default) score += 1
      return { voice, score }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
  return ranked[0]?.voice ?? null
}

function speechChunks(text: string, maxLength: number): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return []
  const sentences = normalized.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) ?? [normalized]
  const chunks: string[] = []
  let current = ''

  const pushWords = (value: string) => {
    const words = value.trim().split(/\s+/)
    for (const word of words) {
      if (!current) current = word
      else if (`${current} ${word}`.length <= maxLength) current += ` ${word}`
      else {
        chunks.push(current)
        current = word
      }
    }
  }

  for (const sentence of sentences) {
    const trimmed = sentence.trim()
    if (!trimmed) continue
    if (!current && trimmed.length <= maxLength) current = trimmed
    else if (current && `${current} ${trimmed}`.length <= maxLength) current += ` ${trimmed}`
    else {
      if (current) chunks.push(current)
      current = ''
      if (trimmed.length <= maxLength) current = trimmed
      else pushWords(trimmed)
    }
  }
  if (current) chunks.push(current)
  return chunks
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
  const rate = Math.min(2, Math.max(0.5, options.rate ?? 1.03))
  const pitch = Math.min(2, Math.max(0, options.pitch ?? 1))
  const volume = Math.min(1, Math.max(0, options.volume ?? 1))
  const maxChunkLength = Math.max(80, options.maxChunkLength ?? 220)
  const chunks = speechChunks(text, maxChunkLength)

  const sequence = (async () => {
    if (chunks.length === 0) return
    const voices = await availableVoices()
    if (cancelled) throw new VoiceSynthesisError('cancelled', 'Das Vorlesen wurde beendet.')
    const voice = selectVoice(voices, lang, options.preferLocalVoice ?? true)
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index]
      options.onChunkStart?.(chunk, index, chunks.length)
      await speakUtterance(synth, chunk, { lang, rate, pitch, volume }, voice, () => cancelled)
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
  private snapshot: LiveVoiceSnapshot = {
    phase: 'idle',
    finalTranscript: '',
    interimTranscript: '',
    lastUserText: '',
    error: null,
  }

  constructor(options: TurnBasedVoiceControllerOptions) {
    this.options = options
  }

  getSnapshot(): LiveVoiceSnapshot {
    return { ...this.snapshot }
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
    this.active = true
    this.paused = false
    this.generation += 1
    this.listen(this.generation)
  }

  pause(): void {
    if (!this.active) return
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
    this.paused = false
    this.generation += 1
    const generation = this.generation
    this.update({ phase: 'listening', finalTranscript: '', interimTranscript: '', error: null })
    // Chrome/Android meldet sonst bei sehr schnellem Pause→Fortsetzen
    // gelegentlich noch eine laufende Recognition-Instanz ("busy").
    window.setTimeout(() => this.listen(generation), 220)
  }

  /** Ends the voice session. An in-flight model request is signalled separately. */
  stop(): void {
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

  /** Stops the spoken answer and immediately opens the microphone for a new turn. */
  interruptSpeech(): void {
    if (!this.active || this.paused || this.snapshot.phase !== 'speaking' || !this.playback) return
    this.recognition?.abort()
    this.recognition = null
    this.playback?.cancel()
    this.playback = null
    this.generation += 1
    this.listen(this.generation)
  }

  private update(patch: Partial<LiveVoiceSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    this.options.onSnapshot?.({ ...this.snapshot })
  }

  private shouldContinue(generation: number): boolean {
    return this.active && !this.paused && generation === this.generation
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
          const playback = startSpeechPlayback(answer, { lang: this.options.lang ?? 'de-DE' })
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
          this.generation += 1
          this.listen(this.generation)
        } else {
          this.paused = true
          this.update({ phase: 'paused' })
        }
      })
      .catch((error: unknown) => this.handleError(error, generation))
  }

  private restartAfterEmptyTurn(generation: number): void {
    if (!this.shouldContinue(generation)) return
    window.setTimeout(() => {
      if (!this.shouldContinue(generation)) return
      this.generation += 1
      this.listen(this.generation)
    }, 180)
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
