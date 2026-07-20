import { createClient, type RealtimeChannel } from '@supabase/supabase-js'
import { shareableAppUrl } from './appUrl'

/**
 * Kleiner Echtzeit-Transport für den Seminar-Quizmodus.
 *
 * Der Host hält Fragen, Lösungen und Punkte im eigenen Browser und sendet nur
 * den öffentlichen Spielstand über Supabase Broadcast. Es werden weder
 * Experimentdaten noch personenbezogene Daten persistiert. Für einen
 * Seminarraum reicht das bewusst schlanke Modell; es ist keine Plattform für
 * öffentliche, manipulationssichere Wettkämpfe.
 */

export type LivePhase = 'lobby' | 'question' | 'reveal' | 'finished'

export interface LiveOption {
  id: string
  title: string
}

export interface LiveQuestion {
  id: string
  category: string
  prompt: string
  options: LiveOption[]
}

export interface LivePlayer {
  id: string
  name: string
  color: string
  score: number
  streak: number
  answered: boolean
}

export interface LiveQuizState {
  version: 1
  /** Monoton steigende Host-Revision zur Abwehr verspäteter Broadcasts. */
  revision: number
  roomCode: string
  hostId: string
  phase: LivePhase
  questionIndex: number
  totalQuestions: number
  question: LiveQuestion | null
  deadlineMs: number | null
  answerCount: number
  players: LivePlayer[]
  reveal: { correctId: string; explanation: string; classification: string; graphNodeIds: string[] } | null
  updatedAt: number
}

export interface LiveDeckCard {
  question: LiveQuestion
  correctId: string
  explanation: string
  /** Kurze didaktische Einordnung für die Auflösung. */
  classification: string
  /** Relevante Knoten im eingefrorenen Wissensgraphen. */
  graphNodeIds: string[]
}

export type JoinPayload = { player: Pick<LivePlayer, 'id' | 'name' | 'color'> }
export type AnswerPayload = { playerId: string; questionId: string; optionId: string; at: number }
export type LeavePayload = { playerId: string }
export interface TopicSuggestionPayload { id: string; playerId: string; playerName: string; topic: string }
export interface TopicDecisionPayload { id: string; topic: string; accepted: boolean; message: string }

export type LiveConnectionStatus = 'connected' | 'disconnected' | 'error' | 'timed-out'

export interface LiveHandlers {
  onState: (state: LiveQuizState) => void
  onJoin?: (payload: JoinPayload) => void
  onAnswer?: (payload: AnswerPayload) => void
  onLeave?: (payload: LeavePayload) => void
  onSyncRequest?: () => void
  onTopicSuggestion?: (payload: TopicSuggestionPayload) => void
  onTopicDecision?: (payload: TopicDecisionPayload) => void
  /**
   * Wird erst nach einer erfolgreichen Erstverbindung aufgerufen. So bleiben
   * bestehende Aufrufer unverändert, können aber spätere Abbrüche und eine
   * automatische Realtime-Wiederverbindung sichtbar machen.
   */
  onConnectionStatus?: (status: LiveConnectionStatus) => void
}

export interface QuizHostHandlers {
  onJoin?: (payload: JoinPayload) => void
  onAnswer?: (payload: AnswerPayload) => void
  onLeave?: (payload: LeavePayload) => void
  onSyncRequest?: () => void
  onConnectionStatus?: (status: LiveConnectionStatus) => void
}

export interface QuizPlayerHandlers {
  onState: (state: LiveQuizState) => void
  onConnectionStatus?: (status: LiveConnectionStatus) => void
}

/**
 * Bewahrt jeden sichtbaren Phasenwechsel in Reihenfolge auf, fasst aber reine
 * Zwischenstände auf den jeweils neuesten Stand zusammen. So bleibt der
 * Broadcast-Fanout klein, ohne dass Auflösung oder nächste Frage verschwinden.
 */
export class LiveQuizStateOutbox {
  private transitions: LiveQuizState[] = []
  private snapshot: LiveQuizState | null = null

  enqueue(state: LiveQuizState, transition: boolean): void {
    if (transition) {
      if (this.snapshot && this.snapshot.revision <= state.revision) this.snapshot = null
      this.transitions.push(state)
      return
    }
    this.snapshot = state
  }

