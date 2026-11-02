// Heat layer (spec §4): 720×360 score grid drawn crisp (no smoothing) with the cividis LUT, filtered cells dimmed with
// bg @ 90% then hatched (#66718C, 45°, 6 px period, 1.5 px) in screen pixels.
import ImageLayer from 'ol/layer/Image'
import ImageCanvasSource from 'ol/source/ImageCanvas'
import { HEAT_STOPS, T } from './tokens'

export function buildLut(stops = HEAT_STOPS): Uint8ClampedArray {
  const rgb = stops.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)))
  const lut = new Uint8ClampedArray(256 * 4)
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * (stops.length - 1)
    const k = Math.min(Math.floor(t), stops.length - 2)
    const f = t - k
    for (let ch = 0; ch < 3; ch++) lut[i * 4 + ch] = rgb[k][ch] + (rgb[k + 1][ch] - rgb[k][ch]) * f
    lut[i * 4 + 3] = 245 // ≈ 0.96 opacity
  }
  return lut
}
const LUT = buildLut()

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  return cv
}

export type HeatMode = 'view' | 'absolute'

/**
 * "In this view" colouring: a 101-entry lookup score → cos(lat) area-weighted mid-rank percentile (0–100) of that score
 * among the scorable, unfiltered land cells whose centres are inside `extent` (EPSG:4326, may extend past ±180°).
 * Returns null when the view holds no such cell (then the absolute scale is used).
 */
export function viewLut(scores: Uint8Array, filter: Uint8Array, extent: number[]): Uint8Array | null {
  const w = new Float64Array(101)
  const [x0, y0, x1, y1] = extent
  const wide = x1 - x0 >= 360
  const r0 = Math.max(0, Math.floor((90 - Math.min(90, y1)) * 2))
  const r1 = Math.min(359, Math.floor((90 - Math.max(-90, y0)) * 2))
  for (let r = r0; r <= r1; r++) {
    const lat = 89.75 - 0.5 * r
    if (lat < y0 || lat > y1) continue
    const cw = Math.cos((lat * Math.PI) / 180)
    for (let c = 0; c < 720; c++) {
      if (!wide) {
        const lon = -179.75 + 0.5 * c
        const k = Math.ceil((x0 - lon) / 360) // shift into [x0, x0 + 360)
        if (lon + 360 * k > x1) continue
      }
      const i = r * 720 + c
      const v = scores[i]
      if (v === 255 || filter[i] !== 0) continue
      w[Math.min(v, 100)] += cw
    }
  }
  let tot = 0
  for (const x of w) tot += x
  if (!(tot > 0)) return null
  const lut = new Uint8Array(101)
  let below = 0
  for (let v = 0; v <= 100; v++) { lut[v] = Math.round((100 * (below + 0.5 * w[v])) / tot); below += w[v] }
  return lut
}

/** Filter code for cells without enough data to score (matches INSUFFICIENT_CODE in scoring/engine.ts). */
export const INSUFFICIENT = 255

/** scores: 0..100, 255 = not in grid / no score. filter: >0 = filtered out, 255 = not enough data.
 *  Returns the heat canvas, the filtered-cell mask and the insufficient-data mask. */
export function gridCanvases(scores: Uint8Array, filter: Uint8Array, lut?: Uint8Array | null): { heat: HTMLCanvasElement; mask: HTMLCanvasElement; insuf: HTMLCanvasElement } {
  const heat = makeCanvas(720, 360)
  const mask = makeCanvas(720, 360)
  const insuf = makeCanvas(720, 360)
  const hc = heat.getContext('2d')!
  const mc = mask.getContext('2d')!
  const ic = insuf.getContext('2d')!
  const hi = hc.createImageData(720, 360)
  const mi = mc.createImageData(720, 360)
  const ii = ic.createImageData(720, 360)
  for (let i = 0; i < scores.length; i++) {
    const s = scores[i]
    if (filter[i] === INSUFFICIENT) { ii.data[i * 4 + 3] = 255; continue }
    if (s === 255) continue
    const v = lut ? lut[Math.min(s, 100)] : Math.min(s, 100)
    const j = Math.round((v / 100) * 255) * 4
    hi.data.set(LUT.subarray(j, j + 4), i * 4)
    if (filter[i] > 0) { mi.data[i * 4 + 3] = 255 }
  }
  hc.putImageData(hi, 0, 0)
  mc.putImageData(mi, 0, 0)
  ic.putImageData(ii, 0, 0)
  return { heat, mask, insuf }
}

