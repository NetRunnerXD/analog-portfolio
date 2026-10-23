import { useEffect, useMemo, useRef, useState } from 'react'
import OlMap from 'ol/Map'
import View from 'ol/View'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import GeoJSON from 'ol/format/GeoJSON'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import { Fill, Stroke, Style } from 'ol/style'
import { defaults as defaultControls } from 'ol/control/defaults'
import { boundingExtent } from 'ol/extent'
import type { MapBrowserEvent } from 'ol'
import 'ol/ol.css'
import { band, fmtLatLon } from '../lib/format'
import { makeHeatLayer, gridCanvases, INSUFFICIENT, type HeatState } from './heat'
import { candidatePin, earthPin, knownPin } from './pins'
import { T } from './tokens'
import { measurePadding, offsetCenter } from './padding'

/** Overlays can live outside the map wrapper (phone sheet, tablet drawer), so search the whole screen. */
const overlayRoot = (e: HTMLElement): ParentNode => e.closest('main') ?? document

export interface MapPin { id: string; kind: 'portfolio' | 'known' | 'candidate'; n?: number; lat: number; lon: number; label: string; tooltip: string }
export interface HeatGrid { scores: Uint8Array; filter: Uint8Array }
export interface TooltipContent { lines: string[]; x: number; y: number }

interface Props {
  heat: HeatGrid | null
  pins: MapPin[]
  selectedId?: string | null
  hoveredId?: string | null
  /** Bumped when the map should re-frame on the portfolio pins */
  fitKey?: string
  ariaLabel: string
  describedBy?: string
  filterText: (code: number) => string
  closest?: (cellId: number) => Promise<string | null>
  onSelectPin?: (id: string) => void
  onHoverPin?: (id: string | null) => void
  showLabels?: boolean
  children?: React.ReactNode
}

const LAND_URL = `${import.meta.env.BASE_URL}basemap/ne_50m_land.json`
// Home view: all inhabited land (Antarctica's coast to the High Arctic), fitted to whatever size the map column has.
const HOME = { center: [0, 15], zoom: 1.6, extent: [-180, -62, 180, 84] as [number, number, number, number] }

