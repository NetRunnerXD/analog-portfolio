// UI copy from design/spec.md v0.3 (§7, §8.2, §11) with design/factcheck.md applied. Plain-language labels only:
// no engine-computed numbers live here (those are always read from the data files or the scoring worker).
import type { FactorId, PurposeId, Target, VariantId } from './types/contract'

export type FactorGroup = 'thermal' | 'terrain' | 'ground' | 'dryness' | 'ice' | 'sunlight' | 'shielding'

export interface FactorUi { name: string; short: string; chip: string; group: FactorGroup; info: string; good: string; weak: string; tieBreaker?: boolean }

export const FACTOR_UI: Record<FactorId, FactorUi> = {
  F1: { name: 'Average ground temperature', short: 'Tmp', chip: 'Cold', group: 'thermal', good: 'is about as cold', weak: 'is much warmer',
    info: "How warm the ground is on average over a year, in kelvin. Compared as a ratio, so being 10 K off matters more when it's cold. If the target is colder than anywhere on Earth, we compare against Earth's coldest real value and list the shortfall." },
  F2: { name: 'Day–night temperature swing', short: 'Swg', chip: 'Swing', group: 'thermal', good: 'has a similar daily temperature swing', weak: 'has a far smaller day–night swing',
    info: "How much the ground heats up and cools down each day. When the target swings more than anywhere on Earth (the Moon's equator swings about 300 K), the site is scored against Earth's largest swing and the shortfall is listed under What Earth can't give you." },
  F3: { name: 'Ground type (heat retention)', short: 'Gnd', chip: 'Ground', group: 'ground', good: 'has similar ground texture', weak: 'has different ground texture',
    info: 'How the ground holds heat, sorted into five types from dusty to rocky. Each world is ranked on its own scale and the types are compared, so this describes texture, not an exact physical match.' },
  F4: { name: 'Flat, landable ground', short: 'Flt', chip: 'Flat', group: 'terrain', good: 'has as much flat ground', weak: 'has less flat ground',
    info: 'Share of the area with gentle slopes under 5°, the goal for lunar landers (8° is the limit).' },
  F5: { name: 'Hills and relief', short: 'Rlf', chip: 'Relief', group: 'terrain', good: 'has similar hills and ridges', weak: 'is flatter or more rugged',
    info: 'How much the height changes within the area. We compare height differences, not altitude above sea level.' },
  F6: { name: 'Rock type', short: 'Rck', chip: 'Rock', group: 'ground', good: 'has similar rocks', weak: 'has different rocks',
    info: 'The main rock family (for example basalt, anorthosite or sandstone), matched with our documented similarity table: same family scores 100, related families 50.' },
  F7: { name: 'Dryness', short: 'Dry', chip: 'Dry', group: 'dryness', good: 'is just as dry', weak: 'is wetter',
    info: 'How dry the climate is. The target is treated as completely dry, so the driest places on Earth score highest.' },
  F8: { name: 'Bare ground (no plants)', short: 'Bar', chip: 'Bare', group: 'dryness', good: 'is bare and lifeless', weak: 'has plants',
    info: 'Share of bare rock, sand, snow or ice instead of plants. The target is lifeless, so 100% bare is a perfect match.' },
  F9: { name: 'Frozen ground / ice', short: 'Ice', chip: 'Ice', group: 'ice', good: 'has frozen ground', weak: 'has no permanent ice',
    info: "Whether the ground stays frozen all year, compared with ice in the target's cold traps or just below its surface." },
  F10: { name: 'Sun angle & daylight pattern', short: 'Sun', chip: 'Sun', group: 'sunlight', good: 'has the same low sun', weak: 'has a higher sun',
    info: "How high the Sun climbs at noon and how long days and nights last. Polar places with a low Sun match the Moon's south pole best." },
  F11: { name: 'Air & radiation shielding', short: 'Shd', chip: 'Shield', group: 'shielding', good: '', weak: '', tieBreaker: true,
    info: 'How thin the air is and how much space radiation reaches the ground. Earth is always far better protected, so this can only break ties between otherwise equal places.' },
  F12: { name: 'UV exposure', short: 'UV', chip: 'UV', group: 'shielding', good: '', weak: '', tieBreaker: true,
    info: "Strength of the Sun's ultraviolet light. The Moon and Mars get far more; this only breaks ties." },
  F13: { name: 'Landforms', short: 'Lnd', chip: 'Landforms', group: 'shielding', good: '', weak: '', tieBreaker: true,
    info: 'Whether the area has matching landforms such as impact craters, lava tubes or ice-shaped ground.' },
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
