import { useMemo, useState } from 'react'
import type { AppCtx } from '../App'
import ForceGraph, { communityColor } from '../components/ForceGraph'
import { COMMUNITIES, NODE_YEARS, TIMELINE_RANGE } from '../data/graph'

const EXPLORER_FOCUS_KEY = 'noesis.explorer.focus.v1'
const COUNTERFACTUAL_EDGE_KEY = 'noesis.arena.counterfactual-edge.v1'

function edgeKey(source: string, relation: string, target: string): string {
  return `${source}\u0000${relation}\u0000${target}`
}

export default function Explorer({ ctx }: { ctx: AppCtx }) {
  const [selected, setSelected] = useState<string | null>(() => {
    const requested = sessionStorage.getItem(EXPLORER_FOCUS_KEY)
    sessionStorage.removeItem(EXPLORER_FOCUS_KEY)
    return requested && ctx.graph.nodes.some((node) => node.id === requested) ? requested : null
  })
  const [query, setQuery] = useState(() =>
    selected ? ctx.graph.nodes.find((node) => node.id === selected)?.title ?? '' : '',
  )
  const [communityFilter, setCommunityFilter] = useState<string>('alle')
  const [timeline, setTimeline] = useState(false)
  const [year, setYear] = useState(1800)
  const [showHeuristic, setShowHeuristic] = useState(true)
  const [showMediaWiki, setShowMediaWiki] = useState(true)

  const communities = useMemo(() => [...new Set(ctx.graph.nodes.map((n) => n.community))], [ctx.graph])
  const visibleGraph = useMemo(() => ({
    nodes: ctx.graph.nodes,
    edges: ctx.graph.edges.filter((edge) => {
      const heuristic = edge.provenance?.some((item) => item.confidence === 'heuristic') ?? false
      const mediaWiki = edge.relation === 'mediawiki_verlinkt_auf'
      return (showHeuristic || !heuristic) && (showMediaWiki || !mediaWiki)
    }),
  }), [ctx.graph, showHeuristic, showMediaWiki])

  const highlightIds = useMemo(() => {
    let ids = ctx.graph.nodes.map((n) => n.id)
    if (communityFilter !== 'alle') {
      ids = ctx.graph.nodes.filter((n) => n.community === communityFilter).map((n) => n.id)
    }
    if (query.trim()) {
      const q = query.toLowerCase()
      ids = ids.filter((id) => {
        const n = ctx.graph.nodes.find((x) => x.id === id)!
        return n.title.toLowerCase().includes(q) || n.summary.toLowerCase().includes(q)
      })
    }
    if (timeline) {
      // Zeitreise: nur Knoten zeigen, die im gewählten Jahr »existieren«
      ids = ids.filter((id) => {
        const span = NODE_YEARS[id]
        return !span || (year >= span[0] && year <= span[1])
      })
    }
    return ids.length === ctx.graph.nodes.length ? undefined : ids
  }, [ctx.graph, query, communityFilter, timeline, year])

  const node = selected ? ctx.graph.nodes.find((n) => n.id === selected) : null
  const nodeEdges = node
    ? visibleGraph.edges.filter((e) => e.source === node.id || e.target === node.id)
    : []

  const communityName = (id: string) =>
    COMMUNITIES.find((c) => c.id === id)?.name ??
    (id.startsWith('wiki_') ? 'Wikipedia-Import' : id === 'recherche' ? 'Live-Recherche' : 'Eigenes Wissen')

  return (
    <div>
      <div className="eyebrow">Wissensgraph</div>
      <h1>Graph-Explorer</h1>
      <p className="lead">
        Artikel sind Knoten, Beziehungen sind Kanten, Farben markieren Communities. Ziehe den Hintergrund frei,
        zoome mit Mausrad oder Pinch und verschiebe einzelne Knoten unabhängig voneinander.
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <input
          type="text"
          placeholder="Suche in Titeln und Texten …"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <select value={communityFilter} onChange={(e) => setCommunityFilter(e.target.value)} style={{ maxWidth: 280 }}>
          <option value="alle">Alle Communities</option>
          {communities.map((c) => (
            <option key={c} value={c}>
              {communityName(c)}
            </option>
          ))}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, flexWrap: 'wrap' }}>
          <input type="checkbox" checked={timeline} onChange={(e) => setTimeline(e.target.checked)} />
          🕰 Zeitreise
          {timeline && (
            <>
              <input
                type="range"
                min={TIMELINE_RANGE[0]}
                max={TIMELINE_RANGE[1]}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                style={{ width: 200, padding: 0 }}
              />
              <strong style={{ fontFamily: 'var(--serif)', fontSize: 18, minWidth: 52 }}>{year}</strong>
            </>
          )}
        </label>
        <label className="graph-layer-toggle">
          <input type="checkbox" checked={showMediaWiki} onChange={(event) => setShowMediaWiki(event.target.checked)} />
          MediaWiki-Links
        </label>
        <label className="graph-layer-toggle">
          <input type="checkbox" checked={showHeuristic} onChange={(event) => setShowHeuristic(event.target.checked)} />
          Heuristische Themenkanten
        </label>
      </div>

      <div className="card" style={{ padding: 8 }}>
        <ForceGraph graph={visibleGraph} highlightIds={highlightIds} selected={selected} onSelect={setSelected} />
        <div className="legend" style={{ padding: '4px 12px 8px' }}>
          {communities.map((c) => (
            <span key={c}>
              <span className="sw" style={{ background: communityColor(communities, c) }} />
              {communityName(c)}
            </span>
          ))}
        </div>
      </div>

      {node && (
        <div className="card" style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: 18, fontFamily: 'var(--serif)' }}>{node.title}</h3>
            <span className="chip">
              <span className="dot" style={{ background: communityColor(communities, node.community) }} />
              {communityName(node.community)} · {node.type}
            </span>
          </div>
          <p style={{ fontSize: 14 }}>{node.summary}</p>
          {nodeEdges.length > 0 && (
            <>
              <h3 style={{ marginTop: 12 }}>Beziehungen ({nodeEdges.length})</h3>
              <div style={{ display: 'grid', gap: 4, fontSize: 13.5 }}>
                {nodeEdges.map((e, i) => {
                  const other = e.source === node.id ? e.target : e.source
                  const otherNode = ctx.graph.nodes.find((n) => n.id === other)
                  return (
                    <div className="explorer-relation-row" key={i}>
                      <div>
                      {e.source === node.id ? (
                        <>
                          <span className="hint">{e.label}</span>{' '}
                          <a
                            style={{ color: 'var(--accent-deep)', cursor: 'pointer', fontWeight: 600 }}
                            onClick={() => setSelected(other)}
                          >
                            {otherNode?.title}
                          </a>
                        </>
                      ) : (
                        <>
                          <a
                            style={{ color: 'var(--accent-deep)', cursor: 'pointer', fontWeight: 600 }}
                            onClick={() => setSelected(other)}
                          >
                            {otherNode?.title}
                          </a>{' '}
                          <span className="hint">{e.label}</span> <span className="hint">→ {node.title}</span>
                        </>
                      )}
                      </div>
                      <button
                        type="button"
                        className="btn sm"
                        title="Dieselbe Frage mit und ohne diese Kante vergleichen"
                        onClick={() => {
                          sessionStorage.setItem(COUNTERFACTUAL_EDGE_KEY, edgeKey(e.source, e.relation, e.target))
                          ctx.go('arena')
                        }}
                      >
                        Was wäre ohne diese Kante?
                      </button>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
