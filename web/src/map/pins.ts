// Map markers drawn on canvas (no data: or blob: URLs, so a strict img-src CSP keeps working). Spec §3:
// every marker has a 1.5 px space-950 outline + 1 px text-100 halo; selection is a three-band ring.
import Icon from 'ol/style/Icon'
import Style from 'ol/style/Style'
import { T } from './tokens'

const DPR = () => (typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 3) : 1)
const cache = new Map<string, Style>()

function canvas(w: number, h: number) {
  const r = DPR()
  const cv = document.createElement('canvas')
  cv.width = Math.ceil(w * r)
  cv.height = Math.ceil(h * r)
  const ctx = cv.getContext('2d')!
  ctx.scale(r, r)
  return { cv, ctx, r }
}

/** Stroke a path three times: halo (outermost), outline, then fill. */
function outlined(ctx: CanvasRenderingContext2D, path: Path2D, fill: string) {
  ctx.lineJoin = 'round'
  ctx.strokeStyle = T.halo
  ctx.lineWidth = 2 * (1.5 + 1)
  ctx.stroke(path)
  ctx.strokeStyle = T.outline
  ctx.lineWidth = 2 * 1.5
  ctx.stroke(path)
  ctx.fillStyle = fill
  ctx.fill(path)
}

function ring(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  // three-band ring: accent 3.5 px + space-950 2 px + text-100 1 px halo
  const band = (rad: number, w: number, col: string) => { ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke() }
  band(r + 3.5 + 1, 1, T.halo)
  band(r + 3.5 / 2 + 2, 3.5, T.selectRing)
  band(r + 1, 2, T.outline)
}

/** Earth portfolio pin: teardrop, head Ø 26 px, 42 px tall, tip on the location, number in the head. */
export function earthPin(n: number, selected = false): Style {
  const key = `earth|${n}|${selected}`
  const hit = cache.get(key)
  if (hit) return hit
  const pad = selected ? 9 : 3
  const W = 26 + 2 * pad
  const H = 42 + 2 * pad
  const { cv, ctx, r } = canvas(W, H)
  const cx = W / 2
  const cy = pad + 13
  const p = new Path2D()
  p.arc(cx, cy, 13, Math.PI * 0.82, Math.PI * 2.18)
  p.quadraticCurveTo(cx + 6, cy + 18, cx, pad + 42)
  p.quadraticCurveTo(cx - 6, cy + 18, cx + 13 * Math.cos(Math.PI * 0.82), cy + 13 * Math.sin(Math.PI * 0.82))
  p.closePath()
  if (selected) ring(ctx, cx, cy, 13)
  outlined(ctx, p, T.pinEarth)
  ctx.fillStyle = T.ink
  ctx.font = "600 14px 'JetBrains Mono', ui-monospace, monospace"
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(n), cx, cy + 0.5)
  const st = new Style({ image: new Icon({ img: cv, size: [cv.width, cv.height], scale: 1 / r, anchor: [0.5, (pad + 42) / H] }), zIndex: 100 - n + (selected ? 50 : 0) })
  cache.set(key, st)
  return st
}

/** Known analog: open square 14 px, ≥ 2 px text-100 stroke, then the outline + halo. */
export function knownPin(selected = false): Style {
  const key = `known|${selected}`
  const hit = cache.get(key)
  if (hit) return hit
  const S = 14 + (selected ? 18 : 6)
  const { cv, ctx, r } = canvas(S, S)
  const o = (S - 14) / 2
  const p = new Path2D()
  p.rect(o, o, 14, 14)
  if (selected) ring(ctx, S / 2, S / 2, 9)
  outlined(ctx, p, T.markerFill)
  ctx.strokeStyle = T.markerStroke
  ctx.lineWidth = 2
  ctx.strokeRect(o + 2, o + 2, 10, 10)
  const st = new Style({ image: new Icon({ img: cv, size: [cv.width, cv.height], scale: 1 / r }), zIndex: 20 })
  cache.set(key, st)
  return st
}

/** New candidate: 5-point star 18 px, space-950 fill, 2 px text-100 stroke, then the outline + halo. */
export function candidatePin(selected = false): Style {
  const key = `cand|${selected}`
  const hit = cache.get(key)
  if (hit) return hit
  const S = 18 + (selected ? 20 : 8)
  const { cv, ctx, r } = canvas(S, S)
  const cx = S / 2
  const cy = S / 2 + 1
  const p = new Path2D()
  for (let k = 0; k < 10; k++) {
    const rad = k % 2 === 0 ? 9 : 4
    const a = -Math.PI / 2 + (k * Math.PI) / 5
    const x = cx + rad * Math.cos(a)
    const y = cy + rad * Math.sin(a)
    if (k === 0) p.moveTo(x, y)
    else p.lineTo(x, y)
  }
  p.closePath()
  if (selected) ring(ctx, cx, cy, 10)
  outlined(ctx, p, T.markerFill)
  ctx.strokeStyle = T.markerStroke
  ctx.lineWidth = 1.5
  ctx.stroke(p)
  const st = new Style({ image: new Icon({ img: cv, size: [cv.width, cv.height], scale: 1 / r }), zIndex: 30 })
  cache.set(key, st)
  return st
}

/** Target pins (spec §3): Moon = circle Ø 24 px, Mars = diamond 30 px; a number inside for reverse-search twins. */
export function bodyPin(body: 'moon' | 'mars', n?: number): Style {
  const key = `body|${body}|${n ?? ''}`
  const hit = cache.get(key)
  if (hit) return hit
  const S = (body === 'moon' ? 24 : 30) + 8
  const { cv, ctx, r } = canvas(S, S)
  const c = S / 2
  const p = new Path2D()
  if (body === 'moon') p.arc(c, c, 12, 0, Math.PI * 2)
  else { p.moveTo(c, c - 15); p.lineTo(c + 15, c); p.lineTo(c, c + 15); p.lineTo(c - 15, c); p.closePath() }
  outlined(ctx, p, body === 'moon' ? T.pinMoon : T.pinMars)
  if (n !== undefined) {
    ctx.fillStyle = T.ink
    ctx.font = "600 13px 'JetBrains Mono', ui-monospace, monospace"
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(n), c, c + 0.5)
  }
  const st = new Style({ image: new Icon({ img: cv, size: [cv.width, cv.height], scale: 1 / r }), zIndex: 40 - (n ?? 0) })
  cache.set(key, st)
  return st
}

/** Small swatches for the legend / layer toggle (DOM canvases). */
export function swatch(kind: 'earth' | 'known' | 'candidate'): HTMLCanvasElement {
  const st = kind === 'earth' ? earthPin(1) : kind === 'known' ? knownPin() : candidatePin()
  return (st.getImage() as Icon).getImage(1) as HTMLCanvasElement
}