  dequeue(): LiveQuizState | null {
    const transition = this.transitions.shift()
    if (transition) {
      if (this.snapshot && this.snapshot.revision <= transition.revision) this.snapshot = null
      return transition
    }
    const snapshot = this.snapshot
    this.snapshot = null
    return snapshot
  }

  hasPending(): boolean {
    return this.transitions.length > 0 || this.snapshot !== null
  }

  clear(): void {
    this.transitions = []
    this.snapshot = null
  }
}

export function isNewerLiveQuizState(current: LiveQuizState | null, next: LiveQuizState): boolean {
  return current === null || current.roomCode !== next.roomCode || next.revision > current.revision
}

export function isLiveQuizTransition(current: LiveQuizState | null, next: LiveQuizState): boolean {
  return current === null ||
    current.roomCode !== next.roomCode ||
    current.phase !== next.phase ||
    current.questionIndex !== next.questionIndex
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export function liveQuizConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY)
}

export function makeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function makeRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint32Array(6)
  globalThis.crypto?.getRandomValues?.(bytes)
  return Array.from(bytes, (value, index) => alphabet[(value || Math.floor(Math.random() * 0xffffffff) + index) % alphabet.length]).join('')
}

const LIVE_ROOM_CODE = /^[A-Z0-9]{6}$/
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/
const HEX_COLOR = /^#[0-9A-F]{6}$/i
const LIVE_PHASES = new Set<LivePhase>(['lobby', 'question', 'reveal', 'finished'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isBoundedText(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && value.length >= min && value.length <= max && value.trim().length >= min
}

function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ID.test(value)
}

function isNonNegativeInteger(value: unknown, max = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= max
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= Number.MAX_SAFE_INTEGER
}

export function normalizeLiveRoomCode(value: string): string {
  return value.trim().toUpperCase()
}

export function isLiveRoomCode(value: unknown): value is string {
  return typeof value === 'string' && LIVE_ROOM_CODE.test(value)
}

function isLiveOption(value: unknown): value is LiveOption {
  if (!isRecord(value)) return false
  return isSafeId(value.id) && isBoundedText(value.title, 1, 160)
}

function isLiveQuestion(value: unknown): value is LiveQuestion {
  if (!isRecord(value) || !isSafeId(value.id) || !isBoundedText(value.category, 1, 80) || !isBoundedText(value.prompt, 1, 1_000)) return false
  if (!Array.isArray(value.options) || value.options.length < 2 || value.options.length > 8 || !value.options.every(isLiveOption)) return false
  return new Set(value.options.map((option) => option.id)).size === value.options.length
}

function isLivePlayer(value: unknown): value is LivePlayer {
  if (!isRecord(value)) return false
  return isSafeId(value.id) &&
    isBoundedText(value.name, 1, 20) &&
    typeof value.color === 'string' && HEX_COLOR.test(value.color) &&
    isNonNegativeInteger(value.score, 100_000_000) &&
    isNonNegativeInteger(value.streak, 10_000) &&
    typeof value.answered === 'boolean'
}

function isLiveReveal(value: unknown, question: LiveQuestion | null): value is NonNullable<LiveQuizState['reveal']> {
  if (!isRecord(value) || !isSafeId(value.correctId) || !isBoundedText(value.explanation, 1, 2_000) || !isBoundedText(value.classification, 1, 500)) return false
  if (!Array.isArray(value.graphNodeIds) || value.graphNodeIds.length > 100 || !value.graphNodeIds.every(isSafeId)) return false
  if (new Set(value.graphNodeIds).size !== value.graphNodeIds.length) return false
  return question === null || question.options.some((option) => option.id === value.correctId)
}

export function isLiveQuizState(value: unknown, expectedRoomCode?: string): value is LiveQuizState {
  if (!isRecord(value) || value.version !== 1 || !isLiveRoomCode(value.roomCode)) return false
  if (expectedRoomCode !== undefined && value.roomCode !== normalizeLiveRoomCode(expectedRoomCode)) return false
  if (!isNonNegativeInteger(value.revision) || value.revision < 1) return false
  if (!isSafeId(value.hostId) || typeof value.phase !== 'string' || !LIVE_PHASES.has(value.phase as LivePhase)) return false
  if (!isNonNegativeInteger(value.questionIndex, 99) || !isNonNegativeInteger(value.totalQuestions, 100) || value.totalQuestions < 1 || value.questionIndex >= value.totalQuestions) return false

  const question = value.question === null ? null : isLiveQuestion(value.question) ? value.question : undefined
  if (question === undefined) return false
  if (value.deadlineMs !== null && !isFiniteTimestamp(value.deadlineMs)) return false
  if (!Array.isArray(value.players) || value.players.length > 20 || !value.players.every(isLivePlayer)) return false
  if (new Set(value.players.map((player) => player.id)).size !== value.players.length) return false
  if (!isNonNegativeInteger(value.answerCount, value.players.length) || !isFiniteTimestamp(value.updatedAt)) return false

  const reveal = value.reveal === null ? null : isLiveReveal(value.reveal, question) ? value.reveal : undefined
  if (reveal === undefined) return false
  if (value.phase === 'lobby' && (question !== null || value.deadlineMs !== null || reveal !== null)) return false
  if (value.phase === 'question' && (question === null || value.deadlineMs === null || reveal !== null)) return false
  if (value.phase === 'reveal' && (question === null || value.deadlineMs !== null || reveal === null)) return false
  if (value.phase === 'finished' && value.deadlineMs !== null) return false
  return true
}

export function isLiveJoinPayload(value: unknown): value is JoinPayload {
  if (!isRecord(value) || !isRecord(value.player)) return false
  return isSafeId(value.player.id) &&
    isBoundedText(value.player.name, 1, 20) &&
    typeof value.player.color === 'string' && HEX_COLOR.test(value.player.color)
}

export function isLiveAnswerPayload(value: unknown): value is AnswerPayload {
  if (!isRecord(value)) return false
  return isSafeId(value.playerId) && isSafeId(value.questionId) && isSafeId(value.optionId) && isFiniteTimestamp(value.at)
}

export function isLiveLeavePayload(value: unknown): value is LeavePayload {
  return isRecord(value) && isSafeId(value.playerId)
}

export function isTopicSuggestionPayload(value: unknown): value is TopicSuggestionPayload {
  if (!isRecord(value)) return false
  return isSafeId(value.id) && isSafeId(value.playerId) && isBoundedText(value.playerName, 1, 24) && isBoundedText(value.topic, 1, 80)
}

export function isTopicDecisionPayload(value: unknown): value is TopicDecisionPayload {
  if (!isRecord(value)) return false
  return isSafeId(value.id) && isBoundedText(value.topic, 1, 80) && typeof value.accepted === 'boolean' && isBoundedText(value.message, 1, 500)
}

function isSyncRequestPayload(value: unknown): value is Record<string, never> {
  return isRecord(value) && Object.keys(value).length === 0
}

export function liveRoomUrl(code: string): string {
  const roomCode = normalizeLiveRoomCode(code)
  if (!isLiveRoomCode(roomCode)) throw new Error('Der Live-Raumcode muss aus genau sechs Buchstaben oder Ziffern bestehen.')
  const url = shareableAppUrl()
  url.search = ''
  url.hash = ''
  url.searchParams.set('live', roomCode)
  return url.toString()
}

type LiveEvent = 'state' | 'join' | 'answer' | 'leave' | 'sync-request' | 'topic-suggest' | 'topic-decision'
type QuizRole = 'host' | 'player'
type ConnectionLifecycle = { intentionalClose: boolean }

function validatedRoomCode(roomCode: string): string {
  const normalizedRoomCode = normalizeLiveRoomCode(roomCode)
  if (!isLiveRoomCode(normalizedRoomCode)) {
    throw new Error('Der Live-Raumcode muss aus genau sechs Buchstaben oder Ziffern bestehen.')
  }
  return normalizedRoomCode
}

function createRealtimeClient() {
  if (!liveQuizConfigured() || !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('Live-Quiz ist noch nicht konfiguriert. Bitte VITE_SUPABASE_URL und VITE_SUPABASE_PUBLISHABLE_KEY setzen.')
  }
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function subscribeChannel(
  channel: RealtimeChannel,
  onConnectionStatus?: (status: LiveConnectionStatus) => void,
  lifecycle: ConnectionLifecycle = { intentionalClose: false },
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let initialSettled = false
    let connectedOnce = false
    const timer = window.setTimeout(() => {
      if (initialSettled) return
      initialSettled = true
      void channel.unsubscribe()
      reject(new Error('Zeitüberschreitung beim Verbinden mit dem Live-Raum.'))
    }, 12_000)
    channel.subscribe((status) => {
      if (lifecycle.intentionalClose) return
      if (status === 'SUBSCRIBED') {
        if (!connectedOnce) {
          connectedOnce = true
          if (!initialSettled) {
            initialSettled = true
            window.clearTimeout(timer)
            resolve()
          }
        } else {
          onConnectionStatus?.('connected')
        }
        return
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        if (!initialSettled) {
          initialSettled = true
          window.clearTimeout(timer)
          void channel.unsubscribe()
          reject(new Error(`Live-Raum konnte nicht verbunden werden (${status}).`))
          return
        }
        if (!connectedOnce) return
        onConnectionStatus?.(
          status === 'CHANNEL_ERROR' ? 'error' : status === 'TIMED_OUT' ? 'timed-out' : 'disconnected',
        )
      }
    })
  })
}

