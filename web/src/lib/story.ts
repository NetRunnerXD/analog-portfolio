import type { Portfolio, ValidationFile } from '../types/contract'
import type { UrlState } from './url'

/** Spec §11.11: seven steps, ~30 s. Durations in ms; step 5 has two captions, step 6 two scenes. */
export const STORY_STEPS = [
  { chip: 'The target', ms: 2000 },
  { chip: 'The question', ms: 3000 },
  { chip: 'The idea', ms: 5000 },
  { chip: 'The map', ms: 4000 },
  { chip: 'The portfolio', ms: 6000 },
  { chip: 'Mars', ms: 7000 },
  { chip: 'Try it', ms: 3000 },
] as const
export const STORY_MOON = 'moon_shackleton_connecting_ridge'
export const STORY_MARS = 'mars_jezero'
/** Atacama (reverse-search card on step 6): an often-used Mars analog, picked for the story only. */
export const STORY_PLACE = '-24.50,-69.25'

/** What the app shows underneath the story overlay at a step (null = a full-bleed story visual). */
export function storyScene(step: number, half: number, purpose: string, marsPurpose: string): Partial<UrlState> | null {
  const base = { site: undefined, w: undefined, v: 'best_match' as const }
  if (step === 4) return { ...base, view: 'explore', t: STORY_MOON, p: purpose, step: 'map' }
  if (step === 5) return { ...base, view: 'explore', t: STORY_MOON, p: purpose, step: 'portfolio' }
  if (step === 6) return half === 0 ? { ...base, view: 'explore', t: STORY_MARS, p: marsPurpose, step: 'portfolio' } : { view: 'reverse', body: 'mars', place: STORY_PLACE }
  return null
}

/** "3 sites cover 8 of 9 needs." from the shipped portfolio (never hard-coded). */
export function portfolioCaption(p: Portfolio | null): string | null {
  const v = p?.variants.find((x) => x.id === 'best_match' && x.available) ?? p?.variants.find((x) => x.available)
  if (!p || !v) return null
  const covered = v.covers?.length ?? Math.round(v.coverage * p.universe.length)
  return `${v.sites.length} site${v.sites.length === 1 ? '' : 's'} cover ${covered} of ${p.universe.length} needs.`
}

/** "{hit} of {total} famous analogs rediscovered in the top 5%" for one target / purpose pair. Excluded evaluations count as misses. */
export function validationCaption(v: ValidationFile | null, targetId: string, profileId: string): string | null {
  if (!v) return null
  let hit = 0, total = 0
  for (const s of v.sites) {
    if (s.kind !== 'positive') continue
    for (const r of s.results ?? []) if (r.target_id === targetId && r.profile_id === profileId) { total++; if (r.in_top5) hit++ }
  }
  return total ? `${hit} of ${total} famous analogs rediscovered in the top 5%.` : null
}
