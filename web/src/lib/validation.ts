// Validation tab (spec §8.4 ValidationSummary, §11.6): per target + purpose, from validation.json; recomputed from live
// percentiles under custom weights with the pipeline's own rules (export/mock.py: positives on a matching body + purpose,
// every negative on every pair; in_top5 = percentile ≥ 95, in_top1 = percentile ≥ 99; rank AUC = Mann–Whitney with ties = ½).
import type { TargetBody, ValidationFile, ValidationSite } from '../types/contract'

export type EvalStatus = NonNullable<ValidationSite['results'][number]['status']>
export interface AnalogRow {
  name: string; cellId: number; percentile: number; isControl: boolean; inTop5: boolean; inTop1: boolean; site: ValidationSite
  /** scored, or why the evaluation was excluded. Excluded evaluations stay in every denominator as misses (contract v1.2). */
  status: EvalStatus
}
export interface PairValidation {
  rows: AnalogRow[]
  total: number
  hit5: number
  hit1: number
  nControls: number
  /** positives that were excluded (gate, land, hard filter, insufficient data) but still counted in `total` */
  nExcluded: number
  auc: number | null
}
/** Live (custom-weight) result for one evaluation cell from the in-browser scorer. percentile null = insufficient data. */
export interface LiveCell { percentile: number | null }

export const TOP5_PCT = 95
export const TOP1_PCT = 99

const CONTROL_PREFIX = /^negative control:\s*/i
export const analogName = (s: ValidationSite) => s.name.replace(CONTROL_PREFIX, '')

/** Which validation sites are evaluated on this pair (same rule as the pipeline). */
export function evaluated(v: ValidationFile, body: TargetBody, profileId: string): ValidationSite[] {
  return v.sites.filter((s) => s.kind === 'negative' || ((s.body_analog === body || s.body_analog === 'both') && s.mission_purposes.includes(profileId)))
}

export function rankAuc(pos: number[], neg: number[]): number | null {
  if (!pos.length || !neg.length) return null
  let a = 0
  for (const p of pos) for (const n of neg) a += p > n ? 1 : p === n ? 0.5 : 0
  return a / (pos.length * neg.length)
}

/** The cell the pipeline evaluates a site at (coastal sites are snapped to the nearest land cell). */
export const evalCell = (s: ValidationSite) => s.eval_cell_id ?? s.cell_id

export const STATUS_TEXT: Record<EvalStatus, string> = {
  scored: '',
  gate_excluded: 'fails the Mars gate',
  land_filter_excluded: 'no land cell nearby',
  hard_filter_excluded: 'fails a hard limit',
  insufficient_data: 'not enough data',
}

/**
 * Per target + purpose, with the pipeline's rules (export/real.py): every evaluation of the pair stays in the
 * denominators; gate- and land-excluded evaluations count as percentile 0, hard-filter-excluded ones at the percentile of
 * S = 0, insufficient-data ones at 0.
 * live: eval cell → live result (custom weights). The gate and land filter don't depend on weights, so those statuses
 * come from the file; the hard-filter percentile and the 70% data floor do, so they come from the live scorer.
 */
export function pairValidation(v: ValidationFile, targetId: string, body: TargetBody, profileId: string, live?: Map<number, LiveCell>): PairValidation {
  const rows: AnalogRow[] = []
  for (const s of evaluated(v, body, profileId)) {
    const r = s.results.find((x) => x.target_id === targetId && x.profile_id === profileId)
    if (!r) continue // not evaluated on this pair in this release
    const fileStatus: EvalStatus = r.status ?? 'scored'
    let status = fileStatus
    let pct: number | null = r.percentile
    if (live && fileStatus !== 'gate_excluded' && fileStatus !== 'land_filter_excluded') {
      const l = live.get(evalCell(s))
      if (!l) continue
      if (l.percentile === null || Number.isNaN(l.percentile)) { status = 'insufficient_data'; pct = 0 }
      else { pct = l.percentile; if (fileStatus === 'insufficient_data') status = 'scored' }
    }
    if (status !== 'scored' && status !== 'hard_filter_excluded') pct = 0
    if (pct === null || Number.isNaN(pct)) pct = 0
    const counts = status === 'scored'
    rows.push({ name: analogName(s), cellId: evalCell(s), percentile: pct, isControl: s.kind === 'negative', status,
      inTop5: counts && pct >= TOP5_PCT, inTop1: counts && pct >= TOP1_PCT, site: s })
  }
  rows.sort((a, b) => Number(a.isControl) - Number(b.isControl) || b.percentile - a.percentile)
  const pos = rows.filter((r) => !r.isControl)
  const neg = rows.filter((r) => r.isControl)
  return {
    rows, total: pos.length, hit5: pos.filter((r) => r.inTop5).length, hit1: pos.filter((r) => r.inTop1).length,
    nControls: neg.length, nExcluded: pos.filter((r) => r.status !== 'scored').length,
    auc: rankAuc(pos.map((r) => r.percentile), neg.map((r) => r.percentile)),
  }
}

/** "top 2%" from a 0–100 percentile (same rounding as the site card chip). */
export const topPct = (pct: number) => Math.max(0.1, +(100 - pct).toFixed(1))
