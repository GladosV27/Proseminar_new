import type { GenerateResult, LLMEngine } from './llm'

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '')
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
const ROOM_STORAGE_KEY = 'noesis.seminar.room.v1'
const PARTICIPANT_STORAGE_KEY = 'noesis.seminar.participant.v1'

export function seminarRoomCode(): string | null {
  const fromUrl = new URLSearchParams(window.location.search).get('seminar')?.trim() ?? ''
  if (/^[A-Za-z0-9_-]{4,64}$/.test(fromUrl)) {
    sessionStorage.setItem(ROOM_STORAGE_KEY, fromUrl)
    return fromUrl
  }
  const remembered = sessionStorage.getItem(ROOM_STORAGE_KEY)?.trim() ?? ''
  return /^[A-Za-z0-9_-]{4,64}$/.test(remembered) ? remembered : null
}

export function seminarOnlineConfigured(roomCode = seminarRoomCode()): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY && roomCode)
}

function seminarParticipantId(): string {
  const existing = sessionStorage.getItem(PARTICIPANT_STORAGE_KEY)?.trim() ?? ''
  if (/^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing
  const created = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
  sessionStorage.setItem(PARTICIPANT_STORAGE_KEY, created)
  return created
}

interface SeminarResponse {
  text?: string
  model?: string
  error?: string
}

interface SeminarPromptParts {
  question: string
  context: string
  history: string
}

const QUESTION_LIMIT = 1_200
const CONTEXT_LIMIT = 5_000
const HISTORY_LIMIT = 1_800

/**
 * Das generische LLM-Interface liefert einen formatierten Prompt. Für den
 * Remote-Transport werden seine Teile wieder getrennt, damit die aktuelle
 * Frage niemals durch ein Kontextlimit abgeschnitten werden kann.
 */
function splitPrompt(user: string): SeminarPromptParts {
  const questionMarker = '\n\nFRAGE:'
  const questionAt = user.lastIndexOf(questionMarker)
  const beforeQuestion = questionAt >= 0 ? user.slice(0, questionAt) : ''
  const question = (questionAt >= 0 ? user.slice(questionAt + questionMarker.length) : user).trim()
  const contextMarker = 'KONTEXT:\n'
  const contextAt = beforeQuestion.indexOf(contextMarker)
  const historyRaw = contextAt >= 0 ? beforeQuestion.slice(0, contextAt) : ''
  const context = (contextAt >= 0 ? beforeQuestion.slice(contextAt + contextMarker.length) : '').trim()
  const history = historyRaw
    .replace(/^BISHERIGER GESPRÄCHSVERLAUF \(nur für sprachliche Bezüge\):\s*/u, '')
    .trim()
  return {
    question: question.slice(0, QUESTION_LIMIT),
    context: context.slice(0, CONTEXT_LIMIT),
    // Für Anschlussfragen sind die jüngsten Beiträge wichtiger als der Anfang.
    history: history.slice(-HISTORY_LIMIT),
  }
}

/**
 * Online-Engine nur fuer den zeitlich begrenzten QR-Seminarmodus.
 *
 * Der Browser fuehrt Retrieval und Graphauswahl weiterhin lokal aus. An die
 * Edge Function gehen nur Frage/Verlauf und der bereits lokal reduzierte
 * Evidenzkontext. Vollstaendige PDFs, der lokale Graph und der
 * Provider-Schluessel verlassen den Browser nicht.
 */
export class SeminarOnlineEngine implements LLMEngine {
  readonly id = 'seminar-online'
  readonly label = 'Seminar-Online-Modell'
  readonly execution = 'remote' as const
  private controller: AbortController | null = null

  constructor(private readonly roomCode: string) {}

  async generate(_system: string, user: string, onToken?: (partial: string) => void): Promise<GenerateResult> {
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      throw new Error('Der Seminar-Server ist in diesem Build noch nicht konfiguriert.')
    }

    this.controller?.abort()
    const controller = new AbortController()
    this.controller = controller
    const prompt = splitPrompt(user)
    if (!prompt.question) throw new Error('Die aktuelle Frage ist leer.')

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/seminar-chat`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomCode: this.roomCode,
          participantId: seminarParticipantId(),
          question: prompt.question,
          context: prompt.context,
          history: prompt.history,
        }),
        signal: controller.signal,
      })

      const payload = (await response.json().catch(() => ({}))) as SeminarResponse
      if (!response.ok) {
        if (response.status === 429) throw new Error('Gerade fragen zu viele Personen gleichzeitig. Bitte kurz warten und erneut senden.')
        if (response.status === 401 || response.status === 403) throw new Error('Dieser Seminarraum ist nicht aktiv oder der QR-Code ist abgelaufen.')
        throw new Error(payload.error || `Seminar-Server: HTTP ${response.status}`)
      }

      const text = payload.text?.trim() ?? ''
      if (!text) throw new Error('Das Online-Modell hat keine Antwort geliefert.')
      onToken?.(text)
      return { text, engine: payload.model ? `${this.id}:${payload.model}` : this.id }
    } catch (error) {
      if (controller.signal.aborted) throw new Error('Die Antwort wurde gestoppt.')
      throw error
    } finally {
      if (this.controller === controller) this.controller = null
    }
  }

  interrupt(): void {
    this.controller?.abort()
    this.controller = null
  }
}
