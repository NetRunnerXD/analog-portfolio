// OpenLayers side of the twin viewer (spec §8.5 TwinViewer). Each pane is drawn in an oblique stereographic projection
// centred on its own site (lib/twin.ts), so one map resolution = the same metres per pixel on every body, north up.
// Imagery (NASA GIBS, NASA Solar System Treks) is reprojected from its native grid by OpenLayers. Underneath, the
// pipeline's Moon/Mars grids (lib/planetGrid.ts) draw a coarse relief layer, which is also the fallback when tiles fail.
import OlMap from 'ol/Map'
import View from 'ol/View'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import Polygon from 'ol/geom/Polygon'
import TileLayer from 'ol/layer/Tile'
import ImageLayer from 'ol/layer/Image'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import XYZ from 'ol/source/XYZ'
import ImageCanvasSource from 'ol/source/ImageCanvas'
import TileGrid from 'ol/tilegrid/TileGrid'
import GeoJSON from 'ol/format/GeoJSON'
import Projection from 'ol/proj/Projection'
import { addCoordinateTransforms, addProjection, get as getProjection } from 'ol/proj'
import { defaults as defaultControls } from 'ol/control/defaults'
import { Fill, Stroke, Style } from 'ol/style'
import { cellRing, circleRing, MARS_R, MOON_R, obliqueStereo, panePyramids, PYRAMIDS, spForward, spInverse, spScale, type TilePyramid } from '../lib/twin'
import { sampler, columnRange, type PlanetGrids } from '../lib/planetGrid'
import { bodyPin, knownPin } from './pins'
import { T } from './tokens'

export type PaneBody = 'earth' | 'moon' | 'mars'
export const radiusOf = (body: PaneBody, earthR: number) => (body === 'earth' ? earthR : body === 'moon' ? MOON_R : MARS_R)

/** Native tile projections, registered once. Units and metres per unit are per body so OpenLayers picks the right
 *  tile level when it reprojects. */
function sourceProjection(body: PaneBody, kind: 'deg' | 'sp', R: number): Projection {
  if (body === 'earth') return getProjection('EPSG:4326') as Projection
  const code = `TWIN:${body}:${kind}`
  const hit = getProjection(code)
  if (hit) return hit as Projection
  const p = kind === 'deg'
    ? new Projection({ code, units: 'degrees', metersPerUnit: (2 * Math.PI * R) / 360, extent: [-180, -90, 180, 90], worldExtent: [-180, -90, 180, 90], global: true, getPointResolution: (r) => r })
    : new Projection({ code, units: 'm', extent: [-1095930, -1095930, 1095930, 1095930], getPointResolution: (r, [x, y]) => r / spScale(spInverse([x, y], R)[1]) })
  addProjection(p)
  return p
}

/** The pane's own projection, with transforms to every source it draws. */
function localProjection(body: PaneBody, lat: number, lon: number, R: number, pyramids: TilePyramid[]): Projection {
  const code = `TWIN:LOCAL:${body}:${lat.toFixed(5)}:${lon.toFixed(5)}`
  const hit = getProjection(code)
  if (hit) return hit as Projection
  const st = obliqueStereo(lat, lon, R)
  const L = 2 * R
  const local = new Projection({ code, units: 'm', extent: [-L, -L, L, L], getPointResolution: (r, [x, y]) => r / (1 + (Math.hypot(x, y) / (2 * R)) ** 2) })
  addProjection(local)
  const kinds = new Set<'deg' | 'sp'>(['deg', ...pyramids.map((p) => p.kind)])
  for (const kind of kinds) {
    const src = sourceProjection(body, kind, R)
    if (kind === 'deg') addCoordinateTransforms(local, src, (c) => st.inverse(c), (c) => st.forward(c))
    else addCoordinateTransforms(local, src, (c) => spForward(st.inverse(c), R), (c) => st.forward(spInverse(c, R)))
  }
  return local
}

export interface PaneOptions {
  target: HTMLElement
  body: PaneBody
  lat: number
  lon: number
  earthR: number
  resolution: number
  /** ring (lon/lat) of the footprint to outline: the 0.5° Earth cell, or the target's sampling window */
  footprint: number[][]
  pin?: { body: 'moon' | 'mars'; n?: number }
  grids?: PlanetGrids | null
  onTiles: (state: { loaded: number; failed: number }) => void
}

export interface Pane { map: OlMap; view: View; dispose(): void; setGrids(g: PlanetGrids | null): void }

