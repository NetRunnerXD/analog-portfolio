import { useEffect, useMemo, useState } from 'react'
import type { Ctx } from './panels'
import { pairValidation, topPct, TOP5_PCT, type PairValidation } from '../lib/validation'
import type { FactorId, SiteRef, TargetBody, ValidationFile } from '../types/contract'
import type { CellDetail } from '../worker/protocol'
import type { ScorerClient } from '../worker/client'

/**
 * Site card · Validation tab (spec §8.4 ValidationSummary, §11.6). Per target + purpose. Default weights: validation.json.
 * Custom weights: percentiles of the same analog cells from the in-browser scorer, with the "Recalculated" tag.
 */
export default function ValidationTab({ validation, targetId, body, profileId, ctx, site, scorer, scoreKey, showOnMap, onShowOnMap }: {
  validation: ValidationFile
  targetId: string
  body: TargetBody
  profileId: string
  ctx: Ctx
  site: SiteRef
  scorer: ScorerClient | null
  /** changes whenever the worker re-scores (target, purpose, weights) */
  scoreKey: string | null
  showOnMap: boolean
  onShowOnMap: (v: boolean) => void
}) {
  const [cells, setCells] = useState<{ key: string; byCell: Map<number, CellDetail> } | null>(null)
  const cellIds = useMemo(() => [...new Set(validation.sites.map((s) => s.cell_id))], [validation])
  useEffect(() => {
    if (!scorer || !scoreKey) return
    let live = true
    scorer.cells(cellIds).then((ds) => live && setCells({ key: scoreKey, byCell: new Map(ds.map((d) => [d.cellId, d])) })).catch(() => undefined)
    return () => { live = false }
  }, [scorer, scoreKey, cellIds])
  const cur = cells && cells.key === scoreKey ? cells.byCell : null
  const livePct = useMemo(() => {
    if (!ctx.custom || !cur) return undefined
    const m = new Map<number, number>()
    for (const [c, d] of cur) if (d.inGrid && d.percentile !== null) m.set(c, d.percentile)
    return m
  }, [ctx.custom, cur])
  const pv: PairValidation | null = ctx.custom && !livePct ? null : pairValidation(validation, targetId, body, profileId, livePct)

  // honest-miss note: the weighted need with the lowest score at that analog's cell
  const mainFactor = (cellId: number): FactorId | null => {
    const d = cur?.get(cellId)
    if (!d) return null
    let best: FactorId | null = null
    let bestLoss = -1
    for (const f of ctx.needs) {
      const s = d.factorScores[f]
      if (s === undefined) continue
      const loss = (ctx.weights[f] ?? 0) * (1 - s)
      if (loss > bestLoss) { bestLoss = loss; best = f }
    }
    return best
  }

  const sitePct = site.earth_percentile
  return (
    <div className="validation">
      <h3 className="t-title">Did the engine find famous analogs on its own?</h3>
      {pv === null ? (
        <div aria-busy="true"><div className="skeleton" /><div className="skeleton" /><p className="t-small muted2">Recalculating for your weights…</p></div>
      ) : (
        <>
          <p className="t-small muted2">We fixed the weights before scoring, then checked where {pv.total} well-known analog sites landed for this target and purpose. The engine never saw this list.
            {validation.frozen_commit ? ` Weights frozen at commit ${validation.frozen_commit.slice(0, 7)}${validation.frozen_at ? ` (${validation.frozen_at})` : ''}.` : ''}</p>
          {ctx.custom && <p className="tag tag-live">Recalculated for your weights. The pre-registered result uses the default weights.</p>}
          {pv.total === 0 ? (
            <p className="t-small">No known analog in our list is tagged for this purpose on the {body === 'moon' ? 'Moon' : 'Mars'}, so there is nothing to check here yet.</p>
          ) : (
            <dl className="vstats">
              <div><dt className="t-small muted2">known analogs in the top 5%</dt><dd className="scoreLg num">{pv.hit5} of {pv.total}</dd></div>
              <div><dt className="t-small muted2">in the top 1%</dt><dd className="scoreLg num">{pv.hit1} of {pv.total}</dd></div>
              {pv.auc !== null && <div><dt className="t-small muted2">AUC vs {pv.nControls} non-analogs (1.0 = perfect, 0.5 = chance)</dt><dd className="scoreLg num">{pv.auc.toFixed(2)}</dd></div>}
            </dl>
          )}
          {sitePct !== undefined && sitePct !== null && <p className="t-small this-site">This site ranks in the top {topPct(sitePct)}% for {ctx.targetShort} · {ctx.purposeName}.</p>}
          <div className="vlist-head">
            <span className="t-label">Known analogs · <span aria-hidden="true">|</span><span className="sr-only">the vertical line</span> = top 5% line</span>
            <label className="t-small"><input type="checkbox" checked={showOnMap} onChange={(e) => onShowOnMap(e.target.checked)} /> Show on map</label>
          </div>
          <ul className="vlist">
            {pv.rows.map((r) => (
              <li key={`${r.cellId}:${r.name}`} className={r.isControl ? 'control' : ''}
                aria-label={`${r.name}${r.isControl ? ' (control)' : ''}: top ${topPct(r.percentile)} percent${r.inTop5 ? ', inside the top 5 percent' : ', outside the top 5 percent'}.`}>
                <span className="t-label vname" aria-hidden="true">{r.isControl ? <>{r.name} <span className="muted2">(control)</span></> : r.name}</span>
                <span className="vbar" aria-hidden="true"><i className="v5" style={{ left: `${TOP5_PCT}%` }} /><b style={{ left: `${r.percentile}%` }} /></span>
                <span className="num t-small vpct" aria-hidden="true">top {topPct(r.percentile)}%</span>
              </li>
            ))}
          </ul>
          {pv.rows.filter((r) => !r.isControl && !r.inTop5).map((r) => {
            const f = mainFactor(r.cellId)
            return f ? <p key={`miss:${r.cellId}:${r.name}`} className="t-small muted2">{r.name} lands outside the top 5% because {ctx.ft.label(f).toLowerCase()} differs. We report it rather than retune the weights.</p> : null
          })}
        </>
      )}
    </div>
  )
}
