// "Beyond Earth's range" numbers for the site card and the Fidelity Gap panel (spec v0.3.1 §11.4).
// best Earth = the engine-exported Earth extreme for the factor's feature (targets.json earth_reference.stats: e.g. the
// coldest 0.5° land cell's annual mean surface temperature) when the target lies beyond it, else the scoring clip t*.
// The shortfall is always positive: Earth's coldest cell minus the target when the target is colder, target minus
// Earth's maximum when it is larger.
import type { EarthReference, FactorId, FactorsFile, Target } from '../types/contract'

export interface EarthLimit { target: number; best: number; short: number; note: string | null }

const NOTE: Record<string, [string, string]> = {
  ts_mean_k: ['Coldest 0.5° land cell in our data (annual mean surface temperature)', 'Warmest 0.5° land cell in our data (annual mean surface temperature)'],
  dt_k: ['Smallest day–night swing of any 0.5° land cell in our data', 'Largest day–night swing of any 0.5° land cell in our data'],
}

export function earthLimit(t: Target, f: FactorId, factors: FactorsFile, ref: EarthReference | undefined): EarthLimit | null {
  const fv = t.features?.[f]
  if (!fv || fv.value === null || fv.value === undefined) return null
  const feature = factors.factors.find((x) => x.id === f)?.feature
  const st = feature ? ref?.stats?.[feature] : undefined
  const v = fv.value
  if (st) {
    if (v < st.min.value) return { target: v, best: st.min.value, short: st.min.value - v, note: NOTE[feature!]?.[0] ?? null }
    if (v > st.max.value) return { target: v, best: st.max.value, short: v - st.max.value, note: NOTE[feature!]?.[1] ?? null }
  }
  if (fv.t_star === null || fv.t_star === undefined) return null
  const short = Math.abs(v - fv.t_star)
  return short > 1e-9 ? { target: v, best: fv.t_star, short, note: null } : null
}
