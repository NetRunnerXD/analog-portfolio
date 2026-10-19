// JS port of pipeline/analog_portfolio/score/{engine,variants}.py and the portfolio step of export/mock.py.
// Runs in the scoring Web Worker (src/worker/scorer.worker.ts) for live re-weighting, and in vitest for parity.
// Every number it produces is computed from the shipped Earth grid + targets.json + profiles.json/factors.json.
import { ALL_FACTORS, CORE_FACTORS, SECONDARY_FACTORS } from '../types/contract'
import type { FactorId, FactorsFile, HardFilter, Portfolio, PortfolioVariant, Profile, ProfilesFile, SiteRef, TargetBody, VariantId } from '../types/contract'
import { earthRadiusKm, haversineKm, pyRound, weightedPctRank, weightedQuantile } from './area'
import { FLOOR, flagMatch, greedyPortfolio } from './normalize'

/** Filter code the worker sends for insufficient_data cells (filter codes 1..n index the active hard filters). */
export const INSUFFICIENT_CODE = 255
export const EASY_MAX_MIN = 360 // easiest_to_reach: travel_time_min <= 360 (contract v1.1 §4.1)
export const NCELLS = 259200

export interface EarthGrid {
  n: number
  cellId: Int32Array
  lat: Float64Array
  lon: Float64Array
  areaW: Float64Array
  cols: Record<string, Float64Array>
  /** cache of target-independent percentile ranks */
  _pct: Record<string, Float64Array>
}

export function prepareEarth(columns: Record<string, ArrayLike<number>>): EarthGrid {
  const ids = columns.cell_id
  if (!ids) throw new Error('earth grid needs a cell_id column (sparse layout)')
  const n = ids.length
  const cellId = new Int32Array(n)
  const lat = new Float64Array(n)
  const lon = new Float64Array(n)
  const areaW = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const c = ids[i]
    cellId[i] = c
    const row = Math.floor(c / 720)
    lat[i] = 89.75 - 0.5 * row
    lon[i] = -179.75 + 0.5 * (c % 720)
    areaW[i] = Math.cos((lat[i] * Math.PI) / 180)
  }
  const cols: Record<string, Float64Array> = {}
  for (const [k, v] of Object.entries(columns)) if (k !== 'cell_id') cols[k] = v instanceof Float64Array ? v : Float64Array.from(v)
  return { n, cellId, lat, lon, areaW, cols, _pct: {} }
}

const nan0 = (v: number) => (Number.isNaN(v) ? 0 : v)
const clip01 = (v: number) => (Number.isNaN(v) ? 0 : v < 0 ? 0 : v > 1 ? 1 : v)
/** Like clip01 but keeps NaN: a core factor whose Earth input is missing in a cell is dropped for that cell (contract §3.2.6). */
const clipKeepNaN = (v: number) => (Number.isNaN(v) ? NaN : v < 0 ? 0 : v > 1 ? 1 : v)

/** Contract §3.2.6 default: a cell is scored only if its present factors carry ≥ 70% of the active weight. */
export const MIN_ACTIVE_WEIGHT_FRAC = 0.7
export const minActiveFrac = (profiles: ProfilesFile) => {
  const v = Number((profiles.defaults as { missing_data?: { min_active_weight_frac?: number } }).missing_data?.min_active_weight_frac)
  return Number.isFinite(v) && v > 0 ? v : MIN_ACTIVE_WEIGHT_FRAC
}
/** Factors scored without a target value: F7 is directional (drier = better; every target is hyper-arid, AI = 0). */
export const TARGET_FREE_FACTORS: readonly FactorId[] = ['F7']
/** Weighted core factors dropped for a target because it has no value for them (contract §3.2.5). */
export const targetDropped = (tv: TargetValues, weights: Record<string, number>): FactorId[] =>
  CORE_FACTORS.filter((f) => (weights[f] ?? 0) > 0 && !TARGET_FREE_FACTORS.includes(f) && (tv[f] === null || tv[f] === undefined))

function pct(e: EarthGrid, col: string, higherIsBetter: boolean): Float64Array {
  const key = `${col}:${higherIsBetter}`
  if (!e._pct[key]) e._pct[key] = weightedPctRank(e.cols[col], e.areaW, higherIsBetter)
  return e._pct[key]
}

