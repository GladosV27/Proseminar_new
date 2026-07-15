import type { GraphEdge, GraphNode, KnowledgeGraph } from '../data/types'

/**
 * Pfad-Quiz & automatischer Fragen-Generator.
 *
 * Die App würfelt einen zufälligen 2–3-Hop-Pfad aus dem Wissensgraphen und
 * macht daraus eine Multiple-Choice-Frage: Startknoten + Beziehungskette →
 * gesuchter Zielknoten. Distraktoren stammen aus derselben Typklasse.
 *
 * Wissenschaftlicher Doppelnutzen (Ausarbeitung § 8): Das Verfahren ist ein
 * unerschöpflicher Generator für Multi-Hop-Testfragen mit garantiertem
 * Gold-Evidenzpfad – es entschärft den Einwand »nur 40 handgebaute Fragen«.
 * Jede Quizfrage lässt sich als Katalog-Eintrag (JSON) exportieren.
 */

export interface QuizStep {
  edge: GraphEdge
  /** true = Kante in Pfeilrichtung durchlaufen */
  forward: boolean
  from: GraphNode
  to: GraphNode
}

export interface QuizQuestion {
  start: GraphNode
  steps: QuizStep[]
  answer: GraphNode
  options: GraphNode[]
  hops: number
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function generateQuiz(graph: KnowledgeGraph, hops: 2 | 3): QuizQuestion | null {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const adj = new Map<string, { edge: GraphEdge; other: string; forward: boolean }[]>()
  for (const n of graph.nodes) adj.set(n.id, [])
  for (const e of graph.edges) {
    adj.get(e.source)?.push({ edge: e, other: e.target, forward: true })
    adj.get(e.target)?.push({ edge: e, other: e.source, forward: false })
  }

  // bis zu 60 Versuche, einen Pfad ohne Knotenwiederholung zu würfeln
  for (let attempt = 0; attempt < 60; attempt++) {
    const start = pick(graph.nodes.filter((n) => (adj.get(n.id)?.length ?? 0) >= 2))
    const visited = new Set<string>([start.id])
    const steps: QuizStep[] = []
    let current = start

    let ok = true
    for (let h = 0; h < hops; h++) {
      const candidates = (adj.get(current.id) ?? []).filter((a) => !visited.has(a.other))
      if (candidates.length === 0) {
        ok = false
        break
      }
      const step = pick(candidates)
      const to = byId.get(step.other)!
      steps.push({ edge: step.edge, forward: step.forward, from: current, to })
      visited.add(to.id)
      current = to
    }
    if (!ok) continue

    const answer = current
    // Distraktoren: gleicher Typ, nicht auf dem Pfad
    const distractorPool = graph.nodes.filter((n) => n.type === answer.type && !visited.has(n.id))
    if (distractorPool.length < 3) continue
    const options = shuffle([answer, ...shuffle(distractorPool).slice(0, 3)])
    return { start, steps, answer, options, hops }
  }
  return null
}

/** Menschlich lesbare Beschreibung eines Schritts (berücksichtigt die Richtung). */
export function stepLabel(s: QuizStep): string {
  return s.forward ? `${s.edge.label} →` : `← ${s.edge.label} (eingehend)`
}

export function quizText(q: QuizQuestion): string {
  const chain = q.steps.map((s) => `»${s.edge.label}«${s.forward ? '' : ' (eingehend)'}`).join(', dann ')
  return `Starte bei »${q.start.title}«. Zu welcher Entität gelangst du über die Beziehungskette ${chain}?`
}

/** Exportiert die Quizfrage als Katalog-Eintrag (Format von questions.ts). */
export function toCatalogEntry(q: QuizQuestion): string {
  const entry = {
    id: `gen_${Date.now().toString(36)}`,
    text: quizText(q),
    category: q.hops === 2 ? 'multi-hop-2' : 'multi-hop-3',
    hops: q.hops,
    goldAnswer: q.answer.title,
    mustContain: [q.answer.title.toLowerCase()],
    goldPath: [q.start.id, ...q.steps.map((s) => s.to.id)],
  }
  return JSON.stringify(entry, null, 2)
}
