import { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { confetti, vibrate } from '../components/effects'
import ForceGraph from '../components/ForceGraph'
import { BASE_GRAPH } from '../data/graph'
import { makeLiveQuestionDeck } from '../engine/liveQuestions'
import {
  LiveTransport,
  type LivePlayer,
  type LiveQuizState,
  liveQuizConfigured,
  liveRoomUrl,
  makeId,
  makeRoomCode,
} from '../engine/liveQuiz'

type Role = 'landing' | 'host' | 'player'

const COLORS = ['#d45d43', '#2d7d7a', '#7168b7', '#b27625', '#b04c75', '#4c7c43', '#2c6ea6', '#8a5b34']

function cleanName(value: string, fallback: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 20) || fallback
}

function sortedPlayers(players: LivePlayer[]): LivePlayer[] {
  return [...players].sort((a, b) => b.score - a.score || b.streak - a.streak || a.name.localeCompare(b.name, 'de'))
}

function RoomQr({ url }: { url: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  useEffect(() => {
    void QRCode.toDataURL(url, { width: 440, margin: 1, color: { dark: '#141413', light: '#faf9f5' } }).then(setDataUrl)
  }, [url])
  return dataUrl ? <img src={dataUrl} alt="QR-Code zum Beitreten" style={{ width: '100%', maxWidth: 240, borderRadius: 12 }} /> : <p className="hint">QR-Code wird erzeugt …</p>
}

function Countdown({ deadlineMs }: { deadlineMs: number | null }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!deadlineMs) return
    const timer = window.setInterval(() => setNow(Date.now()), 150)
    return () => window.clearInterval(timer)
  }, [deadlineMs])
  if (!deadlineMs) return null
  const seconds = Math.max(0, (deadlineMs - now) / 1000)
  const pct = Math.min(100, (seconds / 18) * 100)
  return <div style={{ minWidth: 190 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}><span>Antwortzeit</span><span>{seconds.toFixed(1)} s</span></div><div className="progress" style={{ marginTop: 5 }}><span style={{ width: `${pct}%`, background: seconds < 5 ? 'var(--bad)' : undefined }} /></div></div>
}