export function createPane(o: PaneOptions): Pane {
  const R = radiusOf(o.body, o.earthR)
  const pyramids = panePyramids(o.body, o.lat)
  const proj = localProjection(o.body, o.lat, o.lon, R, pyramids)
  const st = obliqueStereo(o.lat, o.lon, R)
  const tiles = { loaded: 0, failed: 0 }
  const tileLayers = pyramids.map((py, i) => {
    const src = new XYZ({
      url: py.url, projection: sourceProjection(o.body, py.kind, R), wrapX: false, interpolate: true, transition: 0,
      tileGrid: new TileGrid({ origin: py.origin, extent: py.extent, tileSize: py.tileSize, resolutions: Array.from({ length: py.maxZ + 1 }, (_, z) => py.res0 / 2 ** z) }),
      attributions: py.credit,
    })
    src.on('tileloadend', () => { tiles.loaded++; o.onTiles({ ...tiles }) })
    src.on('tileloaderror', () => { tiles.failed++; o.onTiles({ ...tiles }) })
    return new TileLayer({ source: src, opacity: i === 0 ? 1 : 0.55, properties: { id: `tiles-${i}` } })
  })

  // Coarse relief from the decoded pipeline grid (Moon / Mars) or Natural Earth land (Earth): always drawn underneath.
  let grids: PlanetGrids | null = o.grids ?? null
  const relief = new ImageLayer({
    source: new ImageCanvasSource({
      projection: proj,
      ratio: 1,
      canvasFunction: (extent, _resolution, _pixelRatio, size) => {
        const cv = document.createElement('canvas')
        cv.width = Math.max(1, Math.round(size[0])); cv.height = Math.max(1, Math.round(size[1]))
        const ctx = cv.getContext('2d')!
        ctx.fillStyle = T.landNoData
        ctx.fillRect(0, 0, cv.width, cv.height)
        if (!grids) return cv
        const at = sampler(grids, 'elevation_m')
        const [lo, hi] = columnRange(grids, 'elevation_m')
        const step = 4
        const w = Math.ceil(cv.width / step), h = Math.ceil(cv.height / step)
        const small = document.createElement('canvas'); small.width = w; small.height = h
        const sctx = small.getContext('2d')!
        const img = sctx.createImageData(w, h)
        const rx = (extent[2] - extent[0]) / w, ry = (extent[3] - extent[1]) / h
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
          const [lon, lat] = st.inverse([extent[0] + (i + 0.5) * rx, extent[3] - (j + 0.5) * ry])
          const v = at(lat, lon)
          const g = Number.isFinite(v) && hi > lo ? 40 + Math.round(150 * ((v - lo) / (hi - lo))) : 22
          const k = 4 * (j * w + i)
          img.data[k] = g; img.data[k + 1] = g; img.data[k + 2] = g + 6; img.data[k + 3] = 255
        }
        sctx.putImageData(img, 0, 0)
        ctx.imageSmoothingEnabled = true
        ctx.drawImage(small, 0, 0, cv.width, cv.height)
        return cv
      },
    }),
    properties: { id: 'relief' },
  })
  const layers: (TileLayer | ImageLayer<ImageCanvasSource> | VectorLayer)[] = []
  if (o.body === 'earth') {
    const land = new VectorSource({ url: `${import.meta.env.BASE_URL}basemap/ne_50m_land.json`, format: new GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: proj }) })
    layers.push(new VectorLayer({ source: land, style: new Style({ fill: new Fill({ color: T.landNoData }), stroke: new Stroke({ color: T.coastline, width: 0.8 }) }) }))
  } else layers.push(relief)
  layers.push(...tileLayers)

  const overlay = new VectorSource()
  const ring = new Feature(new Polygon([o.footprint.map((c) => st.forward(c))]))
  ring.setStyle(new Style({ stroke: new Stroke({ color: T.halo, width: 3 }) }))
  const ringInner = new Feature(new Polygon([o.footprint.map((c) => st.forward(c))]))
  ringInner.setStyle(new Style({ stroke: new Stroke({ color: o.body === 'earth' ? T.pinEarth : o.body === 'moon' ? T.pinMoon : T.pinMars, width: 1.5, lineDash: [6, 4] }) }))
  overlay.addFeatures([ring, ringInner])
  if (o.pin) { const pt = new Feature(new Point([0, 0])); pt.setStyle(bodyPin(o.pin.body, o.pin.n)); overlay.addFeature(pt) }
  layers.push(new VectorLayer({ source: overlay, properties: { id: 'overlay' } }))

  const view = new View({ projection: proj, center: [0, 0], resolution: o.resolution, minResolution: 2, maxResolution: 40000, extent: [-R, -R, R, R], constrainOnlyCenter: true, enableRotation: false, constrainResolution: false })
  const map = new OlMap({ target: o.target, layers, view, controls: defaultControls({ zoom: true, rotate: false, attribution: true, attributionOptions: { collapsible: false } }) })
  return {
    map, view,
    dispose: () => map.setTarget(undefined),
    setGrids: (g) => { grids = g; relief.getSource()?.changed() },
  }
}

