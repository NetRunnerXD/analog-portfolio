import { useMemo, useState } from 'react'
import { FACTOR_UI, VARIANT_UI } from '../copy'
import { accessText, band, cellEwKm, fmtLatLon, isAtLimit, makeValueFormatter, siteTitle, summarySentence, to100 } from '../lib/format'
import type { GapRowData } from '../lib/gaps'
import type { FactorId, FactorsFile, Portfolio, SiteRef, Target, VariantId } from '../types/contract'
import { ALL_FACTORS, CORE_FACTORS, VARIANT_IDS } from '../types/contract'
import type { CellDetail } from '../worker/protocol'
import { AtLimitIcon, Banner, EmptyState, FlaskIcon, GapIcon, Icon, InfoPopover, SegmentedControl, ShieldIcon } from './ui'

export interface Ctx {
  target: Target
  purposeName: string
  targetShort: string
  weights: Record<string, number>
  custom: boolean
  needs: FactorId[]
  factors: FactorsFile
  /** precomputed robustness is only valid for the shipped default-weight portfolio */
  robustnessAvailable: boolean
}

function FactorChip({ f, atLimit }: { f: FactorId; atLimit: boolean }) {
  const ui = FACTOR_UI[f]
  return (
    <span className={`chip ${atLimit ? 'chip-limit' : ''}`}
      title={atLimit ? `${ui.name}: covered at Earth's limit. The target is beyond anything on Earth; the rest is listed under What Earth can't give you.` : ui.name}>
      <i className={`dot g-${ui.group}`} aria-hidden="true" />{ui.chip}{atLimit && <><AtLimitIcon /><span className="sr-only"> (covered at Earth's limit)</span></>}
    </span>
  )
}

export function RobustnessLine({ site, ctx }: { site: SiteRef; ctx: Ctx }) {
  if (ctx.custom || !ctx.robustnessAvailable) {
    return <p className="robust t-small muted2"><InfoPopIcon /> Robustness is shown for default weights</p>
  }
  const r = site.robustness
  if (!r) return null
  const pct = Math.round(r.top5_freq * 100)
  return (
    <p className="robust t-small">
      {r.robust ? <><ShieldIcon /> <strong className="t-label">Robust</strong> <span className="muted2">· in the top 5% of land in {pct}% of 1,000 weight tests</span></>
        : <span className="muted2">In the top 5% of land in {pct}% of 1,000 weight tests</span>}
      <InfoPopover title="Robustness">A site is Robust when its cell stays in the top 5% of land cells in at least 80% of 1,000 Monte Carlo weight draws.</InfoPopover>
    </p>
  )
}
const InfoPopIcon = () => <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M8 7v4.2M8 4.6v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>

/* ---------------------------------------------------------------- Top regions (heatmap step) */
export function TopRegionsPanel({ ctx, portfolio, stats, nLand, onOpen, onPortfolio, onWeights, hovered, onHover }: {
  ctx: Ctx
  portfolio: Portfolio | null
  stats: { best: number; top5: number } | null
  nLand: number | null
  onOpen: (s: SiteRef) => void
  onPortfolio: () => void
  onWeights: () => void
  hovered: string | null
  onHover: (id: string | null) => void
}) {
  const top = (portfolio?.top_cells ?? []).slice(0, 5)
  const n = portfolio?.variants.find((v) => v.id === 'best_match')?.sites.length ?? 0
  return (
    <div className="panel-body">
      <p className="overline">Top regions</p>
      <h2 className="t-h2">Earth places most like {ctx.targetShort} for {ctx.purposeName}</h2>
      <p className="t-small muted2">Every 0.5° cell of land (about 55 km north–south, narrower east–west toward the poles) is scored 0–100 on 10 factors.</p>
      <dl className="stats">
        <div><dt>Land areas scored</dt><dd className="num">{nLand === null ? '…' : nLand.toLocaleString('en')}</dd></div>
        <div><dt>Best match</dt><dd className="num">{stats ? `${to100(stats.best)} / 100` : '…'}</dd></div>
        <div><dt>Top 5% starts at</dt><dd className="num">{stats ? `${to100(stats.top5)} / 100` : '…'}</dd></div>
      </dl>
      <ol className="regions" aria-label="Top regions">
        {top.map((s, i) => (
          <li key={s.site_id}>
            <button type="button" data-site-id={s.site_id} className={`region-row ${hovered === s.site_id ? 'hov' : ''}`} onClick={() => onOpen(s)}
              onMouseEnter={() => onHover(s.site_id)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(s.site_id)} onBlur={() => onHover(null)}
>
              <span className="rank num">{i + 1}</span>
              <span className="rname">{siteTitle(s)}</span>
              <span className="minibar" aria-hidden="true"><i style={{ width: `${to100(s.score)}%` }} /></span>
              <span className="num">{to100(s.score)}<span className="sr-only"> out of 100, {band(to100(s.score))} match</span></span>
            </button>
          </li>
        ))}
      </ol>
      <div className="panel-actions">
        <button type="button" className="btn btn-primary btn-block" onClick={onPortfolio} disabled={!portfolio}>Show my Analog Portfolio ({n} sites) →</button>
        <button type="button" className="btn btn-secondary btn-block" onClick={onWeights}>Adjust what counts</button>
      </div>
      <p className="t-small muted2">Gravity, air and radiation never match: see What Earth can't give you</p>
    </div>
  )
}

/* ---------------------------------------------------------------- Portfolio */
export function PortfolioPanel({ ctx, portfolio, variantId, onVariant, onOpen, selected, hovered, onHover }: {
  ctx: Ctx
  portfolio: Portfolio
  variantId: VariantId
  onVariant: (v: VariantId) => void
  onOpen: (s: SiteRef) => void
  selected: string | null
  hovered: string | null
  onHover: (id: string | null) => void
}) {
  const variant = portfolio.variants.find((v) => v.id === variantId) ?? portfolio.variants[0]
  const covered = new Set(variant?.covers ?? [])
  const k = ctx.needs.filter((f) => covered.has(f)).length
  const m = ctx.needs.length
  const sites = variant?.sites ?? []
  const options = VARIANT_IDS.map((id) => {
    const v = portfolio.variants.find((x) => x.id === id)
    let reason = v?.unavailable_reason ?? null
    if (id === 'one_continent' && v && !v.available) reason = `No single continent covers ${k} or more needs.`
    return { value: id, label: VARIANT_UI[id].label, disabled: !v || !v.available, reason }
  })
  return (
    <div className="panel-body">
      <p className="overline">Your Analog Portfolio</p>
      <h2 className="t-h2">{sites.length === 1 ? `1 Earth site covers ${k} of ${m} needs` : `${sites.length} Earth sites together cover ${k} of ${m} needs`}</h2>
      <p className="t-small muted2">Each need is a factor that matters for {ctx.purposeName} (weight above 0). A site covers a need when it scores 70 or more on it, or reaches Earth's limit when the target is beyond Earth's range.</p>
      <div className="variant-row">
        <SegmentedControl label="Portfolio variant" value={variant?.id ?? 'best_match'} onChange={onVariant} options={options} />
        <InfoPopover title="Portfolio variants">Best match: highest scores. Easiest to reach: every site is within 6 hours of a city of 50,000+ people. One continent: all sites on one continent, for a single expedition.</InfoPopover>
      </div>
      {variant?.id === 'one_continent' && variant.continent && <p className="t-small muted2">All sites in {variant.continent}.</p>}
      {!sites.length ? (
        <EmptyState title="No site covers any need yet." body="Lower the bar or pick another purpose." />
      ) : (
        <ol className="site-list">
          {sites.map((s, i) => (
            <li key={s.site_id}>
              <SiteListCard site={s} n={i + 1} ctx={ctx} selected={selected === s.site_id} hovered={hovered === s.site_id} onOpen={() => onOpen(s)} onHover={onHover} />
            </li>
          ))}
        </ol>
      )}
      {ctx.needs.every((f) => covered.has(f)) && sites.length > 0 && <p className="t-small muted2">Every need Earth can meet is covered.</p>}
    </div>
  )
}

function SiteListCard({ site, n, ctx, selected, hovered, onOpen, onHover }: { site: SiteRef; n: number; ctx: Ctx; selected: boolean; hovered: boolean; onOpen: () => void; onHover: (id: string | null) => void }) {
  const score = to100(site.score)
  const chips = site.covers.filter((f) => ctx.needs.includes(f))
  const robust = !ctx.custom && ctx.robustnessAvailable && site.robustness?.robust
  return (
    <button type="button" data-site-id={site.site_id} className={`site-card ${selected ? 'sel' : ''} ${hovered ? 'hov' : ''}`} aria-pressed={selected} onClick={onOpen}
      onMouseEnter={() => onHover(site.site_id)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(site.site_id)} onBlur={() => onHover(null)}>
      <span className="sc-head">
        <span className="pin-glyph num"><span className="sr-only">Site </span>{n}</span>
        <span className="sc-name">
          <span className="t-title">{siteTitle(site)}</span>
          <span className="t-small muted2">{site.known_analog ? 'Known analog · ' : site.candidate ? 'New candidate · ' : ''}{fmtLatLon(site.lat, site.lon, 2)}</span>
        </span>
        <span className="sc-score"><span className="scoreLg">{score}</span><span className="micro muted2"><span className="sr-only">out of</span> / 100</span><span className="t-small">{band(score)}</span></span>
      </span>
      <span className="chips">
        <span className="t-small muted2">Covers</span>
        {chips.map((f) => <FactorChip key={f} f={f} atLimit={isAtLimit(ctx.target, f)} />)}
      </span>
      <span className="t-small sc-meta">{robust && <><ShieldIcon /> <strong>Robust</strong> · </>}{accessText(site.logistics?.travel_time_min)}</span>
      <span className="link-text t-small">Open details →</span>
    </button>
  )
}

/* ---------------------------------------------------------------- Fidelity gap */
export function FidelityGapPanel({ rows }: { rows: GapRowData[] }) {
  const tiers: [GapRowData['tier'], string][] = [['impossible', 'Impossible on Earth'], ['beyondRange', "Beyond Earth's range"], ['notCovered', 'Not covered by these sites']]
  return (
    <div className="panel-body gap-panel">
      <h2 className="t-h2">What Earth can't give you</h2>
      <p className="t-small muted2">No Earth site can match these. Rehearse them in a facility instead.</p>
      {tiers.map(([tier, title]) => {
        const rs = rows.filter((r) => r.tier === tier)
        if (!rs.length) return null
        return (
          <section key={tier} aria-label={title}>
            <h3 className={`overline tier-h ${tier}`}>{tier !== 'notCovered' ? <GapIcon /> : <span aria-hidden="true">┄</span>} {title}</h3>
            <ul className="gap-list">
              {rs.map((r) => (
                <li key={r.key} className={`gap-row ${r.tier}`}>
                  <p className="t-title">{r.name}</p>
                  {r.lines.map((l, i) => <p key={i} className="t-small num-inline">{l}</p>)}
                  {r.facilities.length > 0 && (
                    <p className="facilities">{r.facilities.slice(0, 3).map((f) => <span key={f} className="facility"><FlaskIcon /> {f}</span>)}</p>
                  )}
                  {r.sources.length > 0 && <p className="micro muted2">Sources: {r.sources.slice(0, 3).map((u, i) => <a key={u} href={u} target="_blank" rel="noreferrer">{i ? ' · ' : ''}{new URL(u).hostname.replace(/^www\./, '')}</a>)}</p>}
                  {r.fix && <button type="button" className="link-btn" onClick={r.fix.onClick}>{r.fix.label}</button>}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
      <p className="t-small muted2">Rehearse these in a facility instead.</p>
    </div>
  )
}

/* ---------------------------------------------------------------- Site card */
export function SiteCard({ site, n, nTotal, ctx, detail, onBack, backLabel, onCopy, headingRef }: {
  site: SiteRef
  n: number | null
  nTotal: number
  ctx: Ctx
  detail: CellDetail | null
  onBack: () => void
  backLabel: string
  onCopy: () => void
  headingRef: React.RefObject<HTMLHeadingElement | null>
}) {
  const [expanded, setExpanded] = useState(false)
  const fmt = useMemo(() => makeValueFormatter(ctx.factors), [ctx.factors])
  const featureOf = useMemo(() => Object.fromEntries(ctx.factors.factors.map((f) => [f.id, f.feature])), [ctx.factors])
  const score = to100(site.score)
  const pct = site.earth_percentile
  const topPct = pct === undefined ? null : Math.max(0.1, +(100 - pct).toFixed(1))
  const sorted = ALL_FACTORS.filter((f) => site.factor_scores[f] !== undefined && site.factor_scores[f] !== null)
    .sort((a, b) => (ctx.weights[b] ?? 0) - (ctx.weights[a] ?? 0) || Number(a.slice(1)) - Number(b.slice(1)))
  const needsRows = sorted.filter((f) => (ctx.weights[f] ?? 0) > 0)
  const rows = expanded ? sorted : needsRows
  const gapsT: Partial<Record<FactorId, number>> = Object.fromEntries(CORE_FACTORS.filter((f) => isAtLimit(ctx.target, f)).map((f) => [f, ctx.target.features![f]!.gap!]))
  return (
    <div className="panel-body site-card-panel">
      <button type="button" className="link-btn back" onClick={onBack}>← {backLabel}</button>
      <h2 className="t-h2" tabIndex={-1} ref={headingRef}>{siteTitle(site)}</h2>
      <p className="t-small muted2">{fmtLatLon(site.lat, site.lon, 2)} · 0.5° cell (~55 × {cellEwKm(site.lat)} km)</p>
      <p className="status-chips">
        {n !== null && <span className="tag">Site {n} of {nTotal}</span>}
        {topPct !== null && <span className="tag">Top {topPct}% of Earth land</span>}
        {site.known_analog && <span className="tag">□ Known analog</span>}
        {!site.known_analog && site.candidate && <span className="tag">☆ New candidate</span>}
      </p>
      {!site.known_analog && site.candidate && <Banner tone="info" title="New candidate.">This area scores high but isn't a known analog site. Needs field confirmation.</Banner>}
      <div className="score-block">
        <span className="scoreXl">{score}</span><span className="micro muted2">/ 100</span>
        <span className="t-title">{band(score)} match for {ctx.purposeName}</span>
      </div>
      <RobustnessLine site={site} ctx={ctx} />
      <p className="summary t-body">{summarySentence(ctx.targetShort, ctx.weights, site.factor_scores, gapsT)}</p>
      <div className="frow-head"><span className="overline">Each factor, 0–100 · sorted by weight</span><span className="overline">Weight</span></div>
      <ul className="factor-rows">
        {rows.map((f) => {
          const ui = FACTOR_UI[f]
          const s = site.factor_scores[f] as number
          const w = ctx.weights[f] ?? 0
          const feat = featureOf[f]
          const x = detail?.features[feat]
          const tv = ctx.target.features?.[f]?.value
          const capped = isAtLimit(ctx.target, f)
          const det = `Site ${detail ? fmt(f, x) : '…'} · target ${fmt(f, tv)}`
          return (
            <li key={f} className="frow" aria-label={`${ui.name}: ${to100(s)} out of 100${ui.tieBreaker ? ', tie-breaker' : `, weight ${w} percent`}. ${det}.${capped ? ` Earth can't reach this: short by ${fmt(f, ctx.target.features![f]!.gap)}.` : ''}`}>
              <span className={`ficon g-${ui.group}`} aria-hidden="true"><Icon name={`factor-${ui.group}`} size={20} /></span>
              <span className="fname">
                <span className="t-label">{ui.name}{ui.tieBreaker && <em className="muted2"> (tie-breaker)</em>}</span>
                <InfoPopover title={ui.name}>{ui.info}</InfoPopover>
              </span>
              <span className="fdet" aria-hidden="true">
                <span className="t-small muted2">{det}</span>
                {capped && <span className="t-small capped">⤒ Earth can't reach this: short by {fmt(f, ctx.target.features![f]!.gap)}</span>}
              </span>
              <span className="fbar" aria-hidden="true"><i className={`g-${ui.group}`} style={{ width: `${to100(s)}%` }} />{capped && <b className="capmark" />}</span>
              <span className="num fscore" aria-hidden="true">{to100(s)}</span>
              <span className="t-small muted2 fw" aria-hidden="true">{ui.tieBreaker ? '' : `×${w}`}</span>
            </li>
          )
        })}
      </ul>
      {sorted.length > needsRows.length && (
        <button type="button" className="link-btn" aria-expanded={expanded} onClick={() => setExpanded((e) => !e)}>
          {expanded ? 'Show fewer ▴' : `Show all ${sorted.filter((f) => CORE_FACTORS.includes(f as never)).length} factors + ${sorted.filter((f) => !CORE_FACTORS.includes(f as never)).length} tie-breakers ▾`}
        </button>
      )}
      {expanded && <p className="t-small muted2">Tie-breakers only nudge the score (up to 10%). Earth always differs a lot here.</p>}
      <div className="panel-actions row">
        <button type="button" className="btn btn-secondary" onClick={onCopy}>Copy share link</button>
      </div>
      <p className="t-small muted2">{accessText(site.logistics?.travel_time_min)}{site.logistics?.continent ? ` · ${site.logistics.continent}` : ''}</p>
    </div>
  )
}
