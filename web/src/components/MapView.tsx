import { useEffect, useRef } from 'react'
import Map from 'ol/Map'
import View from 'ol/View'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import WMTS from 'ol/source/WMTS'
import WMTSTileGrid from 'ol/tilegrid/WMTS'
import { Circle, Fill, Stroke, Style, Text } from 'ol/style'
import 'ol/ol.css'
import type { SiteRef } from '../types/contract'

// NASA GIBS EPSG:4326 basemap (Blue Marble shaded relief), 512 px tiles, 0.5625 deg/px at level 0.
const GIBS_RES = Array.from({ length: 8 }, (_, z) => 0.5625 / 2 ** z)
const gibs = new WMTS({
  url: 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_ShadedRelief_Bathymetry/default/2004-08-01/500m/{TileMatrix}/{TileRow}/{TileCol}.jpeg',
  requestEncoding: 'REST',
  layer: 'BlueMarble_ShadedRelief_Bathymetry',
  matrixSet: '500m',
  format: 'image/jpeg',
  projection: 'EPSG:4326',
  style: 'default',
  wrapX: true,
  tileGrid: new WMTSTileGrid({
    origin: [-180, 90],
    resolutions: GIBS_RES,
    matrixIds: GIBS_RES.map((_, i) => String(i)),
    tileSize: 512,
  }),
  attributions: 'Imagery: NASA GIBS / Blue Marble',
})

const colour = (s: number) => `hsl(${Math.round(220 - 200 * s)}, 85%, 55%)`

interface Props {
  cells: SiteRef[]
  portfolio: SiteRef[]
  onSelect?: (s: SiteRef) => void
}

export default function MapView({ cells, portfolio, onSelect }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<Map | null>(null)
  const src = useRef(new VectorSource())

  useEffect(() => {
    if (!el.current) return
    const vector = new VectorLayer({ source: src.current })
    map.current = new Map({
      target: el.current,
      layers: [new TileLayer({ source: gibs }), vector],
      view: new View({ projection: 'EPSG:4326', center: [0, 20], zoom: 2, minZoom: 1, maxZoom: 9 }),
    })
    map.current.on('singleclick', (e) => {
      map.current?.forEachFeatureAtPixel(e.pixel, (f) => {
        const s = f.get('site') as SiteRef | undefined
        if (s && onSelect) onSelect(s)
        return true
      })
    })
    return () => map.current?.setTarget(undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const s = src.current
    s.clear()
    const inPortfolio = new Set(portfolio.map((p) => p.site_id))
    for (const c of cells) {
      if (inPortfolio.has(c.site_id)) continue
      const f = new Feature({ geometry: new Point([c.lon, c.lat]), site: c })
      f.setStyle(new Style({ image: new Circle({ radius: 5, fill: new Fill({ color: colour(c.score) }), stroke: new Stroke({ color: '#0008', width: 1 }) }) }))
      s.addFeature(f)
    }
    portfolio.forEach((p, i) => {
      const f = new Feature({ geometry: new Point([p.lon, p.lat]), site: p })
      f.setStyle(new Style({
        image: new Circle({ radius: 11, fill: new Fill({ color: '#ffb000' }), stroke: new Stroke({ color: '#111', width: 2 }) }),
        text: new Text({ text: String(i + 1), font: 'bold 12px system-ui', fill: new Fill({ color: '#111' }) }),
      }))
      s.addFeature(f)
    })
  }, [cells, portfolio])

  return <div ref={el} className="map" role="region" aria-label="Map of Earth analog candidates" />
}
