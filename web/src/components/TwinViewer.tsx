import { useEffect, useRef, useState } from 'react'
import 'ol/ol.css'
import './twin.css'
import { createPane, earthFootprint, radiusOf, targetFootprint, type Pane, type PaneBody } from '../map/twinPane'
import { initialMpp, panePyramids, scaleBar } from '../lib/twin'
import { loadPlanetGrids } from '../lib/planetGrid'
import { Banner } from './ui'

export interface TwinSide { title: string; lat: number; lon: number }
export interface TwinTarget extends TwinSide { body: 'moon' | 'mars'; radiusKm: number; pinN?: number }

/**
 * Spec §8.5 TwinViewer / §11.7: Earth site and Moon/Mars twin side by side at the same metres per pixel, locked zoom and
 * pan by default, one shared scale bar, the paired-factor table underneath (children), credits and an honesty note.
 * OpenLayers and the imagery load only when this component mounts (lazy route).
 */
export default function TwinViewer({ earth, twin, earthR, header, onClose, children }: {
  earth: TwinSide
  twin: TwinTarget
  /** Earth radius in metres (profiles.json) */
  earthR: number
  header: string
  onClose: () => void
  children?: React.ReactNode
}) {
  const elE = useRef<HTMLDivElement>(null)
  const elT = useRef<HTMLDivElement>(null)
  const panes = useRef<{ e: Pane; t: Pane } | null>(null)
  const [locked, setLocked] = useState(true)
  const lockedRef = useRef(locked)
  useEffect(() => { lockedRef.current = locked }, [locked])
  const [res, setRes] = useState<{ e: number; t: number } | null>(null)
  const [tiles, setTiles] = useState<Record<PaneBody, { loaded: number; failed: number }>>({ earth: { loaded: 0, failed: 0 }, moon: { loaded: 0, failed: 0 }, mars: { loaded: 0, failed: 0 } })

  useEffect(() => {
    if (!elE.current || !elT.current) return
    const w = Math.min(elE.current.clientWidth || 600, elT.current.clientWidth || 600)
    const tR = radiusOf(twin.body, earthR)
    // the larger footprint (0.5° Earth cell diagonal or the target's sampling disc) fills ~70% of a pane
    const cellDiag = Math.hypot(0.5 * (Math.PI / 180) * earthR, 0.5 * (Math.PI / 180) * earthR * Math.cos((earth.lat * Math.PI) / 180))
    const mpp = initialMpp(Math.max(cellDiag, 2 * twin.radiusKm * 1000), w)
    const onTiles = (b: PaneBody) => (s: { loaded: number; failed: number }) => setTiles((t) => ({ ...t, [b]: s }))
    const e = createPane({ target: elE.current, body: 'earth', lat: earth.lat, lon: earth.lon, earthR, resolution: mpp, footprint: earthFootprint(earth.lat, earth.lon), onTiles: onTiles('earth') })
    const t = createPane({ target: elT.current, body: twin.body, lat: twin.lat, lon: twin.lon, earthR, resolution: mpp, footprint: targetFootprint(twin.lat, twin.lon, twin.radiusKm, tR), pin: { body: twin.body, n: twin.pinN }, onTiles: onTiles(twin.body) })
    panes.current = { e, t }
    // locked: both panes share centre offset (metres from their site) and resolution; guard against echo loops
    let syncing = false
    const link = (a: Pane, b: Pane) => {
      const sync = () => {
        setRes({ e: e.view.getResolution() ?? mpp, t: t.view.getResolution() ?? mpp })
        if (!lockedRef.current || syncing) return
        syncing = true
        b.view.setResolution(a.view.getResolution())
        b.view.setCenter(a.view.getCenter())
        syncing = false
      }
      a.view.on('change:resolution', sync)
      a.view.on('change:center', sync)
    }
    link(e, t); link(t, e)
    setRes({ e: mpp, t: mpp })
    let live = true
    loadPlanetGrids(twin.body).then((g) => live && t.setGrids(g)).catch(() => undefined)
    return () => { live = false; e.dispose(); t.dispose(); panes.current = null }
  }, [earth.lat, earth.lon, twin.body, twin.lat, twin.lon, twin.radiusKm, twin.pinN, earthR])

  // re-locking snaps the twin pane to the Earth pane
  useEffect(() => {
    if (!locked || !panes.current) return
    const { e, t } = panes.current
    t.view.setResolution(e.view.getResolution())
    t.view.setCenter(e.view.getCenter())
  }, [locked])

  useEffect(() => {
    const on = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose() }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [onClose])

  const bodyName = twin.body === 'moon' ? 'MOON' : 'MARS'
  const down = (b: PaneBody) => tiles[b].loaded === 0 && tiles[b].failed >= 2
  const credit = panePyramids(twin.body, twin.lat).map((p) => p.credit).join(' + ')
  const bar = (r: number) => scaleBar(r, 120)
  return (
    <main id="main" className="twin-screen">
      <div className="twin-head">
        <div>
          <h1 className="t-h2">Side by side, factor by factor</h1>
          <p className="t-small muted2">{header}</p>
        </div>
        <label className="t-small twin-lock"><input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} /> Lock zoom &amp; pan</label>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Close <span aria-hidden="true">✕</span><span className="sr-only">(Escape)</span></button>
      </div>
      {(down('earth') || down(twin.body)) && <Banner tone="info" title="Satellite imagery is unavailable.">Showing a simpler map; scores aren't affected.</Banner>}
      <div className="twin-panes">
        <section className="twin-pane" aria-label={`Earth: ${earth.title}`}>
          <h2 className="t-h3 twin-title"><span className="body-tag body-earth">EARTH</span> {earth.title}</h2>
          <div ref={elE} className="twin-map" role="region" aria-label={`Satellite map of ${earth.title}, with the scored 0.5° cell outlined`} tabIndex={0} />
          {!locked && res && <ScaleBar {...bar(res.e)} />}
        </section>
        <section className="twin-pane" aria-label={`${twin.body === 'moon' ? 'Moon' : 'Mars'}: ${twin.title}`}>
          <h2 className="t-h3 twin-title"><span className={`body-tag body-${twin.body}`}>{bodyName}</span> {twin.title}</h2>
          <div ref={elT} className="twin-map" role="region" aria-label={`Map of ${twin.title}, with the ${twin.radiusKm} km sampling window outlined`} tabIndex={0} />
          {!locked && res && <ScaleBar {...bar(res.t)} />}
        </section>
      </div>
      {locked && res && <div className="twin-shared"><ScaleBar {...bar(res.e)} /><span className="t-small muted2">Both maps use the same scale</span></div>}
      <div className="twin-table">{children}</div>
      <p className="t-small muted2">Same factors; gravity, air and radiation always differ.</p>
      <p className="t-micro muted2 twin-credit">Imagery: NASA GIBS · true colour / {credit}. Relief underlay: the app's own Moon/Mars grids.</p>
    </main>
  )
}

function ScaleBar({ px, label }: { px: number; label: string }) {
  return <span className="scalebar" aria-label={`Scale: ${Math.round(px)} pixels is ${label}`}><i style={{ width: `${px}px` }} aria-hidden="true" /><span className="num t-small">{label}</span></span>
}