export function lithMatrix(f: FactorsFile): number[][] {
  const codes = Object.fromEntries(f.lithology_classes.map((c) => [c.id, c.code]))
  const n = Math.max(...f.lithology_classes.map((c) => c.code)) + 1
  const m = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? f.lithology_similarity.default_same : 0)))
  m[0][0] = 0
  for (const [a, b, s] of f.lithology_similarity.pairs) { m[codes[a]][codes[b]] = s; m[codes[b]][codes[a]] = s }
  return m
}

export type TargetValues = Partial<Record<FactorId, number | null>>

/** {factor: [t_star, gap]} for factors with earth_clip (P0.5 / P99.5 area-weighted land quantiles). */
export function clipTargets(e: EarthGrid, tv: TargetValues, f: FactorsFile): Partial<Record<FactorId, [number, number]>> {
  const out: Partial<Record<FactorId, [number, number]>> = {}
  for (const fac of f.factors) {
    const t = tv[fac.id]
    if (t === null || t === undefined || !fac.earth_clip) continue
    const [lo, hi] = weightedQuantile(e.cols[fac.feature], e.areaW, [0.005, 0.995])
    const ts = Math.min(Math.max(t, lo), hi)
    out[fac.id] = [ts, Math.abs(t - ts)]
  }
  return out
}

/** Per-factor similarity arrays s_F in [0, 1] (engine.factor_scores). A core factor with no target value is dropped. */
export function factorScores(e: EarthGrid, tv: TargetValues, body: TargetBody, f: FactorsFile): Partial<Record<FactorId, Float64Array>> {
  const fac = Object.fromEntries(f.factors.map((x) => [x.id, x]))
  const clips = clipTargets(e, tv, f)
  const has = (id: FactorId) => tv[id] !== null && tv[id] !== undefined
  const tstar = (id: FactorId) => (clips[id] ? clips[id]![0] : (tv[id] as number))
  const n = e.n
  const s: Partial<Record<FactorId, Float64Array>> = {}
  // core factors keep NaN where the Earth input is missing (dropped per cell in aggregate); secondaries treat it as 0
  const map = (fn: (i: number) => number) => { const a = new Float64Array(n); for (let i = 0; i < n; i++) a[i] = clipKeepNaN(fn(i)); return a }
  const mapSec = (fn: (i: number) => number) => { const a = new Float64Array(n); for (let i = 0; i < n; i++) a[i] = clip01(fn(i)); return a }
  const ratio = (x: number, t: number) => (x + t === 0 ? 1 : 1 - Math.abs(x - t) / (x + t))
  const c = e.cols
  if (has('F1')) { const t = tstar('F1'); s.F1 = map((i) => ratio(c.ts_mean_k[i], t)) }
  if (has('F2')) { const t = tstar('F2'); s.F2 = map((i) => ratio(c.dt_k[i], t)) }
  if (has('F3')) { const t = tv.F3 as number; s.F3 = map((i) => 1 - Math.abs(c.ti_class[i] - t) / 4) }
  if (has('F4')) { const t = tv.F4 as number; s.F4 = map((i) => 1 - Math.abs(c.slope_lt5_frac[i] - t)) }
  if (has('F5')) { const t = tstar('F5'); s.F5 = map((i) => ratio(c.relief_m[i], t)) }
  if (has('F6')) {
    const lm = lithMatrix(f)
    const t = Math.trunc(tv.F6 as number)
    s.F6 = map((i) => (Number.isNaN(c.lith_class[i]) ? NaN : lm[Math.trunc(c.lith_class[i])]?.[t] ?? 0))
  }
  // F7 is directional (contract §3.2: s = 1 − P_earth(aridity), drier = better) and needs no target value: every target
  // is hyper-arid (AI = 0), so it is always scored, even when targets.json leaves F7.value null.
  { const p = pct(e, 'aridity_index', false); const ai = c.aridity_index; s.F7 = map((i) => (Number.isNaN(ai[i]) ? NaN : p[i])) }
  if (has('F8')) { const t = tv.F8 as number; s.F8 = map((i) => 1 - Math.abs(c.barren_frac[i] - t)) }
  if (has('F9')) { const t = tv.F9 as number; s.F9 = map((i) => 1 - Math.abs(c.ice_index[i] - t)) }
  if (has('F10')) {
    const tau = Number(fac.F10.params?.tau)
    const t = tstar('F10')
    s.F10 = map((i) => Math.exp(-0.5 * ((c.noon_sun_elev_deg[i] - t) / tau) ** 2))
  }
  const cap11 = Number(fac.F11.params?.cap?.[body] ?? 0)
  const pm = pct(e, 'column_mass_gcm2', false)
  const pr = pct(e, 'cutoff_rigidity_gv', false)
  s.F11 = mapSec((i) => cap11 * (0.5 * (pm[i] + pr[i])))
  const cap12 = Number(fac.F12.params?.cap?.[body] ?? 0)
  const pu = pct(e, 'uv_index', true)
  s.F12 = mapSec((i) => cap12 * pu[i])
  const tf = has('F13') ? Math.trunc(tv.F13 as number) : 0
  s.F13 = mapSec((i) => flagMatch(Math.trunc(nan0(c.geomorph_flags[i])), tf))
  return s
}

