import { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import type { AppCtx } from '../App'
import ForceGraph from '../components/ForceGraph'
import {
  LiveTransport,
  liveQuizConfigured,
  makeId,
  makeRoomCode,
  type TopicDecisionPayload,
  type TopicSuggestionPayload,
} from '../engine/liveQuiz'
import { pullPersonalWikipedia, searchPersonalWikipedia } from '../engine/personalWikipedia'
import { applyKnowledgeImport } from '../engine/store'

type Role = 'landing' | 'host' | 'participant'

function roomUrl(code: string): string {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('graphroom', code)
  return url.toString()
}

function RoomQr({ url }: { url: string }) {
  const [src, setSrc] = useState('')
  useEffect(() => { void QRCode.toDataURL(url, { width: 420, margin: 1 }).then(setSrc) }, [url])
  return src ? <img src={src} alt="QR-Code zum gemeinsamen Seminargraphen" className="collaborative-qr" /> : null
}

export default function CollaborativeGraph({ ctx }: { ctx: AppCtx }) {
  const queryCode = useMemo(() => new URLSearchParams(location.search).get('graphroom')?.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) ?? '', [])
  const [role, setRole] = useState<Role>('landing')
  const [roomCode, setRoomCode] = useState(queryCode)
  const [name, setName] = useState('')
  const [topic, setTopic] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [decision, setDecision] = useState<TopicDecisionPayload | null>(null)
  const [suggestions, setSuggestions] = useState<Array<TopicSuggestionPayload & { state: 'open' | 'loading' | 'accepted' | 'rejected'; message?: string }>>([])
  const [focusIds, setFocusIds] = useState<string[]>([])
  const transportRef = useRef<LiveTransport | null>(null)
  const participantId = useRef(makeId()).current
  const pendingSuggestionId = useRef<string | null>(null)

  useEffect(() => () => transportRef.current?.close(), [])

  const focusGraph = useMemo(() => {
    const ids = new Set(focusIds)
    return ids.size ? {
      nodes: ctx.graph.nodes.filter((node) => ids.has(node.id)),
      edges: ctx.graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
    } : null
  }, [ctx.graph, focusIds])

  async function createRoom() {
    if (!ctx.online || navigator.onLine === false) {
      setError('Der gemeinsame Seminargraph benötigt den bewusst aktivierten Online-Modus.')
      return
    }
    setConnecting(true)
    setError(null)
    const code = makeRoomCode()
    try {
      transportRef.current = await LiveTransport.connect(code, {
        onState: () => undefined,
        onTopicSuggestion: (payload) => setSuggestions((current) => current.some((item) => item.id === payload.id)
          ? current
          : [...current.slice(-19), { ...payload, topic: payload.topic.slice(0, 80), state: 'open' }]),
      })
      setRoomCode(code)
      setRole('host')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setConnecting(false) }
  }

  async function joinRoom() {
    if (!ctx.online || navigator.onLine === false) return setError('Schalte für den Seminarraum zuerst den Online-Modus ein.')
    if (roomCode.length !== 6) return setError('Der Raumcode muss sechs Zeichen enthalten.')
    setConnecting(true)
    setError(null)
    try {
      transportRef.current = await LiveTransport.connect(roomCode, {
        onState: () => undefined,
        onTopicDecision: (payload) => {
          if (payload.id === pendingSuggestionId.current) setDecision(payload)
        },
      })
      setRole('participant')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setConnecting(false) }
  }

  async function sendSuggestion() {
    const cleanTopic = topic.trim().replace(/\s+/g, ' ').slice(0, 80)
    if (!cleanTopic) return
    const payload: TopicSuggestionPayload = {
      id: makeId(), playerId: participantId, playerName: name.trim().slice(0, 24) || 'Seminar-Gast', topic: cleanTopic,
    }
    pendingSuggestionId.current = payload.id
    await transportRef.current?.send('topic-suggest', payload)
    setDecision({ id: payload.id, topic: cleanTopic, accepted: false, message: 'Der Vorschlag wartet auf die Freigabe des Hosts.' })
    setTopic('')
  }

  async function decide(suggestion: TopicSuggestionPayload, accept: boolean) {
    if (!accept) {
      const result = { id: suggestion.id, topic: suggestion.topic, accepted: false, message: 'Nicht in den Seminargraph übernommen.' }
      setSuggestions((current) => current.map((item) => item.id === suggestion.id ? { ...item, state: 'rejected', message: result.message } : item))
      await transportRef.current?.send('topic-decision', result)
      return
    }
    setSuggestions((current) => current.map((item) => item.id === suggestion.id ? { ...item, state: 'loading' } : item))
    try {
      if (!ctx.online || navigator.onLine === false) throw new Error('Online-Modus ist für die Wikipedia-Prüfung erforderlich.')
      const hits = await searchPersonalWikipedia(suggestion.topic, { limit: 5 })
      const usable = hits.filter((hit) => !hit.disambiguation)
      const exact = usable.find((hit) => hit.title.toLocaleLowerCase('de-DE') === suggestion.topic.toLocaleLowerCase('de-DE'))
      const hit = exact ?? (usable.length === 1 ? usable[0] : null)
      if (!hit) {
        const options = usable.slice(0, 3).map((item) => item.title).join(' · ')
        throw new Error(options ? `Mehrdeutig – genauer vorschlagen: ${options}` : 'Kein eindeutiger Wikipedia-Artikel gefunden.')
      }
      const pulled = await pullPersonalWikipedia([hit.title], ctx.graph)
      const applied = applyKnowledgeImport(ctx.custom, pulled)
      ctx.setCustom(applied.knowledge)
      setFocusIds(pulled.focusNodeIds)
      const result = {
        id: suggestion.id,
        topic: hit.title,
        accepted: true,
        message: `${hit.title}: ${applied.report.delta.addedNodeIds.length} neue Knoten, ${applied.report.delta.addedEdgeKeys.length} neue belegte Kanten.`,
      }
      setSuggestions((current) => current.map((item) => item.id === suggestion.id ? { ...item, topic: hit.title, state: 'accepted', message: result.message } : item))
      await transportRef.current?.send('topic-decision', result)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      setSuggestions((current) => current.map((item) => item.id === suggestion.id ? { ...item, state: 'open', message } : item))
    }
  }

  if (!liveQuizConfigured()) return <div><div className="eyebrow">Gemeinsamer Seminargraph</div><h1>Noch nicht verbunden</h1><div className="card"><p>Diese Funktion nutzt dieselbe kostenlose Supabase-Realtime-Verbindung wie das Live-Quiz.</p><p className="hint">Konfiguration: <code>VITE_SUPABASE_URL</code> und <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>.</p></div></div>

  if (role === 'landing') return (
    <div>
      <div className="eyebrow">QR-Kollaboration</div>
      <h1>Gemeinsamer Seminargraph</h1>
      <p className="lead">Bis zu 20 Handys schlagen Themen vor. Nur der Host entscheidet, welcher öffentliche Wikipedia-Artikel tatsächlich in den lokalen Präsentationsgraphen gelangt.</p>
      {!ctx.online && <div className="callout"><strong>Online-Funktion ausgeschaltet.</strong>{' '}<button className="btn sm" onClick={() => ctx.setOnline(true)}>Online-Modus aktivieren</button></div>}
      {error && <div className="callout">{error}</div>}
      <div className="grid cols-2">
        <div className="card"><h2>Raum eröffnen</h2><button className="btn primary" disabled={connecting || !ctx.online} onClick={() => void createRoom()}>{connecting ? 'Verbinde …' : 'Seminarraum starten'}</button></div>
        <div className="card"><h2>Beitreten</h2><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" /><input className="mono" value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} placeholder="RAUMCODE" style={{ marginTop: 8 }} /><button className="btn" disabled={connecting || !ctx.online || roomCode.length !== 6} onClick={() => void joinRoom()} style={{ marginTop: 9 }}>Beitreten</button></div>
      </div>
    </div>
  )

  return <div className="collaborative-page"><div className="eyebrow">Gemeinsamer Seminargraph · {roomCode}</div><h1>{role === 'host' ? 'Themen moderieren' : 'Thema vorschlagen'}</h1>{error && <div className="callout">{error}</div>}{role === 'host' ? <div className="collaborative-host-grid"><div className="card collaborative-room-card"><RoomQr url={roomUrl(roomCode)} /><strong className="mono">{roomCode}</strong><p className="hint">Der Host prüft jeden Vorschlag vor dem Netzabruf.</p></div><div className="card collaborative-proposals"><h2>Vorschläge</h2>{suggestions.length === 0 ? <p className="hint">Noch keine Vorschläge.</p> : suggestions.map((item) => <div key={item.id}><span><strong>{item.topic}</strong><small>{item.playerName}{item.message ? ` · ${item.message}` : ''}</small></span>{item.state === 'open' && <span><button className="btn sm" onClick={() => void decide(item, false)}>Ablehnen</button><button className="btn sm primary" onClick={() => void decide(item, true)}>Prüfen & übernehmen</button></span>}{item.state === 'loading' && <span className="chip">Wikipedia wird geprüft …</span>}{item.state === 'accepted' && <span className="chip">✓ im Graph</span>}</div>)}</div></div> : <div className="card collaborative-participant"><p>Es wird nur dein Themenbegriff an den Host übertragen – keine Dateien und kein persönlicher Wissensgraph.</p><div className="collaborative-topic-input"><input value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={80} placeholder="z. B. Hannah Arendt" /><button className="btn primary" disabled={!topic.trim()} onClick={() => void sendSuggestion()}>Vorschlagen</button></div>{decision && <div className="callout">{decision.message}</div>}</div>}{role === 'host' && focusGraph && <div className="card collaborative-focus"><h2>Zuletzt gewachsener Teilgraph</h2><ForceGraph graph={focusGraph} highlightIds={focusIds} height={380} pulse /></div>}</div>
}
