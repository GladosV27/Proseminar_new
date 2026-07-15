/** Kleine Effekt-Helfer: Konfetti (DOM/CSS, ohne Bibliothek) und Vibration. */

const CONFETTI_COLORS = ['#d97757', '#2a78d6', '#1baf7a', '#eda100', '#4a3aa7']

export function confetti(count = 90): void {
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:999;overflow:hidden'
  document.body.appendChild(host)
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span')
    const size = 6 + Math.random() * 7
    p.style.cssText = [
      'position:absolute',
      `left:${Math.random() * 100}vw`,
      'top:-16px',
      `width:${size}px`,
      `height:${size * (0.5 + Math.random())}px`,
      `background:${CONFETTI_COLORS[i % CONFETTI_COLORS.length]}`,
      `border-radius:${Math.random() > 0.5 ? '50%' : '2px'}`,
      `animation:confetti-fall ${1.8 + Math.random() * 1.6}s ease-in ${Math.random() * 0.6}s forwards`,
      `--drift:${(Math.random() - 0.5) * 240}px`,
      `--spin:${Math.round(Math.random() * 720 - 360)}deg`,
    ].join(';')
    host.appendChild(p)
  }
  setTimeout(() => host.remove(), 4200)
}

export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* optional */
  }
}
