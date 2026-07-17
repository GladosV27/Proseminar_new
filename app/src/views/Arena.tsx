import { useMemo, useState } from 'react'
import type { AppCtx } from '../App'
import ForceGraph from '../components/ForceGraph'
import type { Condition, KnowledgeGraph } from '../data/types'
import {
  ALL_CONDITIONS,
  CONDITION_INFO,
  ExperimentRunner,
  SYSTEM_PROMPT,
  type PreparedTrial,
} from '../engine/experiment'
import { ExtractiveEngine, type LLMEngine } from '../engine/llm'

const COUNTERFACTUAL_EDGE_KEY = 'noesis.arena.counterfactual-edge.v1'

interface ArenaResult {
  condition: Condition
  answer: string
  prepared: PreparedTrial
  latencyMs: number
  graph: KnowledgeGraph
  engineLabel: string
}

type ArenaEngine = 'active' | 'demo'

function keyOf(source: string, relation: string, target: string): string {
  return `${source}\u0000${relation}\u0000${target}`
}

function preparedGraph(prepared: PreparedTrial, graph: KnowledgeGraph): KnowledgeGraph {
  const ids = new Set(prepared.subgraph?.nodes ?? prepared.retrievedIds)
  return {
    nodes: graph.nodes.filter((node) => ids.has(node.id)),
    edges: graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
  }
}

async function runSide(
  ctx: AppCtx,
  graph: KnowledgeGraph,
  question: string,
  condition: Condition,
  engine: LLMEngine,
): Promise<ArenaResult> {
  const runner = new ExperimentRunner(graph)
  const started = performance.now()
  let prepared: PreparedTrial
  try {
    prepared = await runner.prepare(question, condition, { retrieval: ctx.retrieval })
  } catch (error) {
    if (ctx.retrieval !== 'dense') throw error
    prepared = await runner.prepare(question, condition, { retrieval: 'tfidf' })
  }
  const generated = await engine.generate(SYSTEM_PROMPT, prepared.userPrompt)
  return {
    condition,
    answer: generated.text,
    prepared,
    latencyMs: Math.round(performance.now() - started),
    graph: preparedGraph(prepared, graph),
    engineLabel: engine.label,
  }
}