/** Footprint rings in lon/lat: the scored 0.5° Earth cell, or a target's sampling disc. */
export const earthFootprint = (lat: number, lon: number) => cellRing(lat, lon)
export const targetFootprint = (lat: number, lon: number, radiusKm: number, R: number) => circleRing([lon, lat], radiusKm * 1000, R)

/** Whole-body map in the imagery's own geographic grid (reverse search): EQ tiles over the grid relief, numbered pins. */
export function createGlobe(target: HTMLElement, body: 'moon' | 'mars', earthR: number, onTiles: (s: { loaded: number; failed: number }) => void) {
  const R = radiusOf(body, earthR)
  const py = body === 'moon' ? PYRAMIDS.moonEq : PYRAMIDS.mars
  const proj = sourceProjection(body, 'deg', R)
  const tiles = { loaded: 0, failed: 0 }
  const src = new XYZ({
    url: py.url, projection: proj, wrapX: true, interpolate: true, attributions: py.credit,
    tileGrid: new TileGrid({ origin: py.origin, extent: py.extent, tileSize: py.tileSize, resolutions: Array.from({ length: py.maxZ + 1 }, (_, z) => py.res0 / 2 ** z) }),
  })
  src.on('tileloadend', () => { tiles.loaded++; onTiles({ ...tiles }) })
  src.on('tileloaderror', () => { tiles.failed++; onTiles({ ...tiles }) })
  const pins = new VectorSource()
  const map = new OlMap({
    target,
    layers: [new TileLayer({ source: src }), new VectorLayer({ source: pins })],
    view: new View({ projection: proj, center: [0, 0], zoom: 0, extent: [-180, -90, 180, 90], constrainOnlyCenter: true, enableRotation: false, showFullExtent: true }),
    controls: defaultControls({ zoom: true, rotate: false, attribution: true, attributionOptions: { collapsible: false } }),
  })
  map.getView().fit([-180, -90, 180, 90])
  return {
    map,
    setPins(list: { lat: number; lon: number; n: number }[]) {
      pins.clear()
      for (const p of list) { const f = new Feature(new Point([p.lon, p.lat])); f.setStyle(bodyPin(body, p.n)); pins.addFeature(f) }
    },
    dispose: () => map.setTarget(undefined),
  }
}

/** Small Earth locator for reverse search: Natural Earth land, one pin, click to pick a point. */
export function createLocator(target: HTMLElement, onPick: (lat: number, lon: number) => void) {
  const land = new VectorSource({ url: `${import.meta.env.BASE_URL}basemap/ne_50m_land.json`, format: new GeoJSON() })
  const pin = new VectorSource()
  const map = new OlMap({
    target,
    layers: [new VectorLayer({ source: land, style: new Style({ fill: new Fill({ color: T.landNoData }), stroke: new Stroke({ color: T.coastline, width: 0.8 }) }) }), new VectorLayer({ source: pin })],
    view: new View({ projection: 'EPSG:4326', center: [0, 15], zoom: 0, extent: [-180, -90, 180, 90], constrainOnlyCenter: true, enableRotation: false }),
    controls: defaultControls({ zoom: true, rotate: false, attribution: false }),
  })
  map.getView().fit([-180, -60, 180, 80])
  map.on('singleclick', (e) => { const [lon, lat] = e.coordinate; onPick(lat, lon) })
  return {
    setPin(lat: number, lon: number) {
      pin.clear()
      const f = new Feature(new Point([lon, lat])); f.setStyle(knownPin(true)); pin.addFeature(f)
      map.getView().animate({ center: [lon, lat], duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300 })
    },
    dispose: () => map.setTarget(undefined),
  }
}
