import type { GraphEdge, GraphNode, KnowledgeGraph } from '../data/types'
import { normalize, terms } from './text'

/**
 * Graph-RAG-Bedingung: topologisches Retrieval über den Wissensgraphen.
 *
 * Pipeline (entspricht Abschnitt 4.2 der Ausarbeitung):
 *  1. Entity-Linking:  Erwähnungen von Knotentiteln/Aliassen in der Frage
 *  2. Seed-Erweiterung: zusätzlich Top-Knoten nach lexikalischer Relevanz
 *  3. Traversal:       gescorte Breitensuche (Beam) bis Tiefe 3 –
 *                      Kanten werden bevorzugt, deren Relation/Zielknoten
 *                      mit den Frage-Termen überlappen
 *  4. Serialisierung:  Subgraph als Tripel-Liste + Zusammenfassungen der
 *                      Pfadknoten → linearisierter Kontext für das LLM
 */

export interface SubgraphResult {
  seeds: GraphNode[]
  nodes: GraphNode[]
  edges: GraphEdge[]
  context: string
}

interface Adj {
  edge: GraphEdge
  other: string
  dir: 'out' | 'in'
}

export class GraphIndex {
  private byId = new Map<string, GraphNode>()
  private adj = new Map<string, Adj[]>()
  private nameIndex: { key: string; id: string }[] = []

  constructor(private graph: KnowledgeGraph) {
    for (const n of graph.nodes) {
      this.byId.set(n.id, n)
      this.adj.set(n.id, [])
      const names = [n.title, ...(n.aliases ?? [])]
      for (const name of names) this.nameIndex.push({ key: normalize(name), id: n.id })
    }
    // längere Namen zuerst, damit »Kritik der reinen Vernunft« vor »Vernunft« matcht
    this.nameIndex.sort((a, b) => b.key.length - a.key.length)
    for (const e of graph.edges) {
      this.adj.get(e.source)?.push({ edge: e, other: e.target, dir: 'out' })
      this.adj.get(e.target)?.push({ edge: e, other: e.source, dir: 'in' })
    }
  }

  node(id: string): GraphNode | undefined {
    return this.byId.get(id)
  }

  /** 1. Entity-Linking über Titel & Aliasse (längste Übereinstimmung zuerst). */
  linkEntities(question: string): GraphNode[] {
    let q = ' ' + normalize(question) + ' '
    const found: GraphNode[] = []
    for (const { key, id } of this.nameIndex) {
      const idx = q.indexOf(key)
      if (idx >= 0) {
        const before = q[idx - 1] ?? ' '
        const after = q[idx + key.length] ?? ' '
        if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) {
          if (!found.some((n) => n.id === id)) found.push(this.byId.get(id)!)
          q = q.replace(key, ' '.repeat(key.length))
        }
      }
    }
    return found
  }

  /** 2.+3. Subgraph-Extraktion um die Seeds herum. */
  extract(question: string, opts = { depth: 3, beam: 4, maxNodes: 14 }): SubgraphResult {
    const qTerms = new Set(terms(question))
    let seeds = this.linkEntities(question)

    // Fallback/Ergänzung: lexikalisch bester Knoten, falls kein Titel matcht
    if (seeds.length === 0) {
      const scored = this.graph.nodes
        .map((n) => {
          const nt = new Set(terms(n.title + ' ' + n.summary))
          let s = 0
          for (const t of qTerms) if (nt.has(t)) s++
          return { n, s }
        })
        .sort((a, b) => b.s - a.s)
      seeds = scored
        .slice(0, 2)
        .filter((x) => x.s > 0)
        .map((x) => x.n)
    }

    const inSub = new Set(seeds.map((s) => s.id))
    const subEdges: GraphEdge[] = []
    let frontier = seeds.map((s) => s.id)

    for (let d = 0; d < opts.depth && inSub.size < opts.maxNodes; d++) {
      const candidates: { adj: Adj; from: string; score: number }[] = []
      for (const id of frontier) {
        for (const a of this.adj.get(id) ?? []) {
          const target = this.byId.get(a.other)!
          // Score: lexikalische Relevanz von Relation + Zielknoten zur Frage,
          // plus Bonus, wenn die Kante zwei bereits verlinkte Entitäten verbindet
          const label = new Set(terms(a.edge.label + ' ' + a.edge.relation + ' ' + target.title))
          let score = 0
          for (const t of qTerms) if (label.has(t)) score += 1
          if (inSub.has(a.other)) score += 2
          if (d === 0) score += 0.5 // Nachbarn der Seeds leicht bevorzugen
          candidates.push({ adj: a, from: id, score })
        }
      }
      candidates.sort((a, b) => b.score - a.score)
      const next: string[] = []
      for (const c of candidates) {
        if (inSub.size >= opts.maxNodes) break
        const isNew = !inSub.has(c.adj.other)
        const already = subEdges.includes(c.adj.edge)
        if (already) continue
        // pro Ebene nur die besten `beam` NEUEN Knoten aufnehmen,
        // Kanten zwischen vorhandenen Knoten immer
        if (isNew && next.length >= opts.beam) continue
        subEdges.push(c.adj.edge)
        if (isNew) {
          inSub.add(c.adj.other)
          next.push(c.adj.other)
        }
      }
      frontier = next
      if (frontier.length === 0) break
    }

    const nodes = [...inSub].map((id) => this.byId.get(id)!)
    return { seeds, nodes, edges: subEdges, context: this.serialize(seeds, nodes, subEdges) }
  }

  /** 4. Linearisierung des Subgraphen als LLM-Kontext. */
  private serialize(seeds: GraphNode[], nodes: GraphNode[], edges: GraphEdge[]): string {
    const parts: string[] = []
    if (edges.length) {
      parts.push(
        'BEZIEHUNGEN (Wissensgraph):\n' +
          edges.map((e) => `• ${this.byId.get(e.source)?.title} — ${e.label} → ${this.byId.get(e.target)?.title}`).join('\n'),
      )
    }
    const ordered = [...seeds, ...nodes.filter((n) => !seeds.some((s) => s.id === n.id))]
    parts.push('ARTIKEL-AUSZÜGE:\n' + ordered.map((n) => `[${n.title}] ${n.summary}`).join('\n\n'))
    return parts.join('\n\n')
  }
}
