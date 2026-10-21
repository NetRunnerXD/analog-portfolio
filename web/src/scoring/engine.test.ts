// Python/JS parity of the full scorer: run the TS engine on the shipped mock Earth grid with each profile's default
// weights and compare against the portfolios the Python reference wrote (pipeline/analog_portfolio/export/mock.py).
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodeGrid } from '../data'
import type { FactorId, FactorsFile, GridManifest, Portfolio, ProfilesFile, SiteRef, TargetsFile, ValidationFile } from '../types/contract'
import { buildVariants, clipTargets, factorScores, prepareEarth, run, type TargetValues } from './engine'
import { gridContinentLookup } from './continent'

// CI runs against the shipped mocks. Set PARITY_DATA to another data root (e.g. a read-only export of PR #11's
// web/public/data) to check parity against a real pipeline run locally.
const MOCK = process.env.PARITY_DATA ? resolve(process.env.PARITY_DATA) : resolve(__dirname, '../../public/data/mock')
const json = <T,>(p: string): T => JSON.parse(readFileSync(resolve(MOCK, p), 'utf8')) as T
const manifest = json<GridManifest>('earth_features.json')
const bin = readFileSync(resolve(MOCK, manifest.binary))
const columns = decodeGrid(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength))
const earth = prepareEarth(columns)
// contract v1.1.1: the grid carries a `continent` column (manifest codes); the worker uses it the same way
const gridContinent = gridContinentLookup(manifest, columns)
const factors = json<FactorsFile>('factors.json')
const profiles = json<ProfilesFile>('profiles.json')
const targets = json<TargetsFile>('targets.json')
const validation = json<ValidationFile>('validation.json')
const known = new Map<number, string>()
const seen = new Set<number>()
for (const v of validation.sites) { if (seen.has(v.cell_id)) continue; seen.add(v.cell_id); if (v.kind === 'positive') known.set(v.cell_id, v.name) }

// Pre-v1.1.1 export/mock.py mock_continent() boxes: only used if the grid has no continent column.
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
// PARITY_TOL_SCALE widens every tolerance for a local check against an export that is not yet computed on the quantised grid.
const TOL_SCALE = Number(process.env.PARITY_TOL_SCALE ?? 1)
const close = (a: number, b: number, tol: number, what: string) => expect(Math.abs(a - b), `${what}: ${a} vs ${b}`).toBeLessThanOrEqual(tol * TOL_SCALE)

describe('engine parity with the Python reference (mock grid, default weights)', () => {
  it('targets.json t_star / gap match clipTargets', () => {
    for (const t of targets.targets) {
      if (!t.features?.F1?.value) continue
      const clips = clipTargets(earth, tvOf(t.id), factors)
      for (const [f, [ts, gap]] of Object.entries(clips) as [FactorId, [number, number]][]) {
        close(ts, t.features[f]!.t_star!, 5.1e-5, `${t.id} ${f} t_star`) // exports round to 4 dp
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
        knownCells: known, continentOf: (c, la, lo) => (gridContinent ? gridContinent(c) : mockContinent(la, lo)) })
      // per-site factor scores, S and percentile at every cell the reference exported
      const idx = new Map<number, number>()
      earth.cellId.forEach((c, i) => idx.set(c, i))
      const refSites = [...(p.top_cells ?? []), ...p.variants.flatMap((v) => v.sites)]
      for (const r of refSites) {
        const i = idx.get(r.cell_id)!
        for (const [f, v] of Object.entries(r.factor_scores)) {
          // the real exporter writes 0.0 for a factor dropped for the target (no target value); the engine leaves it out
          if (!s[f as FactorId]) { expect(v, `${r.site_id} ${f} dropped`).toBe(0); continue }
          close(s[f as FactorId]![i], v as number, 5.1e-5, `${r.site_id} ${f}`)
        }
        close(out.total[i], r.score, 5.1e-5, `${r.site_id} S`)
        close(out.pct[i], r.earth_percentile!, 5.1e-3, `${r.site_id} pct`)
      }
      for (const k of ['median', 'top5', 'top1'] as const) close(out.portfolio.earth_thresholds![k], p.earth_thresholds![k], 5.1e-5, k) // exports round to 4 dp
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
        if (v.id === 'easiest_to_reach') {
          v.sites.forEach((x) => expect(x.logistics!.travel_time_min!).toBeLessThanOrEqual(360))
        }
        if (v.id === 'one_continent' && v.available) v.sites.forEach((x) => expect(x.logistics!.continent).toBe(v.continent))
        expect(new Set(v.sites.map((x) => x.site_id)).size).toBe(v.sites.length)
      }
    })
  }

  // Exact pool / site-id parity under the canonical stable tie-break (candidates by s_F desc, S desc, cell index asc;
  // set-cover pool by S desc, cell index asc). CI runs it on the contract v1.1.1 mocks; PARITY_DATA points it at another
  // export (e.g. PR #11's real run) for a local check.
  it('candidate pool and variant site ids match Python exactly (canonical tie-break)', () => {
    for (const file of files) {
      const p = json<Portfolio>(`portfolios/${file}`)
      const target = targets.targets.find((t) => t.id === p.target_id)!
      const profile = profiles.profiles.find((x) => x.id === p.profile_id)!
      const tv = tvOf(target.id)
      const out = run({ earth, s: factorScores(earth, tv, target.body, factors), clips: clipTargets(earth, tv, factors), targetId: target.id, profile, profiles,
        weights: profile.weights, knownCells: known, continentOf: (c, la, lo) => (gridContinent ? gridContinent(c) : mockContinent(la, lo)) })
      expect(out.portfolio.top_cells!.map((x) => x.cell_id), `${file} top_cells`).toEqual(p.top_cells!.map((x) => x.cell_id))
      for (const v of p.variants) {
        const mine = out.portfolio.variants.find((x) => x.id === v.id)!
        expect(mine.sites.map((x) => x.cell_id), `${file} ${v.id}`).toEqual(v.sites.map((x) => x.cell_id))
      }
    }
  })
})

