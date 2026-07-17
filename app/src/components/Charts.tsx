import { useState } from 'react'

/**
 * Leichte SVG-Charts nach den Dataviz-Regeln:
 * dünne Marken, 2px Lücken, abgerundete Datenenden an der Basislinie,
 * selektive Direktbeschriftung (Relief-Regel für kontrastarme Serien),
 * Legende ab 2 Serien, Hover-Tooltip, Text in Ink-Farben (nie Serienfarbe).
 */

export interface Series {
  name: string
  color: string
  values: number[]
}

interface Tip {
  x: number
  y: number
  text: string
}

export function GroupedBars({
  categories,
  series,
  format = (v: number) => String(Math.round(v * 100) / 100),
  yMax,
  height = 240,
}: {
  categories: string[]
  series: Series[]
  format?: (v: number) => string
  yMax?: number
  height?: number
}) {
  const [tip, setTip] = useState<Tip | null>(null)
  const max = yMax ?? Math.max(0.0001, ...series.flatMap((s) => s.values)) * 1.15
  const W = 640
  const H = height
  const padL = 8
  const padB = 26
  const padT = 18
  const groupW = (W - padL) / categories.length
  const barW = Math.min(34, (groupW - 16) / series.length - 2)

  return (
    <div style={{ position: 'relative' }}>
      {series.length > 1 && (
        <div className="legend">
          {series.map((s) => (
            <span key={s.name}>
              <span className="sw" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img">
        {/* Gitterlinien (dezent) */}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={padL}
            x2={W}
            y1={padT + (H - padB - padT) * (1 - f)}
            y2={padT + (H - padB - padT) * (1 - f)}
            stroke="var(--grid)"
            strokeWidth={1}
          />
        ))}
        <line x1={padL} x2={W} y1={H - padB} y2={H - padB} stroke="var(--line)" strokeWidth={1.2} />
        {categories.map((cat, ci) => {
          const gx = padL + ci * groupW + (groupW - series.length * (barW + 2)) / 2
          return (
            <g key={cat}>
              {series.map((s, si) => {
                const v = s.values[ci] ?? 0
                const h = ((H - padB - padT) * v) / max
                const x = gx + si * (barW + 2)
                const y = H - padB - h
                return (
                  <g key={s.name}>
                    <rect
                      x={x}
                      y={y}
                      width={barW}
                      height={Math.max(h, v > 0 ? 3 : 0)}
                      rx={4}
                      ry={4}
                      fill={s.color}
                      onPointerEnter={(e) =>
                        setTip({ x: e.clientX, y: e.clientY, text: `${s.name} · ${cat}: ${format(v)}` })
                      }
                      onPointerMove={(e) => setTip({ x: e.clientX, y: e.clientY, text: `${s.name} · ${cat}: ${format(v)}` })}
                      onPointerLeave={() => setTip(null)}
                    />
                    {/* Basislinie überdeckt die untere Rundung → Datenende oben rund, unten bündig */}
                    <rect x={x} y={H - padB - 4} width={barW} height={v > 0 ? 4 : 0} fill={s.color} />
                    <text
                      x={x + barW / 2}
                      y={y - 5}
                      textAnchor="middle"
                      fontSize={11}
                      fill="var(--ink-2)"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {format(v)}
                    </text>
                  </g>
                )
              })}
              <text x={padL + ci * groupW + groupW / 2} y={H - 8} textAnchor="middle" fontSize={12} fill="var(--muted)">
                {cat}
              </text>
            </g>
          )
        })}
      </svg>
      {tip && (
        <div className="viz-tip" style={{ left: tip.x + 12, top: tip.y + 12 }}>
          {tip.text}
        </div>
      )}
    </div>
  )
}

export function HBar({
  rows,
  color = 'var(--cat-1)',
  format = (v: number) => String(v),
}: {
  rows: { label: string; value: number }[]
  color?: string
  format?: (v: number) => string
}) {
  const max = Math.max(0.0001, ...rows.map((r) => r.value))
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 64px', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 12.5, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.label}
          </span>
          <div style={{ background: 'var(--surface-2)', borderRadius: 6, height: 14 }}>
            <div
              style={{
                width: `${(r.value / max) * 100}%`,
                minWidth: r.value > 0 ? 6 : 0,
                height: '100%',
                borderRadius: 6,
                background: color,
              }}
            />
          </div>
          <span style={{ fontSize: 12.5, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--ink)' }}>
            {format(r.value)}
          </span>
        </div>
      ))}
    </div>
  )
}
