import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FactorsFile, Target, TargetsFile } from '../types/contract'
import { isAtLimit } from './format'
import { earthLimit } from './limits'

const MOCK = resolve(__dirname, '../../public/data/mock')
const factors = JSON.parse(readFileSync(resolve(MOCK, 'factors.json'), 'utf8')) as FactorsFile
const targets = JSON.parse(readFileSync(resolve(MOCK, 'targets.json'), 'utf8')) as TargetsFile
const ref = targets.earth_reference ?? undefined

describe('beyond-Earth shortfall (spec v0.3.1 §11.4)', () => {
  it('coldest shadows: shortfall = Earth coldest cell − target, always positive', () => {
    const t = targets.targets.find((x) => x.body === 'moon' && (x.features?.F1?.value ?? 999) < ref!.stats.ts_mean_k.min.value)!
    const lim = earthLimit(t, 'F1', factors, ref)!
    expect(lim.best).toBe(ref!.stats.ts_mean_k.min.value)
    expect(lim.short).toBeCloseTo(ref!.stats.ts_mean_k.min.value - t.features!.F1!.value!, 9)
    expect(lim.short).toBeGreaterThan(0)
    expect(lim.note).toMatch(/Coldest 0\.5° land cell in our data/)
  })
  it('falls back to |value − t*| without earth_reference, and isAtLimit ignores the gap sign', () => {
    const t: Target = { id: 'x', body: 'moon', name: 'x', features: { F1: { value: 180, t_star: 222.31, gap: -42.31, source: 'mock' } } } as unknown as Target
    expect(isAtLimit(t, 'F1')).toBe(true)
    expect(earthLimit(t, 'F1', factors, undefined)!.short).toBeCloseTo(42.31, 9)
    const inside: Target = { ...t, features: { F1: { value: 250, t_star: 250, gap: 0, source: 'mock' } } } as unknown as Target
    expect(isAtLimit(inside, 'F1')).toBe(false)
    expect(earthLimit(inside, 'F1', factors, undefined)).toBeNull()
  })
})
