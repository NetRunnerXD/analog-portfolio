import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodeGrid } from '../data'
import type { FactorId, FactorsFile, GridManifest, ProfilesFile, TargetsFile } from '../types/contract'
import { aggregate, factorScores, minActiveFrac, prepareEarth, type TargetValues } from './engine'
import { reverseFactorScores, reverseTotals, topTwins, type PlanetValues } from './reverse'

const D = resolve(__dirname, '../../public/data')
const json = <T,>(p: string) => JSON.parse(readFileSync(resolve(D, p), 'utf8')) as T
const grid = (name: string) => {
  const m = json<GridManifest>(name)
  const b = readFileSync(resolve(D, m.binary))
  return { m, cols: decodeGrid(m, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)) }
}
const ef = grid('earth_features.json')
const earth = prepareEarth(ef.cols)
const factors = json<FactorsFile>('factors.json')
const profiles = json<ProfilesFile>('profiles.json')
const sc = json<TargetsFile>('targets.json').scoring_constants
const mars = grid('mars_grid.json')
const P: PlanetValues = {}
for (const a of mars.m.arrays) if (a.factor) P[a.factor as FactorId] = mars.cols[a.name]
const m = mars.m.n_cells

describe('reverse search uses the forward engine with the roles swapped', () => {
  const prof = profiles.profiles.find((p) => p.bodies.includes('mars'))!
  const earthOnly = factorScores(earth, {}, 'mars', factors, sc)
  for (const i of [123, 40000, 77777]) {
    it(`Earth cell #${i}: per-factor scores and totals equal factorScores / aggregate with the planet cell as the target`, () => {
      const r = reverseFactorScores(earth, i, earthOnly, P, m, factors, sc)
      const tot = reverseTotals(r, prof.weights, minActiveFrac(profiles))
      let checked = 0
      for (let j = 0; j < m; j += 997) {
        const tv: TargetValues = {}
        for (const [f, a] of Object.entries(P)) tv[f as FactorId] = Number.isFinite(a![j]) ? a![j] : null
        const s = factorScores(earth, tv, 'mars', factors, sc)
        for (const [f, a] of Object.entries(s)) {
          const mine = r.s[f as FactorId]![j]
          if (Number.isNaN(a![i])) expect(Number.isNaN(mine), `${f} ${j}`).toBe(true)
          else expect(Math.abs(mine - a![i]), `${f} ${j}`).toBeLessThan(1e-12)
        }
        const one: Partial<Record<FactorId, Float64Array>> = {}
        for (const [f, a] of Object.entries(s)) one[f as FactorId] = Float64Array.of(a![i])
        const want = aggregate(one, prof.weights, 1, minActiveFrac(profiles)).total[0]
        if (Number.isNaN(want)) expect(Number.isNaN(tot[j])).toBe(true)
        else { expect(Math.abs(tot[j] - want)).toBeLessThan(1e-12); checked++ }
      }
      expect(checked).toBeGreaterThan(10)
    })
  }
  it('top twins are ranked and spread out', () => {
    const r = reverseFactorScores(earth, 40000, earthOnly, P, m, factors, sc)
    const tot = reverseTotals(r, prof.weights, minActiveFrac(profiles))
    const lat = Float64Array.from({ length: m }, (_, j) => 89.5 - Math.floor(j / 360))
    const lon = Float64Array.from({ length: m }, (_, j) => -179.5 + (j % 360))
    const t = topTwins(tot, r, lat, lon, 3396190, 3, 300)
    expect(t).toHaveLength(3)
    expect(t[0].score).toBeGreaterThanOrEqual(t[1].score)
    expect(t[1].score).toBeGreaterThanOrEqual(t[2].score)
  })
})
