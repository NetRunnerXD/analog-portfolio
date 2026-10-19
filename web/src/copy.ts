// UI copy from design/spec.md v0.3 (§7, §8.2, §11) with design/factcheck.md applied. Plain-language labels only:
// no engine-computed numbers live here (those are always read from the data files or the scoring worker).
import type { FactorId, PurposeId, Target, VariantId } from './types/contract'

export type FactorGroup = 'thermal' | 'terrain' | 'ground' | 'dryness' | 'ice' | 'sunlight' | 'shielding'

/**
 * Per-factor presentation that is NOT a label: colour group, the everyday chip word (spec §7 "Chips … Cold, Swing, …")
 * and the summary-sentence phrases. Factor names, short names, tier and info text are read from factors.json
 * (`ui_label`, `ui_short`, `tier`, `ui_copy`) via lib/factors.ts; nothing here names a factor.
 * `chip` is only a fallback until factors.json carries a per-factor chip word (`ui_chip`).
 */
export interface FactorUi { chip: string; group: FactorGroup; good: string; weak: string }

export const FACTOR_UI: Record<FactorId, FactorUi> = {
  F1: { chip: 'Cold', group: 'thermal', good: 'is about as cold', weak: 'is much warmer' },
  F2: { chip: 'Swing', group: 'thermal', good: 'has a similar daily temperature swing', weak: 'has a far smaller day–night swing' },
  F3: { chip: 'Ground', group: 'ground', good: 'has similar ground texture', weak: 'has different ground texture' },
  F4: { chip: 'Flat', group: 'terrain', good: 'has as much flat ground', weak: 'has less flat ground' },
  F5: { chip: 'Relief', group: 'terrain', good: 'has similar hills and ridges', weak: 'is flatter or more rugged' },
  F6: { chip: 'Rock', group: 'ground', good: 'has similar rocks', weak: 'has different rocks' },
  F7: { chip: 'Dry', group: 'dryness', good: 'is just as dry', weak: 'is wetter' },
  F8: { chip: 'Bare', group: 'dryness', good: 'is bare and lifeless', weak: 'has plants' },
  F9: { chip: 'Ice', group: 'ice', good: 'has frozen ground', weak: 'has no permanent ice' },
  F10: { chip: 'Sun', group: 'sunlight', good: 'has the same low sun', weak: 'has a higher sun' },
  F11: { chip: 'Shield', group: 'shielding', good: '', weak: '' },
  F12: { chip: 'UV', group: 'shielding', good: '', weak: '' },
  F13: { chip: 'Landforms', group: 'shielding', good: '', weak: '' },
}

export const PURPOSE_ICON: Record<PurposeId, string> = {
  P1_landing_mobility: 'purpose-landing-driving',
  P2_isru_ice: 'purpose-ice-resources',
  P3_habitat_eva_power: 'purpose-habitat-eva-power',
  P4_geology_regolith: 'purpose-geology-regolith',
  P5_astrobiology: 'purpose-search-life',
}

/** Fallbacks only; profiles.json display_name / display_short win (contract v1.1). */
export const PURPOSE_UI: Record<PurposeId, { name: string; short: string; description: string; campaign: string }> = {
  P1_landing_mobility: { name: 'Landing & driving', short: 'Landing', description: 'Flat, firm ground to land on and drive across.', campaign: 'Like Desert RATS and Black Point Lava Flow.' },
  P2_isru_ice: { name: 'Ice & resources', short: 'Ice', description: 'Frozen ground to practise finding and digging water ice.', campaign: 'Like PISCES and RESOLVE on Mauna Kea.' },
  P3_habitat_eva_power: { name: 'Habitat, EVA & power', short: 'Habitat', description: 'Cold, low sun and big temperature swings for living and spacewalks.', campaign: 'Like HMP on Devon Island and HI-SEAS on Mauna Loa.' },
  P4_geology_regolith: { name: 'Geology & regolith', short: 'Geology', description: "Rocks and soils like the target's, for science training.", campaign: 'Like Apollo training at Ries and Sudbury.' },
  P5_astrobiology: { name: 'Search for life', short: 'Life', description: 'Dry, harsh places where life barely survives, to test life-detection tools.', campaign: 'Like ASTEP in the Atacama.' },
}

export const STATUS_BADGE: Record<NonNullable<Target['status']>, string> = {
  'moon-base-i': 'Moon Base I site',
  'artemis-9': 'Artemis candidate',
  'mission-site': 'Rover site',
  'starship-candidate': 'Starship candidate',
  'ground-truth': 'Ice ground truth',
  optional: 'Optional',
}

export const VARIANT_UI: Record<VariantId, { label: string; short: string }> = {
  best_match: { label: 'Best match', short: 'Best' },
  easiest_to_reach: { label: 'Easiest to reach', short: 'Easiest' },
  one_continent: { label: 'One continent', short: '1 continent' },
}

export const DEFAULT_TARGET = 'moon_shackleton_connecting_ridge'
export const DEFAULT_PURPOSE: PurposeId = 'P3_habitat_eva_power'