function validateQuizHttpPayload(role: QuizRole, roomCode: string, event: LiveEvent, payload: object): void {
  if (role === 'host') {
    if (event !== 'state') throw new Error(`Der Quiz-Host darf „${event}“ nicht über den State-Kanal senden.`)
    if (!isLiveQuizState(payload, roomCode)) throw new Error('Der zu sendende Quiz-Spielstand ist ungültig.')
    return
  }

  if (event === 'join') {
    if (!isLiveJoinPayload(payload)) throw new Error('Die zu sendenden Beitrittsdaten sind ungültig.')
    return
  }
  if (event === 'answer') {
    if (!isLiveAnswerPayload(payload)) throw new Error('Die zu sendende Quizantwort ist ungültig.')
    return
  }
  if (event === 'leave') {
    if (!isLiveLeavePayload(payload)) throw new Error('Die zu sendende Abmeldung ist ungültig.')
    return
  }
  if (event !== 'sync-request') throw new Error(`Quiz-Spieler dürfen „${event}“ nicht an den Host senden.`)
  if (!isSyncRequestPayload(payload)) throw new Error('Die zu sendende Synchronisationsanfrage ist ungültig.')
}

export class LiveTransport {
  private constructor(
    private readonly channel: RealtimeChannel,
    private readonly quizHttpChannel: RealtimeChannel | null = null,
    private readonly quizRole: QuizRole | null = null,
    private readonly roomCode: string | null = null,
    private readonly lifecycle: ConnectionLifecycle = { intentionalClose: false },
  ) {}

