// Python/JS parity of the full scorer: run the TS engine on the shipped mock Earth grid with each profile's default
// weights and compare against the portfolios the Python reference wrote (pipeline/analog_portfolio/export/mock.py).
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodeGrid } from '../data'
import type { FactorId, FactorsFile, GridManifest, Portfolio, ProfilesFile, TargetsFile, ValidationFile } from '../types/contract'
import { clipTargets, factorScores, prepareEarth, run, type TargetValues } from './engine'

const MOCK = resolve(__dirname, '../../public/data/mock')
const json = <T,>(p: string): T => JSON.parse(readFileSync(resolve(MOCK, p), 'utf8')) as T
const manifest = json<GridManifest>('earth_features.json')
const bin = readFileSync(resolve(MOCK, manifest.binary))
const earth = prepareEarth(decodeGrid(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)))
const factors = json<FactorsFile>('factors.json')
const profiles = json<ProfilesFile>('profiles.json')
const targets = json<TargetsFile>('targets.json')
const validation = json<ValidationFile>('validation.json')
const known = new Map<number, string>()
const seen = new Set<number>()
for (const v of validation.sites) { if (seen.has(v.cell_id)) continue; seen.add(v.cell_id); if (v.kind === 'positive') known.set(v.cell_id, v.name) }

// export/mock.py mock_continent(): MOCK-only continent boxes, used here so the one_continent variant can be compared.
function mockContinent(lat: number, lon: number): string {
  if (lat < -60) return 'Antarctica'
  if (lon < -30) return lat < 12 ? 'South America' : 'North America'
  if (lat > 60 && lon < -10) return 'North America'
  if ((lon > 110 && lat < -10) || lon > 160) return 'Oceania'
  if (lon >= -20 && lon <= 52 && lat < 36) return 'Africa'
  if (lon >= -25 && lon <= 40 && lat >= 36) return 'Europe'
  return 'Asia'
}

const tvOf = (id: string): TargetValues => {
  const t = targets.targets.find((x) => x.id === id)!
  return Object.fromEntries(Object.entries(t.features ?? {}).map(([f, v]) => [f, v?.value ?? null])) as TargetValues
}
const files = readdirSync(resolve(MOCK, 'portfolios')).filter((f) => f.endsWith('.json')).sort()
const close = (a: number, b: number, tol: number, what: string) => expect(Math.abs(a - b), `${what}: ${a} vs ${b}`).toBeLessThanOrEqual(tol)

describe('engine parity with the Python reference (mock grid, default weights)', () => {
  it('targets.json t_star / gap match clipTargets', () => {
    for (const t of targets.targets) {
      if (!t.features?.F1?.value) continue
      const clips = clipTargets(earth, tvOf(t.id), factors)
      for (const [f, [ts, gap]] of Object.entries(clips) as [FactorId, [number, number]][]) {
        close(ts, t.features[f]!.t_star!, 1e-9, `${t.id} ${f} t_star`)
        close(gap, t.features[f]!.gap!, 6e-4, `${t.id} ${f} gap`)
      }
    }
  })

  for (const file of files) {
    it(file, () => {
      const p = json<Portfolio>(`portfolios/${file}`)
      const target = targets.targets.find((t) => t.id === p.target_id)!
      const profile = profiles.profiles.find((x) => x.id === p.profile_id)!
      const tv = tvOf(target.id)
      const s = factorScores(earth, tv, target.body, factors)
      const out = run({ earth, s, clips: clipTargets(earth, tv, factors), targetId: target.id, profile, profiles, weights: profile.weights,
        knownCells: known, continentOf: (_c, la, lo) => mockContinent(la, lo) })
      // per-site factor scores, S and percentile at every cell the reference exported
      const idx = new Map<number, number>()
      earth.cellId.forEach((c, i) => idx.set(c, i))
      const refSites = [...(p.top_cells ?? []), ...p.variants.flatMap((v) => v.sites)]
      for (const r of refSites) {
        const i = idx.get(r.cell_id)!
        for (const [f, v] of Object.entries(r.factor_scores)) close(s[f as FactorId]![i], v as number, 5.1e-5, `${r.site_id} ${f}`)
        close(out.total[i], r.score, 5.1e-5, `${r.site_id} S`)
        close(out.pct[i], r.earth_percentile!, 5.1e-3, `${r.site_id} pct`)
      }
      for (const k of ['median', 'top5', 'top1'] as const) close(out.portfolio.earth_thresholds![k], p.earth_thresholds![k], 1e-9, k)
      expect(out.portfolio.universe).toEqual(p.universe)
      expect(out.portfolio.uncoverable).toEqual(p.uncoverable)
      // Variant invariants (contract v1.1 §4.1) on the JS output
      const theta = profile.theta
      for (const v of out.portfolio.variants) {
        expect(v.sites.length).toBeLessThanOrEqual(profiles.defaults.portfolio_max_sites)
        for (const site of v.sites) {
          expect(site.covers).toEqual((Object.keys(profile.weights) as FactorId[]).filter((f) => profile.weights[f] > 0 && (site.factor_scores[f] ?? 0) >= theta))
          // every exported number is re-derivable from the grid
          const i = idx.get(site.cell_id)!
          close(site.score, out.total[i], 5.1e-5, 'site score')
        }
        if (v.id === 'easiest_to_reach') v.sites.forEach((x) => expect(x.logistics!.travel_time_min!).toBeLessThanOrEqual(360))
        if (v.id === 'one_continent' && v.available) v.sites.forEach((x) => expect(x.logistics!.continent).toBe(v.continent))
        expect(new Set(v.sites.map((x) => x.site_id)).size).toBe(v.sites.length)
      }
    })
  }

  // SKIPPED UNTIL THE PIPELINE MATCHES THE CANONICAL TIE-BREAK. Project 1 confirmed (Oct 8) that the JS tie-break is canonical
  // (contract v1.1.1 errata): candidates by s_F desc, then S desc, then cell_id asc; set-cover pool by S desc, then cell_id
  // asc. The mock export still uses numpy's default (unstable) argsort, and ties are common at the top-50 cut (F3 classes,
  // F6 categories, F8 = 1.0), so its exact pool and site ids are implementation-defined today. Every score, percentile and
  // threshold already matches (tests above). Remove `.skip` once pipeline/export uses the same tie-break and the mocks are
  // regenerated. Mid-rank percentiles and the 70% missing-data rule land in a separate PR and are not ported here.
  it.skip('candidate pool and variant site ids match Python exactly (enable once the pipeline uses the canonical tie-break)', () => {
    for (const file of files) {
      const p = json<Portfolio>(`portfolios/${file}`)
      const target = targets.targets.find((t) => t.id === p.target_id)!
      const profile = profiles.profiles.find((x) => x.id === p.profile_id)!
      const tv = tvOf(target.id)
      const out = run({ earth, s: factorScores(earth, tv, target.body, factors), clips: clipTargets(earth, tv, factors), targetId: target.id, profile, profiles,
        weights: profile.weights, knownCells: known, continentOf: (_c, la, lo) => mockContinent(la, lo) })
      expect(out.portfolio.top_cells!.map((x) => x.cell_id), `${file} top_cells`).toEqual(p.top_cells!.map((x) => x.cell_id))
      for (const v of p.variants) {
        const mine = out.portfolio.variants.find((x) => x.id === v.id)!
        expect(mine.sites.map((x) => x.cell_id), `${file} ${v.id}`).toEqual(v.sites.map((x) => x.cell_id))
      }
    }
  })
})