/**
 * (S_core, S) per cell (engine.aggregate). Factors dropped for the target are left out and the weights renormalised.
 * Missing Earth data (contract §3.2.6): a core factor that is NaN in a cell is dropped for that cell and the weights are
 * renormalised over the factors present; if those carry less than `minFrac` of the active weight the cell is
 * `insufficient_data` and gets NaN (no score; excluded from ranking, thresholds and the candidate pool by `run`).
 * `coverage` is the present share of the active weight per cell (1 when nothing is missing).
 */
export function aggregate(s: Partial<Record<FactorId, Float64Array>>, weights: Record<string, number>, n: number, minFrac = MIN_ACTIVE_WEIGHT_FRAC):
  { core: Float64Array; total: Float64Array; coverage: Float64Array } {
  const active = Object.entries(weights).filter(([f, w]) => w > 0 && s[f as FactorId]) as [FactorId, number][]
  let wsum = 0
  for (const [, w] of active) wsum += w
  const core = new Float64Array(n)
  const total = new Float64Array(n)
  const coverage = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let log = 0
    let wp = 0
    for (const [f, w] of active) {
      const v = s[f]![i]
      if (Number.isNaN(v)) continue
      wp += w
      log += (w / wsum) * Math.log(Math.max(v, FLOOR))
    }
    coverage[i] = wsum > 0 ? wp / wsum : 0
    if (wsum > 0 && wp < wsum && wp < minFrac * wsum - 1e-12) { core[i] = NaN; total[i] = NaN; continue }
    // all present: exactly the reference arithmetic; some missing: renormalise over the present weight
    core[i] = wsum > 0 ? Math.exp(wp === wsum ? log : (log * wsum) / wp) : 0
    let sec = 0
    for (const f of SECONDARY_FACTORS) sec += s[f]![i]
    total[i] = core[i] * (0.9 + 0.1 * (sec / 3))
  }
  return { core, total, coverage }
}

/** Hard filters by id (engine.hard_filter_mask). Unknown ids pass (and are reported). */
export function filterPasses(id: string, c: Record<string, Float64Array>, i: number): boolean | null {
  switch (id) {
    case 'land': return nan0(c.water_frac[i]) < 0.5
    case 'not_urban': return nan0(c.builtup_frac[i]) < 0.5
    case 'frozen_ground': return nan0(c.ice_index[i]) > 0 || c.ts_mean_k[i] < 273.15
    case 'dry_or_cold_desert': { const ai = c.aridity_index[i]; return ai < 0.2 || (c.ts_mean_k[i] < 273.15 && ai < 0.5) }
    default: return null
  }
}

export const activeFilters = (profiles: ProfilesFile, profile: Profile): HardFilter[] => [...profiles.global_hard_filters, ...profile.hard_filters]

