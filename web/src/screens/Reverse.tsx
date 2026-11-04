import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { fmtLatLon, targetShort, to100 } from '../lib/format'
import { loadPlaces, parsePlace, placeLabel, searchPlaces, type Place } from '../lib/places'
import type { FactorText } from '../lib/factors'
import { loadPlanetGrids, type PlanetGrids } from '../lib/planetGrid'
import type { UrlState } from '../lib/url'
import { earthRadiusKm, haversineKm } from '../scoring/area'
import type { FactorId, FactorsFile, ProfilesFile, Target } from '../types/contract'
import type { ScorerClient } from '../worker/client'
import type { PlanetGridPayload, ReverseReplyMsg } from '../worker/protocol'
import { ErrorState } from '../components/ui'
import PairedFactors from '../components/PairedFactors'
import { createGlobe, createLocator } from '../map/twinPane'
import './reverse.css'

const TwinViewer = lazy(() => import('../components/TwinViewer'))

const CIRCLED = ['①', '②', '③']
type Body = 'moon' | 'mars'

export default function Reverse({ profiles, factors, ft, targets, scorer, url, update }: {
  profiles: ProfilesFile; factors: FactorsFile; ft: FactorText; targets: Target[]
  scorer: ScorerClient | null; url: UrlState; update: (s: Partial<UrlState>, replace?: boolean) => void
}) {
  const body: Body = url.body ?? 'mars'
  const Body = body === 'moon' ? 'Moon' : 'Mars'
  const [places, setPlaces] = useState<Place[] | null>(null)
  const [placesErr, setPlacesErr] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const [gs, setGs] = useState<{ body: Body; g: PlanetGrids } | null>(null)
  const grids = gs?.body === body ? gs.g : null
  const [out, setOut] = useState<{ key: string; res?: ReverseReplyMsg; err?: string } | null>(null)
  const [twinN, setTwinN] = useState<number | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const getPlaces = () => { if (!places) loadPlaces().then(setPlaces, (e: Error) => setPlacesErr(e.message)) }
  useEffect(() => { if (url.place?.startsWith('ne:')) getPlaces() })
  const place = useMemo(() => parsePlace(url.place, places), [url.place, places])
  const matches = useMemo(() => (places ? searchPlaces(places, q) : []), [places, q])

  // Weights: the body's default purpose (same 10 factors and formulas as forward search).
  const prof = useMemo(() => profiles.profiles.find((p) => p.bodies.includes(body))!, [profiles, body])
  const Rkm = earthRadiusKm(profiles.defaults)

  useEffect(() => {
    let live = true
    loadPlanetGrids(body).then((g) => { if (live) setGs({ body, g }) }, (e: Error) => { if (live) setOut({ key: body, err: e.message }) })
    return () => { live = false }
  }, [body])

  // The dense 1° grid is the search space (one value per cell, factor columns only).
  const dense = useMemo(() => grids?.grids.filter((g) => g.manifest.layout === 'dense').sort((a, b) => b.manifest.grid.resolution_deg - a.manifest.grid.resolution_deg)[0] ?? null, [grids])
  const key = place ? `${body}|${place.lat}|${place.lon}` : ''
  const cur = out && (out.key === key || out.key === body) ? out : null
  const res = cur?.res ?? null
  const err = cur?.err ?? null
  const busy = !!place && !cur
  useEffect(() => {
    if (!scorer || !dense || !place) return
    let live = true
    const payload = (): PlanetGridPayload => {
      const g = dense.manifest.grid
      const n = g.ncols * g.nrows
      const lat = new Float64Array(n), lon = new Float64Array(n)
      for (let j = 0; j < n; j++) { const r = Math.floor(j / g.ncols), c = j % g.ncols; lat[j] = g.lat_centre_first - r * g.resolution_deg; lon[j] = g.lon_centre_first + c * g.resolution_deg }
      const values: PlanetGridPayload['values'] = {}
      for (const a of dense.manifest.arrays) if (a.factor) values[a.factor as FactorId] = Float64Array.from(dense.columns[a.name])
      return { lat, lon, values, radiusM: (body === 'moon' ? 1737.4 : 3396.19) * 1000 }
    }
    scorer.reverse({ body, lat: place.lat, lon: place.lon, weights: prof.weights, n: 3 }, payload)
      .then((r) => { if (live) setOut({ key, res: r }) }, (e: Error) => { if (live) setOut({ key, err: e.message }) })
    return () => { live = false }
  }, [scorer, dense, place, body, prof, key])

  // Earth locator
  const locEl = useRef<HTMLDivElement>(null)
  const loc = useRef<ReturnType<typeof createLocator> | null>(null)
  useEffect(() => {
    if (!locEl.current) return
    loc.current = createLocator(locEl.current, (lat, lon) => update({ place: `${lat.toFixed(2)},${lon.toFixed(2)}` }))
    return () => { loc.current?.dispose(); loc.current = null }
  }, [update])
  useEffect(() => { if (place) loc.current?.setPin(place.lat, place.lon) }, [place])

  // Planet map with numbered pins
  const globeEl = useRef<HTMLDivElement>(null)
  const globe = useRef<ReturnType<typeof createGlobe> | null>(null)
  const [down, setDown] = useState<Body | null>(null)
  const tilesDown = down === body
  useEffect(() => {
    if (!globeEl.current) return
    globe.current = createGlobe(globeEl.current, body, Rkm * 1000, (s) => setDown(s.failed >= 2 && s.loaded === 0 ? body : null))
    return () => { globe.current?.dispose(); globe.current = null }
  }, [body, Rkm])
  const twins = useMemo(() => (res && res.cellId !== null ? res.twins : []), [res])
  useEffect(() => { globe.current?.setPins(twins.map((t, k) => ({ lat: t.lat, lon: t.lon, n: k + 1 }))) }, [twins])

  const rBody = body === 'moon' ? 1737.4 : 3396.19
  const twinTitle = (t: { lat: number; lon: number }) => {
    let best: { t: Target; d: number } | null = null
    for (const x of targets) if (x.body === body) { const d = haversineKm(t.lat, t.lon, x.anchor.lat, x.anchor.lon, rBody); if (!best || d < best.d) best = { t: x, d } }
    return best && best.d < 300 ? `${Body} · ${targetShort(best.t)} area (${Math.round(best.d)} km away)` : `${Body} · ${fmtLatLon(t.lat, t.lon, 1)}`
  }
  const twinValues = (t: { lat: number; lon: number }) => {
    const o: Partial<Record<FactorId, number | null>> = {}
    if (!dense) return o
    for (const a of dense.manifest.arrays) if (a.factor) { const v = grids!.sample(a.name, t.lat, t.lon)?.value; o[a.factor as FactorId] = v === undefined || Number.isNaN(v) ? null : v }
    return o
  }

  const pick = (p: Place) => { setQ(''); setOpen(false); update({ place: `ne:${p.ne_id}` }) }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, matches.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && matches[active]) { e.preventDefault(); pick(matches[active]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  const top = twins[0]
  const ranked = top ? (Object.entries(top.factorScores).filter(([f, v]) => v !== null && (prof.weights[f] ?? 0) > 0) as [FactorId, number][]).sort((a, b) => b[1] - a[1]) : []
  const closest = ranked.slice(0, 2).map(([f]) => ft.short(f))
  const furthest = ranked.length > 2 ? ft.short(ranked[ranked.length - 1][0]) : null
  const shown = twinN !== null ? twins[twinN] : null

  return (
    <main id="main" className="reverse">
      <header className="rv-head">
        <h1 className="t-h1">Find your place's twin</h1>
        <p className="t-body muted2">Pick a place on Earth. We score every {Body} cell against it with the same ten factors and formulas as the forward search ({prof.display_short ?? prof.name} weights).</p>
      </header>
      <div className="rv-controls">
        <div className="rv-search" role="combobox" aria-expanded={open && matches.length > 0} aria-haspopup="listbox" aria-owns="rv-list">
          <label htmlFor="rv-q" className="t-label">Your place on Earth</label>
          <input id="rv-q" ref={input} type="search" autoComplete="off" placeholder="Search a city or town, or click the map" value={q}
            aria-autocomplete="list" aria-controls="rv-list" aria-activedescendant={open && matches[active] ? `rv-o${active}` : undefined}
            onFocus={getPlaces} onChange={(e) => { setQ(e.target.value); setActive(0); setOpen(true) }} onKeyDown={onKey} onBlur={() => setTimeout(() => setOpen(false), 150)} />
          {open && matches.length > 0 && (
            <ul id="rv-list" role="listbox" className="rv-list">
              {matches.map((m, k) => (
                <li key={m.ne_id} id={`rv-o${k}`} role="option" aria-selected={k === active} className={k === active ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); pick(m) }}>{placeLabel(m)}</li>
              ))}
            </ul>
          )}
          <p className="t-small muted2">{placesErr ? `Place list didn't load (${placesErr}). Click the map instead.` : 'Searched in your browser. Nothing you type is sent anywhere.'}</p>
        </div>
        <div className="segmented" role="radiogroup" aria-label="Compare with">
          {(['mars', 'moon'] as Body[]).map((b) => (
            <button key={b} role="radio" aria-checked={body === b} className={body === b ? 'on' : ''} onClick={() => update({ body: b })}>{b === 'moon' ? 'Moon' : 'Mars'}</button>
          ))}
        </div>
      </div>
      <div className="rv-grid">
        <section className="rv-earth" aria-label="Earth locator">
          <div ref={locEl} className="rv-map" />
          <p className="t-small muted2">{place ? (url.place?.startsWith('ne:') ? `${place.title} · ${fmtLatLon(place.lat, place.lon)}` : place.title) : 'Click anywhere on land.'}</p>
        </section>
        <section className="rv-planet" aria-label={`${Body} map`}>
          <div ref={globeEl} className="rv-map" />
          {tilesDown && <p className="t-small muted2">{Body} imagery isn't loading. The pins still show where the twins are.</p>}
        </section>
        <section className="rv-result card" aria-live="polite">
          {err ? <ErrorState title="Couldn't run the search." body="Try again in a moment." detail={err} /> :
            !place ? <p className="t-body muted2">Search a place or click the Earth map to see its closest {Body} twin.</p> :
            busy ? <p className="t-body muted2" aria-busy="true">Scoring every {Body} cell…</p> :
            res && res.cellId === null ? <p className="t-body">That's open water. Pick a spot on land.</p> :
            !top ? <p className="t-body">Not enough data at this place to score it (under the minimum share of measured weight).</p> : (
              <>
                <p className="t-label muted2">Closest {Body} twin {CIRCLED[0]}</p>
                <h2 className="t-h2">{twinTitle(top)}</h2>
                <p className="t-body"><strong>How much like {place.title.split(',')[0]}: {to100(top.score)} / 100</strong></p>
                {res?.snapped && <p className="t-small muted2">Your point is just off the land grid, so we used the nearest land cell.</p>}
                {closest.length > 0 && <p className="t-body">Closest on {closest.join(' and ')}{furthest ? `. Furthest on ${furthest}.` : '.'}</p>}
                {twins.length > 1 && <p className="t-small">Next closest: {twins.slice(1).map((t, k) => `${CIRCLED[k + 1]} ${twinTitle(t)} (${to100(t.score)})`).join(' · ')}</p>}
                <div className="rv-actions">
                  {twins.map((_, k) => <button key={k} className={k === 0 ? 'btn primary' : 'btn'} onClick={() => setTwinN(k)}>{k === 0 ? 'Open twin view' : `Twin view ${CIRCLED[k]}`}</button>)}
                </div>
                <p className="t-small muted2">Twins are at least 300 km apart. A high score means similar measured conditions, not that the places look alike.</p>
              </>
            )}
        </section>
      </div>
      {shown && place && (
        <Suspense fallback={null}>
          <TwinViewer earthR={Rkm * 1000} header={`${place.title} ↔ ${twinTitle(shown)}`} onClose={() => setTwinN(null)}
            earth={{ title: place.title, lat: place.lat, lon: place.lon }}
            twin={{ body, title: twinTitle(shown), lat: shown.lat, lon: shown.lon, radiusKm: (Math.PI * rBody) / 360, pinN: twinN! + 1 }}>
            <PairedFactors compact body={body} twinValues={twinValues(shown)} factors={factors} ft={ft} factorScores={shown.factorScores} earthFeatures={res!.features}
              caption={`How ${place.title.split(',')[0]} compares with this ${Body} cell`} />
          </TwinViewer>
        </Suspense>
      )}
    </main>
  )
}
