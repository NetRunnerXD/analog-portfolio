import { FACTOR_UI } from '../copy'
import type { Ctx } from '../components/panels'
import type { Gap, GapsFile, Portfolio, PortfolioVariant, TargetBody } from '../types/contract'
import { CORE_FACTORS } from '../types/contract'
import { isAtLimit, makeValueFormatter, to100 } from './format'

// Fidelity Gap rows (spec §8.4 FidelityGapPanel). Tier 1 and the facility/source lists come from gaps.json;
// tier-2 numbers come from targets.json features (value, t_star, gap); tier 3 from the active portfolio variant.
export interface GapRowData { key: string; tier: 'impossible' | 'beyondRange' | 'notCovered'; name: string; lines: string[]; facilities: string[]; sources: string[]; fix?: { label: string; onClick: () => void } }

const litStr = (v: unknown, unit?: string) => {
  if (v === null || v === undefined) return ''
  const s = Array.isArray(v) ? v.join('–') : String(v)
  return typeof v === 'number' && unit && !/^(qualitative|category|composition|pressure)$/.test(unit) ? `${s} ${unit}` : s
}

export function buildGapRows(gaps: GapsFile, body: TargetBody, ctx: Ctx, variant: PortfolioVariant | undefined, onBestMatch: (() => void) | null, portfolio: Portfolio | null, fmt: ReturnType<typeof makeValueFormatter>): GapRowData[] {
  const fac = (ids: string[]) => ids.map((id) => gaps.facilities[id]?.name ?? id)
  const bodyWord = body === 'moon' ? 'Moon' : 'Mars'
  const rows: GapRowData[] = []
  // Tier 1: never on Earth (Researcher's gaps.json, constant)
  for (const g of gaps.tiers.never_on_earth.gaps) {
    const tv = g.values[body]
    if (tv === undefined || tv === null) continue
    const earth = g.values.earth
    rows.push({ key: g.id, tier: 'impossible', name: g.label, lines: [`${bodyWord} ${litStr(tv, g.values.unit)}${earth !== undefined && earth !== null ? ` · Earth ${litStr(earth, g.values.unit)}` : ''}`], facilities: fac(g.example_facilities), sources: g.citation_urls })
  }
  // Tier 2: beyond Earth's range. Live rows: every core factor whose target value is outside Earth's P0.5–P99.5 (targets.json gap > 0)
  const t2: Gap[] = gaps.tiers.beyond_earth_range.gaps
  const covered = new Set(variant?.covers ?? [])
  const liveFactors = CORE_FACTORS.filter((f) => isAtLimit(ctx.target, f))
  for (const f of liveFactors) {
    const fv = ctx.target.features![f]!
    const related = t2.filter((g) => g.factors.includes(f) && g.values[body] !== undefined)
    const siteIdx = variant?.sites.findIndex((s) => (s.factor_scores[f] ?? 0) >= (portfolio?.theta ?? 0.7)) ?? -1
    const lines = [`Target ${fmt(f, fv.value)} · best Earth ${fmt(f, fv.t_star)} · short ${fmt(f, fv.gap)}`]
    if (covered.has(f) && siteIdx >= 0) lines.push(`Site ${siteIdx + 1} covers it at Earth's limit · short ${fmt(f, fv.gap)}`)
    rows.push({ key: `live-${f}`, tier: 'beyondRange', name: FACTOR_UI[f].name, lines, facilities: fac([...new Set(related.flatMap((g) => g.example_facilities))]), sources: [...new Set(related.flatMap((g) => g.citation_urls))] })
  }
  // Static tier-2 rows for factors outside the scored core (e.g. Mars surface pressure on F11)
  for (const g of t2) {
    if (g.values[body] === undefined || g.values[body] === null) continue
    if (g.factors.some((f) => (CORE_FACTORS as string[]).includes(f))) continue
    rows.push({ key: g.id, tier: 'beyondRange', name: g.label, lines: [`${bodyWord} ${litStr(g.values[body], g.values.unit)}${g.values.earth ? ` · Earth ${litStr(g.values.earth, g.values.unit)}` : ''}`], facilities: fac(g.example_facilities), sources: g.citation_urls })
  }
  // Tier 3: needs not covered by the chosen sites
  for (const f of ctx.needs) {
    if (covered.has(f)) continue
    const best = Math.max(0, ...(variant?.sites ?? []).map((s) => s.factor_scores[f] ?? 0))
    const uncoverable = portfolio?.uncoverable.includes(f)
    const bmCovers = portfolio?.variants.find((v) => v.id === 'best_match')?.covers?.includes(f)
    rows.push({
      key: `nc-${f}`, tier: 'notCovered', name: FACTOR_UI[f].name,
      lines: [uncoverable ? 'No candidate Earth site scores 70 on this need.' : `Best site scores ${to100(best)}; a site needs 70 to count as covering it.`],
      facilities: [], sources: [],
      fix: !uncoverable && bmCovers && variant?.id !== 'best_match' && onBestMatch ? { label: 'Try "Best match" →', onClick: onBestMatch } : undefined,
    })
  }
  return rows
}