/** "Not enough data": 1.5 px dots on a 6 px grid in the hatch colour, over the no-data land fill. */
function dotTile(pixelRatio: number): HTMLCanvasElement {
  const p = Math.round(6 * pixelRatio)
  const cv = makeCanvas(p, p)
  const ctx = cv.getContext('2d')!
  ctx.fillStyle = T.hatch
  ctx.beginPath()
  ctx.arc(p / 2, p / 2, 0.9 * pixelRatio, 0, Math.PI * 2)
  ctx.fill()
  return cv
}

function hatchTile(pixelRatio: number): HTMLCanvasElement {
  const p = Math.round(6 * pixelRatio)
  const cv = makeCanvas(p, p)
  const ctx = cv.getContext('2d')!
  ctx.strokeStyle = T.hatch
  ctx.lineWidth = 1.5 * pixelRatio
  ctx.beginPath()
  for (const o of [-p, 0, p]) { ctx.moveTo(o, p); ctx.lineTo(o + p, 0) }
  ctx.stroke()
  return cv
}

export interface HeatState { heat: HTMLCanvasElement | null; mask: HTMLCanvasElement | null; insuf?: HTMLCanvasElement | null }

export function makeHeatLayer(state: HeatState): ImageLayer<ImageCanvasSource> {
  const source = new ImageCanvasSource({
    projection: 'EPSG:4326',
    ratio: 1,
    canvasFunction: (extent, _resolution, pixelRatio, size) => {
      const cv = makeCanvas(size[0], size[1])
      if (!state.heat || !state.mask) return cv
      const ctx = cv.getContext('2d')!
      ctx.imageSmoothingEnabled = false
      const sx = size[0] / (extent[2] - extent[0])
      const sy = size[1] / (extent[3] - extent[1])
      const offs: number[] = []
      for (let off = Math.floor((extent[0] + 180) / 360) * 360; off - 180 < extent[2]; off += 360) offs.push(off)
      const draw = (img: HTMLCanvasElement, c2: CanvasRenderingContext2D) => {
        c2.imageSmoothingEnabled = false
        for (const off of offs) c2.drawImage(img, (-180 + off - extent[0]) * sx, (extent[3] - 90) * sy, 360 * sx, 180 * sy)
      }
      draw(state.heat, ctx)
      // filtered: 1) dim with bg @ 90 %, 2) 45° hatch in screen space, both clipped to filtered cells
      const dim = makeCanvas(size[0], size[1])
      const dc = dim.getContext('2d')!
      draw(state.mask, dc)
      dc.globalCompositeOperation = 'source-in'
      dc.fillStyle = T.bg
      dc.globalAlpha = 0.9
      dc.fillRect(0, 0, size[0], size[1])
      ctx.drawImage(dim, 0, 0)
      const hatch = makeCanvas(size[0], size[1])
      const hcx = hatch.getContext('2d')!
      hcx.fillStyle = hcx.createPattern(hatchTile(pixelRatio), 'repeat')!
      hcx.fillRect(0, 0, size[0], size[1])
      hcx.globalCompositeOperation = 'destination-in'
      draw(state.mask, hcx)
      ctx.drawImage(hatch, 0, 0)
      if (state.insuf) {
        const dots = makeCanvas(size[0], size[1])
        const dcx = dots.getContext('2d')!
        dcx.fillStyle = T.landNoData
        dcx.fillRect(0, 0, size[0], size[1])
        dcx.fillStyle = dcx.createPattern(dotTile(pixelRatio), 'repeat')!
        dcx.fillRect(0, 0, size[0], size[1])
        dcx.globalCompositeOperation = 'destination-in'
        draw(state.insuf, dcx)
        ctx.drawImage(dots, 0, 0)
      }
      return cv
    },
  })
  return new ImageLayer({ source, opacity: 1, properties: { id: 'heat' } })
}
