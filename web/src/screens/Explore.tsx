import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { VARIANT_UI } from '../copy'
import { DataError, loadPortfolio } from '../data'
import { fmtLatLon, hasScorableFeatures, makeTitler, makeValueFormatter, purposeName, targetShort, to100 } from '../lib/format'
import type { UrlState } from '../lib/url'
import { useBreakpoint } from '../lib/useMedia'
import MapView, { type MapPin } from '../map/MapView'
import { earthRadiusKm, haversineKm } from '../scoring/area'
import { INSUFFICIENT_CODE, minActiveFrac, targetDropped } from '../scoring/engine'
import { CORE_FACTORS } from '../types/contract'
import type { FactorId, FactorsFile, GapsFile, Portfolio, Profile, ProfilesFile, SiteRef, Target, ValidationFile, VariantId, EarthReference } from '../types/contract'
import type { ScorerClient } from '../worker/client'
import type { CellDetail, ScoredMsg } from '../worker/protocol'
import { buildGapRows } from '../lib/gaps'
import { makeFactorText } from '../lib/factors'
import { FidelityGapPanel, PortfolioPanel, SiteCard, TopRegionsPanel, type Ctx, type SiteTab } from '../components/panels'
import { Banner, EmptyState, ErrorState, Toast } from '../components/ui'
import WeightsSheet from '../components/WeightsSheet'
import MapLegend from '../components/MapLegend'
import ValidationTab from '../components/ValidationTab'
import PairedFactors from '../components/PairedFactors'

// OpenLayers twin panes + imagery load only when the twin view opens
const TwinViewer = lazy(() => import('../components/TwinViewer'))

interface Props {
  target: Target
  profile: Profile
  profiles: ProfilesFile
  factors: FactorsFile
  gaps: GapsFile
  validation: ValidationFile
  earthRef?: EarthReference | null
  mock: boolean
  scorer: ScorerClient | null
  scorerError: string | null
  nCells: number | null
  url: UrlState
  update: (patch: Partial<UrlState>, replace?: boolean) => void
  onRetryScorer: () => void
  onChangeTarget: () => void
  /** bumped by the top bar / picker to open the custom weights dialog */
  weightsReq: number
  weightsSeen: number
  onWeightsSeen: (n: number) => void
}

type PfState = { key: string; status: 'loading' | 'ok' | 'missing' | 'error'; data: Portfolio | null; err?: string }

const sameWeights = (a: Record<string, number>, b: Record<string, number>) => CORE_FACTORS.every((f) => (a[f] ?? 0) === (b[f] ?? 0))

