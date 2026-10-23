// JS port of pipeline/analog_portfolio/score/{engine,variants}.py and the portfolio step of export/mock.py.
// Runs in the scoring Web Worker (src/worker/scorer.worker.ts) for live re-weighting, and in vitest for parity.
// Every number it produces is computed from the shipped Earth grid + targets.json + profiles.json/factors.json.
import { ALL_FACTORS, CORE_FACTORS, SECONDARY_FACTORS } from '../types/contract'
import type { ValidationFile, FactorId, FactorsFile, HardFilter, Portfolio, PortfolioVariant, Profile, ProfilesFile, SiteRef, TargetBody, VariantId } from '../types/contract'
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
    areaW[i] = Math.cos(lat[i] * (Math.PI / 180)) // np.radians: x · (π/180)
  }
  const cols: Record<string, Float64Array> = {}
  for (const [k, v] of Object.entries(columns)) if (k !== 'cell_id') cols[k] = v instanceof Float64Array ? v : Float64Array.from(v)
  return { n, cellId, lat, lon, areaW, cols, _pct: {} }
}

const nan0 = (v: number) => (Number.isNaN(v) ? 0 : v)
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

export function lithMatrix(f: FactorsFile): number[][] {
  const codes = Object.fromEntries(f.lithology_classes.map((c) => [c.id, c.code]))
  const n = Math.max(...f.lithology_classes.map((c) => c.code)) + 1
  const m = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? f.lithology_similarity.default_same : 0)))
  m[0][0] = 0
  for (const [a, b, s] of f.lithology_similarity.pairs) { m[codes[a]][codes[b]] = s; m[codes[b]][codes[a]] = s }
  return m
}

export type TargetValues = Partial<Record<FactorId, number | null>>

/** targets.json → scoring_constants (contract v1.2): Earth clip and F1/F2 range bounds at full precision, computed by the
 *  pipeline from the shipped (decoded) grid. When absent (mocks), the engine computes the same quantiles itself. */
export interface ScoringConstants {
  earth_clip?: Partial<Record<FactorId, { feature: string; p0_5: number; p99_5: number }>>
  range_norm?: { factors?: Partial<Record<FactorId, { feature: string; p01: number; p99: number; span: number }>> }
}

const finiteTv = (tv: TargetValues, id: FactorId): number | null => {
  const v = tv[id]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** {factor: [t_star, gap]} for factors with earth_clip (P0.5 / P99.5 area-weighted land quantiles). */
export function clipTargets(e: EarthGrid, tv: TargetValues, f: FactorsFile, sc?: ScoringConstants): Partial<Record<FactorId, [number, number]>> {
  const out: Partial<Record<FactorId, [number, number]>> = {}
  for (const fac of f.factors) {
    const t = finiteTv(tv, fac.id)
    if (t === null || !fac.earth_clip) continue
    const k = sc?.earth_clip?.[fac.id]
    const [lo, hi] = k ? [k.p0_5, k.p99_5] : weightedQuantile(e.cols[fac.feature], e.areaW, [0.005, 0.995])
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) { out[fac.id] = [t, 0]; continue }
    const ts = Math.min(Math.max(t, lo), hi)
    out[fac.id] = [ts, Math.abs(t - ts)]
  }
  return out
}

/** F1/F2 range similarity max(0, 1 − |x − t*| / span). A degenerate span (≤ 0 or not finite, e.g. a constant column
 *  in the shipped constants) scores 1 on an exact match and 0 otherwise; a missing Earth value stays NaN. */
export function rangeSim(x: number, ts: number, span: number): number {
  if (!Number.isFinite(x)) return NaN
  if (!(span > 0) || !Number.isFinite(span)) return x === ts ? 1 : 0
  return Math.max(0, 1 - Math.abs(x - ts) / span)
}

/** Area-weighted Earth P1 / P99 span of a column (F1/F2 range similarity, contract v1.2). */
function rangeSpan(e: EarthGrid, col: string, id: FactorId, sc?: ScoringConstants): number {
  const k = sc?.range_norm?.factors?.[id]
  if (k) return k.span
  const key = `range:${col}`
  if (!e._pct[key]) {
    const [lo, hi] = weightedQuantile(e.cols[col], e.areaW, [0.01, 0.99])
    e._pct[key] = Float64Array.of(Number.isFinite(lo) && hi > lo ? hi - lo : 1)
  }
  return e._pct[key][0]
}

