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
  const dragRef = useRef<{ id: string | null; ox: number; oy: number }>({ id: null, ox: 0, oy: 0 })
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
        if (dragRef.current.id !== s.id) {
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
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr
        canvas.height = h * dpr
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.save()
      ctx.translate(w / 2, h / 2)

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
        ctx.strokeStyle = touched ? resolveColor('var(--accent)') : line
        ctx.lineWidth = pulsing ? 3.2 : emphasized ? 2.2 : touched ? 1.8 : 1
        ctx.globalAlpha = emphasized || pulsing ? 0.98 : a.highlight && b.highlight ? (touched ? 0.95 : 0.55) : 0.12
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
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
      if (heatRef.current > 0 || dragRef.current.id) {
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

  function pick(ev: React.PointerEvent): string | null {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const x = ev.clientX - rect.left - rect.width / 2
    const y = ev.clientY - rect.top - rect.height / 2
    let best: { id: string; d: number } | null = null
    for (const s of simRef.current) {
      const d = Math.hypot(s.x - x, s.y - y)
      if (d < Math.max(s.r + 6, 14) && (!best || d < best.d)) best = { id: s.id, d }
    }
    return best?.id ?? null
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height, display: 'block', cursor: hover ? 'pointer' : 'grab', touchAction: 'none' }}
      onPointerMove={(ev) => {
        if (dragRef.current.id) {
          heatRef.current = Math.max(heatRef.current, 30)
          const canvas = canvasRef.current!
          const rect = canvas.getBoundingClientRect()
          const s = simRef.current.find((n) => n.id === dragRef.current.id)
          if (s) {
            s.x = ev.clientX - rect.left - rect.width / 2
            s.y = ev.clientY - rect.top - rect.height / 2
            s.vx = 0
            s.vy = 0
          }
        } else {
          setHover(pick(ev))
        }
      }}
      onPointerDown={(ev) => {
        const id = pick(ev)
        dragRef.current.id = id
        heatRef.current = Math.max(heatRef.current, 45)
        ;(ev.target as HTMLElement).setPointerCapture(ev.pointerId)
      }}
      onPointerUp={(ev) => {
        const id = pick(ev)
        if (id && id === dragRef.current.id) onSelect?.(id)
        else if (!id) onSelect?.(null)
        dragRef.current.id = null
      }}
    />
  )
}
