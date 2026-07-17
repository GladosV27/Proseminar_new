import { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { confetti, vibrate } from '../components/effects'
import ForceGraph from '../components/ForceGraph'
import { BASE_GRAPH } from '../data/graph'
import { makeLiveQuestionDeck } from '../engine/liveQuestions'
import {
  LiveQuizStateOutbox,
  LiveTransport,
  type LivePlayer,
  type LiveQuizState,
  isLiveQuizTransition,
  isNewerLiveQuizState,
  liveQuizConfigured,
  liveRoomUrl,
  makeId,
  makeRoomCode,
} from '../engine/liveQuiz'

type Role = 'landing' | 'host' | 'player'

const COLORS = ['#d45d43', '#2d7d7a', '#7168b7', '#b27625', '#b04c75', '#4c7c43', '#2c6ea6', '#8a5b34']
const MAX_PLAYERS = 20
const STATE_BROADCAST_INTERVAL_MS = 600
const LIVE_CLIENT_ID_KEY = 'noesis.live-quiz.client.v1'

function persistentClientId(): string {
  try {
    const existing = sessionStorage.getItem(LIVE_CLIENT_ID_KEY)?.trim() ?? ''
    if (/^[A-Za-z0-9._:-]{1,128}$/.test(existing)) return existing
    const created = makeId()
    sessionStorage.setItem(LIVE_CLIENT_ID_KEY, created)
    return created
  } catch {
    return makeId()
  }
}

function cleanName(value: string, fallback: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 20) || fallback
}

function waitForHostState(
  promise: Promise<LiveQuizState>,
  roomCode: string,
  timeoutMs = 7_000,
): Promise<LiveQuizState> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`Im Raum ${roomCode} antwortet kein Host. Prüfe den Code oder bitte den Host, den Raum neu zu öffnen.`))
    }, timeoutMs)
    void promise.then(
      (next) => {
        window.clearTimeout(timer)
        resolve(next)
      },
      (err) => {
        window.clearTimeout(timer)
        reject(err)
      },
    )
  })
}

function sortedPlayers(players: LivePlayer[]): LivePlayer[] {
  return [...players].sort((a, b) => b.score - a.score || b.streak - a.streak || a.name.localeCompare(b.name, 'de'))
}

