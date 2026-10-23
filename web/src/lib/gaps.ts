import type { Ctx } from '../components/panels'
import type { Gap, GapsFile, Portfolio, PortfolioVariant, TargetBody } from '../types/contract'
import { CORE_FACTORS } from '../types/contract'
import { isAtLimit, makeDeltaFormatter, makeValueFormatter, to100 } from './format'
import { earthLimit } from './limits'

// Fidelity Gap rows (spec §8.4 FidelityGapPanel). Tier 1 and the facility/source lists come from gaps.json;
// tier-2 numbers come from targets.json features (value, t_star, gap); tier 3 from the active portfolio variant.
export interface GapRowData { key: string; tier: 'impossible' | 'beyondRange' | 'notCovered'; name: string; lines: string[]; facilities: string[]; sources: string[]; fix?: { label: string; onClick: () => void }; info?: { title: string; text: string } }

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
    const lim = earthLimit(ctx.target, f, ctx.factors, ctx.earthRef)
    if (!lim) continue
    const related = t2.filter((g) => g.factors.includes(f) && g.values[body] !== undefined)
    const siteIdx = variant?.sites.findIndex((s) => (s.factor_scores[f] ?? 0) >= (portfolio?.theta ?? 0.7)) ?? -1
    const dfmt = makeDeltaFormatter(ctx.factors)
    // shortfall is always positive: Earth's coldest cell minus the target for coldest shadows (spec v0.3.1 §11.4)
    const lines = [`Target ${fmt(f, lim.target)} · best Earth ${fmt(f, lim.best)} · short ${dfmt(f, lim.short)}`]
    if (covered.has(f) && siteIdx >= 0) lines.push(`Site ${siteIdx + 1} covers it at Earth's limit · short ${dfmt(f, lim.short)}`)
    rows.push({ key: `live-${f}`, tier: 'beyondRange', name: ctx.ft.label(f), lines, info: lim.note ? { title: 'Best Earth', text: lim.note } : undefined, facilities: fac([...new Set(related.flatMap((g) => g.example_facilities))]), sources: [...new Set(related.flatMap((g) => g.citation_urls))] })
  }
  // Coldest shadows (spec v0.3.1 §11.4, Moon): permanently shadowed cold traps, ~40 K (Diviner; ~38 K at the LCROSS site).
  // best Earth t* = Earth's coldest 0.5° land-cell annual mean surface temperature exported by the engine
  // (targets.json earth_reference.stats.ts_mean_k.min); residual = t* − target (positive). Static MODIS fallback until then.
  const psr = t2.find((g) => g.id === 'psr_cryogenic_cold' && g.values[body] !== undefined && g.values[body] !== null)
  if (psr) {
    const PSR_TARGET_K = 40
    const tStar = ctx.earthRef?.stats?.ts_mean_k?.min?.value
    const line = tStar !== undefined && Number.isFinite(tStar)
      ? `Target ~${PSR_TARGET_K} K · best Earth ${Math.round(tStar)} K · short ${Math.round(tStar - PSR_TARGET_K)} K`
      : `Target ~${PSR_TARGET_K} K · Earth's coldest surface ~175 K · short ~135 K`
    rows.push({ key: psr.id, tier: 'beyondRange', name: 'Coldest shadows', lines: [line],
      info: tStar !== undefined ? { title: 'Best Earth', text: 'Coldest 0.5° land cell in our data (annual mean surface temperature)' } : { title: 'Best Earth', text: "Earth's coldest measured surface, ~175 K (MODIS, Scambos et al. 2018)" },
      facilities: fac(psr.example_facilities), sources: psr.citation_urls })
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
      key: `nc-${f}`, tier: 'notCovered', name: ctx.ft.label(f),
      lines: [uncoverable ? 'No candidate Earth site scores 70 on this need.' : `Best site scores ${to100(best)}; a site needs 70 to count as covering it.`],
      facilities: [], sources: [],
      fix: !uncoverable && bmCovers && variant?.id !== 'best_match' && onBestMatch ? { label: 'Try "Best match" →', onClick: onBestMatch } : undefined,
    })
  }
  return rows
}

