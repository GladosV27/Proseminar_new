import { createClient, type RealtimeChannel } from '@supabase/supabase-js'

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

type JoinPayload = { player: Pick<LivePlayer, 'id' | 'name' | 'color'> }
type AnswerPayload = { playerId: string; questionId: string; optionId: string; at: number }

export interface LiveHandlers {
  onState: (state: LiveQuizState) => void
  onJoin?: (payload: JoinPayload) => void
  onAnswer?: (payload: AnswerPayload) => void
  onSyncRequest?: () => void
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

export function liveRoomUrl(code: string): string {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('live', code)
  return url.toString()
}

function isState(value: unknown): value is LiveQuizState {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<LiveQuizState>
  return candidate.version === 1 && typeof candidate.roomCode === 'string' && typeof candidate.hostId === 'string' && Array.isArray(candidate.players)
}

export class LiveTransport {
  private constructor(private readonly channel: RealtimeChannel) {}

  static async connect(roomCode: string, handlers: LiveHandlers): Promise<LiveTransport> {
    if (!liveQuizConfigured() || !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      throw new Error('Live-Quiz ist noch nicht konfiguriert. Bitte VITE_SUPABASE_URL und VITE_SUPABASE_PUBLISHABLE_KEY setzen.')
    }

    const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const channel = client.channel(`graph-rag-live:${roomCode.toUpperCase()}`, {
      config: { broadcast: { self: false } },
    })

    channel.on('broadcast', { event: 'state' }, ({ payload }) => {
      if (isState(payload)) handlers.onState(payload)
    })
    channel.on('broadcast', { event: 'join' }, ({ payload }) => handlers.onJoin?.(payload as JoinPayload))
    channel.on('broadcast', { event: 'answer' }, ({ payload }) => handlers.onAnswer?.(payload as AnswerPayload))
    channel.on('broadcast', { event: 'sync-request' }, () => handlers.onSyncRequest?.())

    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('Zeitüberschreitung beim Verbinden mit dem Live-Raum.')), 12_000)
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          window.clearTimeout(timer)
          resolve()
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          window.clearTimeout(timer)
          reject(new Error(`Live-Raum konnte nicht verbunden werden (${status}).`))
        }
      })
    })
    return new LiveTransport(channel)
  }

  async send(event: 'state' | 'join' | 'answer' | 'sync-request', payload: object = {}): Promise<void> {
    const status = await this.channel.send({ type: 'broadcast', event, payload })
    if (status !== 'ok') throw new Error(`Echtzeit-Nachricht konnte nicht gesendet werden (${status}).`)
  }

  close(): void {
    void this.channel.unsubscribe()
  }
}