  static async connect(roomCode: string, handlers: LiveHandlers): Promise<LiveTransport> {
    const normalizedRoomCode = validatedRoomCode(roomCode)
    const client = createRealtimeClient()
    const lifecycle: ConnectionLifecycle = { intentionalClose: false }
    const channel = client.channel(`graph-rag-live:${normalizedRoomCode}`, {
      config: { broadcast: { self: false, ack: true } },
    })

    channel.on('broadcast', { event: 'state' }, ({ payload }) => {
      if (isLiveQuizState(payload, normalizedRoomCode)) handlers.onState(payload)
    })
    channel.on('broadcast', { event: 'join' }, ({ payload }) => {
      if (isLiveJoinPayload(payload)) handlers.onJoin?.(payload)
    })
    channel.on('broadcast', { event: 'answer' }, ({ payload }) => {
      if (isLiveAnswerPayload(payload)) handlers.onAnswer?.(payload)
    })
    channel.on('broadcast', { event: 'leave' }, ({ payload }) => {
      if (isLiveLeavePayload(payload)) handlers.onLeave?.(payload)
    })
    channel.on('broadcast', { event: 'sync-request' }, () => handlers.onSyncRequest?.())
    channel.on('broadcast', { event: 'topic-suggest' }, ({ payload }) => {
      if (isTopicSuggestionPayload(payload)) handlers.onTopicSuggestion?.(payload)
    })
    channel.on('broadcast', { event: 'topic-decision' }, ({ payload }) => {
      if (isTopicDecisionPayload(payload)) handlers.onTopicDecision?.(payload)
    })

    await subscribeChannel(channel, handlers.onConnectionStatus, lifecycle)
    return new LiveTransport(channel, null, null, null, lifecycle)
  }

