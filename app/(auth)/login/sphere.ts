/**
 * The brand sphere — design.md §7.6. Drawn on a 2D canvas: a 255° gradient of
 * the Nove blues, five drifting colour fields, a wandering dimple, a highlight
 * and a rim light, inside three hairline rings. No WebGL needed.
 */

export interface Circle {
  x: number
  y: number
  r: number
}

// sky → royal → navy → mist (logo navy #032F6E, PYS royal and sky)
const STOPS: [number, string][] = [
  [0, '#39b4f8'],
  [0.3, '#0462f2'],
  [0.65, '#032f6e'],
  [1, '#d6e4fe'],
]

// rgb, speed, phase, alpha
const FIELDS: [string, number, number, number][] = [
  ['57,180,248', 0.00023, 0, 0.6],
  ['4,98,242', 0.00017, 2.1, 0.55],
  ['3,47,110', 0.00021, 4.2, 0.5],
  ['214,228,254', 0.00013, 1.2, 0.45],
  ['255,255,255', 0.00019, 3.3, 0.25],
]

const RINGS: [number, number][] = [
  [1.28, 0.16],
  [1.62, 0.11],
  [2.05, 0.07],
]

export function paintSphere(cx: CanvasRenderingContext2D, { x, y, r }: Circle, t: number) {
  if (r < 0.5) return

  cx.lineWidth = 1
  for (const [k, a] of RINGS) {
    cx.strokeStyle = `rgba(29,29,29,${a})`
    cx.beginPath()
    cx.arc(x, y, r * k, 0, Math.PI * 2)
    cx.stroke()
  }

  cx.save()
  cx.beginPath()
  cx.arc(x, y, r, 0, Math.PI * 2)
  cx.clip()

  const fill = (style: CanvasGradient) => {
    cx.fillStyle = style
    cx.fillRect(x - r, y - r, r * 2, r * 2)
  }

  const angle = ((255 - 90) * Math.PI) / 180 + Math.sin(t * 0.00011) * 0.7
  const dx = Math.cos(angle) * r
  const dy = Math.sin(angle) * r
  const base = cx.createLinearGradient(x - dx, y - dy, x + dx, y + dy)
  for (const [o, c] of STOPS) base.addColorStop(o, c)
  fill(base)

  for (const [rgb, speed, phase, alpha] of FIELDS) {
    const bx = x + r * 0.5 * Math.cos(t * speed + phase)
    const by = y + r * 0.5 * Math.sin(t * speed * 1.31 + phase)
    const g = cx.createRadialGradient(bx, by, 0, bx, by, r * 0.95)
    g.addColorStop(0, `rgba(${rgb},${alpha})`)
    g.addColorStop(1, `rgba(${rgb},0)`)
    fill(g)
  }

  const vx = x + r * 0.25 * Math.cos(t * 0.00009 + 1)
  const vy = y - r * 0.45 + r * 0.1 * Math.sin(t * 0.00012)
  const dimple = cx.createRadialGradient(vx, vy, r * 0.02, vx, vy, r * 0.3)
  dimple.addColorStop(0, 'rgba(255,255,255,0)')
  dimple.addColorStop(0.45, 'rgba(255,255,255,.3)')
  dimple.addColorStop(0.6, 'rgba(3,47,110,.18)')
  dimple.addColorStop(1, 'rgba(255,255,255,0)')
  fill(dimple)

  const hx = x - r * 0.32
  const hy = y - r * 0.38
  const light = cx.createRadialGradient(hx, hy, 0, hx, hy, r * 0.75)
  light.addColorStop(0, 'rgba(255,255,255,.5)')
  light.addColorStop(1, 'rgba(255,255,255,0)')
  fill(light)

  const rim = cx.createRadialGradient(x, y, r * 0.55, x, y, r)
  rim.addColorStop(0, 'rgba(255,255,255,0)')
  rim.addColorStop(1, 'rgba(214,228,254,.4)')
  fill(rim)

  cx.restore()
}
