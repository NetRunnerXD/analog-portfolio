// Validation tab (spec §8.4 ValidationSummary, §11.6): per target + purpose, from validation.json; recomputed from live
// percentiles under custom weights with the pipeline's own rules (export/mock.py: positives on a matching body + purpose,
// every negative on every pair; in_top5 = percentile ≥ 95, in_top1 = percentile ≥ 99; rank AUC = Mann–Whitney with ties = ½).
import type { TargetBody, ValidationFile, ValidationSite } from '../types/contract'

export interface AnalogRow { name: string; cellId: number; percentile: number; isControl: boolean; inTop5: boolean; inTop1: boolean; site: ValidationSite }
export interface PairValidation {
  rows: AnalogRow[]
  total: number
  hit5: number
  hit1: number
  nControls: number
  auc: number | null
}

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

/**
 * live: cell_id → percentile (0–100) from the in-browser scorer (custom weights). Without it the precomputed
 * validation.json results for this pair are used.
 */
export function pairValidation(v: ValidationFile, targetId: string, body: TargetBody, profileId: string, live?: Map<number, number>): PairValidation {
  const rows: AnalogRow[] = []
  for (const s of evaluated(v, body, profileId)) {
    let pct: number | undefined
    if (live) pct = live.get(s.eval_cell_id ?? s.cell_id)
    else pct = s.results.find((r) => r.target_id === targetId && r.profile_id === profileId)?.percentile
    if (pct === undefined || pct === null || Number.isNaN(pct)) continue
    rows.push({ name: analogName(s), cellId: s.cell_id, percentile: pct, isControl: s.kind === 'negative', inTop5: pct >= TOP5_PCT, inTop1: pct >= TOP1_PCT, site: s })
  }
  rows.sort((a, b) => Number(a.isControl) - Number(b.isControl) || b.percentile - a.percentile)
  const pos = rows.filter((r) => !r.isControl)
  const neg = rows.filter((r) => r.isControl)
  return {
    rows, total: pos.length, hit5: pos.filter((r) => r.inTop5).length, hit1: pos.filter((r) => r.inTop1).length,
    nControls: neg.length, auc: rankAuc(pos.map((r) => r.percentile), neg.map((r) => r.percentile)),
  }
}

/** "top 2%" from a 0–100 percentile (same rounding as the site card chip). */
export const topPct = (pct: number) => Math.max(0.1, +(100 - pct).toFixed(1))