export default function Arena({ ctx }: { ctx: AppCtx }) {
  const [question, setQuestion] = useState('Wie hängen Kant, Hegel und Schopenhauer philosophisch zusammen?')
  const [leftCondition, setLeftCondition] = useState<Condition>('vector')
  const [rightCondition, setRightCondition] = useState<Condition>('graph')
  const [leftEngine, setLeftEngine] = useState<ArenaEngine>('active')
  const [rightEngine, setRightEngine] = useState<ArenaEngine>('active')
  const [blind, setBlind] = useState(true)
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [left, setLeft] = useState<ArenaResult | null>(null)
  const [right, setRight] = useState<ArenaResult | null>(null)
  const [vote, setVote] = useState<'left' | 'right' | 'tie' | null>(null)
  const [counterfactualKey] = useState(() => {
    const value = sessionStorage.getItem(COUNTERFACTUAL_EDGE_KEY)
    sessionStorage.removeItem(COUNTERFACTUAL_EDGE_KEY)
    return value
  })

  const counterfactualEdge = useMemo(
    () => counterfactualKey ? ctx.graph.edges.find((edge) => keyOf(edge.source, edge.relation, edge.target) === counterfactualKey) : undefined,
    [counterfactualKey, ctx.graph.edges],
  )
  const rightGraph = useMemo<KnowledgeGraph>(() => counterfactualKey
    ? { ...ctx.graph, edges: ctx.graph.edges.filter((edge) => keyOf(edge.source, edge.relation, edge.target) !== counterfactualKey) }
    : ctx.graph,
  [counterfactualKey, ctx.graph])

  async function compare() {
    const query = question.trim()
    if (!query || busy) return
    setBusy(true)
    setError(null)
    setLeft(null)
    setRight(null)
    setVote(null)
    setRevealed(!blind)
    try {
      // WebLLM-Engines teilen sich eine Pipeline und werden deshalb bewusst
      // nacheinander ausgeführt; die UI bleibt trotzdem als A/B-Arena lesbar.
      const firstEngine = leftEngine === 'active' ? ctx.engine : new ExtractiveEngine()
      const secondEngine = rightEngine === 'active' ? ctx.engine : new ExtractiveEngine()
      const first = await runSide(ctx, ctx.graph, query, leftCondition, firstEngine)
      setLeft(first)
      const second = await runSide(ctx, rightGraph, query, rightCondition, secondEngine)
      setRight(second)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  function decide(next: 'left' | 'right' | 'tie') {
    setVote(next)
    setRevealed(true)
  }

  const titleFor = (side: 'left' | 'right', result: ArenaResult | null) => {
    if (!result) return side === 'left' ? 'Antwort A' : 'Antwort B'
    if (blind && !revealed) return side === 'left' ? 'Antwort A' : 'Antwort B'
    return CONDITION_INFO[result.condition].label
  }

  return (
    <div className="arena-page">
      <div className="eyebrow">Live-Vergleich · kontrollierte Gegenprobe</div>
      <h1>Noesis Arena</h1>
      <p className="lead">
        Eine Frage, zwei Retrievalbedingungen und auf Wunsch zwei Engines. Im Blindmodus entscheidest du zuerst nach
        der Antwort; erst danach werden Verfahren und Antwortsystem aufgedeckt.
      </p>

      {counterfactualEdge && (
        <div className="callout arena-counterfactual">
          <strong>Was-wäre-wenn-Gegenprobe aktiv</strong>
          <span>Rechts wird genau eine Kante entfernt: {counterfactualEdge.label}</span>
        </div>
      )}

      <div className="card arena-controls">
        <textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={2} />
        <div className="arena-condition-row">
          <label>
            <span>Links</span>
            <select value={leftCondition} onChange={(event) => setLeftCondition(event.target.value as Condition)}>
              {ALL_CONDITIONS.map((condition) => <option value={condition} key={condition}>{CONDITION_INFO[condition].label}</option>)}
            </select>
            <select value={leftEngine} onChange={(event) => setLeftEngine(event.target.value as ArenaEngine)}>
              <option value="active">Aktiv: {ctx.engine.label}</option>
              <option value="demo">Demo-Engine (extraktiv)</option>
            </select>
          </label>
          <label>
            <span>Rechts</span>
            <select value={rightCondition} onChange={(event) => setRightCondition(event.target.value as Condition)}>
              {ALL_CONDITIONS.map((condition) => <option value={condition} key={condition}>{CONDITION_INFO[condition].label}</option>)}
            </select>
            <select value={rightEngine} onChange={(event) => setRightEngine(event.target.value as ArenaEngine)}>
              <option value="active">Aktiv: {ctx.engine.label}</option>
              <option value="demo">Demo-Engine (extraktiv)</option>
            </select>
          </label>
          <label className="arena-blind"><input type="checkbox" checked={blind} onChange={(event) => setBlind(event.target.checked)} /> Blind vergleichen</label>
          <button className="btn primary" type="button" disabled={busy || !question.trim()} onClick={() => void compare()}>
            {busy ? 'Arena läuft …' : 'Vergleich starten'}
          </button>
        </div>
      </div>

      {error && <div className="callout" style={{ borderColor: 'var(--bad)' }}>{error}</div>}

      <div className="arena-grid">
        {([['left', left], ['right', right]] as const).map(([side, result]) => (
          <article className={`card arena-side ${vote === side ? 'winner' : ''}`} key={side}>
            <div className="arena-side-head">
              <h2>{titleFor(side, result)}</h2>
              {result && <span>{result.engineLabel} · {result.latencyMs} ms · {result.prepared.context.length} Zeichen</span>}
            </div>
            <div className="arena-answer">
              {result?.answer || (busy ? 'Wird erzeugt …' : 'Noch kein Durchlauf')}
            </div>
            {result && result.graph.nodes.length > 0 && (
              <details>
                <summary>Evidenzgraph öffnen</summary>
                <ForceGraph graph={result.graph} height={330} pulse />
              </details>
            )}
          </article>
        ))}
      </div>

      {left && right && blind && !revealed && (
        <div className="arena-vote">
          <strong>Welche Antwort überzeugt mehr?</strong>
          <button className="btn" onClick={() => decide('left')}>Antwort A</button>
          <button className="btn" onClick={() => decide('tie')}>Gleichwertig</button>
          <button className="btn" onClick={() => decide('right')}>Antwort B</button>
        </div>
      )}
      {left && right && (!blind || revealed) && (
        <div className="callout arena-reveal">
          <strong>Auflösung</strong>
          <span>Links: {left.engineLabel} + {CONDITION_INFO[left.condition].label} · Rechts: {right.engineLabel} + {CONDITION_INFO[right.condition].label}</span>
          {vote && <span>Deine Wahl: {vote === 'left' ? 'links' : vote === 'right' ? 'rechts' : 'gleichwertig'}</span>}
        </div>
      )}
    </div>
  )
}