export default function LiveQuiz() {
  const queryRoom = useMemo(() => new URLSearchParams(window.location.search).get('live')?.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) ?? '', [])
  const [role, setRole] = useState<Role>(queryRoom ? 'player' : 'landing')
  const [roomCode, setRoomCode] = useState(queryRoom)
  const [name, setName] = useState('')
  const [total, setTotal] = useState<5 | 8>(5)
  const [state, setState] = useState<LiveQuizState | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const clientId = useRef(makeId()).current
  const playerRef = useRef<Pick<LivePlayer, 'id' | 'name' | 'color'> | null>(null)
  const transportRef = useRef<LiveTransport | null>(null)
  const stateRef = useRef<LiveQuizState | null>(null)
  const deckRef = useRef<ReturnType<typeof makeLiveQuestionDeck>>([])

  useEffect(() => () => transportRef.current?.close(), [])
  useEffect(() => { setSelectedAnswer(null) }, [state?.question?.id])

  function acceptState(next: LiveQuizState) { stateRef.current = next; setState(next) }
  function publish(next: LiveQuizState) {
    acceptState(next)
    void transportRef.current?.send('state', next).catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }
  function addPlayer(player: Pick<LivePlayer, 'id' | 'name' | 'color'>) {
    const current = stateRef.current
    if (!current || current.players.some((existing) => existing.id === player.id)) return
    publish({ ...current, players: [...current.players, { ...player, score: 0, streak: 0, answered: false }], updatedAt: Date.now() })
  }
  function recordAnswer(payload: { playerId: string; questionId: string; optionId: string; at: number }) {
    const current = stateRef.current
    const card = deckRef.current[current?.questionIndex ?? -1]
    if (!current || !card || current.phase !== 'question' || !current.question || current.question.id !== payload.questionId) return
    if ((current.deadlineMs ?? 0) < Date.now() || !current.question.options.some((option) => option.id === payload.optionId)) return
    const old = current.players.find((player) => player.id === payload.playerId)
    if (!old || old.answered) return
    const correct = payload.optionId === card.correctId
    const remainingRatio = Math.max(0, Math.min(1, ((current.deadlineMs ?? payload.at) - payload.at) / 18_000))
    const gained = correct ? 1_000 + Math.round(1_000 * remainingRatio) + old.streak * 100 : 0
    const players = current.players.map((player) => player.id === payload.playerId ? { ...player, answered: true, score: player.score + gained, streak: correct ? player.streak + 1 : 0 } : player)
    publish({ ...current, players, answerCount: current.answerCount + 1, updatedAt: Date.now() })
  }

  async function hostRoom() {
    if (!liveQuizConfigured()) return
    setConnecting(true); setError(null)
    try {
      const cards = makeLiveQuestionDeck(total)
      const code = makeRoomCode()
      deckRef.current = cards
      const transport = await LiveTransport.connect(code, {
        onState: () => { /* Nur der Host veröffentlicht den kanonischen Spielstand. */ },
        onJoin: ({ player }) => addPlayer(player),
        onAnswer: recordAnswer,
        onSyncRequest: () => { const current = stateRef.current; if (current) void transportRef.current?.send('state', current) },
      })
      transportRef.current = transport
      const initial: LiveQuizState = { version: 1, roomCode: code, hostId: clientId, phase: 'lobby', questionIndex: 0, totalQuestions: cards.length, question: null, deadlineMs: null, answerCount: 0, players: [], reveal: null, updatedAt: Date.now() }
      setRoomCode(code); setRole('host'); publish(initial)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err)); transportRef.current?.close(); transportRef.current = null
    } finally { setConnecting(false) }
  }

  async function joinRoom() {
    const code = roomCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    if (code.length !== 6) { setError('Bitte einen sechsstelligen Raumcode eingeben.'); return }
    if (!liveQuizConfigured()) return
    setConnecting(true); setError(null)
    try {
      const player = { id: clientId, name: cleanName(name, 'Quiz-Gast'), color: COLORS[Math.floor(Math.random() * COLORS.length)] }
      playerRef.current = player
      const transport = await LiveTransport.connect(code, { onState: acceptState })
      transportRef.current = transport
      setRoomCode(code); setRole('player')
      await transport.send('join', { player }); await transport.send('sync-request')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err)); transportRef.current?.close(); transportRef.current = null
    } finally { setConnecting(false) }
  }

  function askQuestion(index = stateRef.current?.questionIndex ?? 0) {
    const current = stateRef.current; const card = deckRef.current[index]
    if (!current || !card) return
    publish({ ...current, phase: 'question', questionIndex: index, question: card.question, deadlineMs: Date.now() + 18_000, answerCount: 0, players: current.players.map((player) => ({ ...player, answered: false })), reveal: null, updatedAt: Date.now() })
  }
  function revealQuestion() {
    const current = stateRef.current; const card = deckRef.current[current?.questionIndex ?? -1]
    if (!current || !card || current.phase !== 'question') return
    publish({ ...current, phase: 'reveal', deadlineMs: null, reveal: { correctId: card.correctId, explanation: card.explanation, classification: card.classification, graphNodeIds: card.graphNodeIds }, updatedAt: Date.now() })
    if (current.players.some((player) => player.streak >= 4)) confetti()
  }
  function nextQuestion() {
    const current = stateRef.current
    if (!current) return
    const next = current.questionIndex + 1
    if (next >= deckRef.current.length) { publish({ ...current, phase: 'finished', deadlineMs: null, updatedAt: Date.now() }); return }
    askQuestion(next)
  }
  useEffect(() => {
    if (role !== 'host' || state?.phase !== 'question' || !state.deadlineMs) return
    const timer = window.setTimeout(revealQuestion, Math.max(0, state.deadlineMs - Date.now()) + 40)
    return () => window.clearTimeout(timer)
  }, [role, state?.phase, state?.deadlineMs])

  async function answer(optionId: string) {
    if (role !== 'player' || !state?.question || state.phase !== 'question' || selectedAnswer || (state.deadlineMs ?? 0) < Date.now()) return
    setSelectedAnswer(optionId); vibrate(35)
    try { await transportRef.current?.send('answer', { playerId: clientId, questionId: state.question.id, optionId, at: Date.now() }) }
    catch (err) { setSelectedAnswer(null); setError(err instanceof Error ? err.message : String(err)) }
  }
  async function copyRoomLink() { await navigator.clipboard.writeText(liveRoomUrl(roomCode)); setCopied(true) }
  function leave() {
    transportRef.current?.close(); transportRef.current = null; stateRef.current = null
    setState(null); setSelectedAnswer(null); setRole('landing'); setRoomCode('')
    const url = new URL(window.location.href); url.searchParams.delete('live'); window.history.replaceState({}, '', url)
  }

  const link = roomCode ? liveRoomUrl(roomCode) : ''
  const players = state ? sortedPlayers(state.players) : []
  const me = players.find((player) => player.id === clientId)
  const isReveal = state?.phase === 'reveal' || state?.phase === 'finished'
  const answerGraph = useMemo(() => {
    const ids = new Set(state?.reveal?.graphNodeIds ?? [])
    if (ids.size === 0) return null
    return {
      nodes: BASE_GRAPH.nodes.filter((node) => ids.has(node.id)),
      edges: BASE_GRAPH.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
    }
  }, [state?.reveal])

  if (!liveQuizConfigured()) return <div><div className="eyebrow">Echtzeit-Spielmodus</div><h1>Live-Quiz</h1><div className="card" style={{ maxWidth: '72ch' }}><h3 style={{ marginTop: 0 }}>Noch nicht verbunden</h3><p className="lead">Der lokale Pfad-Quizmodus bleibt verfügbar. Für Räume mit QR-Code, Punkten und bis zu 20 Handys benötigt die App einmalig eine kostenlose Supabase-Verbindung.</p><p className="hint">Lege die Datei <code>.env</code> aus <code>.env.example</code> an und folge <code>docs/LIVE_QUIZ.md</code>. Niemals einen Secret- oder service_role-Schlüssel eintragen.</p></div></div>

  if (role === 'landing') return (
    <div>
      <div className="eyebrow">Echtzeit-Spielmodus</div>
      <h1>Live-Quiz</h1>
      <p className="lead">Eine schnelle Quizshow statt einer schweren Denkaufgabe: Direktes Wissen, bekannte Werke, Orte, Drama und Ideen-Remixe. Alle Fragen sind in wenigen Sekunden ohne Vorwissen über Graph-Pfade lösbar.</p>
      {error && <div className="callout" style={{ borderColor: 'var(--bad)', marginBottom: 14 }}>{error}</div>}
      <div className="grid cols-2" style={{ maxWidth: 820 }}>
        <div className="card">
          <div className="eyebrow">Präsentationslaptop</div>
          <h2 style={{ marginTop: 4 }}>Quizshow eröffnen</h2>
          <p className="hint">Du steuerst Timer und Auflösung. Die Fragen mischen Blitzwissen, Werke, Orte, Zeitreise und philosophisches Drama.</p>
          <div className="callout" style={{ margin: '12px 0' }}>⚡ Keine Multi-Hop-Pfade · vier klare Antwortkarten · maximal 18 Sekunden pro Runde</div>
          <div className="seg" style={{ marginBottom: 14 }}>{([5, 8] as const).map((value) => <button key={value} className={total === value ? 'on' : ''} onClick={() => setTotal(value)}>{value} Fragen</button>)}</div>
          <button className="btn primary" disabled={connecting} onClick={() => void hostRoom()}>{connecting ? 'Verbinde …' : 'Live-Raum eröffnen'}</button>
        </div>
        <div className="card">
          <div className="eyebrow">Smartphone</div>
          <h2 style={{ marginTop: 4 }}>Raum beitreten</h2>
          <p className="hint">Falls der QR-Code nicht funktioniert, Raumcode eingeben und mitspielen.</p>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Dein Spitzname" maxLength={20} />
          <input value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} placeholder="RAUMCODE" maxLength={6} className="mono" style={{ marginTop: 8, letterSpacing: 2 }} />
          <button className="btn primary" disabled={connecting} onClick={() => void joinRoom()} style={{ marginTop: 12 }}>{connecting ? 'Verbinde …' : 'Beitreten'}</button>
        </div>
      </div>
    </div>
  )

  if (!state) return <div><div className="eyebrow">Live-Quiz</div><h1>Verbinde mit Raum {roomCode}</h1><div className="card"><p>Warte auf den Host …</p>{error && <p className="hint">{error}</p>}<button className="btn sm" onClick={leave}>Zurück</button></div></div>

  return <div><div className="eyebrow">Live-Quiz · Raum {state.roomCode}</div><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}><h1 style={{ marginBottom: 8 }}>{state.phase === 'lobby' ? 'Wartebereich' : state.phase === 'finished' ? 'Endergebnis' : `Frage ${state.questionIndex + 1}/${state.totalQuestions}`}</h1><button className="btn sm" onClick={leave}>Raum verlassen</button></div>{error && <div className="callout" style={{ borderColor: 'var(--bad)', marginBottom: 12 }}>{error}</div>}
    {state.phase === 'lobby' && <div className="grid cols-2">{role === 'host' ? <div className="card" style={{ textAlign: 'center' }}><RoomQr url={link} /><h2 className="mono" style={{ letterSpacing: 4, margin: '8px 0' }}>{state.roomCode}</h2><p className="hint">QR-Code scannen oder Raumcode eingeben</p><button className="btn sm" onClick={() => void copyRoomLink()}>{copied ? '✓ Link kopiert' : 'Link kopieren'}</button></div> : <div className="card"><h2>Du bist dabei</h2><p className="lead">Hallo {me?.name ?? playerRef.current?.name ?? 'Quiz-Gast'}! Warte, bis der Host die erste Frage startet.</p><p className="hint">Raum: <strong className="mono">{state.roomCode}</strong></p></div>}<div className="card"><h2 style={{ marginTop: 0 }}>Lobby · {players.length} dabei</h2>{players.length ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{players.map((player) => <span className="chip" key={player.id} style={{ borderColor: player.color }}><span style={{ color: player.color }}>●</span> {player.name}</span>)}</div> : <p className="hint">Noch niemand beigetreten.</p>}{role === 'host' && <button className="btn primary" disabled={players.length === 0} onClick={() => askQuestion(0)} style={{ marginTop: 16 }}>Erste Frage starten →</button>}</div></div>}
    {(state.phase === 'question' || state.phase === 'reveal') && state.question && <><div className="card" style={{ marginBottom: 12 }}><div style={{ display: 'flex', gap: 14, justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center' }}><div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><span className="chip" style={{ background: 'var(--accent-soft)', color: 'var(--accent-deep)', borderColor: 'var(--accent)' }}>{state.question.category}</span><span className="chip">{state.answerCount}/{players.length} Antworten</span></div>{state.phase === 'question' ? <Countdown deadlineMs={state.deadlineMs} /> : <span className="chip score-korrekt">Auflösung</span>}</div><h2 style={{ maxWidth: '44ch', margin: '18px 0' }}>{state.question.prompt}</h2><div className="grid cols-2">{state.question.options.map((option, index) => { const correct = isReveal && state.reveal?.correctId === option.id; const picked = selectedAnswer === option.id; const wrong = isReveal && picked && !correct; return <button key={option.id} className="btn" disabled={role === 'host' || Boolean(selectedAnswer) || state.phase !== 'question'} onClick={() => void answer(option.id)} style={{ minHeight: 66, justifyContent: 'flex-start', borderColor: correct ? 'var(--good)' : wrong ? 'var(--bad)' : undefined, background: correct ? 'color-mix(in srgb, var(--good) 10%, var(--surface))' : wrong ? 'color-mix(in srgb, var(--bad) 8%, var(--surface))' : undefined }}><strong style={{ marginRight: 10 }}>{['A', 'B', 'C', 'D'][index]}</strong>{option.title}</button> })}</div>{role === 'player' && state.phase === 'question' && <p className="hint" style={{ marginBottom: 0 }}>{selectedAnswer ? '✓ Antwort gespeichert – die Auflösung kommt gleich.' : 'Eine Antwort wählen. Schnelle richtige Antworten bringen mehr Punkte.'}</p>}{state.phase === 'reveal' && <><div className="answer-block" style={{ marginTop: 14 }}><strong>Auflösung:</strong> {state.reveal?.explanation}</div><div className="grid cols-2" style={{ marginTop: 12 }}><div className="card" style={{ margin: 0, padding: 14 }}><div className="eyebrow">Einordnung der Frage</div><h3 style={{ margin: '5px 0 8px' }}>{state.reveal?.classification}</h3><p className="hint" style={{ margin: 0 }}>Die Spiel-Frage war bewusst leicht formuliert. Der Wissensgraph zeigt darunter, welche Entitäten und expliziten Beziehungen die Lösung fachlich tragen.</p><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>{answerGraph?.nodes.map((node) => <span className="chip" key={node.id}>{node.title}</span>)}</div>{answerGraph && answerGraph.edges.length > 0 ? <p className="hint" style={{ margin: '10px 0 0' }}>Relationen: {answerGraph.edges.map((edge) => edge.label).join(' · ')}</p> : <p className="hint" style={{ margin: '10px 0 0' }}>Die Information liegt direkt in diesem Wissensknoten.</p>}</div>{answerGraph && <div className="card" style={{ margin: 0, padding: 8, minHeight: 230 }}><ForceGraph graph={answerGraph} height={220} pulse /></div>}</div></>}</div>{role === 'host' && <div style={{ display: 'flex', gap: 8 }}>{state.phase === 'question' ? <button className="btn primary" onClick={revealQuestion}>Jetzt auflösen</button> : <button className="btn primary" onClick={nextQuestion}>{state.questionIndex + 1 >= state.totalQuestions ? 'Ergebnis zeigen →' : 'Nächste Frage →'}</button>}</div>}</>}
    {(state.phase === 'reveal' || state.phase === 'finished') && <div className="card" style={{ marginTop: 14 }}><h2 style={{ marginTop: 0 }}>{state.phase === 'finished' ? '🏆 Siegerpodest' : 'Zwischenstand'}</h2><div className="table-wrap"><table><thead><tr><th>#</th><th>Spieler:in</th><th className="num">Punkte</th><th className="num">Serie</th></tr></thead><tbody>{players.map((player, index) => <tr key={player.id}><td>{index + 1}</td><td><span style={{ color: player.color }}>●</span> {player.name}</td><td className="num"><strong>{player.score.toLocaleString('de-DE')}</strong></td><td className="num">{player.streak ? `🔥 ${player.streak}` : '–'}</td></tr>)}</tbody></table></div>{role === 'player' && state.phase === 'finished' && <p className="lead" style={{ marginBottom: 0 }}>Danke fürs Mitspielen! Dein Rang: <strong>#{Math.max(1, players.findIndex((player) => player.id === clientId) + 1)}</strong>.</p>}</div>}
  </div>
}
