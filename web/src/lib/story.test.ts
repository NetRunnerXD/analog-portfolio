import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Portfolio, ValidationFile } from '../types/contract'
import { portfolioCaption, STORY_MOON, STORY_STEPS, storyScene, validationCaption } from './story'

const D = resolve(__dirname, '../../public/data')
const json = <T,>(p: string) => JSON.parse(readFileSync(resolve(D, p), 'utf8')) as T
describe('story mode', () => {
  it('has 7 steps totalling about 30 s', () => {
    expect(STORY_STEPS).toHaveLength(7)
    expect(STORY_STEPS.reduce((a, s) => a + s.ms, 0)).toBe(30000)
  })
  it('scenes: full-bleed 1–3 and 7, live app 4–6', () => {
    for (const s of [1, 2, 3, 7]) expect(storyScene(s, 0, 'P3', 'P1')).toBeNull()
    expect(storyScene(5, 0, 'P3', 'P1')).toMatchObject({ view: 'explore', step: 'portfolio', t: STORY_MOON })
    expect(storyScene(6, 1, 'P3', 'P1')).toMatchObject({ view: 'reverse', body: 'mars' })
  })
  it('captions come from the shipped files', () => {
    const pf = json<Portfolio>(`portfolios/${STORY_MOON}_P3_habitat_eva_power.json`)
    const v = pf.variants.find((x) => x.id === 'best_match')!
    expect(portfolioCaption(pf)).toBe(`${v.sites.length} site${v.sites.length === 1 ? '' : 's'} cover ${v.covers!.length} of ${pf.universe.length} needs.`)
    expect(validationCaption(json<ValidationFile>('validation.json'), STORY_MOON, 'P3_habitat_eva_power')).toMatch(/^\d+ of \d+ famous analogs rediscovered in the top 5%\. Blind test: the engine never saw them\.$/)
  })
})