export default function MapView(p: Props) {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<OlMap | null>(null)
  const heatState = useRef<HeatState>({ heat: null, mask: null })
  const heatLayer = useRef(makeHeatLayer(heatState.current))
  const pinSrc = useRef(new VectorSource())
  const props = useRef(p)
  props.current = p
  const [tip, setTip] = useState<TooltipContent | null>(null)
  const [zoom, setZoom] = useState(HOME.zoom)

  useEffect(() => {
    if (!el.current) return
    const landSrc = new VectorSource({ url: LAND_URL, format: new GeoJSON() })
    const land = new VectorLayer({ source: landSrc, style: new Style({ fill: new Fill({ color: T.landNoData }) }), properties: { id: 'land' } })
    const coast = new VectorLayer({ source: landSrc, style: new Style({ stroke: new Stroke({ color: T.coastline, width: 0.8 }) }), properties: { id: 'coast' } })
    const pins = new VectorLayer({ source: pinSrc.current, properties: { id: 'pins' }, declutter: false })
    const map = new OlMap({
      target: el.current,
      layers: [land, heatLayer.current, coast, pins],
      controls: defaultControls({ zoom: false, rotate: false, attribution: false }),
      view: new View({ projection: 'EPSG:4326', center: HOME.center, zoom: HOME.zoom, minZoom: 0, maxZoom: 8, enableRotation: false, showFullExtent: true, multiWorld: true, constrainOnlyCenter: true, extent: [-540, -150, 540, 150] }),
    })
    mapRef.current = map
    if (import.meta.env.DEV) (window as unknown as { __olmap: OlMap }).__olmap = map
    let raf = 0
    const onMove = (e: MapBrowserEvent) => {
      if (e.dragging) return
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const feat = map.forEachFeatureAtPixel(e.pixel, (f) => f, { hitTolerance: 8 })
        const id = (feat?.get('pinId') as string | undefined) ?? null
        props.current.onHoverPin?.(id)
        el.current!.style.cursor = id ? 'pointer' : ''
        if (feat) { setTip({ lines: [String(feat.get('tooltip'))], x: e.pixel[0], y: e.pixel[1] }); return }
        const [lon0, lat] = e.coordinate
        const lon = ((((lon0 + 180) % 360) + 360) % 360) - 180
        const h = props.current.heat
        if (!h || lat > 90 || lat < -90) { setTip(null); return }
        const col = Math.min(Math.floor((lon + 180) * 2), 719)
        const row = Math.min(Math.floor((90 - lat) * 2), 359)
        const cid = row * 720 + col
        const s = h.scores[cid]
        const cLat = 89.75 - 0.5 * row
        const cLon = -179.75 + 0.5 * col
        const where = fmtLatLon(cLat, cLon, 2)
        if (h.filter[cid] === INSUFFICIENT) { setTip({ lines: [props.current.filterText(INSUFFICIENT), where], x: e.pixel[0], y: e.pixel[1] }); return }
        if (s === 255) { setTip(null); return }
        if (h.filter[cid] > 0) { setTip({ lines: [props.current.filterText(h.filter[cid]), where], x: e.pixel[0], y: e.pixel[1] }); return }
        const base = [`${s} / 100 · ${band(s)} match`, where]
        setTip({ lines: base, x: e.pixel[0], y: e.pixel[1] })
        props.current.closest?.(cid).then((c) => {
          if (c) setTip((t) => (t && t.x === e.pixel[0] && t.y === e.pixel[1] ? { ...t, lines: [...base, c] } : t))
        })
      })
    }
    map.on('pointermove', onMove)
    map.getViewport()?.addEventListener('pointerleave', () => { setTip(null); props.current.onHoverPin?.(null) })
    map.on('singleclick', (e) => {
      const feat = map.forEachFeatureAtPixel(e.pixel, (f) => f, { hitTolerance: 8 })
      const id = feat?.get('pinId') as string | undefined
      if (id) props.current.onSelectPin?.(id)
    })
    const fitHome = () => { if (map.getSize()?.[0]) map.getView().fit(HOME.extent, { padding: [24, 24, 24, 24] }) }
    map.once('change:size', fitHome)
    fitHome()
    map.getView().on('change:resolution', () => setZoom(map.getView().getZoom() ?? HOME.zoom))
    return () => { cancelAnimationFrame(raf); map.setTarget(undefined); mapRef.current = null }
  }, [])

  // heat grid → canvases
  useEffect(() => {
    if (!p.heat) { heatState.current.heat = null; heatState.current.mask = null; heatState.current.insuf = null }
    else Object.assign(heatState.current, gridCanvases(p.heat.scores, p.heat.filter))
    heatLayer.current.getSource()?.changed()
    const lyr = heatLayer.current
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) { lyr.setOpacity(1); return }
    let start = 0
    let raf = 0
    const step = (t: number) => {
      if (!start) start = t
      const k = Math.min(1, (t - start) / 450)
      lyr.setOpacity(0.35 + 0.65 * k)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [p.heat])

  // pins
  useEffect(() => {
    const src = pinSrc.current
    src.clear()
    for (const pin of p.pins) {
      const sel = pin.id === p.selectedId || pin.id === p.hoveredId
      const f = new Feature({ geometry: new Point([pin.lon, pin.lat]), pinId: pin.id, tooltip: pin.tooltip })
      f.setStyle(pin.kind === 'portfolio' ? earthPin(pin.n ?? 1, sel) : pin.kind === 'known' ? knownPin(sel) : candidatePin(sel))
      src.addFeature(f)
    }
  }, [p.pins, p.selectedId, p.hoveredId])

  // fit to portfolio pins when asked
  useEffect(() => {
    const map = mapRef.current
    if (!map || !p.fitKey) return
    const pts = p.pins.filter((x) => x.kind === 'portfolio').map((x) => [x.lon, x.lat])
    if (!pts.length) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    // padding accounts for the legend, the phone bottom sheet, the tablet drawer and banners (data-map-obscures)
    const padding = measurePadding(el.current!, overlayRoot(el.current!), [72, 64, 48, 64])
    map.getView().fit(boundingExtent(pts), { padding, maxZoom: 4, duration: reduce ? 0 : 600 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.fitKey])

  // fly to selected portfolio pin
  useEffect(() => {
    const map = mapRef.current
    const pin = p.pins.find((x) => x.id === p.selectedId)
    if (!map || !pin) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const view = map.getView()
    const zoom = Math.max(view.getZoom() ?? 2, 3)
    const padding = measurePadding(el.current!, overlayRoot(el.current!))
    const center = offsetCenter([pin.lon, pin.lat], padding, view.getResolutionForZoom(zoom))
    view.animate({ center, zoom, duration: reduce ? 0 : 600 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.selectedId])

  const zoomBy = (d: number) => { const v = mapRef.current?.getView(); if (v) v.animate({ zoom: (v.getZoom() ?? 2) + d, duration: 200 }) }
  const reset = () => mapRef.current?.getView().fit(HOME.extent, { padding: [24, 24, 24, 24], duration: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 300 })
  const onKey = (e: React.KeyboardEvent) => { if (e.key === '0') { e.preventDefault(); reset() } }

  const labels = useMemo(() => (p.showLabels || zoom >= 3 ? p.pins.filter((x) => x.kind === 'portfolio') : []), [p.pins, p.showLabels, zoom])
  const [labelPx, setLabelPx] = useState<Record<string, [number, number]>>({})
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const upd = () => setLabelPx(Object.fromEntries(labels.map((l) => [l.id, map.getPixelFromCoordinate([l.lon, l.lat]) as [number, number]]).filter(([, px]) => px)))
    upd()
    const k = map.on('postrender', upd)
    return () => { map.un('postrender', k.listener) }
  }, [labels])

  return (
    <div className="map-wrap">
      <div ref={el} className="map" role="region" aria-label={p.ariaLabel} aria-describedby={p.describedBy} tabIndex={0} onKeyDown={onKey} />
      {labels.map((l) => labelPx[l.id] && (
        <span key={l.id} className="pin-label" aria-hidden="true" style={{ left: labelPx[l.id][0] + 16, top: labelPx[l.id][1] - 30 }}>{l.label}</span>
      ))}
      {tip && (
        <div className="map-tooltip" role="tooltip" style={{ left: tip.x + 12, top: tip.y + 12 }}>
          {tip.lines.map((l, i) => <div key={i} className={i === 0 ? 'num' : 'small'}>{l}</div>)}
        </div>
      )}
      <div className="map-controls">
        <button type="button" className="icon-btn" aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(1)}>+</button>
        <button type="button" className="icon-btn" aria-label="Zoom out" title="Zoom out" onClick={() => zoomBy(-1)}>−</button>
        <button type="button" className="icon-btn" aria-label="Reset view" title="Reset view" onClick={reset}>
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M10 1v5M10 14v5M1 10h5M14 10h5" stroke="currentColor" strokeWidth="1.6" /></svg>
        </button>
      </div>
      {p.children}
    </div>
  )
}