  /**
   * Quiz-Host: genau ein WebSocket-Abonnement für Join, Antwort und Sync.
   * Spielstände werden per REST-Broadcast an den getrennten State-Topic
   * geschickt; der Host abonniert diesen Fanout selbst nicht.
   */
  static async connectQuizHost(roomCode: string, handlers: QuizHostHandlers): Promise<LiveTransport> {
    const normalizedRoomCode = validatedRoomCode(roomCode)
    const client = createRealtimeClient()
    const lifecycle: ConnectionLifecycle = { intentionalClose: false }
    const hostChannel = client.channel(`graph-rag-live:${normalizedRoomCode}:host`, {
      config: { broadcast: { self: false, ack: true } },
    })
    const stateHttpChannel = client.channel(`graph-rag-live:${normalizedRoomCode}:state`)

    hostChannel.on('broadcast', { event: 'join' }, ({ payload }) => {
      if (isLiveJoinPayload(payload)) handlers.onJoin?.(payload)
    })
    hostChannel.on('broadcast', { event: 'answer' }, ({ payload }) => {
      if (isLiveAnswerPayload(payload)) handlers.onAnswer?.(payload)
    })
    hostChannel.on('broadcast', { event: 'leave' }, ({ payload }) => {
      if (isLiveLeavePayload(payload)) handlers.onLeave?.(payload)
    })
    hostChannel.on('broadcast', { event: 'sync-request' }, ({ payload }) => {
      if (isSyncRequestPayload(payload)) handlers.onSyncRequest?.()
    })

    try {
      await subscribeChannel(hostChannel, handlers.onConnectionStatus, lifecycle)
    } catch (error) {
      void stateHttpChannel.unsubscribe()
      throw error
    }
    return new LiveTransport(hostChannel, stateHttpChannel, 'host', normalizedRoomCode, lifecycle)
  }

  /**
   * Quiz-Spieler: abonniert ausschließlich den öffentlichen Spielstand.
   * Join, Antworten und Sync-Anfragen gehen per REST-Broadcast direkt an den
   * Host-Topic und werden dadurch nicht an andere Spieler aufgefächert.
   */
  static async connectQuizPlayer(roomCode: string, handlers: QuizPlayerHandlers): Promise<LiveTransport> {
    const normalizedRoomCode = validatedRoomCode(roomCode)
    const client = createRealtimeClient()
    const lifecycle: ConnectionLifecycle = { intentionalClose: false }
    const stateChannel = client.channel(`graph-rag-live:${normalizedRoomCode}:state`, {
      config: { broadcast: { self: false, ack: true } },
    })
    const hostHttpChannel = client.channel(`graph-rag-live:${normalizedRoomCode}:host`)

    stateChannel.on('broadcast', { event: 'state' }, ({ payload }) => {
      if (isLiveQuizState(payload, normalizedRoomCode)) handlers.onState(payload)
    })

    try {
      await subscribeChannel(stateChannel, handlers.onConnectionStatus, lifecycle)
    } catch (error) {
      void hostHttpChannel.unsubscribe()
      throw error
    }
    return new LiveTransport(stateChannel, hostHttpChannel, 'player', normalizedRoomCode, lifecycle)
  }

  async send(event: LiveEvent, payload: object = {}): Promise<void> {
    if (this.lifecycle.intentionalClose) throw new Error('Die Live-Verbindung wurde bereits geschlossen.')
    if (this.quizRole && this.quizHttpChannel && this.roomCode) {
      validateQuizHttpPayload(this.quizRole, this.roomCode, event, payload)
      const result = await this.quizHttpChannel.httpSend(event, payload, { timeout: 8_000 })
      if (!result.success) {
        throw new Error(`Echtzeit-Nachricht konnte nicht gesendet werden (HTTP ${result.status}: ${result.error}).`)
      }
      return
    }

    const status = await this.channel.send({ type: 'broadcast', event, payload })
    if (status !== 'ok') throw new Error(`Echtzeit-Nachricht konnte nicht gesendet werden (${status}).`)
  }

  close(): void {
    if (this.lifecycle.intentionalClose) return
    this.lifecycle.intentionalClose = true
    void this.channel.unsubscribe()
    if (this.quizHttpChannel && this.quizHttpChannel !== this.channel) void this.quizHttpChannel.unsubscribe()
  }
}