/** filterCode per cell: 0 = passes, i > 0 = 1-based index of the first failing filter in activeFilters (spec §8.3). */
export function filterCodes(e: EarthGrid, filters: HardFilter[]): { code: Uint8Array; unknown: string[] } {
  const code = new Uint8Array(e.n)
  const unknown = new Set<string>()
  for (let i = 0; i < e.n; i++) {
    for (let k = 0; k < filters.length; k++) {
      const ok = filterPasses(filters[k].id, e.cols, i)
      if (ok === null) { unknown.add(filters[k].id); continue }
      if (!ok) { code[i] = k + 1; break }
    }
  }
  return { code, unknown: [...unknown] }
}

export interface RunInput {
  earth: EarthGrid
  s: Partial<Record<FactorId, Float64Array>>
  clips: Partial<Record<FactorId, [number, number]>>
  targetId: string
  profile: Profile
  profiles: ProfilesFile
  weights: Record<string, number>
  knownCells: Map<number, string> // validation.csv positives: cell_id -> name
  continentOf: (cellId: number, lat: number, lon: number) => string | null
  /** Build the candidate pool and the three variants (default true). The worker skips it when the shipped default-weight
   *  portfolio is used, and only needs the heat grid and thresholds. */
  withPortfolio?: boolean
}

export interface RunOutput {
  /** null when run with withPortfolio: false */
  portfolio: Portfolio | null
  thresholds: { median: number; top5: number; top1: number }
  /** S per cell; 0 for filtered cells, NaN for insufficient_data cells */
  total: Float64Array
  /** area-weighted Earth percentile 0–100 (0 for insufficient_data cells) */
  pct: Float64Array
  code: Uint8Array
  /** 1 where the cell has enough data to score (contract §3.2.6) */
  valid: Uint8Array
  /** present share of the active weight per cell */
  coverage: Float64Array
  unknownFilters: string[]
  /** cells that pass the hard filters and have enough data */
  nPass: number
  /** insufficient_data cells (not counted in the land total) */
  nInsufficient: number
}

export function siteNameForCell(lat: number, lon: number): string {
  return `Candidate cell ${lat.toFixed(2)}, ${lon.toFixed(2)}`
}

