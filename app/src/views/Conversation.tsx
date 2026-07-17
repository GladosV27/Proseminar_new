import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { AppCtx } from '../App'
import LiveVoiceDialog, { type LiveVoiceStage } from '../components/LiveVoiceDialog'
import type { GraphEdge, KnowledgeGraph } from '../data/types'
import { ExperimentRunner, type PreparedTrial } from '../engine/experiment'
import {
  getVoiceCapabilities,
  listGermanVoices,
  TurnBasedVoiceController,
  VoiceSynthesisError,
  type GermanVoiceInfo,
  type LiveVoiceSnapshot,
} from '../engine/liveVoice'
import {
  RESEARCH_COMMUNITY,
  looksUncovered,
  researchQuestion,
  type ResearchProgress,
  type ResearchResult,
} from '../engine/research'
import { applyKnowledgeImport } from '../engine/store'

type MessageRole = 'user' | 'assistant'
type MessageStatus = 'pending' | 'done' | 'stopped' | 'error'
type ConversationPhase = 'idle' | 'research' | 'retrieval' | 'generation' | 'stopping'

interface SourceRef {
  id: string
  title: string
  kind: 'Wikipedia' | 'Eigenes Wissen' | 'Wissensgraph'
  url?: string
}

interface ConversationMessage {
  id: string
  role: MessageRole
  text: string
  status: MessageStatus
  sources?: SourceRef[]
  prepared?: PreparedTrial
  technicalGraph?: KnowledgeGraph
  notices?: string[]
  /** Die Antwort enthält Kontext aus lokalem Text/PDF-Wissen. */
  containsPersonalKnowledge?: boolean
}

interface ActiveRun {
  id: string
  assistantMessageId: string
  cancelled: boolean
}

const SUGGESTIONS = [
  'Wie hängen Kant, Hegel und Schopenhauer philosophisch zusammen?',
  'An welchen Universitäten lehrte Hegel – und in welcher Reihenfolge?',
  'Was verbindet Schelling mit Kierkegaard?',
  'Warum war der Pantheismusstreit philosophisch bedeutsam?',
]

const AUTO_WIKIPEDIA_KEY = 'noesis.wikipedia.auto.v1'
const VOICE_URI_KEY = 'noesis.voice.uri.v1'
const VOICE_RATE_KEY = 'noesis.voice.rate.v1'

const CONVERSATION_SYSTEM_PROMPT = [
  'Du bist Noesis, ein freundlicher deutschsprachiger Wissensassistent für Philosophie- und Ideengeschichte.',
  'Führe ein natürliches, zusammenhängendes Gespräch und beantworte die aktuelle Frage gewöhnlich in zwei bis fünf klaren Sätzen.',
  'Stütze Tatsachenbehauptungen ausschließlich auf den bereitgestellten Kontext; der Gesprächsverlauf dient nur dazu, Bezüge wie „er“, „dieses Werk“ oder „dort“ zu verstehen.',
  'Erfinde weder Fakten noch Beziehungen. Wenn der Kontext keine sichere Antwort erlaubt, sage offen: „Dazu habe ich in meinem aktuellen Wissensstand keine gesicherte Information.“',
  'Erwähne Retrieval, Graph-RAG oder technische Zwischenschritte nur, wenn die Person ausdrücklich danach fragt.',
].join(' ')

function newId(prefix: string): string {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
  return `${prefix}_${suffix}`
}

function edgeKey(edge: GraphEdge): string {
  return `${edge.source}\u0000${edge.relation}\u0000${edge.target}`
}

