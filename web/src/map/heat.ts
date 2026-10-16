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

/** scores: 0..100, 255 = not in grid. filter: >0 = filtered out. Returns [heatCanvas, filteredMaskCanvas]. */
export function gridCanvases(scores: Uint8Array, filter: Uint8Array): { heat: HTMLCanvasElement; mask: HTMLCanvasElement } {
  const heat = makeCanvas(720, 360)
  const mask = makeCanvas(720, 360)
  const hc = heat.getContext('2d')!
  const mc = mask.getContext('2d')!
  const hi = hc.createImageData(720, 360)
  const mi = mc.createImageData(720, 360)
  for (let i = 0; i < scores.length; i++) {
    const s = scores[i]
    if (s === 255) continue
    const j = Math.round((Math.min(s, 100) / 100) * 255) * 4
    hi.data.set(LUT.subarray(j, j + 4), i * 4)
    if (filter[i] > 0) { mi.data[i * 4 + 3] = 255 }
  }
  hc.putImageData(hi, 0, 0)
  mc.putImageData(mi, 0, 0)
  return { heat, mask }
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

export interface HeatState { heat: HTMLCanvasElement | null; mask: HTMLCanvasElement | null }

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
      return cv
    },
  })
  return new ImageLayer({ source, opacity: 1, properties: { id: 'heat' } })
}
