import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppCtx } from '../App'
import type { Score, TrialResult } from '../data/types'
import { confetti } from '../components/effects'
import { QUESTIONS } from '../data/questions'
import { blindOrder, cohensKappa } from '../engine/experiment'

/**
 * Verblindete Doppelbewertung (Ausarbeitung § 4.4):
 * Antworten werden in deterministisch gemischter Reihenfolge präsentiert –
 * OHNE Bedingung, Engine, Kontext oder Auto-Score. Zwei Bewertende (A/B)
 * urteilen unabhängig; Cohens κ misst die Übereinstimmung. Bei Konsens wird
 * die Bewertung als maßgeblicher manueller Score übernommen, Konflikte
 * werden explizit aufgelöst.
 */

const SCORES: { value: Score; label: string; key: string }[] = [
  { value: 'korrekt', label: 'Korrekt', key: '1' },
  { value: 'teilweise', label: 'Teilweise', key: '2' },
  { value: 'falsch', label: 'Falsch', key: '3' },
  { value: 'enthaltung', label: 'Enthaltung', key: '4' },
]

type Rater = 'A' | 'B'

export default function Rate({ ctx }: { ctx: AppCtx }) {
  const [rater, setRater] = useState<Rater>('A')
  const [cursor, setCursor] = useState(0)

  const questionById = useMemo(() => new Map(QUESTIONS.map((q) => [q.id, q])), [])

  // feste, gemischte Reihenfolge über alle vorhandenen Trials
  const ordered = useMemo(() => blindOrder(ctx.results), [ctx.results])
  const unrated = ordered.filter((r) => !r.blind?.[rater])
  const current = unrated[Math.min(cursor, Math.max(0, unrated.length - 1))]
  const kappa = useMemo(() => cohensKappa(ctx.results), [ctx.results])

  const conflicts = ctx.results.filter((r) => r.blind?.A && r.blind?.B && r.blind.A !== r.blind.B)
  const agreed = ctx.results.filter((r) => r.blind?.A && r.blind?.B && r.blind.A === r.blind.B)

  // 🎉 einmal pro Sitzung: starke Übereinstimmung feiern
  const celebrated = useRef(false)
  useEffect(() => {
    if (!celebrated.current && kappa.kappa !== null && kappa.kappa >= 0.8 && kappa.n >= 10) {
      celebrated.current = true
      confetti()
    }
  }, [kappa])

  function setBlind(id: string, r: Rater, s: Score) {
    ctx.setResults((current) => current.map((t) => (t.id === id ? { ...t, blind: { ...t.blind, [r]: s } } : t)))
  }

  function applyConsensus() {
    ctx.setResults((current) =>
      current.map((t) =>
        t.blind?.A && t.blind?.B && t.blind.A === t.blind.B ? { ...t, manualScore: t.blind.A } : t,
      ),
    )
  }

  function resolveConflict(t: TrialResult, s: Score) {
    ctx.setResults((current) => current.map((x) => (x.id === t.id ? { ...x, manualScore: s } : x)))
  }

  if (ctx.results.length === 0) {
    return (
      <div>
        <div className="eyebrow">Verblindete Doppelbewertung</div>
        <h1>Bewerten</h1>
        <div className="card">
          <p style={{ margin: 0 }}>
            Noch keine Antworten vorhanden. Starte zuerst einen Durchlauf im{' '}
            <a style={{ color: 'var(--accent-deep)', cursor: 'pointer', fontWeight: 600 }} onClick={() => ctx.go('experiment')}>
              Experiment
            </a>
            .
          </p>
        </div>
      </div>
    )
  }

  const q = current ? questionById.get(current.questionId) : undefined
  const done = ordered.length - unrated.length

  return (
    <div>
      <div className="eyebrow">Verblindete Doppelbewertung</div>
      <h1>Bewerten</h1>
      <p className="lead">
        Antworten erscheinen gemischt und ohne Bedingung, Engine oder Auto-Score – bewertet wird allein Frage, Gold-Antwort
        und Modellantwort. Zwei Bewertende urteilen unabhängig; Cohens&nbsp;κ misst eure Übereinstimmung.
      </p>

      <div className="card" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="seg">
          {(['A', 'B'] as Rater[]).map((r) => (
            <button key={r} className={rater === r ? 'on' : ''} onClick={() => { setRater(r); setCursor(0) }}>
              Bewerter:in {r}
            </button>
          ))}
        </div>
        <span className="chip">
          {rater}: {done}/{ordered.length} bewertet
        </span>
        <span className="chip">
          κ = {kappa.kappa === null ? '–' : kappa.kappa.toFixed(2)}
          {kappa.n > 0 && ` (${kappa.agree}/${kappa.n} übereinstimmend)`}
        </span>
        {agreed.length > 0 && (
          <button className="btn sm primary" onClick={applyConsensus}>
            Konsens als manuelle Bewertung übernehmen ({agreed.length})
          </button>
        )}
        <div style={{ flex: 1, minWidth: 180 }}>
          <div className="progress">
            <div style={{ width: `${(done / Math.max(1, ordered.length)) * 100}%` }} />
          </div>
        </div>
      </div>

      {current && q ? (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="hint" style={{ marginBottom: 6 }}>
            Trial {done + 1} von {ordered.length} · verblindet
          </div>
          <h3 style={{ fontFamily: 'var(--serif)', fontSize: 17 }}>{q.text}</h3>
          <p className="hint" style={{ marginTop: 2 }}>
            <strong>Gold:</strong> {q.goldAnswer}
          </p>
          <div className="answer-block" style={{ margin: '12px 0' }}>
            {current.answer}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {SCORES.map((s) => (
              <button key={s.value} className="btn" onClick={() => setBlind(current.id, rater, s.value)}>
                {s.label}
              </button>
            ))}
            <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setCursor((c) => c + 1)}>
              Überspringen →
            </button>
          </div>
        </div>
      ) : (
        <div className="callout" style={{ marginTop: 14 }}>
          ✓ Bewerter:in {rater} hat alle {ordered.length} Antworten bewertet.
          {rater === 'A' && ' Jetzt Bewerter:in B übernehmen lassen – am besten eine zweite Person, unabhängig.'}
        </div>
      )}

      {conflicts.length > 0 && (
        <>
          <h2>Konflikte auflösen ({conflicts.length})</h2>
          <p className="hint">A und B haben unterschiedlich geurteilt – gemeinsam diskutieren und final entscheiden:</p>
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Frage</th>
                  <th>Antwort</th>
                  <th>A</th>
                  <th>B</th>
                  <th>Finale Bewertung</th>
                </tr>
              </thead>
              <tbody>
                {conflicts.map((t) => (
                  <tr key={t.id}>
                    <td style={{ maxWidth: 260 }}>{questionById.get(t.questionId)?.text}</td>
                    <td style={{ maxWidth: 320, fontSize: 12.5 }}>{t.answer.slice(0, 180)}</td>
                    <td>
                      <span className={`chip score-${t.blind!.A}`}>{t.blind!.A}</span>
                    </td>
                    <td>
                      <span className={`chip score-${t.blind!.B}`}>{t.blind!.B}</span>
                    </td>
                    <td>
                      <select
                        value={t.manualScore ?? ''}
                        onChange={(e) => resolveConflict(t, e.target.value as Score)}
                        style={{ width: 'auto', padding: '3px 8px', fontSize: 12.5 }}
                      >
                        <option value="">– wählen –</option>
                        {SCORES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2>Warum verblindet?</h2>
      <p className="hint" style={{ maxWidth: '72ch' }}>
        Wer das System gebaut hat und die Hypothese kennt, bewertet Grenzfälle unbewusst zugunsten der erwarteten
        Bedingung – nicht aus Unehrlichkeit, sondern weil Erwartung das Urteil färbt. Die Verblindung entkoppelt das
        Urteil von der Hypothese; κ macht die verbleibende Subjektivität messbar. Erst damit ist »Korrektheit« ein
        Messinstrument statt einer Meinung.
      </p>
    </div>
  )
}