function RoomQr({ url }: { url: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [qrError, setQrError] = useState(false)
  useEffect(() => {
    let active = true
    setDataUrl(null)
    setQrError(false)
    void QRCode.toDataURL(url, { width: 440, margin: 1, color: { dark: '#141413', light: '#faf9f5' } })
      .then((next) => { if (active) setDataUrl(next) })
      .catch(() => { if (active) setQrError(true) })
    return () => { active = false }
  }, [url])
  if (qrError) return <div className="callout live-quiz-qr-error" role="alert">Der QR-Code konnte nicht erzeugt werden. Nutze den Raumcode oder kopiere den Beitrittslink.</div>
  return dataUrl ? <img src={dataUrl} alt="QR-Code zum Beitreten" className="live-quiz-qr" /> : <p className="hint" role="status">QR-Code wird erzeugt …</p>
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
  return <div className="live-quiz-countdown" role="timer" aria-label={`Noch ${seconds.toFixed(1)} Sekunden Antwortzeit`}><div style={{ display: 'flex', justifyContent: 'space-between', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}><span>Antwortzeit</span><span>{seconds.toFixed(1)} s</span></div><div className="progress" style={{ marginTop: 5 }}><span style={{ width: `${pct}%`, background: seconds < 5 ? 'var(--bad)' : undefined }} /></div></div>
}

export default function LiveQuiz({ onExit }: { onExit?: () => void }) {
  const queryRoom = useMemo(() => new URLSearchParams(window.location.search).get('live')?.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) ?? '', [])
  // Ein QR-Link füllt den Raumcode vor, lässt aber bewusst noch den Spitznamen
  // bestätigen. Erst der Button baut die Realtime-Verbindung auf.
  const [role, setRole] = useState<Role>('landing')
  const [invitedByLink, setInvitedByLink] = useState(Boolean(queryRoom))
  const [roomCode, setRoomCode] = useState(queryRoom)
  const [name, setName] = useState('')
  const [total, setTotal] = useState<5 | 8>(5)
  const [state, setState] = useState<LiveQuizState | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const clientId = useRef(persistentClientId()).current
  const playerRef = useRef<Pick<LivePlayer, 'id' | 'name' | 'color'> | null>(null)
  const transportRef = useRef<LiveTransport | null>(null)
  const stateRef = useRef<LiveQuizState | null>(null)
  const deckRef = useRef<ReturnType<typeof makeLiveQuestionDeck>>([])
  const stateOutboxRef = useRef(new LiveQuizStateOutbox())
  const stateSendQueueRef = useRef<Promise<void>>(Promise.resolve())
  const stateBroadcastTimerRef = useRef<number | null>(null)
  const lastStateBroadcastAtRef = useRef(0)
  const lastSyncRequestAtRef = useRef(0)
  const connectAttemptRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      connectAttemptRef.current += 1
      if (stateBroadcastTimerRef.current !== null) window.clearTimeout(stateBroadcastTimerRef.current)
      stateOutboxRef.current.clear()
      const transport = transportRef.current
      const player = playerRef.current
      transportRef.current = null
      playerRef.current = null
      closeTransport(transport, player)
    }
  }, [])
  useEffect(() => { setSelectedAnswer(null) }, [state?.question?.id])
  useEffect(() => {
    if (role === 'landing') return
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [role])

  function attemptIsActive(attempt: number): boolean {
    return mountedRef.current && connectAttemptRef.current === attempt
  }
  function closeTransport(
    transport: LiveTransport | null,
    player: Pick<LivePlayer, 'id' | 'name' | 'color'> | null,
  ) {
    if (!transport) return
    if (!player) {
      transport.close()
      return
    }
    // Best effort: Bei einem bewussten Verlassen soll der Platz sofort wieder
    // frei werden. Derselbe sessionStorage-Client bleibt bei einem Reload
    // zusätzlich stabil, falls der Browser den letzten Request abbricht.
    void transport.send('leave', { playerId: player.id })
      .catch(() => undefined)
      .finally(() => transport.close())
  }
  function acceptState(next: LiveQuizState): boolean {
    if (!isNewerLiveQuizState(stateRef.current, next)) return false
    stateRef.current = next
    if (mountedRef.current) setState(next)
    return true
  }
  function scheduleStateFlush() {
    if (stateBroadcastTimerRef.current !== null || !stateOutboxRef.current.hasPending()) return
    const elapsed = Date.now() - lastStateBroadcastAtRef.current
    const delay = Math.max(0, STATE_BROADCAST_INTERVAL_MS - elapsed)
    stateBroadcastTimerRef.current = window.setTimeout(flushPendingState, delay)
  }
  function flushPendingState() {
    stateBroadcastTimerRef.current = null
    const pending = stateOutboxRef.current.dequeue()
    if (!pending) return
    lastStateBroadcastAtRef.current = Date.now()
    const transport = transportRef.current
    const attempt = connectAttemptRef.current
    if (transport) {
      stateSendQueueRef.current = stateSendQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          if (!attemptIsActive(attempt) || transportRef.current !== transport) return
          await transport.send('state', pending)
        })
        .catch((err) => {
          if (attemptIsActive(attempt)) setError(err instanceof Error ? err.message : String(err))
        })
    }
    scheduleStateFlush()
  }
  function publish(next: LiveQuizState) {
    const current = stateRef.current
    const stamped: LiveQuizState = {
      ...next,
      revision: current ? current.revision + 1 : Math.max(1, next.revision),
      updatedAt: Math.max(Date.now(), next.updatedAt, (current?.updatedAt ?? 0) + 1),
    }
    const transition = isLiveQuizTransition(current, stamped)
    acceptState(stamped)
    stateOutboxRef.current.enqueue(stamped, transition)
    scheduleStateFlush()
  }
  function addPlayer(player: Pick<LivePlayer, 'id' | 'name' | 'color'>) {
    const current = stateRef.current
    if (!current) return
    if (current.players.some((existing) => existing.id === player.id) || current.players.length >= MAX_PLAYERS) {
      publish({ ...current, updatedAt: Date.now() })
      return
    }
    publish({ ...current, players: [...current.players, { ...player, score: 0, streak: 0, answered: false }], updatedAt: Date.now() })
  }
  function removePlayer(playerId: string) {
    const current = stateRef.current
    if (!current || !current.players.some((player) => player.id === playerId)) return
    const players = current.players.filter((player) => player.id !== playerId)
    publish({
      ...current,
      players,
      answerCount: players.filter((player) => player.answered).length,
      updatedAt: Date.now(),
    })
  }
  function recordAnswer(payload: { playerId: string; questionId: string; optionId: string; at: number }) {
    const current = stateRef.current
    const card = deckRef.current[current?.questionIndex ?? -1]
    if (!current || !card || current.phase !== 'question' || !current.question || current.question.id !== payload.questionId) return
    // Für Frist und Geschwindigkeitsbonus zählt ausschließlich die Uhr des Hosts.
    // Der Client-Zeitstempel bleibt aus Kompatibilitätsgründen im Payload, hat
    // aber keinen Einfluss mehr auf Punkte oder Annahme der Antwort.
    const receivedAt = Date.now()
    if ((current.deadlineMs ?? 0) < receivedAt || !current.question.options.some((option) => option.id === payload.optionId)) return
    const old = current.players.find((player) => player.id === payload.playerId)
    if (!old || old.answered) return
    const correct = payload.optionId === card.correctId
    const remainingRatio = Math.max(0, Math.min(1, ((current.deadlineMs ?? receivedAt) - receivedAt) / 18_000))
    const gained = correct ? 1_000 + Math.round(1_000 * remainingRatio) + old.streak * 100 : 0
    const players = current.players.map((player) => player.id === payload.playerId ? { ...player, answered: true, score: player.score + gained, streak: correct ? player.streak + 1 : 0 } : player)
    publish({ ...current, players, answerCount: current.answerCount + 1, updatedAt: Date.now() })
  }

  async function hostRoom() {
    if (!liveQuizConfigured()) return
    const attempt = ++connectAttemptRef.current
    setConnecting(true); setError(null)
    let transport: LiveTransport | null = null
    try {
      const cards = makeLiveQuestionDeck(total)
      const code = makeRoomCode()
      deckRef.current = cards
      transport = await LiveTransport.connectQuizHost(code, {
        onJoin: ({ player }) => { if (attemptIsActive(attempt)) addPlayer(player) },
        onAnswer: (payload) => { if (attemptIsActive(attempt)) recordAnswer(payload) },
        onLeave: ({ playerId }) => { if (attemptIsActive(attempt)) removePlayer(playerId) },
        onSyncRequest: () => {
          if (!attemptIsActive(attempt)) return
          const current = stateRef.current
          if (current) publish({ ...current, updatedAt: Date.now() })
        },
        onConnectionStatus: (status) => {
          if (!attemptIsActive(attempt)) return
          if (status === 'connected') {
            setError(null)
            const current = stateRef.current
            if (current) publish({ ...current, updatedAt: Date.now() })
          } else {
            setError('Die Supabase-Verbindung wurde unterbrochen. Noesis versucht automatisch, den Raum wieder zu verbinden.')
          }
        },
      })
      if (!attemptIsActive(attempt)) {
        transport.close()
        return
      }
      transportRef.current = transport
      const initial: LiveQuizState = { version: 1, revision: 1, roomCode: code, hostId: clientId, phase: 'lobby', questionIndex: 0, totalQuestions: cards.length, question: null, deadlineMs: null, answerCount: 0, players: [], reveal: null, updatedAt: Date.now() }
      setRoomCode(code); setRole('host'); publish(initial)
    } catch (err) {
      transport?.close()
      if (!attemptIsActive(attempt)) return
      setError(err instanceof Error ? err.message : String(err))
      transportRef.current = null
    } finally {
      if (attemptIsActive(attempt)) setConnecting(false)
    }
  }

  async function joinRoom() {
    const code = roomCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    if (code.length !== 6) { setError('Bitte einen sechsstelligen Raumcode eingeben.'); return }
    if (!liveQuizConfigured()) return
    const attempt = ++connectAttemptRef.current
    setConnecting(true); setError(null)
    let transport: LiveTransport | null = null
    try {
      const player = { id: clientId, name: cleanName(name, 'Quiz-Gast'), color: COLORS[Math.floor(Math.random() * COLORS.length)] }
      playerRef.current = player
      let resolveHostState: (next: LiveQuizState) => void = () => undefined
      let rejectHostState: (reason: Error) => void = () => undefined
      const hostStatePromise = new Promise<LiveQuizState>((resolve, reject) => {
        resolveHostState = resolve
        rejectHostState = reject
      })
      transport = await LiveTransport.connectQuizPlayer(code, {
        onState: (next) => {
          if (!attemptIsActive(attempt) || next.roomCode.toUpperCase() !== code || !acceptState(next)) return
          if (next.players.some((candidate) => candidate.id === player.id)) resolveHostState(next)
          else if (next.players.length >= MAX_PLAYERS) rejectHostState(new Error(`Der Raum ist bereits voll (${MAX_PLAYERS}/${MAX_PLAYERS}).`))
        },
        onConnectionStatus: (status) => {
          if (!attemptIsActive(attempt)) return
          if (status === 'connected') {
            setError(null)
            const now = Date.now()
            if (now - lastSyncRequestAtRef.current >= 2_000) {
              lastSyncRequestAtRef.current = now
              void transportRef.current?.send('sync-request', {}).catch((err) => setError(err instanceof Error ? err.message : String(err)))
            }
          } else {
            setError('Die Verbindung zum Live-Raum wurde unterbrochen. Die Wiederverbindung läuft automatisch.')
          }
        },
      })
      if (!attemptIsActive(attempt)) {
        transport.close()
        return
      }
      transportRef.current = transport
      setRoomCode(code)
      await transport.send('join', { player })
      await waitForHostState(hostStatePromise, code)
      if (!attemptIsActive(attempt)) return
      setRole('player')
    } catch (err) {
      if (!attemptIsActive(attempt)) {
        transport?.close()
        return
      }
      setError(err instanceof Error ? err.message : String(err))
      closeTransport(transportRef.current ?? transport, playerRef.current)
      transportRef.current = null
      stateRef.current = null
      setState(null)
      playerRef.current = null
    } finally {
      if (attemptIsActive(attempt)) setConnecting(false)
    }
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
  async function copyRoomLink() {
    setCopied(false)
    setCopyFailed(false)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API nicht verfügbar')
      await navigator.clipboard.writeText(liveRoomUrl(roomCode))
      setCopied(true)
    } catch {
      setCopyFailed(true)
    }
  }
  function leave() {
    connectAttemptRef.current += 1
    if (stateBroadcastTimerRef.current !== null) window.clearTimeout(stateBroadcastTimerRef.current)
    stateBroadcastTimerRef.current = null
    stateOutboxRef.current.clear()
    stateSendQueueRef.current = Promise.resolve()
    lastStateBroadcastAtRef.current = 0
    lastSyncRequestAtRef.current = 0
    const transport = transportRef.current
    const player = playerRef.current
    transportRef.current = null
    playerRef.current = null
    stateRef.current = null
    closeTransport(transport, player)
    setState(null); setSelectedAnswer(null); setRole('landing'); setRoomCode('')
    setConnecting(false); setCopied(false); setCopyFailed(false); setError(null)
    setInvitedByLink(false)
    const url = new URL(window.location.href); url.searchParams.delete('live'); window.history.replaceState({}, '', url)
  }
  function exitToNoesis() {
    leave()
    onExit?.()
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

  if (!liveQuizConfigured()) return (
    <div className="live-quiz">
      <button type="button" className="btn sm live-quiz-exit" onClick={exitToNoesis}>← Zurück zu Noesis</button>
      <div className="eyebrow">Echtzeit-Spielmodus</div>
      <h1>Live-Quiz</h1>
      <div className="card" style={{ maxWidth: '72ch' }}>
        <h3 style={{ marginTop: 0 }}>Noch nicht verbunden</h3>
        <p className="lead">Der lokale Pfad-Quizmodus bleibt verfügbar. Für Räume mit QR-Code, Punkten und bis zu 20 Handys benötigt die App einmalig eine kostenlose Supabase-Verbindung.</p>
        <p className="hint">Lege die Datei <code>.env</code> aus <code>.env.example</code> an und folge <code>docs/LIVE_QUIZ.md</code>. Niemals einen Secret- oder service_role-Schlüssel eintragen.</p>
      </div>
    </div>
  )

  if (role === 'landing') return (
    <div className="live-quiz">
      <button type="button" className="btn sm live-quiz-exit" onClick={exitToNoesis}>← Zurück zu Noesis</button>
      <div className="eyebrow">{invitedByLink ? 'Einladung zum Echtzeit-Spiel' : 'Echtzeit-Spielmodus'}</div>
      <h1>{invitedByLink ? `Raum ${roomCode} beitreten` : 'Live-Quiz'}</h1>
      <p className="lead">
        {invitedByLink
          ? 'Wähle noch deinen Spitznamen. Der Raumcode aus dem QR-Link ist bereits eingetragen.'
          : 'Eine schnelle Quizshow statt einer schweren Denkaufgabe: Direktes Wissen, bekannte Werke, Orte, Drama und Ideen-Remixe.'}
      </p>
      {error && <div className="callout live-quiz-error" role="alert" aria-live="assertive">{error}</div>}
      <div className={`grid cols-2 live-quiz-landing-grid ${invitedByLink ? 'join-only' : ''}`}>
        {!invitedByLink && (
          <div className="card">
            <div className="eyebrow">Präsentationslaptop</div>
            <h2 style={{ marginTop: 4 }}>Quizshow eröffnen</h2>
            <p className="hint">Du steuerst Timer und Auflösung. Die Fragen mischen Blitzwissen, Werke, Orte, Zeitreise und philosophisches Drama.</p>
            <div className="callout" style={{ margin: '12px 0' }}>⚡ Vier klare Antwortkarten · maximal 18 Sekunden pro Runde</div>
            <div className="seg" style={{ marginBottom: 14 }}>
              {([5, 8] as const).map((value) => (
                <button type="button" key={value} className={total === value ? 'on' : ''} onClick={() => setTotal(value)}>{value} Fragen</button>
              ))}
            </div>
            <button type="button" className="btn primary" disabled={connecting} onClick={() => void hostRoom()}>{connecting ? 'Verbinde …' : 'Live-Raum eröffnen'}</button>
          </div>
        )}
        <form
          className="card live-quiz-join-form"
          aria-busy={connecting}
          onSubmit={(event) => { event.preventDefault(); void joinRoom() }}
        >
          <div className="eyebrow">Smartphone</div>
          <h2 style={{ marginTop: 4 }}>Raum beitreten</h2>
          <p className="hint">{invitedByLink ? 'Der QR-Code hat dich direkt zum richtigen Raum gebracht.' : 'Raumcode eingeben und mitspielen.'}</p>
          <label className="field" htmlFor="live-quiz-name">Dein Spitzname</label>
          <input
            id="live-quiz-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Zum Beispiel Alex"
            maxLength={20}
            autoComplete="nickname"
            autoFocus={invitedByLink}
          />
          <label className="field" htmlFor="live-quiz-code">Raumcode</label>
          <input
            id="live-quiz-code"
            type="text"
            value={roomCode}
            onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
            placeholder="RAUMCODE"
            maxLength={6}
            className="mono"
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
          <button type="submit" className="btn primary" disabled={connecting}>{connecting ? 'Suche Host …' : 'Beitreten'}</button>
          {connecting && <p className="hint" role="status" aria-live="polite">Der Host wird gesucht. Das dauert höchstens sieben Sekunden.</p>}
        </form>
      </div>
    </div>
  )

  if (!state) return (
    <div className="live-quiz">
      <div className="eyebrow">Live-Quiz</div>
      <h1>Verbinde mit Raum {roomCode}</h1>
      <div className="card" role="status" aria-live="polite">
        <p>Warte auf den Host …</p>
        {error && <p className="hint" role="alert">{error}</p>}
        <button type="button" className="btn sm" onClick={leave}>Zurück</button>
      </div>
    </div>
  )

  return (
    <div className="live-quiz">
      <div className="eyebrow">Live-Quiz · Raum {state.roomCode}</div>
      <div className="live-quiz-heading">
        <h1>{state.phase === 'lobby' ? 'Wartebereich' : state.phase === 'finished' ? 'Endergebnis' : `Frage ${state.questionIndex + 1}/${state.totalQuestions}`}</h1>
        <button type="button" className="btn sm" onClick={leave}>Raum verlassen</button>
      </div>
      {error && <div className="callout live-quiz-error" role="alert" aria-live="assertive">{error}</div>}

      {state.phase === 'lobby' && (
        <div className="grid cols-2 live-quiz-lobby-grid">
          {role === 'host' ? (
            <div className="card live-quiz-room-card">
              <RoomQr url={link} />
              <h2 className="mono live-quiz-room-code">{state.roomCode}</h2>
              <p className="hint">QR-Code scannen oder Raumcode eingeben</p>
              <button type="button" className="btn sm" aria-live="polite" onClick={() => void copyRoomLink()}>{copied ? '✓ Link kopiert' : 'Link kopieren'}</button>
              {copyFailed && (
                <div className="live-quiz-copy-fallback">
                  <p className="hint" role="alert">Automatisches Kopieren wurde blockiert. Markiere den Link manuell:</p>
                  <label className="field">
                    Beitrittslink
                    <input
                      type="text"
                      readOnly
                      value={link}
                      onFocus={(event) => event.currentTarget.select()}
                      aria-label="Beitrittslink"
                    />
                  </label>
                </div>
              )}
            </div>
          ) : (
            <div className="card">
              <h2>Du bist dabei</h2>
              <p className="lead">Hallo {me?.name ?? playerRef.current?.name ?? 'Quiz-Gast'}! Warte, bis der Host die erste Frage startet.</p>
              <p className="hint">Raum: <strong className="mono">{state.roomCode}</strong></p>
            </div>
          )}
          <div className="card">
            <h2 className="live-quiz-player-count" aria-live="polite">Lobby · {players.length} dabei</h2>
            {players.length ? (
              <div className="live-quiz-player-list">
                {players.map((player) => (
                  <span className="chip" key={player.id} style={{ borderColor: player.color }}>
                    <span style={{ color: player.color }}>●</span> {player.name}
                    {role === 'host' && (
                      <button
                        type="button"
                        className="live-quiz-player-remove"
                        aria-label={`${player.name} aus der Lobby entfernen`}
                        title="Verwaisten Eintrag entfernen"
                        onClick={() => removePlayer(player.id)}
                      >×</button>
                    )}
                  </span>
                ))}
              </div>
            ) : <p className="hint">Noch niemand beigetreten.</p>}
            {role === 'host' && <button type="button" className="btn primary live-quiz-start" disabled={players.length === 0} onClick={() => askQuestion(0)}>Erste Frage starten →</button>}
          </div>
        </div>
      )}

      {(state.phase === 'question' || state.phase === 'reveal') && state.question && (
        <>
          <div className="card live-quiz-question-card">
            <div className="live-quiz-question-head">
              <div className="live-quiz-meta">
                <span className="chip" style={{ background: 'var(--accent-soft)', color: 'var(--accent-deep)', borderColor: 'var(--accent)' }}>{state.question.category}</span>
                <span className="chip" aria-live="polite">{state.answerCount}/{players.length} Antworten</span>
              </div>
              {state.phase === 'question' ? <Countdown deadlineMs={state.deadlineMs} /> : <span className="chip score-korrekt">Auflösung</span>}
            </div>
            <h2 className="live-quiz-prompt">{state.question.prompt}</h2>
            <div className="grid cols-2 live-quiz-answer-grid">
              {state.question.options.map((option, index) => {
                const correct = isReveal && state.reveal?.correctId === option.id
                const picked = selectedAnswer === option.id
                const wrong = isReveal && picked && !correct
                return (
                  <button
                    type="button"
                    key={option.id}
                    className="btn live-quiz-answer"
                    disabled={role === 'host' || Boolean(selectedAnswer) || state.phase !== 'question'}
                    aria-pressed={picked}
                    onClick={() => void answer(option.id)}
                    style={{
                      borderColor: correct ? 'var(--good)' : wrong ? 'var(--bad)' : undefined,
                      background: correct
                        ? 'color-mix(in srgb, var(--good) 10%, var(--surface))'
                        : wrong ? 'color-mix(in srgb, var(--bad) 8%, var(--surface))' : undefined,
                    }}
                  >
                    <strong>{['A', 'B', 'C', 'D'][index]}</strong>
                    <span>{option.title}</span>
                  </button>
                )
              })}
            </div>
            {role === 'player' && state.phase === 'question' && (
              <p className="hint" style={{ marginBottom: 0 }} role="status" aria-live="polite">
                {selectedAnswer ? '✓ Antwort gesendet – die Auflösung kommt gleich.' : 'Eine Antwort wählen. Schnelle richtige Antworten bringen mehr Punkte.'}
              </p>
            )}
            {state.phase === 'reveal' && (
              <>
                <div className="answer-block live-quiz-reveal"><strong>Auflösung:</strong> {state.reveal?.explanation}</div>
                <div className="grid cols-2 live-quiz-explanation-grid">
                  <div className="card live-quiz-classification-card">
                    <div className="eyebrow">Einordnung der Frage</div>
                    <h3>{state.reveal?.classification}</h3>
                    <p className="hint">Die Spiel-Frage war bewusst leicht formuliert. Der Wissensgraph zeigt, welche Entitäten und Beziehungen die Lösung tragen.</p>
                    <div className="live-quiz-node-list">{answerGraph?.nodes.map((node) => <span className="chip" key={node.id}>{node.title}</span>)}</div>
                    {answerGraph && answerGraph.edges.length > 0
                      ? <p className="hint live-quiz-relations">Relationen: {answerGraph.edges.map((edge) => edge.label).join(' · ')}</p>
                      : <p className="hint live-quiz-relations">Die Information liegt direkt in diesem Wissensknoten.</p>}
                  </div>
                  {answerGraph && <div className="card live-quiz-graph-card"><ForceGraph graph={answerGraph} height={220} pulse /></div>}
                </div>
              </>
            )}
          </div>
          {role === 'host' && (
            <div className="live-quiz-host-actions">
              {state.phase === 'question'
                ? <button type="button" className="btn primary" onClick={revealQuestion}>Jetzt auflösen</button>
                : <button type="button" className="btn primary" onClick={nextQuestion}>{state.questionIndex + 1 >= state.totalQuestions ? 'Ergebnis zeigen →' : 'Nächste Frage →'}</button>}
            </div>
          )}
        </>
      )}

      {(state.phase === 'reveal' || state.phase === 'finished') && (
        <div className="card live-quiz-scoreboard">
          <h2>{state.phase === 'finished' ? '🏆 Siegerpodest' : 'Zwischenstand'}</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Spieler:in</th><th className="num">Punkte</th><th className="num">Serie</th></tr></thead>
              <tbody>
                {players.map((player, index) => (
                  <tr key={player.id}>
                    <td>{index + 1}</td>
                    <td><span style={{ color: player.color }}>●</span> {player.name}</td>
                    <td className="num"><strong>{player.score.toLocaleString('de-DE')}</strong></td>
                    <td className="num">{player.streak ? `🔥 ${player.streak}` : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {role === 'player' && state.phase === 'finished' && <p className="lead live-quiz-rank">Danke fürs Mitspielen! Dein Rang: <strong>#{Math.max(1, players.findIndex((player) => player.id === clientId) + 1)}</strong>.</p>}
        </div>
      )}
    </div>
  )
}
