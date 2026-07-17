import { useEffect, useRef, useState } from 'react'
import type { KnowledgeGraph } from '../data/types'

/**
 * Interaktiver Force-Directed-Graph auf Canvas – ohne externe Bibliothek.
 * Einfache Simulation: Feder-Kräfte entlang Kanten, Coulomb-Abstoßung,
 * leichte Zentrierung. Farben = Community (validierte kategoriale Palette).
 */

const CAT = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)']

export function communityColor(communities: string[], c: string): string {
  const i = communities.indexOf(c)
  return i >= 0 ? CAT[i % CAT.length] : 'var(--accent)'
}

interface Sim {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  r: number
  color: string
  label: string
  highlight: boolean
}

interface Camera {
  x: number
  y: number
  k: number
}

interface Gesture {
  mode: 'idle' | 'node' | 'pan' | 'pinch'
  pointerId: number | null
  nodeId: string | null
  startClientX: number
  startClientY: number
  startCamera: Camera
  startDistance: number
  startCenterX: number
  startCenterY: number
  moved: boolean
}

interface Props {
  graph: KnowledgeGraph
  height?: number
  highlightIds?: string[]
  /** Kanten, die als neu oder besonders relevant sichtbar bleiben sollen. */
  highlightEdgeKeys?: string[]
  onSelect?: (id: string | null) => void
  selected?: string | null
  /** Pfadverfolgung: Kanten leuchten der Reihe nach auf (für Subgraph/Quiz) */
  pulse?: boolean
}