// Spec v0.3.1: "Easiest to reach" is a hard filter (travel_time_min <= 360) applied BEFORE set cover, also for custom weights.
describe('easiest_to_reach: <= 6 h hard filter before set cover', () => {
  const mk = (id: string, tt: number | null, fs: Partial<Record<FactorId, number>>, score: number): SiteRef => ({
    site_id: id, name: id, lat: 0, lon: 0, cell_id: 0, score, score_core: score, earth_percentile: 99, factor_scores: fs, covers: [], gaps: {},
    robustness: null, logistics: { travel_time_min: tt, within_6h: tt === null ? null : tt <= 360, continent: 'Asia', airport_km: null }, known_analog: null, candidate: true,
  })
  it('a far site that would win the set cover is removed first, and pool_size counts only <= 6 h sites', () => {
    const w = { F1: 50, F2: 50 }
    const far = mk('far', 900, { F1: 0.95, F2: 0.95 }, 0.95) // covers both alone; best_match picks it
    const nearA = mk('nearA', 120, { F1: 0.9, F2: 0.2 }, 0.6)
    const nearB = mk('nearB', 360, { F1: 0.1, F2: 0.8 }, 0.5) // exactly 6 h is in
    const edge = mk('edge', 360.1, { F1: 0.99, F2: 0.99 }, 0.99)
    const unknown = mk('unk', null, { F1: 0.99, F2: 0.99 }, 0.99)
    const v = buildVariants([edge, far, unknown, nearA, nearB], w, 0.7, 5)
    expect(v[0].sites.map((s) => s.site_id)).toEqual(['edge'])
    const ez = v.find((x) => x.id === 'easiest_to_reach')!
    expect(ez.pool_size).toBe(2)
    expect(ez.sites.map((s) => s.site_id)).toEqual(['nearA', 'nearB'])
    expect(ez.covers).toEqual(['F1', 'F2'])
  })
  it('custom weights (worker re-scoring path): easiest sites are all <= 6 h and its pool is the filtered candidate pool', () => {
    const t = targets.targets.find((x) => x.body === 'moon' && x.features?.F1?.value)!
    const profile = profiles.profiles[0]
    const weights = { F1: 10, F2: 10, F3: 30, F4: 0, F5: 20, F6: 10, F7: 10, F8: 0, F9: 10, F10: 0 } as Record<string, number>
    const tv = tvOf(t.id)
    const out = run({ earth, s: factorScores(earth, tv, t.body, factors), clips: clipTargets(earth, tv, factors), targetId: t.id, profile, profiles, weights,
      knownCells: known, continentOf: (c, la, lo) => (gridContinent ? gridContinent(c) : mockContinent(la, lo)) })
    const bm = out.portfolio.variants.find((v) => v.id === 'best_match')!
    const ez = out.portfolio.variants.find((v) => v.id === 'easiest_to_reach')!
    expect(ez.pool_size).toBeLessThanOrEqual(bm.pool_size)
    ez.sites.forEach((x) => expect(x.logistics!.travel_time_min!).toBeLessThanOrEqual(360))
  })
})
