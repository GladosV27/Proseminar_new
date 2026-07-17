import type {
  GraphEdge,
  GraphNode,
  KnowledgeGraph,
  KnowledgeImportDelta,
  KnowledgeImportReport,
  KnowledgeProvenance,
  KnowledgeSourceKind,
} from '../data/types'

/** Stabiler, schneller Hash für IDs. Kein kryptographischer Integritätsbeleg. */
export function stableHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function edgeKey(edge: Pick<GraphEdge, 'source' | 'relation' | 'target'>): string {
  return `${edge.source}\u0000${edge.relation}\u0000${edge.target}`
}

export function emptyImportDelta(): KnowledgeImportDelta {
  return {
    addedNodeIds: [],
    updatedNodeIds: [],
    unchangedNodeIds: [],
    removedNodeIds: [],
    addedEdgeKeys: [],
    updatedEdgeKeys: [],
    unchangedEdgeKeys: [],
    removedEdgeKeys: [],
    skippedNodes: 0,
    skippedEdges: 0,
  }
}

export function provisionalDelta(nodes: GraphNode[], edges: GraphEdge[], graph: KnowledgeGraph): KnowledgeImportDelta {
  const delta = emptyImportDelta()
  const nodeIds = new Set(graph.nodes.map((node) => node.id))
  const edgeIds = new Set(graph.edges.map(edgeKey))
  for (const node of nodes) {
    if (nodeIds.has(node.id)) delta.updatedNodeIds.push(node.id)
    else delta.addedNodeIds.push(node.id)
  }
  for (const edge of edges) {
    const key = edgeKey(edge)
    if (edgeIds.has(key)) delta.unchangedEdgeKeys.push(key)
    else delta.addedEdgeKeys.push(key)
  }
  return delta
}

export function createImportReport(args: {
  sourceId: string
  sourceKind: KnowledgeSourceKind
  sourceTitle: string
  importedAt: number
  localOnly: boolean
  nodes: GraphNode[]
  edges: GraphEdge[]
  graph: KnowledgeGraph
  truncated?: boolean
  warnings?: string[]
  skippedReasons?: Record<string, number>
}): KnowledgeImportReport {
  const nonce = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${args.importedAt.toString(36)}-${stableHash(args.sourceId)}`
  const skippedReasons = { ...(args.skippedReasons ?? {}) }
  const delta = provisionalDelta(args.nodes, args.edges, args.graph)
  delta.skippedEdges = Object.values(skippedReasons).reduce((sum, count) => sum + count, 0)
  return {
    importId: `import:${nonce}`,
    sourceId: args.sourceId,
    sourceKind: args.sourceKind,
    sourceTitle: args.sourceTitle,
    importedAt: args.importedAt,
    localOnly: args.localOnly,
    candidateNodes: args.nodes.length,
    candidateEdges: args.edges.length,
    evidencedEdges: args.edges.filter((edge) => (edge.provenance?.length ?? 0) > 0).length,
    truncated: args.truncated ?? false,
    warnings: [...(args.warnings ?? [])],
    skippedReasons,
    delta,
  }
}

function provenanceKey(value: KnowledgeProvenance): string {
  return [
    value.sourceId,
    value.importScopeId ?? '',
    value.method,
    value.page ?? '',
    value.pageEnd ?? '',
    value.section ?? '',
    value.charStart ?? '',
    value.charEnd ?? '',
    value.revisionId ?? '',
    value.targetTitle ?? '',
    value.contentFingerprint ?? '',
    value.evidence ?? '',
  ].join('\u0000')
}

/** Vereinigt Herkunftsbelege deterministisch und ohne Duplikate. */
export function mergeProvenance(
  current: KnowledgeProvenance[] | undefined,
  additions: KnowledgeProvenance[] | undefined,
): KnowledgeProvenance[] | undefined {
  if (!current?.length && !additions?.length) return undefined
  const merged: KnowledgeProvenance[] = []
  const seen = new Set<string>()
  for (const value of [...(current ?? []), ...(additions ?? [])]) {
    if (!value?.sourceId || !value.method) continue
    const key = provenanceKey(value)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push({ ...value })
  }
  return merged.length ? merged : undefined
}

/** Kurzer Originalausschnitt um einen belegenden Textspan. */
export function evidenceExcerpt(text: string, start: number, end: number, maxChars = 320): string {
  const safeStart = Math.max(0, Math.min(start, text.length))
  const safeEnd = Math.max(safeStart, Math.min(end, text.length))
  const context = Math.max(0, Math.floor((maxChars - (safeEnd - safeStart)) / 2))
  let from = Math.max(0, safeStart - context)
  let to = Math.min(text.length, safeEnd + context)
  const beforeBoundary = text.lastIndexOf(' ', from)
  if (beforeBoundary >= 0 && beforeBoundary > from - 24) from = beforeBoundary + 1
  const afterBoundary = text.indexOf(' ', to)
  if (afterBoundary >= 0 && afterBoundary < to + 24) to = afterBoundary
  const compact = text.slice(from, to).replace(/\s+/g, ' ').trim()
  return `${from > 0 ? '…' : ''}${compact}${to < text.length ? '…' : ''}`
}
