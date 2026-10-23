// JS port of pipeline/analog_portfolio/grid/area.py (cos(lat) area weighting) + grid haversine.
// Parity: contract/test_vectors.json (weighted_quantile, weighted_pct_rank) and the engine parity test.

/** numpy's pairwise summation (np.sum on float64), so totals match the Python reference bit-for-bit. */
export function pairwiseSum(a: ArrayLike<number>, start = 0, n = a.length - start): number {
  if (n < 8) {
    let r = 0
    for (let i = 0; i < n; i++) r += a[start + i]
    return r
  }
  if (n <= 128) {
    const r = [a[start], a[start + 1], a[start + 2], a[start + 3], a[start + 4], a[start + 5], a[start + 6], a[start + 7]]
    let i = 8
    for (; i < n - (n % 8); i += 8) for (let k = 0; k < 8; k++) r[k] += a[start + i + k]
    let res = ((r[0] + r[1]) + (r[2] + r[3])) + ((r[4] + r[5]) + (r[6] + r[7]))
    for (; i < n; i++) res += a[start + i]
    return res
  }
  let n2 = Math.floor(n / 2)
  n2 -= n2 % 8
  return pairwiseSum(a, start, n2) + pairwiseSum(a, start + n2, n - n2)
}

/** Stable ascending argsort of x (ties keep index order, like numpy kind="stable"). */
export function argsortStable(x: ArrayLike<number>, idx?: number[]): number[] {
  const o = idx ?? Array.from({ length: x.length }, (_, i) => i)
  return o.sort((i, j) => x[i] - x[j] || i - j)
}

/** Weighted quantiles of finite x: cdf_i = (cumsum(w) - w/2) / sum(w) over x sorted ascending; linear interpolation, clamped. */
export function weightedQuantile(x: ArrayLike<number>, w: ArrayLike<number>, qs: number[]): number[] {
  const ok: number[] = []
  for (let i = 0; i < x.length; i++) if (Number.isFinite(x[i]) && w[i] > 0) ok.push(i)
  if (!ok.length) return qs.map(() => NaN)
  const o = argsortStable(x, ok)
  const xs = new Float64Array(o.length)
  const ws = new Float64Array(o.length)
  o.forEach((k, i) => { xs[i] = x[k]; ws[i] = w[k] })
  const total = pairwiseSum(ws)
  const cdf = new Float64Array(o.length)
  let cum = 0
  for (let i = 0; i < ws.length; i++) { cum += ws[i]; cdf[i] = (cum - 0.5 * ws[i]) / total }
  return qs.map((q) => interp(q, cdf, xs))
}

/** np.interp for increasing xp. */
function interp(q: number, xp: Float64Array, fp: Float64Array): number {
  const n = xp.length
  if (q <= xp[0]) return fp[0]
  if (q >= xp[n - 1]) return fp[n - 1]
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (xp[mid] <= q) lo = mid
    else hi = mid
  }
  const slope = (fp[hi] - fp[lo]) / (xp[hi] - xp[lo])
  return slope * (q - xp[lo]) + fp[lo]
}

/** Area-weighted percentile rank in [0, 1] among finite elements (ties share the mid rank). 1 = best in the given direction. NaN -> 0. */
export function weightedPctRank(x: ArrayLike<number>, w: ArrayLike<number>, higherIsBetter = true): Float64Array {
  const out = new Float64Array(x.length)
  const ok: number[] = []
  for (let i = 0; i < x.length; i++) if (Number.isFinite(x[i]) && w[i] > 0) ok.push(i)
  if (!ok.length) return out
  const o = argsortStable(x, ok)
  const n = o.length
  const cum = new Float64Array(n)
  let c = 0
  for (let i = 0; i < n; i++) { c += w[o[i]]; cum[i] = c }
  const total = cum[n - 1]
  let start = 0
  while (start < n) {
    let end = start
    while (end + 1 < n && x[o[end + 1]] === x[o[start]]) end++
    const below = cum[start] - w[o[start]]
    const mid = (below + cum[end]) / 2.0 / total
    for (let k = start; k <= end; k++) out[o[k]] = higherIsBetter ? mid : 1.0 - mid
    start = end + 1
  }
  return out
}

/** IUGG mean Earth radius (km), the contract's great-circle radius (profiles.json defaults.nms_distance). */
export const EARTH_RADIUS_KM = 6371.0088

/**
 * Earth radius from profiles.json: a numeric `defaults.earth_radius_km` if the contract adds one, else the value written in
 * `defaults.nms_distance` ("great-circle (haversine), Earth radius 6371.0088 km"), else the shared constant.
 */
export function earthRadiusKm(defaults: Record<string, unknown> | undefined): number {
  const n = defaults?.earth_radius_km
  if (typeof n === 'number' && n > 6000 && n < 6500) return n
  const m = typeof defaults?.nms_distance === 'string' ? /radius\s+([\d.]+)\s*km/i.exec(defaults.nms_distance) : null
  const v = m ? Number(m[1]) : NaN
  return v > 6000 && v < 6500 ? v : EARTH_RADIUS_KM
}

/** Great-circle distance (haversine) on a sphere of radius rKm (default: IUGG mean radius). */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number, rKm = EARTH_RADIUS_KM): number {
  const rad = Math.PI / 180
  const p1 = lat1 * rad
  const p2 = lat2 * rad
  const dp = p2 - p1
  const dl = (lon2 - lon1) * rad
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * rKm * Math.asin(Math.sqrt(a))
}

/** Python round(x, nd) for display/export parity (half-even on exact binary ties). */
export function pyRound(x: number, nd: number): number {
  if (!Number.isFinite(x)) return x
  const m = 10 ** nd
  const s = x * m
  if (Number.isInteger(s * 2) && !Number.isInteger(s)) {
    const f = Math.floor(s)
    return (f % 2 === 0 ? f : f + 1) / m
  }
  return Number(x.toFixed(nd))
}