export default function ForceGraph({
  graph,
  height = 520,
  highlightIds,
  highlightEdgeKeys,
  onSelect,
  selected,
  pulse,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simRef = useRef<Sim[]>([])
  const heatRef = useRef(0)
  const cameraRef = useRef<Camera>({ x: 0, y: 0, k: 1 })
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const gestureRef = useRef<Gesture>({
    mode: 'idle',
    pointerId: null,
    nodeId: null,
    startClientX: 0,
    startClientY: 0,
    startCamera: { x: 0, y: 0, k: 1 },
    startDistance: 0,
    startCenterX: 0,
    startCenterY: 0,
    moved: false,
  })
  const [cameraLabel, setCameraLabel] = useState('100 %')
  const [hover, setHover] = useState<string | null>(null)
  const hoverRef = useRef<string | null>(null)
  hoverRef.current = hover

  const communities = [...new Set(graph.nodes.map((n) => n.community))]

  // Simulation bei Graph-Änderung neu initialisieren (Positionen erhalten)
  useEffect(() => {
    const prev = new Map(simRef.current.map((s) => [s.id, s]))
    const hi = new Set(highlightIds ?? [])
    simRef.current = graph.nodes.map((n, i) => {
      const old = prev.get(n.id)
      const angle = (i / graph.nodes.length) * Math.PI * 2
      const commIdx = communities.indexOf(n.community)
      // Communities starten in unterschiedlichen Sektoren → Cluster bleiben sichtbar
      const cx = Math.cos((commIdx / communities.length) * Math.PI * 2) * 160
      const cy = Math.sin((commIdx / communities.length) * Math.PI * 2) * 120
      const deg = graph.edges.filter((e) => e.source === n.id || e.target === n.id).length
      return {
        id: n.id,
        x: old?.x ?? cx + Math.cos(angle) * 60 + (i % 7) * 4,
        y: old?.y ?? cy + Math.sin(angle) * 60 + (i % 5) * 4,
        vx: 0,
        vy: 0,
        r: Math.min(16, 5 + deg * 0.7),
        color: communityColor(communities, n.community),
        label: n.title,
        highlight: hi.size === 0 || hi.has(n.id),
      }
    })
    heatRef.current = Math.min(260, 80 + graph.nodes.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, highlightIds?.join(',')])

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    let raf = 0
    let running = true

    const emphasizedEdges = new Set(highlightEdgeKeys ?? [])
    const simById = new Map(simRef.current.map((node) => [node.id, node]))
    const edgeIdx = graph.edges.map((e) => ({
      s: simById.get(e.source),
      t: simById.get(e.target),
      label: e.label,
      key: `${e.source}\u0000${e.relation}\u0000${e.target}`,
    }))
    const pulseEdges = edgeIdx.filter((edge) => emphasizedEdges.size === 0 || emphasizedEdges.has(edge.key))

    function step() {
      const sims = simRef.current
      // Abstoßung (O(n²) – bei <200 Knoten unproblematisch)
      for (let i = 0; i < sims.length; i++) {
        for (let j = i + 1; j < sims.length; j++) {
          const a = sims[i]
          const b = sims[j]
          let dx = a.x - b.x
          let dy = a.y - b.y
          let d2 = dx * dx + dy * dy
          if (d2 < 1) d2 = 1
          const f = 900 / d2
          const d = Math.sqrt(d2)
          dx /= d
          dy /= d
          a.vx += dx * f
          a.vy += dy * f
          b.vx -= dx * f
          b.vy -= dy * f
        }
      }
      // Federn
      for (const e of edgeIdx) {
        const a = e.s
        const b = e.t
        if (!a || !b) continue
        const dx = b.x - a.x
        const dy = b.y - a.y
        const d = Math.sqrt(dx * dx + dy * dy) || 1
        const f = (d - 78) * 0.012
        a.vx += (dx / d) * f
        a.vy += (dy / d) * f
        b.vx -= (dx / d) * f
        b.vy -= (dy / d) * f
      }
      // Zentrierung + Dämpfung
      for (const s of sims) {
        s.vx += -s.x * 0.004
        s.vy += -s.y * 0.004
        s.vx *= 0.86
        s.vy *= 0.86
        if (!(gestureRef.current.mode === 'node' && gestureRef.current.nodeId === s.id)) {
          s.x += s.vx
          s.y += s.vy
        }
      }
    }

    function resolveColor(v: string): string {
      if (!v.startsWith('var(')) return v
      return getComputedStyle(document.documentElement).getPropertyValue(v.slice(4, -1)).trim()
    }

    function draw() {
      const dpr = window.devicePixelRatio || 1
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      const pixelWidth = Math.round(w * dpr)
      const pixelHeight = Math.round(h * dpr)
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth
        canvas.height = pixelHeight
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.save()
      const camera = cameraRef.current
      ctx.translate(w / 2 + camera.x, h / 2 + camera.y)
      ctx.scale(camera.k, camera.k)

      const line = resolveColor('var(--line)')
      const ink = resolveColor('var(--ink)')
      const muted = resolveColor('var(--muted)')
      const surface = resolveColor('var(--surface)')

      const sims = simRef.current
      const active = hoverRef.current ?? selected
      // Pfadverfolgung: reihum jeweils eine Kante hervorheben
      const pulseKey = pulse && pulseEdges.length
        ? pulseEdges[Math.floor(performance.now() / 650) % pulseEdges.length].key
        : null

      // Kanten
      graph.edges.forEach((e) => {
        const a = simById.get(e.source)
        const b = simById.get(e.target)
        if (!a || !b) return
        const key = `${e.source}\u0000${e.relation}\u0000${e.target}`
        const emphasized = emphasizedEdges.has(key)
        const pulsing = key === pulseKey
        const touched = Boolean(active && (e.source === active || e.target === active)) || emphasized || pulsing
        const heuristic = e.provenance?.some((item) => item.confidence === 'heuristic') ?? false
        ctx.setLineDash(heuristic ? [5, 4] : [])
        ctx.strokeStyle = touched
          ? resolveColor('var(--accent)')
          : heuristic
            ? resolveColor('var(--cat-5)')
            : line
        ctx.lineWidth = pulsing ? 3.2 : emphasized ? 2.2 : touched ? 1.8 : 1
        ctx.globalAlpha = emphasized || pulsing ? 0.98 : a.highlight && b.highlight ? (touched ? 0.95 : 0.55) : 0.12
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
        ctx.setLineDash([])
      })
      ctx.globalAlpha = 1

      // Knoten
      for (const s of sims) {
        const isActive = s.id === active || s.id === selected
        ctx.globalAlpha = s.highlight ? 1 : 0.18
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fillStyle = resolveColor(s.color)
        ctx.fill()
        // 2px Surface-Ring trennt überlappende Marken
        ctx.lineWidth = isActive ? 2.5 : 2
        ctx.strokeStyle = isActive ? resolveColor('var(--accent)') : surface
        ctx.stroke()
      }

      // Labels: nur größere Knoten + aktive (selektive Direktbeschriftung)
      ctx.font = '11.5px system-ui, sans-serif'
      ctx.textAlign = 'center'
      for (const s of sims) {
        const isActive = s.id === active || s.id === selected
        if (!isActive && s.r < 9) continue
        ctx.globalAlpha = s.highlight ? 1 : 0.25
        ctx.fillStyle = isActive ? ink : muted
        ctx.fillText(s.label, s.x, s.y - s.r - 5)
      }
      ctx.restore()
      ctx.globalAlpha = 1
    }

    function loop() {
      if (!running) return
      if (heatRef.current > 0 || gestureRef.current.mode === 'node') {
        step()
        heatRef.current = Math.max(0, heatRef.current - 1)
      }
      draw()
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => {
      running = false
      cancelAnimationFrame(raf)
    }
  }, [graph, highlightIds?.join(','), highlightEdgeKeys, selected, pulse])

  function clientToScreen(clientX: number, clientY: number): { x: number; y: number } {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 }
  }

  function clientToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const screen = clientToScreen(clientX, clientY)
    const camera = cameraRef.current
    return { x: (screen.x - camera.x) / camera.k, y: (screen.y - camera.y) / camera.k }
  }

  function pick(clientX: number, clientY: number): string | null {
    const point = clientToWorld(clientX, clientY)
    let best: { id: string; d: number } | null = null
    for (const s of simRef.current) {
      const d = Math.hypot(s.x - point.x, s.y - point.y)
      const tolerance = Math.max(s.r + 7 / cameraRef.current.k, 14 / cameraRef.current.k)
      if (d < tolerance && (!best || d < best.d)) best = { id: s.id, d }
    }
    return best?.id ?? null
  }

  function commitCamera(next: Camera): void {
    cameraRef.current = { ...next, k: Math.max(0.22, Math.min(4.5, next.k)) }
    setCameraLabel(`${Math.round(cameraRef.current.k * 100)} %`)
  }

  function zoomAt(factor: number, clientX?: number, clientY?: number): void {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const screen = clientX === undefined || clientY === undefined
      ? { x: 0, y: 0 }
      : clientToScreen(clientX, clientY)
    const current = cameraRef.current
    const nextK = Math.max(0.22, Math.min(4.5, current.k * factor))
    const worldX = (screen.x - current.x) / current.k
    const worldY = (screen.y - current.y) / current.k
    commitCamera({ x: screen.x - worldX * nextK, y: screen.y - worldY * nextK, k: nextK })
    if (!rect.width) return
  }

  function fitView(): void {
    const canvas = canvasRef.current
    const nodes = simRef.current
    if (!canvas || nodes.length === 0) return
    const rect = canvas.getBoundingClientRect()
    const xs = nodes.map((node) => node.x)
    const ys = nodes.map((node) => node.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const spanX = Math.max(120, maxX - minX)
    const spanY = Math.max(120, maxY - minY)
    const k = Math.max(0.22, Math.min(2.2, Math.min((rect.width - 72) / spanX, (rect.height - 72) / spanY)))
    commitCamera({ x: -((minX + maxX) / 2) * k, y: -((minY + maxY) / 2) * k, k })
  }

  function beginPinch(): void {
    const points = [...pointersRef.current.values()]
    if (points.length < 2) return
    const [a, b] = points
    gestureRef.current = {
      mode: 'pinch',
      pointerId: null,
      nodeId: null,
      startClientX: 0,
      startClientY: 0,
      startCamera: { ...cameraRef.current },
      startDistance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      startCenterX: (a.x + b.x) / 2,
      startCenterY: (a.y + b.y) / 2,
      moved: true,
    }
  }

  function endPointer(pointerId: number, clientX: number, clientY: number): void {
    const gesture = gestureRef.current
    if (gesture.mode === 'node' && gesture.pointerId === pointerId && !gesture.moved) {
      const id = pick(clientX, clientY)
      if (id === gesture.nodeId) onSelect?.(id)
    } else if (gesture.mode === 'pan' && gesture.pointerId === pointerId && !gesture.moved) {
      onSelect?.(null)
    }
    pointersRef.current.delete(pointerId)
    if (pointersRef.current.size === 1) {
      const [remainingId, point] = [...pointersRef.current.entries()][0]
      gestureRef.current = {
        mode: 'pan',
        pointerId: remainingId,
        nodeId: null,
        startClientX: point.x,
        startClientY: point.y,
        startCamera: { ...cameraRef.current },
        startDistance: 0,
        startCenterX: 0,
        startCenterY: 0,
        moved: true,
      }
    } else if (pointersRef.current.size === 0) {
      gestureRef.current.mode = 'idle'
      gestureRef.current.pointerId = null
      gestureRef.current.nodeId = null
    }
  }

  return (
    <div className="force-graph-shell" style={{ height }}>
      <canvas
        ref={canvasRef}
        className="force-graph-canvas"
        aria-label="Interaktiver Wissensgraph. Hintergrund ziehen zum Verschieben, Mausrad oder Pinch zum Zoomen, Knoten ziehen zum Anordnen."
        style={{ cursor: gestureRef.current.mode === 'pan' ? 'grabbing' : hover ? 'pointer' : 'grab' }}
        onWheel={(ev) => {
          ev.preventDefault()
          zoomAt(Math.exp(-ev.deltaY * 0.0015), ev.clientX, ev.clientY)
        }}
        onDoubleClick={() => fitView()}
        onPointerMove={(ev) => {
          pointersRef.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
          const gesture = gestureRef.current
          if (pointersRef.current.size >= 2) {
            if (gesture.mode !== 'pinch') beginPinch()
            const points = [...pointersRef.current.values()]
            const [a, b] = points
            const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))
            const centerClientX = (a.x + b.x) / 2
            const centerClientY = (a.y + b.y) / 2
            const startScreen = clientToScreen(gestureRef.current.startCenterX, gestureRef.current.startCenterY)
            const currentScreen = clientToScreen(centerClientX, centerClientY)
            const start = gestureRef.current.startCamera
            const worldX = (startScreen.x - start.x) / start.k
            const worldY = (startScreen.y - start.y) / start.k
            const k = start.k * (distance / gestureRef.current.startDistance)
            commitCamera({ x: currentScreen.x - worldX * k, y: currentScreen.y - worldY * k, k })
            return
          }
          if (gesture.mode === 'node' && gesture.pointerId === ev.pointerId) {
            const moved = Math.hypot(ev.clientX - gesture.startClientX, ev.clientY - gesture.startClientY) > 4
            gesture.moved ||= moved
            const s = simRef.current.find((node) => node.id === gesture.nodeId)
            if (s) {
              const point = clientToWorld(ev.clientX, ev.clientY)
              s.x = point.x
              s.y = point.y
              s.vx = 0
              s.vy = 0
              heatRef.current = Math.max(heatRef.current, 30)
            }
          } else if (gesture.mode === 'pan' && gesture.pointerId === ev.pointerId) {
            const dx = ev.clientX - gesture.startClientX
            const dy = ev.clientY - gesture.startClientY
            gesture.moved ||= Math.hypot(dx, dy) > 4
            commitCamera({
              x: gesture.startCamera.x + dx,
              y: gesture.startCamera.y + dy,
              k: gesture.startCamera.k,
            })
          } else {
            setHover(pick(ev.clientX, ev.clientY))
          }
        }}
        onPointerDown={(ev) => {
          pointersRef.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
          ;(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId)
          if (pointersRef.current.size >= 2) {
            beginPinch()
            return
          }
          const id = pick(ev.clientX, ev.clientY)
          gestureRef.current = {
            mode: id ? 'node' : 'pan',
            pointerId: ev.pointerId,
            nodeId: id,
            startClientX: ev.clientX,
            startClientY: ev.clientY,
            startCamera: { ...cameraRef.current },
            startDistance: 0,
            startCenterX: 0,
            startCenterY: 0,
            moved: false,
          }
          heatRef.current = Math.max(heatRef.current, id ? 45 : 0)
        }}
        onPointerUp={(ev) => endPointer(ev.pointerId, ev.clientX, ev.clientY)}
        onPointerCancel={(ev) => endPointer(ev.pointerId, ev.clientX, ev.clientY)}
        onPointerLeave={() => {
          if (gestureRef.current.mode === 'idle') setHover(null)
        }}
      />
      <div className="force-graph-controls" aria-label="Graphansicht steuern">
        <button type="button" onClick={() => zoomAt(1.25)} aria-label="Vergrößern">＋</button>
        <span>{cameraLabel}</span>
        <button type="button" onClick={() => zoomAt(0.8)} aria-label="Verkleinern">−</button>
        <button type="button" onClick={fitView}>Einpassen</button>
        <button
          type="button"
          onClick={() => {
            commitCamera({ x: 0, y: 0, k: 1 })
            heatRef.current = Math.max(heatRef.current, 100)
          }}
        >
          Neu ordnen
        </button>
      </div>
      <div className="force-graph-help">Ziehen: bewegen · Mausrad/Pinch: zoomen · Doppelklick: einpassen</div>
    </div>
  )
}
