// JS port of pipeline/analog_portfolio/score/normalize.py. Parity is enforced by contract/test_vectors.json.
export const FLOOR = 0.01

export function ratioSim(x: number, t: number): number {
  if (x < 0 || t < 0) throw new RangeError('ratioSim needs non-negative ratio-scale inputs')
  if (x + t === 0) return 1
  return 1 - Math.abs(x - t) / (x + t)
}

export const boundedFraction = (x: number, t: number): number => Math.max(0, 1 - Math.abs(x - t))

export const gaussian = (x: number, t: number, tau: number): number => Math.exp(-0.5 * ((x - t) / tau) ** 2)

export const ordinalClass = (x: number, t: number, nClasses = 5): number => 1 - Math.abs(x - t) / (nClasses - 1)

const popcount = (v: number): number => {
  let n = 0
  for (let b = v >>> 0; b; b &= b - 1) n++
  return n
}

export function flagMatch(earthFlags: number, targetFlags: number): number {
  const want = popcount(targetFlags)
  return want === 0 ? 0 : popcount(earthFlags & targetFlags) / want
}

export function geometricMean(scores: Record<string, number>, weights: Record<string, number>, floor = FLOOR): number {
  const ws = Object.entries(weights).filter(([, w]) => w > 0)
  const wsum = ws.reduce((a, [, w]) => a + w, 0)
  if (wsum === 0) return 0
  return Math.exp(ws.reduce((acc, [f, w]) => acc + (w / wsum) * Math.log(Math.max(scores[f], floor)), 0))
}

export function totalScore(core: number, secondary: number[]): number {
  const sec = secondary.length ? secondary.reduce((a, b) => a + b, 0) / secondary.length : 0
  return core * (0.9 + 0.1 * sec)
}

export function cellId(lat: number, lon: number): number {
  const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180
  const col = Math.min(Math.floor((wrapped + 180) / 0.5), 719)
  const row = Math.min(Math.floor((90 - lat) / 0.5), 359)
  return row * 720 + col
}

export function cellCentre(id: number): [lat: number, lon: number] {
  const row = Math.floor(id / 720)
  const col = id % 720
  return [89.75 - 0.5 * row, -179.75 + 0.5 * col]
}

export interface CoverSite { site_id: string; factor_scores: Record<string, number>; cost?: number }

export function greedyPortfolio(sites: CoverSite[], weights: Record<string, number>, theta = 0.7, lam = 0, maxSites = 5): CoverSite[] {
  const active = Object.keys(weights).filter((f) => weights[f] > 0)
  const universe = new Set(active.filter((f) => sites.some((s) => (s.factor_scores[f] ?? 0) >= theta)))
  const chosen: CoverSite[] = []
  while (universe.size && chosen.length < maxSites) {
    let best: CoverSite | null = null
    let bestVal = 0
    for (const s of sites) {
      if (chosen.includes(s)) continue
      let gain = 0
      for (const f of universe) if ((s.factor_scores[f] ?? 0) >= theta) gain += weights[f] * s.factor_scores[f]
      const val = gain / (1 + lam * (s.cost ?? 0))
      if (val > bestVal) { best = s; bestVal = val }
    }
    if (!best) break
    chosen.push(best)
    for (const f of [...universe]) if ((best.factor_scores[f] ?? 0) >= theta) universe.delete(f)
  }
  return chosen
}
