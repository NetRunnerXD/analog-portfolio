import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FactorId, SiteRef, ValidationFile } from '../types/contract'
import { coverageMatrix } from './matrix'
import { evalCell, pairValidation, rankAuc } from './validation'

const DATA = resolve(__dirname, '../../public/data')
const validation = JSON.parse(readFileSync(resolve(DATA, 'validation.json'), 'utf8')) as ValidationFile
const site = (id: string, fs: Partial<Record<FactorId, number>>) => ({ site_id: id, factor_scores: fs } as unknown as SiteRef)

describe('coverage matrix', () => {
  it('covered / at Earth\'s limit / partial / none, and uncovered columns', () => {
    const m = coverageMatrix([site('a', { F1: 0.9, F2: 0.5, F3: 0.1 }), site('b', { F1: 0.2, F2: 0.69, F3: 0.39 })], ['F1', 'F2', 'F3', 'F4'], 0.7, (f) => f === 'F1')
    expect(m.cells).toEqual([['atLimit', 'partial', 'none', 'none'], ['none', 'partial', 'none', 'none']])
    expect(m.uncovered).toEqual(['F2', 'F3', 'F4'])
  })
  it('θ itself counts as covered', () => {
    expect(coverageMatrix([site('a', { F5: 0.7 })], ['F5'], 0.7, () => false).cells[0][0]).toBe('covered')
  })
})

describe('validation per target + purpose', () => {
  it('reproduces the precomputed per-pair hits from validation.json', () => {
    const pairs = new Set(validation.sites.flatMap((s) => s.results.map((r) => `${r.target_id}|${r.profile_id}`)))
    for (const key of pairs) {
      const [t, p] = key.split('|')
      const body = t.startsWith('moon') ? 'moon' : 'mars'
      const pv = pairValidation(validation, t, body, p)
      const pos = validation.sites.filter((s) => s.kind === 'positive').flatMap((s) => s.results.filter((r) => r.target_id === t && r.profile_id === p))
      expect(pv.total).toBe(pos.length)
      expect(pv.hit5).toBe(pos.filter((r) => r.in_top5).length)
      expect(pv.hit1).toBe(pos.filter((r) => r.in_top1).length)
    }
  })
  it('mean of per-pair AUCs equals the published summary rank_auc', () => {
    const pairs = [...new Set(validation.sites.filter((s) => s.kind === 'positive').flatMap((s) => s.results.map((r) => `${r.target_id}|${r.profile_id}`)))].sort()
    const aucs = pairs.map((k) => { const [t, p] = k.split('|'); return pairValidation(validation, t, t.startsWith('moon') ? 'moon' : 'mars', p).auc }).filter((a): a is number => a !== null)
    const mean = aucs.reduce((a, b) => a + b, 0) / aucs.length
    expect(Math.abs(mean - (validation.summary.rank_auc as number))).toBeLessThan(6e-5)
  })
  it('live percentiles override the file (custom weights)', () => {
    const t = 'moon_shackleton_connecting_ridge'
    const live = new Map(validation.sites.map((s) => [evalCell(s), { percentile: 99.5 }]))
    const pv = pairValidation(validation, t, 'moon', 'P3_habitat_eva_power', live)
    const stuck = pv.rows.filter((r) => !r.isControl && (r.status === 'gate_excluded' || r.status === 'land_filter_excluded' || r.status === 'hard_filter_excluded')).length
    expect(pv.hit5).toBe(pv.total - stuck)
    expect(pv.hit1).toBe(pv.total - stuck)
  })
  it('excluded evaluations stay in the denominators (summary pct_top5 / n_evaluations)', () => {
    const pairs = [...new Set(validation.sites.filter((s) => s.kind === 'positive').flatMap((s) => s.results.map((r) => `${r.target_id}|${r.profile_id}`)))]
    let total = 0, hit5 = 0, excluded = 0
    for (const k of pairs) {
      const [t, p] = k.split('|')
      const pv = pairValidation(validation, t, t.startsWith('moon') ? 'moon' : 'mars', p)
      total += pv.total; hit5 += pv.hit5; excluded += pv.nExcluded
    }
    expect(total).toBe(validation.summary.n_evaluations)
    expect(total - excluded).toBe(validation.summary.n_scored)
    expect(Math.abs(hit5 / total - (validation.summary.pct_top5 as number))).toBeLessThan(6e-5)
  })
  it('live: gate-excluded stays at 0; insufficient data under custom weights becomes a miss', () => {
    const mars = validation.sites.find((s) => s.results.some((r) => r.status === 'gate_excluded'))!
    const r = mars.results.find((x) => x.status === 'gate_excluded')!
    const body = r.target_id.startsWith('moon') ? 'moon' : 'mars'
    const live = new Map(validation.sites.map((s) => [evalCell(s), { percentile: null as number | null }]))
    const pv = pairValidation(validation, r.target_id, body, r.profile_id, live)
    const row = pv.rows.find((x) => x.site === mars)!
    expect(row.status).toBe('gate_excluded')
    expect(row.percentile).toBe(0)
    expect(pv.rows.filter((x) => x.status === 'insufficient_data').every((x) => x.percentile === 0 && !x.inTop5)).toBe(true)
    expect(pv.total).toBe(validation.sites.filter((s) => s.kind === 'positive' && s.results.some((x) => x.target_id === r.target_id && x.profile_id === r.profile_id)).length)
  })
  it('rank AUC with ties', () => {
    expect(rankAuc([90, 80], [80, 10])).toBe((1 + 1 + 0.5 + 1) / 4)
    expect(rankAuc([], [1])).toBeNull()
  })
})
