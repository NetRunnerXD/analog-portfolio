import { describe, expect, it } from 'vitest'
import tv from '../../../contract/test_vectors.json'
import { weightedPctRank, weightedQuantile } from './area'
import { boundedFraction, cellId, flagMatch, gaussian, geometricMean, greedyPortfolio, ordinalClass, ratioSim, totalScore } from './normalize'

const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9)

describe('Python/JS parity on contract/test_vectors.json', () => {
  it('ratioSim', () => tv.ratio_sim.forEach((c) => close(ratioSim(c.x, c.t), c.expected)))
  it('boundedFraction', () => tv.bounded_fraction.forEach((c) => close(boundedFraction(c.x, c.t), c.expected)))
  it('gaussian', () => tv.gaussian.forEach((c) => close(gaussian(c.x, c.t, c.tau), c.expected)))
  it('ordinalClass', () => tv.ordinal_class.forEach((c) => close(ordinalClass(c.x, c.t, c.n_classes), c.expected)))
  it('flagMatch', () => tv.flag_match.forEach((c) => close(flagMatch(c.earth, c.target), c.expected)))
  it('geometricMean', () =>
    tv.geometric_mean.forEach((c) => close(geometricMean(c.scores as Record<string, number>, c.weights as Record<string, number>, c.floor), c.expected)))
  it('totalScore', () => tv.total_score.forEach((c) => close(totalScore(c.core, c.secondary), c.expected)))
  it('cellId', () => tv.cell_id.forEach((c) => expect(cellId(c.lat, c.lon)).toBe(c.expected)))
  it('geometricMean drops factors with no target value (v1.1)', () =>
    tv.geometric_mean_dropped.forEach((c) => close(geometricMean(c.scores as Record<string, number>, c.weights as Record<string, number>, c.floor), c.expected)))
  it('weightedQuantile (cos(lat) area weighting, v1.1)', () =>
    tv.weighted_quantile.forEach((c) => close(weightedQuantile(c.x, c.w, [c.q])[0], c.expected)))
  it('weightedPctRank (v1.1)', () =>
    tv.weighted_pct_rank.forEach((c) => {
      const got = weightedPctRank(c.x, c.w, c.higher_is_better)
      c.expected.forEach((e, i) => close(got[i], e))
    }))
  it('greedyPortfolio', () =>
    tv.set_cover.forEach((c) =>
      expect(greedyPortfolio(c.sites as never, c.weights, c.theta, c.lam).map((s) => s.site_id)).toEqual(c.expected_ids)))
})
