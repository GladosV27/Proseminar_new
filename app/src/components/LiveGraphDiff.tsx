import { useEffect, useMemo, useState } from 'react'
import type { KnowledgeGraph } from '../data/types'
import ForceGraph from './ForceGraph'

interface Props {
  graph: KnowledgeGraph
  addedNodeIds: string[]
  addedEdgeKeys: string[]
}

export default function LiveGraphDiff({ graph, addedNodeIds, addedEdgeKeys }: Props) {
  const orderedIds = useMemo(() => {
    const added = new Set(addedNodeIds)
    return [...graph.nodes.filter((node) => added.has(node.id)), ...graph.nodes.filter((node) => !added.has(node.id))]
      .map((node) => node.id)
  }, [addedNodeIds, graph.nodes])
  const [visibleCount, setVisibleCount] = useState(1)

  useEffect(() => {
    setVisibleCount(Math.min(1, orderedIds.length))
    if (orderedIds.length <= 1) return
    const timer = window.setInterval(() => {
      setVisibleCount((current) => {
        if (current >= orderedIds.length) {
          window.clearInterval(timer)
          return current
        }
        return current + 1
      })
    }, 190)
    return () => window.clearInterval(timer)
  }, [orderedIds])

  const visible = new Set(orderedIds.slice(0, visibleCount))
  const shownGraph = {
    nodes: graph.nodes.filter((node) => visible.has(node.id)),
    edges: graph.edges.filter((edge) => visible.has(edge.source) && visible.has(edge.target)),
  }

  return (
    <div className="live-graph-diff">
      <div className="live-graph-diff-head">
        <div>
          <strong>Der Wissensbaum wächst</strong>
          <span>{visibleCount}/{orderedIds.length} Knoten sichtbar</span>
        </div>
        <div className="live-graph-diff-legend">
          <span><i className="verified" /> MediaWiki-belegt</span>
          <span><i className="heuristic" /> thematische Heuristik</span>
        </div>
      </div>
      <ForceGraph
        graph={shownGraph}
        height={300}
        highlightIds={addedNodeIds}
        highlightEdgeKeys={addedEdgeKeys}
        pulse
      />
    </div>
  )
}
