/**
 * Exportiert das erste SVG-Chart innerhalb eines Containers als PNG (2×).
 * CSS-Variablen (var(--…)) werden vor der Serialisierung in konkrete Farben
 * aufgelöst, damit das Bild außerhalb der App identisch aussieht.
 */
export async function exportChartPng(container: HTMLElement, filename: string): Promise<void> {
  const svg = container.querySelector('svg')
  if (!svg) throw new Error('Kein Diagramm gefunden.')

  const clone = svg.cloneNode(true) as SVGSVGElement
  const origEls = [svg, ...Array.from(svg.querySelectorAll('*'))]
  const cloneEls = [clone, ...Array.from(clone.querySelectorAll('*'))]
  for (let i = 0; i < origEls.length; i++) {
    const cs = getComputedStyle(origEls[i] as Element)
    const el = cloneEls[i] as SVGElement
    if (cs.fill && cs.fill !== 'none') el.setAttribute('fill', cs.fill)
    if (cs.stroke && cs.stroke !== 'none') el.setAttribute('stroke', cs.stroke)
    if ((el as Element).tagName === 'text') {
      el.setAttribute('font-family', cs.fontFamily)
      el.setAttribute('font-size', cs.fontSize)
    }
  }
  // Hintergrund in Oberflächenfarbe
  const surface = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#faf9f5'
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  bg.setAttribute('width', '100%')
  bg.setAttribute('height', '100%')
  bg.setAttribute('fill', surface)
  clone.insertBefore(bg, clone.firstChild)

  const vb = svg.viewBox.baseVal
  const w = vb?.width || svg.clientWidth || 640
  const h = vb?.height || svg.clientHeight || 240
  clone.setAttribute('width', String(w))
  clone.setAttribute('height', String(h))
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

  const blobUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    await new Promise<void>((res, rej) => {
      img.onload = () => res()
      img.onerror = () => rej(new Error('SVG konnte nicht gerendert werden.'))
      img.src = blobUrl
    })
    const canvas = document.createElement('canvas')
    canvas.width = w * 2
    canvas.height = h * 2
    const ctx = canvas.getContext('2d')!
    ctx.scale(2, 2)
    ctx.drawImage(img, 0, 0, w, h)
    const png: Blob = await new Promise((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG-Export fehlgeschlagen.'))), 'image/png'),
    )
    const a = document.createElement('a')
    a.href = URL.createObjectURL(png)
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}