/** Area-weighted percentile in [0, 1]; a missing Earth value stays NaN (engine._pct_rank). */
function pctNaN(e: EarthGrid, col: string, higherIsBetter: boolean): Float64Array {
  const key = `nan:${col}:${higherIsBetter}`
  if (!e._pct[key]) {
    const x = e.cols[col]
    const p = weightedPctRank(x, e.areaW, higherIsBetter)
    const out = new Float64Array(e.n)
    for (let i = 0; i < e.n; i++) out[i] = x && Number.isFinite(x[i]) ? p[i] : NaN
    e._pct[key] = out
  }
  return e._pct[key]
}

/**
 * Per-factor similarity arrays s_F in [0, 1] (pipeline score/engine.py factor_scores, contract v1.2). NaN = missing Earth
 * input (dropped per cell in aggregate). A target-dependent factor with no target value is left out (dropped for the
 * target); F7, F11 and F12 use Earth values only and are always scored.
 */
export function factorScores(e: EarthGrid, tv: TargetValues, body: TargetBody, f: FactorsFile, sc?: ScoringConstants): Partial<Record<FactorId, Float64Array>> {
  const fac = Object.fromEntries(f.factors.map((x) => [x.id, x]))
  const clips = clipTargets(e, tv, f, sc)
  const t = (id: FactorId) => finiteTv(tv, id)
  const tstar = (id: FactorId) => (clips[id] ? clips[id]![0] : (t(id) as number))
  const n = e.n
  const nanCol = new Float64Array(n).fill(NaN)
  const col = (k: string) => e.cols[k] ?? nanCol
  const s: Partial<Record<FactorId, Float64Array>> = {}
  // np.clip(v, 0, 1) keeps NaN
  const map = (fn: (i: number) => number) => { const a = new Float64Array(n); for (let i = 0; i < n; i++) a[i] = clipKeepNaN(fn(i)); return a }
  const ratio = (x: number, tt: number) => (x + tt === 0 ? 1 : 1 - Math.abs(x - tt) / (x + tt))
  for (const [id, k] of [['F1', 'ts_mean_k'], ['F2', 'dt_k']] as const) {
    if (t(id) === null) continue
    const x = col(k), ts = tstar(id), span = rangeSpan(e, k, id, sc)
    s[id] = map((i) => rangeSim(x[i], ts, span))
  }
  if (t('F5') !== null) { const x = col('relief_m'), ts = tstar('F5'); s.F5 = map((i) => ratio(x[i], ts)) }
  if (t('F3') !== null) { const x = col('ti_class'), tt = t('F3')!; s.F3 = map((i) => 1 - Math.abs(x[i] - tt) / 4) }
  if (t('F4') !== null) { const x = col('slope_lt5_frac'), tt = t('F4')!; s.F4 = map((i) => 1 - Math.abs(x[i] - tt)) }
  const t6 = t('F6')
  const lm = lithMatrix(f)
  if (t6 !== null && Number.isInteger(t6) && t6 >= 0 && t6 < lm.length) {
    const x = col('lith_class')
    s.F6 = map((i) => (Number.isFinite(x[i]) && x[i] >= 0 && x[i] < lm.length ? lm[Math.trunc(x[i])][t6] : NaN))
  }
  // F7 is directional (s = 1 − P_earth(aridity), drier = better) and needs no target value
  { const p = pctNaN(e, 'aridity_index', false); s.F7 = map((i) => p[i]) }
  if (t('F8') !== null) { const x = col('barren_frac'), tt = t('F8')!; s.F8 = map((i) => 1 - Math.abs(x[i] - tt)) }
  if (t('F9') !== null) { const x = col('ice_index'), tt = t('F9')!; s.F9 = map((i) => 1 - Math.abs(x[i] - tt)) }
  if (t('F10') !== null) {
    const tau = Number(fac.F10.params?.tau)
    const x = col('noon_sun_elev_deg'), ts = tstar('F10')
    s.F10 = map((i) => Math.exp(-0.5 * ((x[i] - ts) / tau) ** 2))
  }
  const cap11 = Number(fac.F11.params?.cap?.[body] ?? 0)
  const pm = pctNaN(e, 'column_mass_gcm2', false)
  const pr = pctNaN(e, 'cutoff_rigidity_gv', false)
  s.F11 = map((i) => cap11 * (0.5 * (pm[i] + pr[i])))
  const cap12 = Number(fac.F12.params?.cap?.[body] ?? 0)
  const pu = pctNaN(e, 'uv_index', true)
  s.F12 = map((i) => cap12 * pu[i])
  const t13 = t('F13')
  if (t13 !== null) {
    const tf = Math.trunc(t13) & 0xff
    const g = col('geomorph_flags')
    s.F13 = map((i) => (Number.isFinite(g[i]) ? flagMatch(Math.trunc(g[i]) & 0xff, tf) : NaN))
  }
  return s
}