export default function Explore(p: Props) {
  const { target, profile, url, update } = p
  const bp = useBreakpoint()
  const pairKey = `${target.id}|${profile.id}`
  const scorable = hasScorableFeatures(target)
  const custom = !!url.w && !sameWeights(url.w, profile.weights)
  const weights = custom ? url.w! : profile.weights
  const wKey = JSON.stringify(CORE_FACTORS.map((f) => weights[f] ?? 0))

  /* ---------- shipped portfolio (default weights) */
  const [pf, setPf] = useState<PfState>({ key: '', status: 'loading', data: null })
  const [pfNonce, setPfNonce] = useState(0)
  useEffect(() => {
    let live = true
    setPf({ key: pairKey, status: 'loading', data: null })
    loadPortfolio(target.id, profile.id)
      .then((d) => live && setPf({ key: pairKey, status: 'ok', data: d }))
      .catch((e: unknown) => {
        if (!live) return
        if (e instanceof DataError && e.status === 404) setPf({ key: pairKey, status: 'missing', data: null })
        else setPf({ key: pairKey, status: 'error', data: null, err: String(e) })
      })
    return () => { live = false }
  }, [pairKey, target.id, profile.id, pfNonce])
  const pfReady = pf.key === pairKey && pf.status !== 'loading'
  const pfData = pf.key === pairKey ? pf.data : null

  /* ---------- live scoring in the worker */
  const [scored, setScored] = useState<{ key: string; msg: ScoredMsg } | null>(null)
  const [scoreErr, setScoreErr] = useState<string | null>(null)
  const scoreKey = `${pairKey}|${wKey}`
  const continents = useMemo<[number, string][]>(() => {
    const m = new Map<number, string>()
    const add = (s: SiteRef) => { if (s.logistics?.continent) m.set(s.cell_id, s.logistics.continent) }
    pfData?.top_cells?.forEach(add)
    pfData?.variants.forEach((v) => v.sites.forEach(add))
    return [...m]
  }, [pfData])
  useEffect(() => {
    if (!p.scorer || !scorable || !pfReady) return
    let live = true
    setScoreErr(null)
    const values = Object.fromEntries(Object.entries(target.features ?? {}).map(([f, v]) => [f, v?.value ?? null])) as Partial<Record<FactorId, number | null>>
    // the default-weight portfolio comes from the shipped file; only build one live for custom weights or a missing file
    p.scorer.score({ target: { id: target.id, body: target.body, values }, profileId: profile.id, weights, continents, withPortfolio: custom || pf.status === 'missing' })
      .then((msg) => live && setScored({ key: scoreKey, msg }))
      .catch((e: unknown) => live && setScoreErr(String(e instanceof Error ? e.message : e)))
    return () => { live = false }
    // weights is captured through scoreKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.scorer, scoreKey, pfReady, scorable])
  const cur = scored?.key === scoreKey ? scored.msg : null
  const scoring = scorable && !!p.scorer && !cur && !scoreErr

  /* ---------- which portfolio drives the UI */
  // Live (worker) sites carry no place names; reuse country/region from the shipped portfolio for the same cell when present.
  const places = useMemo(() => {
    const m = new Map<number, Pick<SiteRef, 'country' | 'region' | 'admin1'>>()
    const add = (s: SiteRef) => { if (s.country || s.region || s.admin1) m.set(s.cell_id, { country: s.country, region: s.region, admin1: s.admin1 }) }
    pfData?.top_cells?.forEach(add)
    pfData?.variants.forEach((v) => v.sites.forEach(add))
    return m
  }, [pfData])
  const livePortfolio = useMemo<Portfolio | null>(() => {
    const lp = cur?.portfolio ?? null
    if (!lp || !places.size) return lp
    const fill = (s: SiteRef): SiteRef => (s.country || s.region || s.admin1 || !places.has(s.cell_id) ? s : { ...s, ...places.get(s.cell_id) })
    return { ...lp, top_cells: lp.top_cells?.map(fill), variants: lp.variants.map((v) => ({ ...v, sites: v.sites.map(fill) })) }
  }, [cur, places])
  const portfolio: Portfolio | null = custom ? livePortfolio : (pfData ?? (pf.status === 'missing' ? livePortfolio : null))
  const fromFile = !custom && !!pfData
  const dropped = new Set<FactorId>(portfolio?.dropped_factors ?? targetDropped(Object.fromEntries(CORE_FACTORS.map((f) => [f, target.features?.[f]?.value ?? null])), weights))
  const needs = CORE_FACTORS.filter((f) => (weights[f] ?? 0) > 0 && !dropped.has(f)) as FactorId[]
  const pName = purposeName(profile)
  const tShort = targetShort(target)
  const ft = useMemo(() => makeFactorText(p.factors), [p.factors])
  const titleOf = useMemo(() => makeTitler([...(portfolio?.top_cells ?? []), ...(portfolio?.variants.flatMap((v) => v.sites) ?? [])]), [portfolio])
  const ctx: Ctx = { title: titleOf, target, purposeName: pName, targetShort: tShort, weights, custom, needs, factors: p.factors, ft, robustnessAvailable: fromFile,
    earthRef: p.earthRef ?? undefined, mc: pfData?.monte_carlo ?? p.profiles.defaults.monte_carlo }
  const variant = portfolio?.variants.find((v) => v.id === url.v && v.available) ?? portfolio?.variants.find((v) => v.id === 'best_match')
  const vSites = useMemo(() => variant?.sites ?? [], [variant])

  // an unavailable variant in the URL falls back to Best match
  useEffect(() => {
    if (portfolio && url.v !== 'best_match' && !portfolio.variants.find((v) => v.id === url.v)?.available) update({ v: 'best_match' }, true)
  }, [portfolio, url.v, update])

  /* ---------- selection */
  const allSites = useMemo(() => {
    const m = new Map<string, SiteRef>()
    vSites.forEach((s) => m.set(s.site_id, s))
    portfolio?.variants.forEach((v) => v.sites.forEach((s) => { if (!m.has(s.site_id)) m.set(s.site_id, s) }))
    portfolio?.top_cells?.forEach((s) => { if (!m.has(s.site_id)) m.set(s.site_id, s) })
    return m
  }, [portfolio, vSites])
  const site = url.site ? allSites.get(url.site) ?? null : null
  // a twin link to a site that isn't in this portfolio falls back to Explore
  useEffect(() => {
    if (url.view === 'twin' && pfReady && portfolio && !site) update({ view: 'explore', site: undefined }, true)
  }, [url.view, pfReady, portfolio, site, update])
  const siteN = site ? vSites.findIndex((s) => s.site_id === site.site_id) : -1
  const [detail, setDetail] = useState<CellDetail | null>(null)
  useEffect(() => {
    setDetail(null)
    if (!site || !cur || !p.scorer) return
    let live = true
    p.scorer.cell(site.cell_id).then((d) => live && setDetail(d)).catch(() => undefined)
    return () => { live = false }
  }, [site, cur, p.scorer])
  const headingRef = useRef<HTMLHeadingElement>(null)
  const lastSite = useRef<string | null>(null)
  useEffect(() => {
    if (site) { lastSite.current = site.site_id; headingRef.current?.focus(); return }
    // back from the site card: return focus to the row that opened it
    if (lastSite.current) { document.querySelector<HTMLElement>(`[data-site-id="${CSS.escape(lastSite.current)}"]`)?.focus(); lastSite.current = null }
  }, [site?.site_id]) // eslint-disable-line react-hooks/exhaustive-deps

  const [hovered, setHovered] = useState<string | null>(null)
  const [siteTab, setSiteTab] = useState<SiteTab>('scores')
  useEffect(() => { setSiteTab('scores') }, [site?.site_id])
  const [weightsOpen, setWeightsOpen] = useState(false)
  const { weightsReq, weightsSeen, onWeightsSeen } = p
  useEffect(() => { if (weightsReq > weightsSeen) { onWeightsSeen(weightsReq); setWeightsOpen(true) } }, [weightsReq, weightsSeen, onWeightsSeen])
  const [toast, setToast] = useState<{ msg: string; tone: 'neutral' | 'error' } | null>(null)
  const [tab, setTab] = useState<'results' | 'gap'>('results')
  const [drawer, setDrawer] = useState(true)
  const [sheet, setSheet] = useState<'peek' | 'half' | 'full'>('half')
  const [announce, setAnnounce] = useState('')

  const openSite = useCallback((s: SiteRef) => { update({ site: s.site_id }); setTab('results'); setDrawer(true); if (sheet === 'peek') setSheet('half') }, [update, sheet])
  const closeSite = useCallback(() => update({ site: undefined }), [update])
  useEffect(() => {
    if (!site || weightsOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !(e.target as HTMLElement).closest('.popover, [role=dialog]')) closeSite() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [site, weightsOpen, closeSite])

  const onVariant = (v: VariantId) => {
    update({ v, site: undefined }, true)
    const vv = portfolio?.variants.find((x) => x.id === v)
    if (vv) {
      const cov = new Set(vv.covers)
      setAnnounce(`${VARIANT_UI[v].label}: ${vv.sites.length} ${vv.sites.length === 1 ? 'site covers' : 'sites cover'} ${needs.filter((f) => cov.has(f)).length} of ${needs.length} needs.`)
    }
  }

  /* ---------- map pins */
  const [layers, setLayers] = useState({ known: true, candidates: false })
  const knownSites = useMemo(() => p.validation.sites.filter((s) => s.kind === 'positive' && (s.body_analog === target.body || s.body_analog === 'both')), [p.validation, target.body])
  const showPortfolio = url.step === 'portfolio' || !!site
  const pins = useMemo<MapPin[]>(() => {
    const out: MapPin[] = []
    const main = showPortfolio ? vSites : (portfolio?.top_cells ?? []).slice(0, 5)
    const mainIds = new Set(main.map((s) => s.site_id))
    main.forEach((s, i) => out.push({ id: s.site_id, kind: 'portfolio', n: i + 1, lat: s.lat, lon: s.lon, label: `${i + 1} · ${ctx.title(s)}`, tooltip: `${showPortfolio ? 'Site' : 'Region'} ${i + 1}: ${ctx.title(s)} · ${to100(s.score)} / 100` }))
    if (site && !mainIds.has(site.site_id)) out.push({ id: site.site_id, kind: site.known_analog ? 'known' : 'candidate', lat: site.lat, lon: site.lon, label: ctx.title(site), tooltip: ctx.title(site) })
    if (layers.known) {
      for (const k of knownSites) {
        const r = k.results.find((x) => x.target_id === target.id && x.profile_id === profile.id)
        const rank = r && !custom ? ` · ranks in the top ${Math.max(0.1, +(100 - r.percentile).toFixed(1))}%` : ''
        out.push({ id: `known:${k.cell_id}:${k.name}`, kind: 'known', lat: k.lat, lon: k.lon, label: k.name, tooltip: `Known analog: ${k.name}${rank}` })
      }
    }
    if (layers.candidates) {
      for (const s of portfolio?.top_cells ?? []) {
        if (!s.candidate || s.known_analog || mainIds.has(s.site_id)) continue
        out.push({ id: s.site_id, kind: 'candidate', lat: s.lat, lon: s.lon, label: ctx.title(s), tooltip: `New candidate · ${to100(s.score)} / 100 · ${fmtLatLon(s.lat, s.lon, 1)}` })
      }
    }
    return out
  }, [showPortfolio, vSites, portfolio, site, layers, knownSites, target.id, profile.id, custom])

  // the body's candidate gate (contract v1.2, Mars) is checked after the hard filters: filterCode = filters.length + 1
  const gate = p.profiles.defaults.candidate_gates?.[target.body]
  const filters = useMemo(() => [...p.profiles.global_hard_filters, ...profile.hard_filters,
    ...(gate ? [{ id: gate.id, rule: gate.rule, reason: gate.ui_tooltip ?? gate.id, ui_short: gate.ui_short, ui_tooltip: gate.ui_tooltip }] : [])], [p.profiles, profile, gate])
  const minPct = Math.round(minActiveFrac(p.profiles) * 100)
  const filterText = useCallback((code: number) => {
    if (code === INSUFFICIENT_CODE) return `Not enough data to score (under ${minPct}% of what counts has Earth data here)`
    const f = filters[code - 1]
    return f ? `Filtered out: ${f.ui_tooltip ?? f.ui_short ?? f.reason}` : 'Filtered out'
  }, [filters, minPct])
  const R = useMemo(() => earthRadiusKm(p.profiles.defaults), [p.profiles])
  const closest = useCallback(async (cid: number) => {
    const lat = 89.75 - 0.5 * Math.floor(cid / 720)
    const lon = -179.75 + 0.5 * (cid % 720)
    let best: { name: string; d: number } | null = null
    for (const k of knownSites) { const d = haversineKm(lat, lon, k.lat, k.lon, R); if (!best || d < best.d) best = { name: k.name, d } }
    return best && best.d < 800 ? `Closest known analog: ${best.name} (${Math.round(best.d)} km)` : null
  }, [knownSites, R])

  const fmt = useMemo(() => makeValueFormatter(p.factors), [p.factors])
  const gapRows = useMemo(() => buildGapRows(p.gaps, target.body, ctx, variant, variant?.id !== 'best_match' ? () => onVariant('best_match') : null, portfolio, fmt),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.gaps, target, variant, portfolio, fmt, needs.join(), custom])

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setToast({ msg: 'Link copied', tone: 'neutral' }) }
    catch { setToast({ msg: "Couldn't copy the link. Copy it from the address bar.", tone: 'error' }) }
  }

  /* ---------- panel content */
  const stats = portfolio?.earth_thresholds && cur ? { best: cur.stats.best, top5: portfolio.earth_thresholds.top5 } : cur ? { best: cur.stats.best, top5: cur.stats.top5 } : null
  let results: React.ReactNode
  if (!scorable) {
    results = <EmptyState title="No data yet for this target." body={`${target.name} doesn't have its target values yet in this data release, so it can't be scored. Pick another target.`}
      action={<button type="button" className="btn btn-secondary" onClick={p.onChangeTarget}>Change target</button>} />
  } else if (pf.status === 'error' && !custom) {
    results = <ErrorState title="Couldn't load results." body="Check your connection and try again." detail={pf.err} onRetry={() => setPfNonce((n) => n + 1)} />
  } else if (!portfolio) {
    results = p.scorerError || scoreErr
      ? <ErrorState title="Couldn't load results." body="The scorer stopped working. Try again." detail={p.scorerError ?? scoreErr ?? ''} onRetry={p.onRetryScorer} />
      : <div className="panel-body" aria-busy="true"><p className="overline">{url.step === 'portfolio' ? 'Your Analog Portfolio' : 'Top regions'}</p><div className="skeleton h2" /><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /><p className="t-small muted2">Scoring Earth's land…</p></div>
  } else if (site) {
    results = <SiteCard site={site} n={siteN >= 0 ? siteN + 1 : null} nTotal={vSites.length} ctx={ctx} detail={detail} headingRef={headingRef}
      onBack={closeSite} backLabel={url.step === 'portfolio' ? 'Portfolio' : 'Top regions'} onCopy={copyLink}
      tab={siteTab} onTab={setSiteTab} onTwin={() => update({ view: 'twin' })}
      validationTab={<ValidationTab validation={p.validation} targetId={target.id} body={target.body} profileId={profile.id} ctx={ctx} site={site}
        scorer={p.scorer} scoreKey={cur ? scoreKey : null} showOnMap={layers.known} onShowOnMap={(v) => setLayers((l) => ({ ...l, known: v }))} />}
      twinTab={<div className="twin-compact">
        <p className="t-small muted2">Site {siteN >= 0 ? `${siteN + 1} · ` : ''}{ctx.title(site)} ↔ {target.name}</p>
        <PairedFactors target={target} factors={p.factors} ft={ft} factorScores={site.factor_scores} earthFeatures={detail?.features ?? null} caption="Side by side, factor by factor" compact />
        <p className="t-small muted2">Same factors; gravity, air and radiation always differ.</p>
        <button type="button" className="btn btn-primary" onClick={() => update({ view: 'twin' })}>Open twin view</button>
      </div>} />
  } else if (url.step === 'portfolio') {
    results = <PortfolioPanel phone={bp === 'phone'} ctx={ctx} portfolio={portfolio} variantId={variant?.id ?? 'best_match'} onVariant={onVariant} onOpen={openSite} selected={url.site ?? null} hovered={hovered} onHover={setHovered} />
  } else {
    results = <TopRegionsPanel ctx={ctx} portfolio={portfolio} stats={stats} nLand={cur?.stats.nScorable ?? p.nCells} onOpen={openSite}
      onPortfolio={() => update({ step: 'portfolio', site: undefined })} onWeights={() => setWeightsOpen(true)} hovered={hovered} onHover={setHovered} />
  }
  const gapPanel = <FidelityGapPanel rows={gapRows} />
  const resultsLabel = site ? 'Site' : url.step === 'portfolio' ? 'Sites' : 'Top regions'

  const banners = (
    <div className="banners" data-map-obscures="top">
      {custom && <Banner tone="info" title="Custom weights." action={<button type="button" className="link-btn" onClick={() => update({ w: undefined })}>Back to default weights</button>}>Scores, the portfolio and validation are recalculated for your weights. The pre-registered results use the default weights. Robustness is shown for default weights.</Banner>}
      {!custom && pf.status === 'missing' && scorable && <Banner tone="info" title="Computed live.">There is no precomputed portfolio for this pair yet, so it was built in your browser. Robustness is not available.</Banner>}
      {(p.scorerError || scoreErr) && portfolio && <Banner tone="warning" title="Live scoring is unavailable.">The heatmap and custom weights need the in-browser scorer. {p.scorerError ?? scoreErr}</Banner>}
      {cur && cur.stats.unknownFilters.length > 0 && <Banner tone="warning" title="Unknown filter.">{cur.stats.unknownFilters.join(', ')} was not applied.</Banner>}
    </div>
  )

  const legend = (
    <MapLegend title={`How ${target.body === 'moon' ? 'Moon' : 'Mars'}-like for this mission`} filterText={filters.map((f) => f.ui_short ?? f.id).join(' or ')}
      insufficientText={cur && cur.stats.nInsufficient > 0 ? `Not enough data (under ${minPct}% of what counts)` : undefined}>
      <fieldset className="layer-toggle t-small">
        <legend className="sr-only">Map layers</legend>
        <label><input type="checkbox" checked={layers.known} onChange={(e) => setLayers((l) => ({ ...l, known: e.target.checked }))} /> <i className="sw sw-known" aria-hidden="true" /> Known analogs</label>
        <label><input type="checkbox" checked={layers.candidates} onChange={(e) => setLayers((l) => ({ ...l, candidates: e.target.checked }))} /> <i className="sw sw-cand" aria-hidden="true" /> New candidates</label>
      </fieldset>
    </MapLegend>
  )

  const map = (
    <section className="map-col" aria-label="Map">
      {banners}
      <MapView heat={cur ? { scores: cur.heat, filter: cur.filter } : null} pins={pins} selectedId={url.site ?? null} hoveredId={hovered}
        fitKey={showPortfolio ? `${scoreKey}|${variant?.id}` : undefined} ariaLabel={`Map of Earth's land coloured by match to ${tShort} for ${pName}`} describedBy="map-legend"
        filterText={filterText} closest={closest} onHoverPin={setHovered}
        onSelectPin={(id) => { const s = allSites.get(id); if (s) openSite(s) }}>
        {legend}
        {p.mock && <span className="illustrative tag">Illustrative mock data</span>}
        {scoring && <span className="map-status t-small" role="status">Scoring Earth's land…</span>}
        {bp === 'tablet' && !drawer && <button type="button" className="btn btn-primary drawer-open" onClick={() => setDrawer(true)}>Show {resultsLabel.toLowerCase()}</button>}
      </MapView>
      <p className="attribution micro muted2">Coastlines: Natural Earth (public domain) · Map: OpenLayers · Earth data: {p.mock ? 'illustrative mock grid' : 'see provenance'}</p>
    </section>
  )

  const tabs = (
    <div className="panel-tabs" role="tablist" aria-label="Results">
      <button type="button" role="tab" id="tab-results" aria-selected={tab === 'results'} aria-controls="tabpanel" onClick={() => setTab('results')}>{resultsLabel}</button>
      <button type="button" role="tab" id="tab-gap" aria-selected={tab === 'gap'} aria-controls="tabpanel" onClick={() => setTab('gap')}>Earth can't give</button>
      {bp === 'tablet' && <button type="button" className="icon-btn drawer-close" aria-label="Hide results" onClick={() => setDrawer(false)}>×</button>}
    </div>
  )

  if (url.view === 'twin') {
    if (!site) {
      return <main id="main" className="stub" aria-busy="true"><p className="t-body muted2">Loading…</p></main>
    }
    return (
      <Suspense fallback={<main id="main" className="stub" aria-busy="true"><p className="t-body muted2">Loading the twin view…</p></main>}>
        <TwinViewer earth={{ title: ctx.title(site), lat: site.lat, lon: site.lon }}
          twin={{ body: target.body, title: target.name, lat: target.anchor.lat, lon: target.anchor.lon, radiusKm: target.sample_radius_km }}
          earthR={earthRadiusKm(p.profiles.defaults) * 1000} header={`Site ${siteN >= 0 ? `${siteN + 1} · ` : ''}${ctx.title(site)} ↔ ${target.name}`}
          onClose={() => update({ view: 'explore' })}>
          <PairedFactors target={target} factors={p.factors} ft={ft} factorScores={site.factor_scores} earthFeatures={detail?.features ?? null} caption="Factor by factor" />
        </TwinViewer>
      </Suspense>
    )
  }

  return (
    <main id="main" className={`explore bp-${bp}`}>
      <h1 className="sr-only">Earth analogs for {target.name}, {pName}</h1>
      <div className="sr-only" aria-live="polite">{announce}</div>
      {bp === 'wide' ? (
        <>
          <aside className="panel panel-a" aria-label={resultsLabel}>{results}</aside>
          {map}
          <aside className="panel panel-b" aria-label="What Earth can't give you">{gapPanel}</aside>
        </>
      ) : (
        <>
          {map}
          {(bp !== 'tablet' || drawer) && (
            <aside className={`panel panel-a ${bp === 'phone' ? `sheet-${sheet}` : ''}`} aria-label="Results" data-map-obscures={bp === 'phone' ? 'bottom' : bp === 'tablet' ? 'right' : undefined}>
              {bp === 'phone' && (
                <button type="button" className="sheet-handle" aria-label={sheet === 'full' ? 'Collapse results' : 'Expand results'}
                  onClick={() => setSheet((s) => (s === 'peek' ? 'half' : s === 'half' ? 'full' : 'peek'))}><span aria-hidden="true" /></button>
              )}
              {tabs}
              <div id="tabpanel" key={tab} className="tab-scroll" tabIndex={0} role="tabpanel" aria-labelledby={tab === 'results' ? 'tab-results' : 'tab-gap'}>{tab === 'results' ? results : gapPanel}</div>
            </aside>
          )}
        </>
      )}
      {weightsOpen && (
        <WeightsSheet ft={ft} initial={weights} defaults={profile.weights} purposeName={pName} onClose={() => setWeightsOpen(false)}
          onApply={(w) => { setWeightsOpen(false); update({ w: sameWeights(w, profile.weights) ? undefined : w, site: undefined }) }} />
      )}
      {toast && <Toast message={toast.msg} tone={toast.tone} onDone={() => setToast(null)} />}
    </main>
  )
}