/** Score every Earth land cell and build the three portfolio variants (export/mock.py portfolio step, contract §4.1). */
export function run(inp: RunInput): RunOutput {
  const { earth: e, s, profile, profiles, weights } = inp
  const d = profiles.defaults
  const theta = profile.theta ?? d.theta
  const { core, total, coverage } = aggregate(s, weights, e.n, minActiveFrac(profiles))
  const { code, unknown } = filterCodes(e, activeFilters(profiles, profile))
  // export/real.py: valid = finite S; filtered cells count as S = 0; insufficient_data cells are left out of every
  // percentile, threshold and the pool (NaN in the ranking array)
  const valid = new Uint8Array(e.n)
  const totalF = new Float64Array(e.n)
  const tfRank = new Float64Array(e.n)
  const mx: number[] = []
  const mw: number[] = []
  let nPass = 0
  let nInsufficient = 0
  for (let i = 0; i < e.n; i++) {
    if (!Number.isFinite(total[i])) { totalF[i] = NaN; tfRank[i] = NaN; nInsufficient++; continue }
    valid[i] = 1
    if (code[i] === 0) { totalF[i] = total[i]; nPass++; if (total[i] > 0) { mx.push(total[i]); mw.push(e.areaW[i]) } }
    tfRank[i] = totalF[i]
  }
  const median = mx.length ? weightedQuantile(mx, mw, [0.5])[0] : 0
  const pctR = weightedPctRank(tfRank, e.areaW, true)
  const pct = new Float64Array(e.n)
  for (let i = 0; i < e.n; i++) pct[i] = 100 * pctR[i]
  const thr = weightedQuantile(tfRank, e.areaW, [0.5, 0.95, 0.99])
  const thresholds = { median: pyRound(thr[0], 4), top5: pyRound(thr[1], 4), top1: pyRound(thr[2], 4) }
  const base = { thresholds, total: totalF, pct, code, valid, coverage, unknownFilters: unknown, nPass, nInsufficient }
  if (inp.withPortfolio === false) return { portfolio: null, ...base }

  // candidate pool (export/real.py _pool): top-N per weighted factor among scorable cells passing the filters with
  // 0 < S >= area-weighted median, then NMS
  const ok: number[] = []
  for (let i = 0; i < e.n; i++) if (code[i] === 0 && valid[i] && totalF[i] > 0 && totalF[i] >= median) ok.push(i)
  const cand = new Set<number>()
  for (const [f, w] of Object.entries(weights)) {
    if (w <= 0) continue
    const sf = s[f as FactorId]
    if (!sf) continue // factor dropped for this target (contract §3.2.5)
    // Ties are common (ordinal F3, categorical F6, F8 capped at 1.0). numpy's default argsort is unstable, so the Python
    // reference picks an arbitrary subset of tied cells. We break ties deterministically: higher S first, then cell order.
    const sv = (i: number) => (Number.isNaN(sf[i]) ? 0 : sf[i]) // np.nan_to_num in the reference sort key
    const order = [...ok].sort((a, b) => sv(b) - sv(a) || totalF[b] - totalF[a] || a - b)
    for (const i of order.slice(0, d.candidates_top_n_per_factor)) cand.add(i)
  }
  const pool = [...cand].sort((a, b) => totalF[b] - totalF[a] || a - b)
  const kept: number[] = []
  const R = earthRadiusKm(inp.profiles.defaults)
  for (const i of pool) {
    if (kept.every((j) => haversineKm(e.lat[i], e.lon[i], e.lat[j], e.lon[j], R) > profile.nms_radius_km)) kept.push(i)
  }
  const known = [...inp.knownCells.keys()].map((cid) => [89.75 - 0.5 * Math.floor(cid / 720), -179.75 + 0.5 * (cid % 720)])
  const gaps: Partial<Record<FactorId, number>> = {}
  for (const [f, v] of Object.entries(inp.clips)) if (v && v[1] > 0) gaps[f as FactorId] = pyRound(v[1], 3)
  const scored = ALL_FACTORS.filter((f) => s[f])

  const site = (i: number): SiteRef => {
    const cid = e.cellId[i]
    const kn = inp.knownCells.get(cid)
    const fs: Partial<Record<FactorId, number>> = {}
    for (const f of scored) fs[f] = Number.isNaN(s[f]![i]) ? (null as unknown as number) : pyRound(s[f]![i], 4)
    const nearKnown = known.length ? Math.min(...known.map(([la, lo]) => haversineKm(e.lat[i], e.lon[i], la, lo, R))) : 1e9
    const tt = e.cols.travel_time_min?.[i]
    const ap = e.cols.airport_km?.[i]
    return {
      site_id: kn ? slug(kn) : `cell_${cid}`,
      name: kn ?? siteNameForCell(e.lat[i], e.lon[i]),
      lat: e.lat[i], lon: e.lon[i], cell_id: cid,
      score: pyRound(totalF[i], 4), score_core: pyRound(core[i], 4), earth_percentile: pyRound(pct[i], 2),
      factor_scores: fs,
      covers: CORE_FACTORS.filter((f) => (weights[f] ?? 0) > 0 && (fs[f] ?? 0) >= theta),
      gaps,
      robustness: null, // Monte Carlo robustness is precomputed for default weights only (hidden under custom weights)
      logistics: {
        travel_time_min: tt === undefined || Number.isNaN(tt) ? null : pyRound(tt, 1),
        within_6h: tt === undefined || Number.isNaN(tt) ? null : tt <= EASY_MAX_MIN,
        continent: inp.continentOf(cid, e.lat[i], e.lon[i]),
        airport_km: ap === undefined || Number.isNaN(ap) ? null : pyRound(ap, 1),
      },
      known_analog: kn ?? null,
      candidate: !kn && nearKnown > 300,
    }
  }
  const poolSites = kept.slice(0, 200).map(site)
  // export/real.py: factors dropped for the target get weight 0 in the set cover and are neither needs nor uncoverable
  const wScored = Object.fromEntries(Object.entries(weights).map(([f, w]) => [f, s[f as FactorId] ? w : 0]))
  const variants = buildVariants(poolSites, wScored, theta, d.portfolio_max_sites)
  const active = CORE_FACTORS.filter((f) => (weights[f] ?? 0) > 0 && s[f])
  const universe = active.filter((f) => poolSites.some((p) => (p.factor_scores[f] ?? 0) >= theta))
  return {
    portfolio: {
      contract_version: profiles.contract_version, target_id: inp.targetId, profile_id: profile.id, weights, theta,
      universe, uncoverable: active.filter((f) => !universe.includes(f)),
      dropped_factors: CORE_FACTORS.filter((f) => (weights[f] ?? 0) > 0 && !s[f]), variants, top_cells: poolSites.slice(0, 25),
      earth_thresholds: thresholds,
    },
    ...base,
  }
}