/**
 * Per cell (pipeline score_cells): S_core = exp(Σ w·ln max(s, FLOOR) / Σ w) over the active factors present in the cell,
 * S = S_core × (0.9 + 0.1 × mean of the secondary factors present). Factors dropped for the target are left out; a NaN
 * factor is dropped for that cell. Cells whose present factors carry less than `minFrac` of the active weight are
 * insufficient_data (NaN). `coverage` is the present share of the active weight.
 */
export function aggregate(s: Partial<Record<FactorId, Float64Array>>, weights: Record<string, number>, n: number, minFrac = MIN_ACTIVE_WEIGHT_FRAC):
  { core: Float64Array; total: Float64Array; coverage: Float64Array } {
  const core = new Float64Array(n)
  const total = new Float64Array(n)
  const coverage = new Float64Array(n).fill(1)
  let anyW = 0
  for (const w of Object.values(weights)) if (w > 0) anyW += w
  if (anyW <= 0) return { core, total, coverage }
  const active = Object.entries(weights).filter(([f, w]) => w > 0 && s[f as FactorId]).map(([f, w]) => [s[f as FactorId]!, w] as const)
  let tot = 0
  for (const [, w] of active) tot += w
  const sec = SECONDARY_FACTORS.map((f) => s[f]).filter((a): a is Float64Array => !!a)
  for (let i = 0; i < n; i++) {
    let num = 0
    let den = 0
    for (const [a, w] of active) {
      const v = a[i]
      if (Number.isNaN(v)) continue
      num += w * Math.log(Math.max(v, FLOOR))
      den += w
    }
    coverage[i] = tot > 0 ? den / tot : 0
    if (!(coverage[i] >= minFrac - 1e-12 && den > 0)) { core[i] = NaN; total[i] = NaN; continue }
    core[i] = Math.exp(num / den)
    let ss = 0
    let ns = 0
    for (const a of sec) { const v = a[i]; if (!Number.isNaN(v)) { ss += v; ns++ } }
    total[i] = core[i] * (0.9 + 0.1 * (ns > 0 ? ss / ns : 0))
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

/** Body candidate gate (contract v1.2 rule 8; profiles.json → defaults.candidate_gates.{body}). Clause thresholds and the
 *  combining rule ("A || B || C || D") come from the data; missing aridity fails A and the AI part of D, other missing
 *  inputs read as 0 (score/gates.py). Bodies without a gate pass everywhere. */
export function candidateGate(e: EarthGrid, body: TargetBody, profiles: ProfilesFile): { pass: Uint8Array; unknown: string[] } {
  const pass = new Uint8Array(e.n).fill(1)
  const g = (profiles.defaults as { candidate_gates?: Record<string, Record<string, unknown>> }).candidate_gates?.[body]
  if (!g) return { pass, unknown: [] }
  const num = (k: string) => Number(g[k])
  const col = (k: string, fill: number) => { const a = e.cols[k]; return (i: number) => (a && !Number.isNaN(a[i]) ? a[i] : fill) }
  const ai = col('aridity_index', 9), f8 = col('barren_frac', 0), pf = col('permafrost_frac', 0), mo = col('moss_lichen_frac', 0), fl = col('geomorph_flags', 0)
  const clauses: Record<string, (i: number) => boolean> = {
    A: (i) => ai(i) <= num('ai_max'),
    B: (i) => f8(i) >= num('f8_min'),
    C: (i) => pf(i) >= num('pf_min') && f8(i) + mo(i) >= num('f8_moss_min'),
    D: (i) => (Math.trunc(fl(i)) & num('d_flag_mask')) !== 0 && (ai(i) <= num('d_ai_max') || f8(i) >= num('d_f8_min')),
  }
  // rule: clause letters joined by || (any) and && (all), e.g. "A || B || C || D"
  const rule = String(g.rule ?? Object.keys(clauses).join(' || '))
  const terms = rule.split('||').map((t) => t.split('&&').map((x) => x.trim()))
  const unknown = [...new Set(terms.flat().filter((x) => !clauses[x]))]
  if (unknown.length) return { pass, unknown: [`${String(g.id ?? body)}: ${unknown.join(', ')}`] }
  for (let i = 0; i < e.n; i++) pass[i] = terms.some((t) => t.every((x) => clauses[x](i))) ? 1 : 0
  return { pass, unknown: [] }
}

/** Known analog cells (export/real.py): positives at their evaluation cell (coastal sites snapped to land, v1.2);
 *  the first site listed for a cell names it. */
export function knownCellsFrom(v: ValidationFile): Map<number, string> {
  const m = new Map<number, string>()
  for (const s of v.sites) {
    if (s.kind !== 'positive') continue
    const c = s.eval_cell_id ?? s.cell_id
    if (c !== null && c !== undefined && !m.has(c)) m.set(c, s.name)
  }
  return m
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
  /** target body (defaults to the target id prefix, as export/real.py does) */
  body?: TargetBody
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
  const filters = activeFilters(profiles, profile)
  const { code, unknown } = filterCodes(e, filters)
  // Body candidate gate (contract v1.2 rule 8, Mars): checked after the hard filters, filterCode = filters.length + 1
  const body = inp.body ?? (inp.targetId.split('_')[0] as TargetBody)
  const gate = candidateGate(e, body, profiles)
  if (gate.unknown.length) unknown.push(...gate.unknown)
  // export/real.py run_target: mask = hard filters ∧ gate; valid = enough data; the ranking population is valid ∧ gate
  // (gate failures leave the ranking; hard-filtered cells stay in it with S = 0); insufficient cells are NaN everywhere.
  const valid = new Uint8Array(e.n)
  const totalF = new Float64Array(e.n)
  const tfRank = new Float64Array(e.n)
  let nPass = 0
  let nInsufficient = 0
  for (let i = 0; i < e.n; i++) {
    if (code[i] === 0 && !gate.pass[i]) code[i] = filters.length + 1
    if (!Number.isFinite(total[i])) { totalF[i] = NaN; tfRank[i] = NaN; nInsufficient++; continue }
    valid[i] = 1
    if (code[i] === 0) { totalF[i] = total[i]; nPass++ }
    tfRank[i] = gate.pass[i] ? totalF[i] : NaN
  }
  const pctR = weightedPctRank(tfRank, e.areaW, true)
  const pct = new Float64Array(e.n)
  for (let i = 0; i < e.n; i++) pct[i] = 100 * pctR[i]
  const thr = weightedQuantile(tfRank, e.areaW, [0.5, 0.95, 0.99])
  const thresholds = { median: pyRound(thr[0], 4), top5: pyRound(thr[1], 4), top1: pyRound(thr[2], 4) }
  const base = { thresholds, total: totalF, pct, code, valid, coverage, unknownFilters: unknown, nPass, nInsufficient }
  if (inp.withPortfolio === false) return { portfolio: null, ...base }

  // candidate pool (engine.candidate_indices + export/real.py _pool): eligible = passes filters and gate with enough
  // data and S >= the area-weighted median S of eligible cells; per active factor the top N by a stable sort on
  // s_F desc, S desc, cell index asc (a missing s_F never ranks); pool order S desc, cell index asc; then NMS.
  const elig: number[] = []
  const mx: number[] = []
  const mw: number[] = []
  for (let i = 0; i < e.n; i++) if (code[i] === 0 && valid[i]) { elig.push(i); mx.push(total[i]); mw.push(e.areaW[i]) }
  const median = mx.length ? weightedQuantile(mx, mw, [0.5])[0] : 0
  const ok = elig.filter((i) => total[i] >= median)
  const cand = new Set<number>()
  for (const [f, w] of Object.entries(weights)) {
    if (w <= 0) continue
    const sf = s[f as FactorId]
    if (!sf) continue // factor dropped for this target (contract §3.2.5)
    const order = ok.filter((i) => Number.isFinite(sf[i])).sort((a, b) => sf[b] - sf[a] || totalF[b] - totalF[a] || a - b)
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
      insufficient_cells: nInsufficient, earth_thresholds: thresholds,
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