function appendNewEdges(existing: GraphEdge[], additions: GraphEdge[]): GraphEdge[] {
  const seen = new Set(existing.map(edgeKey))
  const fresh = additions.filter((edge) => {
    const key = edgeKey(edge)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return [...existing, ...fresh]
}

function mergeResearchGraph(graph: KnowledgeGraph, found: ResearchResult): KnowledgeGraph {
  const knownNodes = new Set(graph.nodes.map((node) => node.id))
  return {
    nodes: [...graph.nodes, ...found.nodes.filter((node) => !knownNodes.has(node.id))],
    edges: appendNewEdges(graph.edges, found.edges),
  }
}

/**
 * Wikipedia-Wissen wird sofort in den getrennten Nutzerbereich übernommen.
 * Dadurch kann genau dieses Wissen nach der einmaligen Recherche später auch
 * im Offline-Modus genutzt werden, ohne den eingefrorenen Experimentkorpus zu
 * verändern.
 */
function persistResearch(ctx: AppCtx, found: ResearchResult): void {
  const applied = applyKnowledgeImport(ctx.custom, found, { replaceSource: false })
  ctx.setCustom(applied.knowledge)
}

function wikipediaUrl(title: string): string {
  return `https://de.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
}

function sourceRefs(prepared: PreparedTrial, graph: KnowledgeGraph): SourceRef[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const seen = new Set<string>()
  const refs: SourceRef[] = []
  for (const id of prepared.retrievedIds) {
    if (seen.has(id)) continue
    seen.add(id)
    const node = byId.get(id)
    if (!node) continue
    const fromWikipedia = node.community === RESEARCH_COMMUNITY || node.community.startsWith('wiki_')
    refs.push({
      id,
      title: node.title,
      kind: fromWikipedia ? 'Wikipedia' : node.custom ? 'Eigenes Wissen' : 'Wissensgraph',
      url: fromWikipedia ? wikipediaUrl(node.title) : undefined,
    })
  }
  return refs
}

function technicalSubgraph(prepared: PreparedTrial, graph: KnowledgeGraph): KnowledgeGraph | undefined {
  if (!prepared.subgraph) return undefined
  const ids = new Set(prepared.subgraph.nodes)
  return {
    nodes: graph.nodes.filter((node) => ids.has(node.id)),
    edges: prepared.subgraph.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      relation: 'retrieved_relation',
      label: edge.label,
    })),
  }
}

const PRIVATE_SOURCE_KINDS = new Set(['manual-text', 'pdf', 'local-llm'])

function isPrivateProvenance(edge: GraphEdge): boolean {
  return edge.provenance?.some((value) => PRIVATE_SOURCE_KINDS.has(value.sourceKind)) ?? false
}

/** Entfernt private Text-/PDF-Knoten und auch private Basis→Basis-Kanten. */
function withoutPersonalKnowledge(graph: KnowledgeGraph): KnowledgeGraph {
  const privateIds = new Set(
    graph.nodes.filter((node) => node.community === 'custom').map((node) => node.id),
  )
  const communities = new Map(graph.nodes.map((node) => [node.id, node.community]))
  return {
    nodes: graph.nodes.filter((node) => !privateIds.has(node.id)),
    edges: graph.edges.flatMap((edge) => {
      if (privateIds.has(edge.source) || privateIds.has(edge.target)) return []
      if (edge.custom && !edge.provenance?.length) {
        // Legacy-Wikipedia-Kanten sind öffentlich erkennbar; unbelegte
        // Basis→Basis-Custom-Kanten werden privacy-first ausgeschlossen.
        const publicResearch = [communities.get(edge.source), communities.get(edge.target)]
          .some((community) => community === RESEARCH_COMMUNITY || community?.startsWith('wiki_'))
        return publicResearch ? [edge] : []
      }
      if (!isPrivateProvenance(edge)) return [edge]
      const provenance = edge.provenance?.filter((value) => !PRIVATE_SOURCE_KINDS.has(value.sourceKind))
      return provenance?.length ? [{ ...edge, provenance }] : []
    }),
  }
}

function lastUserQuestion(messages: ConversationMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].text
  }
  return null
}

/** Ergänzt nur echte Anschlussfragen um den letzten Gesprächsbezug. */
function retrievalQuestion(question: string, messages: ConversationMessage[]): string {
  const previous = lastUserQuestion(messages)
  if (!previous) return question
  const isFollowUp =
    /^(und|aber|warum|wieso|wie genau|wann|wo|welche davon|wer davon|was bedeutet das|was geschah dann)\b/i.test(question) ||
    /\b(er|sie|es|dessen|deren|dieses werk|dieser philosoph|dort|davon|dabei|damit)\b/i.test(question)
  return isFollowUp ? `${previous}\nAnschlussfrage: ${question}` : question
}

function conversationHistory(messages: ConversationMessage[], includePersonalKnowledge = true): string {
  const usable = messages
    .filter((message) =>
      message.status === 'done' &&
      message.text.trim() &&
      (includePersonalKnowledge || !message.containsPersonalKnowledge),
    )
    .slice(-6)
  if (usable.length === 0) return ''
  return usable
    .map((message) => {
      const label = message.role === 'user' ? 'NUTZER' : 'NOESIS'
      const compact = message.text.replace(/\s+/g, ' ').trim().slice(0, 700)
      return `${label}: ${compact}`
    })
    .join('\n')
}

function modelPrompt(
  question: string,
  prepared: PreparedTrial,
  messages: ConversationMessage[],
  includePersonalKnowledge = true,
  spoken = false,
): string {
  const history = conversationHistory(messages, includePersonalKnowledge)
  return [
    history ? `BISHERIGER GESPRÄCHSVERLAUF (nur für sprachliche Bezüge):\n${history}` : '',
    spoken
      ? 'AUSGABEMODUS: Die Antwort wird laut gesprochen. Formuliere wie in einem ruhigen natürlichen Gespräch: kurze vollständige Sätze, keine Markdown-Listen, keine Überschriften, keine Klammerketten und keine vorgelesenen URLs. Nutze gelegentlich eine passende Überleitung, aber keine künstlichen Füllwörter.'
      : '',
    `KONTEXT:\n${prepared.context}`,
    `FRAGE: ${question}`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

function sourceRelationList(graph: KnowledgeGraph): string[] {
  const titles = new Map(graph.nodes.map((node) => [node.id, node.title]))
  return graph.edges.map((edge) => {
    const source = titles.get(edge.source) ?? edge.source
    const target = titles.get(edge.target) ?? edge.target
    return `${source} — ${edge.label} → ${target}`
  })
}

function dialogStage(snapshot: LiveVoiceSnapshot): LiveVoiceStage {
  if (snapshot.phase === 'idle') return 'ready'
  if (snapshot.phase === 'listening') return 'listening'
  if (snapshot.phase === 'thinking') return 'thinking'
  if (snapshot.phase === 'speaking') return 'speaking'
  if (snapshot.phase === 'paused') return 'paused'
  return 'error'
}

export default function Conversation({ ctx, active }: { ctx: AppCtx; active: boolean }) {
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<ConversationPhase>('idle')
  const [researchProgress, setResearchProgress] = useState<ResearchProgress | null>(null)
  const [sharePersonalKnowledge, setSharePersonalKnowledge] = useState(false)
  const [seminarWikipedia, setSeminarWikipedia] = useState(false)
  const [autoWikipedia, setAutoWikipedia] = useState(
    () => localStorage.getItem(AUTO_WIKIPEDIA_KEY) !== 'off',
  )
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [voiceStage, setVoiceStage] = useState<LiveVoiceStage>('ready')
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [voiceLastQuestion, setVoiceLastQuestion] = useState('')
  const [voiceLastAnswer, setVoiceLastAnswer] = useState('')
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null)
  const [voiceMuted, setVoiceMuted] = useState(false)
  const [voiceOptions, setVoiceOptions] = useState<GermanVoiceInfo[]>([])
  const [voiceURI, setVoiceURI] = useState(() => localStorage.getItem(VOICE_URI_KEY) ?? '')
  const [voiceRate, setVoiceRate] = useState(() => {
    const stored = Number(localStorage.getItem(VOICE_RATE_KEY))
    return Number.isFinite(stored) && stored >= 0.85 && stored <= 1.15 ? stored : 0.98
  })
  const activeRunRef = useRef<ActiveRun | null>(null)
  const busyRef = useRef(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const voiceControllerRef = useRef<TurnBasedVoiceController | null>(null)
  const askRef = useRef<(question: string, spoken?: boolean) => Promise<string | null>>(async () => null)
  const stopAnswerRef = useRef<() => void>(() => undefined)
  const voiceMutedRef = useRef(false)
  const seminarOnline = ctx.engine.id === 'seminar-online'
  const voiceCapabilities = useMemo(() => getVoiceCapabilities(), [])
  const personalNodeCount = useMemo(
    () => ctx.custom.nodes.filter((node) => node.community === 'custom').length,
    [ctx.custom.nodes],
  )

  const pendingLabel = useMemo(() => {
    if (phase === 'research') return researchProgress?.step ?? 'Wikipedia wird nach passendem Wissen durchsucht …'
    if (phase === 'retrieval') return 'Passende Knoten und Beziehungen werden zusammengestellt …'
    if (phase === 'generation') return 'Noesis formuliert die Antwort …'
    if (phase === 'stopping') return 'Die laufende Ausgabe wird beendet …'
    return ''
  }, [phase, researchProgress])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages, pendingLabel])

  useEffect(() => {
    if (!seminarOnline) localStorage.setItem(AUTO_WIKIPEDIA_KEY, autoWikipedia ? 'on' : 'off')
  }, [autoWikipedia, seminarOnline])

  useEffect(() => {
    localStorage.setItem(VOICE_URI_KEY, voiceURI)
    localStorage.setItem(VOICE_RATE_KEY, String(voiceRate))
    voiceControllerRef.current?.setPlaybackPreferences({
      voiceURI: voiceURI || undefined,
      rate: voiceRate,
      preferLocalVoice: false,
      naturalProsody: true,
      pauseScale: 0.9,
    })
  }, [voiceRate, voiceURI])

  useEffect(() => {
    if (!voiceOpen || !voiceCapabilities.synthesis) return
    let cancelled = false
    void listGermanVoices('de-DE', false).then((voices) => {
      if (cancelled) return
      setVoiceOptions(voices)
      if (voices.length > 0 && voiceURI && !voices.some((voice) => voice.voiceURI === voiceURI)) setVoiceURI('')
    })
    return () => {
      cancelled = true
    }
  }, [voiceCapabilities.synthesis, voiceOpen, voiceURI])

  useEffect(() => {
    return () => {
      if (activeRunRef.current) activeRunRef.current.cancelled = true
      voiceControllerRef.current?.stop()
    }
  }, [])

  useEffect(() => {
    if (active) return
    voiceControllerRef.current?.stop()
    setVoiceOpen(false)
    setVoiceStage('ready')
    setVoiceTranscript('')
  }, [active])

  useEffect(() => {
    function suspendVoice() {
      voiceControllerRef.current?.stop()
      setVoiceOpen(false)
      setVoiceStage('ready')
      setVoiceTranscript('')
    }
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') suspendVoice()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', suspendVoice)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', suspendVoice)
    }
  }, [])

  function updateMessage(id: string, patch: Partial<ConversationMessage>): void {
    setMessages((current) => current.map((message) => (message.id === id ? { ...message, ...patch } : message)))
  }

  async function ask(rawQuestion?: string, spoken = false): Promise<string | null> {
    const question = (rawQuestion ?? input).trim()
    if (!question || busyRef.current) return null

    const historyBeforeQuestion = messages
    const userMessage: ConversationMessage = {
      id: newId('user'),
      role: 'user',
      text: question,
      status: 'done',
    }
    const assistantMessage: ConversationMessage = {
      id: newId('assistant'),
      role: 'assistant',
      text: '',
      status: 'pending',
    }
    const run: ActiveRun = {
      id: newId('run'),
      assistantMessageId: assistantMessage.id,
      cancelled: false,
    }

    activeRunRef.current = run
    busyRef.current = true
    setMessages((current) => [...current, userMessage, assistantMessage])
    setInput('')
    setBusy(true)
    setResearchProgress(null)

    let graph = seminarOnline && !sharePersonalKnowledge
      ? withoutPersonalKnowledge(ctx.graph)
      : ctx.graph
    const query = retrievalQuestion(question, historyBeforeQuestion)
    const notices: string[] = []

    let answerForVoice: string | null = null

    try {
      const canResearch =
        ctx.online &&
        (seminarOnline ? seminarWikipedia : autoWikipedia) &&
        navigator.onLine !== false &&
        (looksUncovered(query, graph) || looksUncovered(question, graph))

      if (canResearch) {
        setPhase('research')
        try {
          const found = await researchQuestion(query, graph, {}, (progress) => {
            if (!run.cancelled) setResearchProgress(progress)
          })
          if (run.cancelled) return null
          persistResearch(ctx, found)
          graph = mergeResearchGraph(graph, found)
          notices.push(
            `${found.nodes.length} Wikipedia-Artikel und ${found.edges.length} verifizierte MediaWiki-Verbindungen wurden lokal gespeichert.`,
          )
        } catch (error) {
          if (run.cancelled) return null
          const reason = error instanceof Error ? error.message : String(error)
          notices.push(`Die Wikipedia-Ergänzung war nicht verfügbar (${reason}). Die Antwort nutzt deshalb nur das lokale Wissen.`)
        } finally {
          setResearchProgress(null)
        }
      }

      if (run.cancelled) return null
      setPhase('retrieval')
      const runner = new ExperimentRunner(graph)
      let prepared: PreparedTrial
      try {
        prepared = await runner.prepare(query, 'graph', { retrieval: ctx.retrieval })
      } catch (error) {
        if (ctx.retrieval !== 'dense') throw error
        prepared = await runner.prepare(query, 'graph', { retrieval: 'tfidf' })
        notices.push('Dichte Embeddings waren lokal nicht bereit; für diese Antwort wurde automatisch auf TF-IDF zurückgefallen.')
      }

      if (run.cancelled) return null
      const sources = sourceRefs(prepared, graph)
      const retrievedIds = new Set(prepared.retrievedIds)
      const containsPersonalKnowledge =
        sources.some((source) => source.kind === 'Eigenes Wissen') ||
        graph.edges.some(
          (edge) =>
            isPrivateProvenance(edge) &&
            retrievedIds.has(edge.source) &&
            retrievedIds.has(edge.target),
        )
      if (seminarOnline && sharePersonalKnowledge && containsPersonalKnowledge) {
        notices.push('Mit deiner Freigabe wurden ausgewählte Belegauszüge aus deinem lokalen Wissen an das Seminar-Modell gesendet.')
      }
      updateMessage(assistantMessage.id, {
        prepared,
        sources,
        technicalGraph: technicalSubgraph(prepared, graph),
        notices,
        containsPersonalKnowledge,
      })

      setPhase('generation')
      const result = await ctx.engine.generate(
        CONVERSATION_SYSTEM_PROMPT,
        modelPrompt(
          question,
          prepared,
          historyBeforeQuestion,
          !seminarOnline || sharePersonalKnowledge,
          spoken,
        ),
        (partial) => {
          if (!run.cancelled) updateMessage(assistantMessage.id, { text: partial })
        },
      )
      if (run.cancelled) return null
      answerForVoice = result.text.trim() || 'Dazu habe ich in meinem aktuellen Wissensstand keine gesicherte Information.'
      updateMessage(assistantMessage.id, {
        text: answerForVoice,
        status: 'done',
      })
    } catch (error) {
      if (run.cancelled) return null
      const reason = error instanceof Error ? error.message : String(error)
      answerForVoice = `Ich konnte die Antwort gerade nicht erzeugen. ${reason}`
      updateMessage(assistantMessage.id, {
        text: answerForVoice,
        status: 'error',
        notices,
      })
    } finally {
      if (activeRunRef.current?.id === run.id) {
        activeRunRef.current = null
        busyRef.current = false
        setBusy(false)
        setPhase('idle')
        setResearchProgress(null)
      }
    }
    return answerForVoice
  }

  function stopAnswer(): void {
    const run = activeRunRef.current
    if (!run || run.cancelled) return
    run.cancelled = true
    setPhase('stopping')
    setMessages((current) =>
      current.map((message) => {
        if (message.id !== run.assistantMessageId) return message
        return {
          ...message,
          text: message.text || 'Die Antwortausgabe wurde gestoppt.',
          status: 'stopped',
          notices: [...(message.notices ?? []), 'Die sichtbare Ausgabe wurde auf Wunsch gestoppt.'],
        }
      }),
    )
    void Promise.resolve(ctx.engine.interrupt?.()).finally(() => {
      if (activeRunRef.current?.id !== run.id) return
      activeRunRef.current = null
      busyRef.current = false
      setBusy(false)
      setPhase('idle')
      setResearchProgress(null)
    })
  }

  function clearConversation(): void {
    voiceControllerRef.current?.stop()
    setVoiceOpen(false)
    setVoiceStage('ready')
    const run = activeRunRef.current
    if (run) {
      run.cancelled = true
      setPhase('stopping')
      void Promise.resolve(ctx.engine.interrupt?.()).finally(() => {
        if (activeRunRef.current?.id !== run.id) return
        activeRunRef.current = null
        busyRef.current = false
        setBusy(false)
        setPhase('idle')
        setResearchProgress(null)
      })
    }
    setMessages([])
    setInput('')
    setResearchProgress(null)
    if (!run) setPhase('idle')
  }

  function syncVoiceSnapshot(snapshot: LiveVoiceSnapshot): void {
    setVoiceStage(dialogStage(snapshot))
    setVoiceTranscript([snapshot.finalTranscript, snapshot.interimTranscript].filter(Boolean).join(' ').trim())
    setVoiceError(snapshot.error?.message ?? null)
    if (snapshot.lastUserText) setVoiceLastQuestion(snapshot.lastUserText)
    if (snapshot.phase === 'thinking') setVoiceLastAnswer('')
  }

  function voiceController(): TurnBasedVoiceController {
    if (voiceControllerRef.current) return voiceControllerRef.current
    voiceControllerRef.current = new TurnBasedVoiceController({
      lang: 'de-DE',
      autoContinue: true,
      playback: {
        voiceURI: voiceURI || undefined,
        rate: voiceRate,
        preferLocalVoice: false,
        naturalProsody: true,
        pauseScale: 0.9,
      },
      onSnapshot: syncVoiceSnapshot,
      onCancelTurn: () => stopAnswerRef.current(),
      onTurnError: (error) => {
        if (!(error instanceof VoiceSynthesisError) || error.code === 'cancelled') return
        voiceMutedRef.current = true
        setVoiceMuted(true)
        setVoiceNotice('Die Vorlesestimme ist auf diesem Gerät gerade nicht verfügbar. Die Textantwort bleibt sichtbar; Noesis hört weiter zu.')
      },
      onTurn: async (transcript) => {
        setVoiceLastQuestion(transcript)
        setVoiceLastAnswer('')
        const answer = await askRef.current(transcript, true)
        if (answer) setVoiceLastAnswer(answer)
        return voiceMutedRef.current || !voiceCapabilities.synthesis ? null : answer
      },
    })
    return voiceControllerRef.current
  }

  function openVoice(): void {
    if (busyRef.current) return
    setVoiceOpen(true)
    setVoiceTranscript('')
    setVoiceLastQuestion('')
    setVoiceLastAnswer('')
    setVoiceError(null)
    setVoiceNotice(null)
    if (!ctx.online) {
      setVoiceStage('offline')
      return
    }
    if (!voiceCapabilities.recognition) {
      setVoiceStage('unsupported')
      return
    }
    if (!voiceCapabilities.synthesis) {
      voiceMutedRef.current = true
      setVoiceMuted(true)
    }
  }

  function closeVoice(): void {
    voiceControllerRef.current?.stop()
    setVoiceOpen(false)
    setVoiceStage('ready')
    setVoiceTranscript('')
    setVoiceError(null)
    setVoiceNotice(null)
  }

  function handleVoicePrimaryAction(): void {
    const controller = voiceControllerRef.current
    if (!controller) {
      if (voiceCapabilities.recognition) voiceController().start()
      return
    }
    if (voiceStage === 'listening') {
      controller.pause()
    } else if (voiceStage === 'speaking') {
      controller.interruptSpeech()
    } else if (controller.getSnapshot().phase === 'paused' || controller.getSnapshot().phase === 'error') {
      controller.resume()
    } else {
      controller.start()
    }
  }

  function stopVoiceTurn(): void {
    voiceControllerRef.current?.pause()
    stopAnswer()
  }

  function toggleVoiceMuted(): void {
    if (!voiceCapabilities.synthesis) return
    const next = !voiceMutedRef.current
    voiceMutedRef.current = next
    setVoiceMuted(next)
    if (!next) setVoiceNotice(null)
    if (next && voiceStage === 'speaking') voiceControllerRef.current?.interruptSpeech()
  }

  askRef.current = (question) => ask(question)
  stopAnswerRef.current = stopAnswer

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    void ask()
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void ask()
    }
  }

  return (
    <section className="conversation-view">
      <header className="conversation-hero">
        <div>
          <div className="eyebrow">
            {seminarOnline ? 'Seminar-Online-Modell · lokales Graph-Retrieval' : 'Wikipedia · Wissensgraph · lokal'}
          </div>
          <h1>Noesis · philosophischer Wissensdialog</h1>
          <p className="lead">
            Sprich natürlich über Philosophie- und Ideengeschichte. Noesis verbindet passende Knoten, macht seine Quellen
            sichtbar und erweitert sein Wissen bei Bedarf über echte Wikipedia-Verknüpfungen.
          </p>
        </div>
        <div className="conversation-status-row" aria-label="Status des Wissensassistenten">
          <span className="chip">{ctx.graph.nodes.length} Wissensknoten</span>
          <span className="chip">{ctx.engine.label}</span>
          <button
            type="button"
            className={`chip conversation-online-toggle ${ctx.online ? 'online' : ''}`}
            onClick={() => {
              if (!seminarOnline) ctx.setOnline(!ctx.online)
            }}
            title={
              seminarOnline
                ? 'Das gemeinsame Seminar-Modell ist online; Dateien und Graph-Retrieval bleiben lokal.'
                : ctx.online
                  ? 'Live-Recherche ausschalten'
                  : 'Live-Recherche und bewusste Downloads erlauben'
            }
            aria-disabled={seminarOnline}
          >
            {seminarOnline
              ? '● Seminar-Modell verbunden'
              : ctx.online
                ? autoWikipedia
                  ? '● Wikipedia-Automatik aktiv'
                  : '● Online · Automatik aus'
                : '○ Offline · Noesis-Netz aus'}
          </button>
        </div>
      </header>

      {ctx.engine.id === 'extractive' && (
        <div className="callout conversation-engine-note">
          <div>
            <strong>Derzeit ist die schnelle Demo-Engine aktiv.</strong>
            <div className="hint">
              Der Wissensgraph funktioniert bereits; für ein wirklich natürliches Gespräch lade einmalig ein lokales
              Sprachmodell. Danach bleibt es im selben Browserprofil offline nutzbar.
            </div>
          </div>
          <button className="btn sm" type="button" onClick={() => ctx.go('models')}>
            Lokales Modell wählen
          </button>
        </div>
      )}

      {!seminarOnline && ctx.online && (
        <div className="callout conversation-engine-note conversation-wikipedia-control">
          <label className="conversation-wikipedia-auto">
            <input
              type="checkbox"
              checked={autoWikipedia}
              onChange={(event) => setAutoWikipedia(event.target.checked)}
            />
            <span>
              <strong>Wikipedia automatisch bei Wissenslücken ergänzen</strong>
              <small>
                Nur wenn der lokale Graph die Frage voraussichtlich nicht abdeckt, sendet Noesis die Suchfrage an die
                öffentliche MediaWiki-API. Geladene Artikel und echte MediaWiki-Links werden danach lokal gespeichert.
              </small>
            </span>
          </label>
          <button className="btn sm" type="button" onClick={() => ctx.go('knowledge')}>
            Wikipedia gezielt auswählen
          </button>
        </div>
      )}

      {seminarOnline && (
        <div className="callout conversation-engine-note conversation-remote-note">
          <div>
            <strong>Transparenz: Die Antwort wird online formuliert.</strong>
            <div className="hint">
              Text- und PDF-Import, Speicherung sowie Graph-Retrieval laufen auf diesem Gerät. Erst beim Senden werden
              die Frage, ein kurzer Gesprächsverlauf und höchstens 5.000 Zeichen ausgewählter Graphkontext an das
              zeitlich begrenzte Seminar-Modell übertragen – niemals die Originaldatei oder der vollständige Graph.
            </div>
            <div className="seminar-consent-controls">
              <label>
                <input
                  type="checkbox"
                  checked={sharePersonalKnowledge}
                  onChange={(event) => setSharePersonalKnowledge(event.target.checked)}
                  disabled={personalNodeCount === 0}
                />
                <span>
                  <strong>Eigenes Wissen für Online-Antworten freigeben</strong>
                  <small>
                    {personalNodeCount > 0
                      ? 'Nur lokal ausgewählte Textstellen, standardmäßig ausgeschaltet.'
                      : 'Noch kein eigener Text oder PDF-Inhalt gespeichert.'}
                  </small>
                </span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={seminarWikipedia}
                  onChange={(event) => setSeminarWikipedia(event.target.checked)}
                />
                <span>
                  <strong>Wikipedia bei Wissenslücken durchsuchen</strong>
                  <small>Übermittelt die Suchfrage an die öffentliche MediaWiki-API; standardmäßig ausgeschaltet.</small>
                </span>
              </label>
            </div>
          </div>
        </div>
      )}

      <div className="card conversation-shell">
        <div className="conversation-feed" role="log" aria-live="polite" aria-busy={busy}>
          {messages.length === 0 && (
            <div className="conversation-welcome">
              <div className="conversation-avatar" aria-hidden="true">N</div>
              <div>
                <h2>Worüber möchtest du sprechen?</h2>
                <p>
                  Du kannst direkt fragen oder mit einem Vorschlag beginnen. Anschlussfragen versteht Noesis aus dem
                  bisherigen Gespräch heraus.
                </p>
                <div className="conversation-suggestions">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      className="btn conversation-suggestion"
                      type="button"
                      key={suggestion}
                      disabled={busy}
                      onClick={() => void ask(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {messages.map((message) => {
            const relations = message.technicalGraph ? sourceRelationList(message.technicalGraph) : []
            return (
              <article
                className={`conversation-message conversation-message-${message.role} conversation-message-${message.status}`}
                key={message.id}
              >
                <div className="conversation-message-label">
                  {message.role === 'user' ? 'Du' : 'Noesis'}
                </div>
                <div className="conversation-bubble">
                  {message.text ? (
                    <div className="conversation-message-text">{message.text}</div>
                  ) : message.role === 'assistant' ? (
                    <div className="conversation-thinking">
                      <span className="conversation-thinking-dot" aria-hidden="true" />
                      {pendingLabel || 'Einen Moment …'}
                    </div>
                  ) : null}

                  {message.notices?.map((notice) => (
                    <div className="hint conversation-notice" key={notice}>{notice}</div>
                  ))}

                  {message.role === 'assistant' && message.sources && message.sources.length > 0 && (
                    <details className="conversation-sources">
                      <summary>{message.sources.length} verwendete Quellen</summary>
                      <div className="conversation-source-chips">
                        {message.sources.map((source) =>
                          source.url ? (
                            <a
                              className="chip conversation-source-chip"
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                              key={source.id}
                              title={`${source.kind}: ${source.title}`}
                            >
                              {source.title} · {source.kind} ↗
                            </a>
                          ) : (
                            <span className="chip conversation-source-chip" key={source.id} title={source.kind}>
                              {source.title} · {source.kind}
                            </span>
                          ),
                        )}
                      </div>
                    </details>
                  )}

                  {message.role === 'assistant' && message.prepared && (
                    <details className="conversation-technical">
                      <summary>Technischen Kontext einblenden</summary>
                      <div className="conversation-technical-meta">
                        Graph-RAG · Subgraph-Extraktion · {message.prepared.retrievedIds.length} Knoten ·{' '}
                        {message.prepared.retrievalMs} ms Retrieval
                      </div>
                      {relations.length > 0 && (
                        <div className="conversation-relations">
                          <strong>Verwendete Beziehungen</strong>
                          <ul>
                            {relations.map((relation, index) => <li key={`${relation}_${index}`}>{relation}</li>)}
                          </ul>
                        </div>
                      )}
                      <div className="ctx-block conversation-context">
                        {message.prepared.context || 'Für diese Frage wurde kein passender lokaler Kontext gefunden.'}
                      </div>
                    </details>
                  )}
                </div>
              </article>
            )
          })}

          {busy && researchProgress && (
            <div className="conversation-progress" aria-label={researchProgress.step}>
              <div className="progress">
                <div style={{ width: `${(researchProgress.done / Math.max(1, researchProgress.total)) * 100}%` }} />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form className="conversation-composer" onSubmit={submit}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder={ctx.online ? 'Frag Noesis etwas …' : 'Frag das lokal gespeicherte Wissen …'}
            rows={2}
            disabled={busy}
            aria-label="Nachricht an Noesis"
          />
          <div className="conversation-composer-actions">
            <button
              className="btn conversation-live-button"
              type="button"
              onClick={openVoice}
              disabled={busy}
              title="Live-Gespräch öffnen; vor dem Mikrofonstart folgt ein Hinweis zum Browser-Sprachdienst"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 15.25a3.75 3.75 0 0 0 3.75-3.75v-5a3.75 3.75 0 0 0-7.5 0v5A3.75 3.75 0 0 0 12 15.25Z" />
                <path d="M5.75 10.75v.75a6.25 6.25 0 0 0 12.5 0v-.75M12 17.75v3M8.75 20.75h6.5" />
              </svg>
              Live sprechen
            </button>
            {busy ? (
              <button className="btn" type="button" onClick={stopAnswer} disabled={phase === 'stopping'}>
                ■ Ausgabe stoppen
              </button>
            ) : (
              <button className="btn primary" type="submit" disabled={!input.trim()}>
                Senden
              </button>
            )}
            <button
              className="btn"
              type="button"
              onClick={clearConversation}
              disabled={messages.length === 0 && !busy}
              title="Löscht nur den Gesprächsverlauf, nicht den Wissensgraphen"
            >
              Gespräch leeren
            </button>
          </div>
          <div className="hint conversation-composer-hint">
            {seminarOnline
              ? 'Enter sendet · Ausgewählte Belegauszüge werden an das Seminar-Modell übertragen · Originaldateien bleiben lokal'
              : `Enter sendet · Shift+Enter fügt eine neue Zeile ein · Wikipedia-Automatik ${
                  ctx.online && autoWikipedia ? 'aktiv' : 'aus'
                }`}
          </div>
        </form>
      </div>

      <LiveVoiceDialog
        open={voiceOpen}
        stage={voiceStage}
        transcript={voiceTranscript}
        lastQuestion={voiceLastQuestion}
        lastAnswer={voiceLastAnswer}
        error={voiceError ?? voiceNotice}
        muted={voiceMuted}
        speechOutputAvailable={voiceCapabilities.synthesis}
        voices={voiceOptions}
        selectedVoiceURI={voiceURI}
        voiceRate={voiceRate}
        engineLabel={ctx.engine.label}
        remoteAnswer={seminarOnline}
        onClose={closeVoice}
        onPrimaryAction={handleVoicePrimaryAction}
        onStopTurn={stopVoiceTurn}
        onToggleMuted={toggleVoiceMuted}
        onVoiceChange={setVoiceURI}
        onVoiceRateChange={setVoiceRate}
      />
    </section>
  )
}