const order = (fs: Iterable<string>) => [...fs].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))) as FactorId[]

function greedy(pool: SiteRef[], weights: Record<string, number>, theta: number, maxSites: number) {
  const cs = pool.map((p) => ({ site_id: p.site_id, factor_scores: p.factor_scores as Record<string, number>, ref: p }))
  const chosen = greedyPortfolio(cs, weights, theta, 0, maxSites) as typeof cs
  const active = Object.keys(weights).filter((f) => weights[f] > 0)
  const covered = new Set(active.filter((f) => chosen.some((c) => (c.factor_scores[f] ?? 0) >= theta)))
  return { chosen: chosen.map((c) => c.ref), covered }
}

/** score/variants.build_variants */
export function buildVariants(pool: SiteRef[], weights: Record<string, number>, theta: number, maxSites = 5): PortfolioVariant[] {
  const nActive = Math.max(Object.values(weights).filter((w) => w > 0).length, 1)
  const cov = (c: Set<string>) => pyRound(c.size / nActive, 4)
  const out: PortfolioVariant[] = []
  const b = greedy(pool, weights, theta, maxSites)
  out.push({ id: 'best_match', available: b.chosen.length > 0, unavailable_reason: b.chosen.length ? null : 'No candidate sites', continent: null,
    pool_size: pool.length, sites: b.chosen, covers: order(b.covered), coverage: cov(b.covered) })
  const easy = pool.filter((p) => p.logistics?.travel_time_min !== null && p.logistics?.travel_time_min !== undefined && p.logistics.travel_time_min <= EASY_MAX_MIN)
  const ez = easy.length ? greedy(easy, weights, theta, maxSites) : { chosen: [], covered: new Set<string>() }
  out.push({ id: 'easiest_to_reach', available: ez.chosen.length > 0,
    unavailable_reason: ez.chosen.length ? null : 'No portfolio has every site within 6 h of a city of 50k+.',
    continent: null, pool_size: easy.length, sites: ez.chosen, covers: order(ez.covered), coverage: cov(ez.covered) })
  const value = (c: Set<string>, ch: SiteRef[]) => [[...c].reduce((a, f) => a + weights[f], 0), ch.reduce((a, s) => a + s.score, 0)]
  const gt = (x: number[], y: number[]) => x[0] > y[0] || (x[0] === y[0] && x[1] > y[1])
  let best: { cont: string; ch: SiteRef[]; cov: Set<string>; n: number } | null = null
  const conts = [...new Set(pool.map((p) => p.logistics?.continent).filter((c): c is string => !!c))].sort()
  for (const cont of conts) {
    const sub = pool.filter((p) => p.logistics?.continent === cont)
    const r = greedy(sub, weights, theta, maxSites)
    if (r.chosen.length && (!best || gt(value(r.covered, r.chosen), value(best.cov, best.ch)))) best = { cont, ch: r.chosen, cov: r.covered, n: sub.length }
  }
  if (best) out.push({ id: 'one_continent', available: true, unavailable_reason: null, continent: best.cont, pool_size: best.n, sites: best.ch, covers: order(best.cov), coverage: cov(best.cov) })
  else out.push({ id: 'one_continent', available: false, unavailable_reason: 'No candidate sites with a continent', continent: null, pool_size: 0, sites: [], covers: [], coverage: 0 })
  return out
}

/** export/mock.py slug() */
export function slug(name: string): string {
  return name.toLowerCase().replace('negative control:', 'neg').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48)
}

export const VARIANT_ORDER: VariantId[] = ['best_match', 'easiest_to_reach', 'one_continent']
