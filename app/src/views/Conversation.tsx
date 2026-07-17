import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { AppCtx } from '../App'
import type { GraphEdge, KnowledgeGraph } from '../data/types'
import { ExperimentRunner, type PreparedTrial } from '../engine/experiment'
import {
  RESEARCH_COMMUNITY,
  looksUncovered,
  researchQuestion,
  type ResearchProgress,
  type ResearchResult,
} from '../engine/research'

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

const CONVERSATION_SYSTEM_PROMPT = [
  'Du bist Fable, ein freundlicher deutschsprachiger Wissensassistent für Philosophie- und Ideengeschichte.',
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
  const graphNodeIds = new Set(ctx.graph.nodes.map((node) => node.id))
  const graphEdges = new Set(ctx.graph.edges.map(edgeKey))
  const nodes = found.nodes.filter((node) => !graphNodeIds.has(node.id))
  const newEdges = found.edges.filter((edge) => !graphEdges.has(edgeKey(edge)))
  const edges = appendNewEdges(ctx.custom.edges, newEdges)
  if (nodes.length === 0 && edges.length === ctx.custom.edges.length) return
  ctx.setCustom({
    nodes: [...ctx.custom.nodes, ...nodes],
    edges,
  })
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

function conversationHistory(messages: ConversationMessage[]): string {
  const usable = messages
    .filter((message) => message.status === 'done' && message.text.trim())
    .slice(-6)
  if (usable.length === 0) return ''
  return usable
    .map((message) => {
      const label = message.role === 'user' ? 'NUTZER' : 'FABLE'
      const compact = message.text.replace(/\s+/g, ' ').trim().slice(0, 700)
      return `${label}: ${compact}`
    })
    .join('\n')
}

function modelPrompt(question: string, prepared: PreparedTrial, messages: ConversationMessage[]): string {
  const history = conversationHistory(messages)
  return [
    history ? `BISHERIGER GESPRÄCHSVERLAUF (nur für sprachliche Bezüge):\n${history}` : '',
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

export default function Conversation({ ctx }: { ctx: AppCtx }) {
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<ConversationPhase>('idle')
  const [researchProgress, setResearchProgress] = useState<ResearchProgress | null>(null)
  const activeRunRef = useRef<ActiveRun | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const pendingLabel = useMemo(() => {
    if (phase === 'research') return researchProgress?.step ?? 'Wikipedia wird nach passendem Wissen durchsucht …'
    if (phase === 'retrieval') return 'Passende Knoten und Beziehungen werden zusammengestellt …'
    if (phase === 'generation') return 'Fable formuliert die Antwort …'
    if (phase === 'stopping') return 'Die laufende Ausgabe wird beendet …'
    return ''
  }, [phase, researchProgress])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages, pendingLabel])

  useEffect(() => {
    return () => {
      if (activeRunRef.current) activeRunRef.current.cancelled = true
    }
  }, [])

  function updateMessage(id: string, patch: Partial<ConversationMessage>): void {
    setMessages((current) => current.map((message) => (message.id === id ? { ...message, ...patch } : message)))
  }

  async function ask(rawQuestion?: string): Promise<void> {
    const question = (rawQuestion ?? input).trim()
    if (!question || busy) return

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
    setMessages((current) => [...current, userMessage, assistantMessage])
    setInput('')
    setBusy(true)
    setResearchProgress(null)

    let graph = ctx.graph
    const query = retrievalQuestion(question, historyBeforeQuestion)
    const notices: string[] = []

    try {
      const canResearch =
        ctx.online &&
        navigator.onLine !== false &&
        (looksUncovered(query, graph) || looksUncovered(question, graph))

      if (canResearch) {
        setPhase('research')
        try {
          const found = await researchQuestion(query, graph, {}, (progress) => {
            if (!run.cancelled) setResearchProgress(progress)
          })
          if (run.cancelled) return
          persistResearch(ctx, found)
          graph = mergeResearchGraph(graph, found)
          notices.push(
            `${found.nodes.length} Wikipedia-Artikel und ${found.edges.length} verifizierte MediaWiki-Verbindungen wurden lokal gespeichert.`,
          )
        } catch (error) {
          if (run.cancelled) return
          const reason = error instanceof Error ? error.message : String(error)
          notices.push(`Die Wikipedia-Ergänzung war nicht verfügbar (${reason}). Die Antwort nutzt deshalb nur das lokale Wissen.`)
        } finally {
          setResearchProgress(null)
        }
      }

      if (run.cancelled) return
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

      if (run.cancelled) return
      const sources = sourceRefs(prepared, graph)
      updateMessage(assistantMessage.id, {
        prepared,
        sources,
        technicalGraph: technicalSubgraph(prepared, graph),
        notices,
      })

      setPhase('generation')
      const result = await ctx.engine.generate(
        CONVERSATION_SYSTEM_PROMPT,
        modelPrompt(question, prepared, historyBeforeQuestion),
        (partial) => {
          if (!run.cancelled) updateMessage(assistantMessage.id, { text: partial })
        },
      )
      if (run.cancelled) return
      updateMessage(assistantMessage.id, {
        text: result.text.trim() || 'Dazu habe ich in meinem aktuellen Wissensstand keine gesicherte Information.',
        status: 'done',
      })
    } catch (error) {
      if (run.cancelled) return
      const reason = error instanceof Error ? error.message : String(error)
      updateMessage(assistantMessage.id, {
        text: `Ich konnte die Antwort gerade nicht erzeugen. ${reason}`,
        status: 'error',
        notices,
      })
    } finally {
      if (activeRunRef.current?.id === run.id) {
        activeRunRef.current = null
        setBusy(false)
        setPhase('idle')
        setResearchProgress(null)
      }
    }
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
      setBusy(false)
      setPhase('idle')
      setResearchProgress(null)
    })
  }

  function clearConversation(): void {
    const run = activeRunRef.current
    if (run) {
      run.cancelled = true
      setPhase('stopping')
      void Promise.resolve(ctx.engine.interrupt?.()).finally(() => {
        if (activeRunRef.current?.id !== run.id) return
        activeRunRef.current = null
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
          <div className="eyebrow">Wikipedia · Wissensgraph · lokal</div>
          <h1>Fable Wissensgespräch</h1>
          <p className="lead">
            Sprich natürlich über Philosophie- und Ideengeschichte. Fable verbindet passende Knoten, macht seine Quellen
            sichtbar und erweitert sein Wissen bei Bedarf über echte Wikipedia-Verknüpfungen.
          </p>
        </div>
        <div className="conversation-status-row" aria-label="Status des Wissensassistenten">
          <span className="chip">{ctx.graph.nodes.length} Wissensknoten</span>
          <span className="chip">{ctx.engine.label}</span>
          <button
            type="button"
            className={`chip conversation-online-toggle ${ctx.online ? 'online' : ''}`}
            onClick={() => ctx.setOnline(!ctx.online)}
            title={ctx.online ? 'Live-Recherche ausschalten' : 'Live-Recherche und bewusste Downloads erlauben'}
          >
            {ctx.online ? '● Wikipedia bei Wissenslücken' : '○ Offline · nur lokales Wissen'}
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

      <div className="card conversation-shell">
        <div className="conversation-feed" role="log" aria-live="polite" aria-busy={busy}>
          {messages.length === 0 && (
            <div className="conversation-welcome">
              <div className="conversation-avatar" aria-hidden="true">F</div>
              <div>
                <h2>Worüber möchtest du sprechen?</h2>
                <p>
                  Du kannst direkt fragen oder mit einem Vorschlag beginnen. Anschlussfragen versteht Fable aus dem
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
                  {message.role === 'user' ? 'Du' : 'Fable'}
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
            placeholder={ctx.online ? 'Frag Fable etwas …' : 'Frag das lokal gespeicherte Wissen …'}
            rows={2}
            disabled={busy}
            aria-label="Nachricht an Fable"
          />
          <div className="conversation-composer-actions">
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
            Enter sendet · Shift+Enter fügt eine neue Zeile ein · Wikipedia-Wissen wird nur im Online-Modus ergänzt
          </div>
        </form>
      </div>
    </section>
  )
}
