// "Who covers what" (spec §8.4 CoverageMatrix): portfolio sites × the m needs (weight > 0, not dropped).
import type { FactorId, SiteRef } from '../types/contract'

export type CoverCell = 'covered' | 'atLimit' | 'partial' | 'none'

/** Lower bound of the "Partial" band (spec §8.6 Band: Weak < 40, Partial 40–59, Good 60–79, Strong ≥ 80). */
export const PARTIAL_MIN = 0.4

export interface CoverageMatrix {
  needs: FactorId[]
  cells: CoverCell[][]
  /** needs no site in the portfolio covers (covered or at Earth's limit) */
  uncovered: FactorId[]
}

/**
 * A site covers a need when its factor score is ≥ θ (the profile's coverage threshold from the portfolio file).
 * A covered need whose target lies beyond Earth's range is "covered at Earth's limit" (⤒). Partial = Partial band up to θ.
 */
export function coverageMatrix(sites: SiteRef[], needs: FactorId[], theta: number, atLimit: (f: FactorId) => boolean): CoverageMatrix {
  const cells = sites.map((s) => needs.map((f): CoverCell => {
    const v = s.factor_scores[f]
    if (v === undefined || v === null || Number.isNaN(v)) return 'none'
    if (v >= theta) return atLimit(f) ? 'atLimit' : 'covered'
    return v >= PARTIAL_MIN ? 'partial' : 'none'
  }))
  const uncovered = needs.filter((_, j) => !cells.some((row) => row[j] === 'covered' || row[j] === 'atLimit'))
  return { needs, cells, uncovered }
}
