import { useState } from 'react'
import type { AppCtx } from '../App'
import type { Condition, Score, TrialResult } from '../data/types'
import { vibrate } from '../components/effects'
import { CATEGORY_LABELS, QUESTIONS } from '../data/questions'
import {
  ALL_CONDITIONS,
  buildTrialSchedule,
  CONDITION_INFO,
  CORE_CONDITIONS,
  normalizeExperimentSeed,
  ORDER_STRATEGY,
} from '../engine/experiment'

const SCORES: Score[] = ['korrekt', 'teilweise', 'falsch', 'enthaltung']

export default function Experiment({ ctx }: { ctx: AppCtx }) {
  const running = ctx.experimentStatus.state === 'running'
  const progress = ctx.experimentStatus
  const [conditions, setConditions] = useState<Condition[]>([...CORE_CONDITIONS])
  const [repetitions, setRepetitions] = useState(3)
  const [seed, setSeed] = useState(20260616)
  const [lastRunId, setLastRunId] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('alle')

  const resultFor = (qid: string, c: Condition) =>
    [...ctx.results].reverse().find((r) => r.questionId === qid && r.condition === c && r.engine === ctx.engine.id && r.retrieval === ctx.retrieval)

  async function runAll() {
    if (running) return
    const normalizedSeed = normalizeExperimentSeed(seed)
    const schedule = buildTrialSchedule(QUESTIONS, conditions, repetitions, normalizedSeed)
    const runId = `run_${Date.now().toString(36)}_s${normalizedSeed}_${Math.random().toString(36).slice(2, 6)}`
    const total = schedule.length
    let done = 0
    // Jeder Messlauf wird angehängt. runId + repetitionId halten Wiederholungen auseinander.
    const next: TrialResult[] = [...ctx.results]
    setLastRunId(runId)
    ctx.beginExperiment(runId, total)
    for (const trial of schedule) {
      if (ctx.experimentCancelled()) break
      const label = `W${trial.repetition} · ${trial.question.id} · ${CONDITION_INFO[trial.condition].short}`
      ctx.updateExperiment(done, label)
      try {
        // baseRunner: Messungen ausschließlich auf dem eingefrorenen Korpus
        const { result } = await ctx.baseRunner.run(trial.question, trial.condition, ctx.engine, {
          retrieval: ctx.retrieval,
          metadata: {
            runId,
            repetitionId: `${runId}_r${trial.repetition}`,
            repetition: trial.repetition,
            order: trial.order,
            seed: normalizedSeed,
            questionOrder: trial.questionOrder,
            conditionOrder: trial.conditionOrder,
            orderStrategy: ORDER_STRATEGY,
          },
        })
        next.push(result)
        ctx.setResults([...next])
      } catch (err) {
        console.error(err)
      }
      done++
      ctx.updateExperiment(done, label)
    }
    const cancelled = ctx.experimentCancelled()
    ctx.finishExperiment(cancelled ? 'cancelled' : 'completed')
    // haptisches Feedback auf Mobilgeräten: Messlauf fertig
    if (!cancelled) vibrate([120, 60, 120])
  }

  function setManual(id: string, s: Score | '') {
    ctx.setResults(ctx.results.map((r) => (r.id === id ? { ...r, manualScore: s === '' ? undefined : s } : r)))
  }

  const shown = QUESTIONS.filter((q) => filter === 'alle' || q.category === filter)

  return (
    <div>
      <div className="eyebrow">Messung</div>
      <h1>Experiment</h1>
      <p className="lead">
        {QUESTIONS.length} Fragen × gewählte Bedingungen × {repetitions} Wiederholungen mit der aktuellen Engine (<strong>{ctx.engine.label}</strong>,
        Retrieval: <strong>{ctx.retrieval === 'dense' ? 'Dichte Embeddings' : 'TF-IDF'}</strong>). Das Auto-Scoring
        prüft Gold-Schlüsselbegriffe; maßgeblich ist die verblindete Bewertung (Ansicht »Bewerten«). Messläufe verwenden{' '}
        <strong>ausschließlich den eingefrorenen Experiment-Korpus</strong>; eigenes und recherchiertes Wissen bleibt
        außen vor.
      </p>

      <div className="card" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {ALL_CONDITIONS.map((c) => (
            <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }} title={CONDITION_INFO[c].label}>
              <input
                type="checkbox"
                checked={conditions.includes(c)}
                disabled={running}
                onChange={(e) =>
                  setConditions(ALL_CONDITIONS.filter((x) => (x === c ? e.target.checked : conditions.includes(x))))
                }
              />
              {CONDITION_INFO[c].short}
            </label>
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          Wiederholungen
          <input
            type="number"
            min={1}
            max={10}
            step={1}
            value={repetitions}
            disabled={running}
            onChange={(e) => setRepetitions(Math.max(1, Math.min(10, Math.trunc(e.target.valueAsNumber || 1))))}
            style={{ width: 66 }}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          Reihenfolge-Seed
          <input
            type="number"
            min={0}
            max={4294967295}
            step={1}
            value={seed}
            disabled={running}
            onChange={(e) =>
              setSeed(Number.isFinite(e.target.valueAsNumber) ? Math.max(0, Math.min(4294967295, e.target.valueAsNumber)) : 0)
            }
            style={{ width: 130 }}
          />
        </label>
        {!running ? (
          <button className="btn primary" onClick={runAll} disabled={conditions.length === 0 || !Number.isFinite(seed)}>
            ▶ Durchlauf starten
          </button>
        ) : (
          <button className="btn" onClick={ctx.cancelExperiment}>
            ◼ Abbrechen
          </button>
        )}
        {(running || progress.done > 0) && (
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="progress">
              <div style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
            </div>
            <div className="hint" style={{ marginTop: 4 }}>
              {progress.done}/{progress.total} · {progress.label}
            </div>
          </div>
        )}
      </div>

      <p className="hint" style={{ margin: '10px 2px 0' }}>
        Die Fragenreihenfolge wird pro Wiederholung deterministisch mit Seed{' '}
        <strong>{Number.isFinite(seed) ? normalizeExperimentSeed(seed) : '—'}</strong> gemischt; die Bedingungen rotieren
        zyklisch über Positionen und Wiederholungen. Dadurch werden Reihenfolge- und Erwärmungseffekte reduziert. Neue
        Läufe bleiben erhalten
        {lastRunId ? (
          <>
            {' '}
            (zuletzt: <span className="mono">{lastRunId}</span>)
          </>
        ) : null}
        .
      </p>

      <p className="hint" style={{ margin: '6px 2px 0' }}>
        <strong>Vektor+Budget</strong> gleicht das Zeichenbudget an Graph-RAG an. Das reduziert die Konfundierung durch
        unterschiedliche Kontextmengen; die Repräsentation als Chunks beziehungsweise Graph-Tripel unterscheidet sich
        aber weiterhin. <strong>Hybrid</strong> exploriert, ob sich die Fehler von Vektor- und Graph-Retrieval
        komplementär verhalten.
      </p>

      <div style={{ margin: '16px 0 10px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 240 }}>
          <option value="alle">Alle Kategorien</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <div className="card table-wrap" style={{ padding: 10 }}>
        <table>
          <thead>
            <tr>
              <th style={{ minWidth: 260 }}>Frage</th>
              <th>Hops</th>
              {conditions.map((c) => (
                <th key={c} style={{ minWidth: 200 }}>
                  {CONDITION_INFO[c].short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((q) => (
              <tr key={q.id}>
                <td>
                  <strong style={{ fontSize: 12, color: 'var(--muted)' }}>{q.id.toUpperCase()}</strong> {q.text}
                  <div className="hint" style={{ marginTop: 3 }}>
                    Gold: {q.goldAnswer}
                  </div>
                </td>
                <td className="num">
                  <span className="chip">{q.expectAbstain ? '⌀' : q.hops}</span>
                </td>
                {conditions.map((c) => {
                  const r = resultFor(q.id, c)
                  if (!r)
                    return (
                      <td key={c}>
                        <span className="hint">—</span>
                      </td>
                    )
                  const eff = r.manualScore ?? r.autoScore
                  return (
                    <td key={c}>
                      <div style={{ fontSize: 12.5, marginBottom: 5 }}>
                        {r.answer.length > 160 ? r.answer.slice(0, 157) + '…' : r.answer}
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span className={`chip score-${eff}`}>
                          {eff}
                          {r.manualScore ? ' ✎' : ''}
                        </span>
                        <span className="chip" title={`End-to-End; davon Generierung ${r.generationMs} ms`}>
                          E2E {r.latencyMs} ms
                        </span>
                        <span className="chip" title={`Messlauf ${r.runId}, Wiederholung ${r.repetition}`}>
                          W{r.repetition}
                        </span>
                        {r.evidenceRecall !== null && (
                          <span className="chip" title="Evidenz-Recall: Anteil der Gold-Pfad-Knoten im Kontext">
                            Ev {Math.round((r.evidenceRecall ?? 0) * 100)}%
                          </span>
                        )}
                        <select
                          value={r.manualScore ?? ''}
                          onChange={(e) => setManual(r.id, e.target.value as Score | '')}
                          style={{ width: 'auto', padding: '2px 6px', fontSize: 11.5, borderRadius: 7 }}
                        >
                          <option value="">auto</option>
                          {SCORES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
