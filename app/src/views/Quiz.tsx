import { useMemo, useState } from 'react'
import type { AppCtx } from '../App'
import ForceGraph from '../components/ForceGraph'
import { confetti, vibrate } from '../components/effects'
import { generateQuiz, quizText, stepLabel, toCatalogEntry, type QuizQuestion } from '../engine/quiz'
import { BASE_GRAPH } from '../data/graph'

export default function Quiz({ ctx }: { ctx: AppCtx }) {
  const [hops, setHops] = useState<2 | 3>(2)
  const [q, setQ] = useState<QuizQuestion | null>(() => generateQuiz(BASE_GRAPH, 2))
  const [picked, setPicked] = useState<string | null>(null)
  const [score, setScore] = useState({ richtig: 0, gesamt: 0, streak: 0 })
  const [copied, setCopied] = useState(false)

  const revealed = picked !== null
  const correct = revealed && picked === q?.answer.id

  const pathGraph = useMemo(() => {
    if (!q) return null
    const ids = new Set([q.start.id, ...q.steps.map((s) => s.to.id)])
    return {
      nodes: ctx.graph.nodes.filter((n) => ids.has(n.id)),
      edges: q.steps.map((s) => s.edge),
    }
  }, [q, ctx.graph])

  function next(h: 2 | 3 = hops) {
    setQ(generateQuiz(BASE_GRAPH, h))
    setPicked(null)
    setCopied(false)
  }

  function choose(id: string) {
    if (revealed || !q) return
    setPicked(id)
    const ok = id === q.answer.id
    const streak = ok ? score.streak + 1 : 0
    setScore({ richtig: score.richtig + (ok ? 1 : 0), gesamt: score.gesamt + 1, streak })
    if (ok) {
      vibrate(60)
      if (streak > 0 && streak % 5 === 0) confetti()
    } else {
      vibrate([40, 60, 40])
    }
  }

  async function copyEntry() {
    if (!q) return
    await navigator.clipboard.writeText(toCatalogEntry(q))
    setCopied(true)
  }

  return (
    <div>
      <div className="eyebrow">Spielmodus · Fragen-Generator</div>
      <h1>Pfad-Quiz</h1>
      <p className="lead">
        Die App würfelt einen zufälligen Pfad durch den Wissensgraphen – findest du das Ziel der Beziehungskette?
        Nebenbei ist das ein unerschöpflicher Generator für Multi-Hop-Testfragen mit garantiertem Gold-Evidenzpfad:
        Jede Frage lässt sich als Katalog-Eintrag exportieren.
      </p>

      <div className="card" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="seg">
          {([2, 3] as const).map((h) => (
            <button
              key={h}
              className={hops === h ? 'on' : ''}
              onClick={() => {
                setHops(h)
                next(h)
              }}
            >
              {h} Hops
            </button>
          ))}
        </div>
        <span className="chip">
          {score.richtig}/{score.gesamt} richtig
        </span>
        <span className="chip">🔥 Serie: {score.streak}</span>
        <button className="btn sm" onClick={() => next()}>
          ↻ Neue Frage
        </button>
      </div>

      {q ? (
        <div className="card" style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            <span className="chip" style={{ fontSize: 13, background: 'var(--accent-soft)', color: 'var(--accent-deep)', borderColor: 'var(--accent)' }}>
              Start: {q.start.title}
            </span>
            {q.steps.map((s, i) => (
              <span key={i} className="chip" style={{ fontSize: 12.5 }}>
                {stepLabel(s)}
              </span>
            ))}
            <span className="chip" style={{ fontSize: 13 }}>Ziel: ❓</span>
          </div>

          <div className="grid cols-2">
            {q.options.map((o) => {
              const isAnswer = o.id === q.answer.id
              const isPicked = o.id === picked
              let border = 'var(--line)'
              let bg = 'var(--surface)'
              if (revealed && isAnswer) {
                border = 'var(--good)'
                bg = 'color-mix(in srgb, var(--good) 10%, var(--surface))'
              } else if (revealed && isPicked && !isAnswer) {
                border = 'var(--bad)'
                bg = 'color-mix(in srgb, var(--bad) 8%, var(--surface))'
              }
              return (
                <button
                  key={o.id}
                  className="btn"
                  onClick={() => choose(o.id)}
                  style={{ justifyContent: 'flex-start', borderColor: border, background: bg, padding: '12px 16px' }}
                >
                  {revealed && isAnswer ? '✓ ' : revealed && isPicked ? '✗ ' : ''}
                  {o.title}
                </button>
              )
            })}
          </div>

          {revealed && (
            <>
              <div className="answer-block" style={{ marginTop: 14 }}>
                {correct ? '🎉 Richtig! ' : `Leider nein – gesucht war »${q.answer.title}«. `}
                {q.answer.summary.split('. ').slice(0, 2).join('. ')}.
              </div>
              {pathGraph && (
                <>
                  <h3 style={{ marginTop: 14 }}>Der Gold-Pfad</h3>
                  <div style={{ border: '1px solid var(--line)', borderRadius: 10 }}>
                    <ForceGraph graph={pathGraph} height={220} pulse />
                  </div>
                </>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <button className="btn primary" onClick={() => next()}>
                  Nächste Frage →
                </button>
                <button className="btn sm" onClick={copyEntry}>
                  {copied ? '✓ Kopiert' : '⎘ Als Testfrage exportieren (JSON)'}
                </button>
              </div>
              <p className="hint" style={{ marginTop: 10, fontSize: 12 }}>
                Generierter Fragetext: {quizText(q)}
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="callout" style={{ marginTop: 14 }}>Kein Pfad gefunden – bitte neue Frage würfeln.</div>
      )}
    </div>
  )
}
