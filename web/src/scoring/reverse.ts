// Reverse search (spec §8.5 ReverseSearchPanel, §11.8): one Earth cell against every Moon or Mars grid cell, scored with
// the forward engine's own per-factor formulas and aggregation (engine.ts factorScores / aggregate), with the roles
// swapped: the planet cell is the "target" (clipped to Earth's range exactly as a target is), the Earth cell is fixed.
// A planet cell with no value for a factor drops that factor for that cell, as a target with a null value does.
import { CORE_FACTORS, SECONDARY_FACTORS, type FactorId, type FactorsFile } from '../types/contract'
import { aggregate, clipTargets, lithMatrix, rangeSim, rangeSpan, type EarthGrid, type ScoringConstants } from './engine'
import { flagMatch } from './normalize'

const ALL: FactorId[] = [...CORE_FACTORS, ...SECONDARY_FACTORS]
const EARTH_ONLY: FactorId[] = ['F7', 'F11', 'F12']
const clip01 = (v: number) => (Number.isNaN(v) ? NaN : v < 0 ? 0 : v > 1 ? 1 : v)

/** Planet "target" values per factor, one entry per planet cell (NaN = no value). */
export type PlanetValues = Partial<Record<FactorId, Float64Array>>

export interface ReverseScores {
  /** per factor, per planet cell; NaN where the Earth value is missing */
  s: Partial<Record<FactorId, Float64Array>>
  /** per planet cell: bit k set = factor ALL[k] dropped (no planet value) */
  dropped: Uint16Array
}

/** earthOnly: factorScores(e, {}, body, …) (F7, F11, F12 need no target and are the same for every planet cell). */
export function reverseFactorScores(e: EarthGrid, i: number, earthOnly: Partial<Record<FactorId, Float64Array>>, P: PlanetValues, m: number,
  f: FactorsFile, sc?: ScoringConstants): ReverseScores {
  const fac = Object.fromEntries(f.factors.map((x) => [x.id, x]))
  const featureOf = (id: FactorId) => fac[id].feature
  const x = (id: FactorId) => { const c = e.cols[featureOf(id)]; return c ? c[i] : NaN }
  // Earth clip bounds per factor (the same P0.5 / P99.5 a target is clipped to)
  const bounds: Partial<Record<FactorId, [number, number]>> = {}
  for (const id of ALL) {
    if (!fac[id]?.earth_clip) continue
    const lo = clipTargets(e, { [id]: -1e300 }, f, sc)[id]?.[0]
    const hi = clipTargets(e, { [id]: 1e300 }, f, sc)[id]?.[0]
    if (lo !== undefined && hi !== undefined && Number.isFinite(lo) && Number.isFinite(hi)) bounds[id] = [lo, hi]
  }
  const tstar = (id: FactorId, t: number) => { const b = bounds[id]; return b ? Math.min(Math.max(t, b[0]), b[1]) : t }
  const lm = lithMatrix(f)
  const tau = Number(fac.F10?.params?.tau)
  const s: Partial<Record<FactorId, Float64Array>> = {}
  const dropped = new Uint16Array(m)
  for (const [k, id] of ALL.entries()) {
    const out = new Float64Array(m)
    if (EARTH_ONLY.includes(id)) { const v = earthOnly[id]?.[i]; out.fill(v === undefined ? NaN : v); s[id] = out; continue }
    const T = P[id]
    const xv = x(id)
    for (let j = 0; j < m; j++) {
      const t = T ? T[j] : NaN
      let ok = Number.isFinite(t)
      let v = NaN
      if (ok) {
        switch (id) {
          case 'F1': case 'F2': v = rangeSim(xv, tstar(id, t), rangeSpan(e, featureOf(id), id, sc)); break
          case 'F5': { const ts = tstar(id, t); v = xv + ts === 0 ? 1 : 1 - Math.abs(xv - ts) / (xv + ts); break }
          case 'F3': v = 1 - Math.abs(xv - t) / 4; break
          case 'F4': case 'F8': case 'F9': v = 1 - Math.abs(xv - t); break
          case 'F6': ok = Number.isInteger(t) && t >= 0 && t < lm.length
            v = ok && Number.isFinite(xv) && xv >= 0 && xv < lm.length ? lm[Math.trunc(xv)][t] : NaN; break
          case 'F10': v = Math.exp(-0.5 * ((xv - tstar(id, t)) / tau) ** 2); break
          case 'F13': v = Number.isFinite(xv) ? flagMatch(Math.trunc(xv) & 0xff, Math.trunc(t) & 0xff) : NaN; break
        }
      }
      if (!ok) { dropped[j] |= 1 << k; out[j] = NaN } else out[j] = clip01(v)
    }
    s[id] = out
  }
  return { s, dropped }
}

/** Totals per planet cell with the forward aggregate, grouping cells by which factors they drop. NaN = insufficient. */
export function reverseTotals(r: ReverseScores, weights: Record<string, number>, minFrac: number): Float64Array {
  const m = r.dropped.length
  const total = new Float64Array(m).fill(NaN)
  const groups = new Map<number, number[]>()
  for (let j = 0; j < m; j++) { const g = groups.get(r.dropped[j]); if (g) g.push(j); else groups.set(r.dropped[j], [j]) }
  for (const [mask, idx] of groups) {
    const sub: Partial<Record<FactorId, Float64Array>> = {}
    for (const [k, id] of ALL.entries()) {
      if (mask & (1 << k) || !r.s[id]) continue
      const a = r.s[id]!
      sub[id] = Float64Array.from(idx, (j) => a[j])
    }
    const agg = aggregate(sub, weights, idx.length, minFrac)
    idx.forEach((j, q) => { total[j] = agg.total[q] })
  }
  return total
}

export interface Twin { lat: number; lon: number; score: number; factorScores: Partial<Record<FactorId, number | null>> }

/** Best planet cells, at least `sepKm` apart on the body (great circle), best first. */
export function topTwins(total: Float64Array, r: ReverseScores, lat: Float64Array, lon: Float64Array, R: number, n = 3, sepKm = 300): Twin[] {
  const order = [...total.keys()].filter((j) => Number.isFinite(total[j])).sort((a, b) => total[b] - total[a] || a - b)
  const D = Math.PI / 180
  const gc = (a: number, b: number) => {
    const h = Math.sin(((lat[b] - lat[a]) * D) / 2) ** 2 + Math.cos(lat[a] * D) * Math.cos(lat[b] * D) * Math.sin(((lon[b] - lon[a]) * D) / 2) ** 2
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))) / 1000
  }
  const out: number[] = []
  for (const j of order) {
    if (out.every((k) => gc(j, k) > sepKm)) out.push(j)
    if (out.length >= n) break
  }
  return out.map((j) => ({
    lat: lat[j], lon: lon[j], score: total[j],
    factorScores: Object.fromEntries(ALL.filter((id, k) => !(r.dropped[j] & (1 << k)) && r.s[id]).map((id) => [id, Number.isNaN(r.s[id]![j]) ? null : r.s[id]![j]])),
  }))
}

