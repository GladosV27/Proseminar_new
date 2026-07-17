import { useMemo, useState } from 'react'
import type { GraphEdge, GraphNode, KnowledgeGraph } from '../data/types'
import { terms } from '../engine/text'
import ForceGraph from './ForceGraph'

function edgeKey(edge: GraphEdge): string {
  return `${edge.source}\u0000${edge.relation}\u0000${edge.target}`
}

function sentences(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter('de', { granularity: 'sentence' })
    return [...segmenter.segment(text)].map((item) => item.segment.trim()).filter(Boolean)
  }
  return text.split(/(?<=[.!?])\s+/).map((value) => value.trim()).filter(Boolean)
}

function matchNodes(sentence: string, nodes: GraphNode[]): GraphNode[] {
  const queryTerms = new Set(terms(sentence))
  return nodes
    .map((node) => {
      const titleTerms = new Set(terms(node.title))
      const bodyTerms = new Set(terms(node.summary))
      let score = 0
      for (const term of queryTerms) {
        if (titleTerms.has(term)) score += 4
        else if (bodyTerms.has(term)) score += 1
      }
      return { node, score }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((item) => item.node)
}

export default function AnswerEvidence({ answer, graph }: { answer: string; graph: KnowledgeGraph }) {
  const mapped = useMemo(() => sentences(answer).map((sentence) => ({
    sentence,
    nodes: matchNodes(sentence, graph.nodes),
  })), [answer, graph.nodes])
  const [active, setActive] = useState(0)
  const activeIds = mapped[active]?.nodes.map((node) => node.id) ?? []
  const activeSet = new Set(activeIds)
  const activeEdges = graph.edges.filter((edge) => activeSet.has(edge.source) || activeSet.has(edge.target))

  if (!graph.nodes.length || !mapped.length) return null
  return (
    <details className="answer-evidence">
      <summary>Antwort im Graph nachvollziehen</summary>
      <div className="answer-evidence-note">
        Transparente Hilfsansicht: Sätze werden deterministisch nach gemeinsamer Terminologie passenden Retrieval-Knoten
        zugeordnet. Das ist eine nachvollziehbare Zuordnung, aber kein Beweis für die innere Modellkausalität.
      </div>
      <div className="answer-evidence-layout">
        <div className="answer-evidence-sentences">
          {mapped.map((item, index) => (
            <button
              type="button"
              className={active === index ? 'active' : ''}
              onClick={() => setActive(index)}
              key={`${item.sentence}_${index}`}
            >
              <span>{index + 1}</span>
              <p>{item.sentence}</p>
              <small>{item.nodes.length ? item.nodes.map((node) => node.title).join(' · ') : 'keine eindeutige Zuordnung'}</small>
            </button>
          ))}
        </div>
        <ForceGraph
          graph={graph}
          height={320}
          highlightIds={activeIds}
          highlightEdgeKeys={activeEdges.map(edgeKey)}
          pulse
        />
      </div>
    </details>
  )
}
