// TypeScript mirror of contract/schemas/*.schema.json (DATA_CONTRACT.md v1.1). Keep in sync.
export type CoreFactorId = `F${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10}`
export type FactorId = CoreFactorId | 'F11' | 'F12' | 'F13'
export type Body = 'earth' | 'moon' | 'mars'
export type TargetBody = 'moon' | 'mars'
export type PurposeId = 'P1_landing_mobility' | 'P2_isru_ice' | 'P3_habitat_eva_power' | 'P4_geology_regolith' | 'P5_astrobiology'
export type VariantId = 'best_match' | 'easiest_to_reach' | 'one_continent'

export const CORE_FACTORS: CoreFactorId[] = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10']
export const SECONDARY_FACTORS: FactorId[] = ['F11', 'F12', 'F13']
export const ALL_FACTORS: FactorId[] = [...CORE_FACTORS, ...SECONDARY_FACTORS]
export const VARIANT_IDS: VariantId[] = ['best_match', 'easiest_to_reach', 'one_continent']

export interface GridArray {
  name: string
  factor: FactorId | null
  dtype: 'uint8' | 'uint16' | 'uint32' | 'int16' | 'float32'
  byte_offset: number
  length: number
  scale: number
  add_offset: number
  nodata: number | null
  units: string
  stats?: { p005: number; p50: number; p995: number; min: number; max: number } | null
  source?: string
  /** categorical columns (contract v1.1.1 `continent`): {code: label}; 0/nodata = none */
  codes?: Record<string, string>
  /** alias accepted for older manifests: labels indexed by code */
  categories?: string[] | Record<string, string>
}

export interface GridManifest {
  contract_version: string
  body: Body
  mock: boolean
  grid: { resolution_deg: 0.5; ncols: 720; nrows: 360; lon_centre_first: -179.75; lat_centre_first: 89.75; row_order: 'north-to-south' }
  layout: 'sparse' | 'dense'
  n_cells: number
  binary: string
  byte_order: 'little'
  arrays: GridArray[]
  generated_at: string
}

export interface FeatureValue { value: number | null; t_star: number | null; gap: number | null; units?: string; source?: string }

/** Literature value from Researcher's targets.json / gaps.json. */
export type LitValue = number | string | null | (number | string)[]
export interface LitEntry { value: LitValue; unit: string; citation_url: string | null; note?: string }

export interface Target {
  id: string
  name: string
  short_name?: string
  description?: string
  body: TargetBody
  role: string
  anchor: { lat: number; lon: number; lon_convention?: string; source_url: string; note?: string }
  sample_radius_km: number
  values: Record<string, LitEntry>
  context_values?: Record<string, unknown>
  status?: 'artemis-9' | 'moon-base-i' | 'mission-site' | 'starship-candidate' | 'ground-truth' | 'optional'
  window_offset?: { bearing_deg: number; distance_km: number } | null
  citations?: string[]
  features?: Partial<Record<FactorId, FeatureValue>>
  card?: Record<string, unknown>
}

export interface EarthExtreme { value: number; cell_id: number; lat: number; lon: number }
export interface EarthReference {
  label: string
  source?: string
  grid?: string
  area_weighting?: string
  n_land_cells?: number
  stats: Record<string, { units: string; min: EarthExtreme; max: EarthExtreme; p0_5: number; p50: number; p99_5: number }>
}

export interface TargetsFile {
  _schema?: string
  version?: string
  generated?: string
  contract_version?: string
  mock?: boolean
  body_context?: Partial<Record<TargetBody, Record<string, LitEntry>>>
  targets: Target[]
  earth_reference?: EarthReference | null
}

export interface HardFilter { id: string; rule: string; reason: string; ui_short?: string; ui_tooltip?: string }
export interface Profile {
  id: PurposeId
  code: string
  name: string
  display_name?: string
  display_short?: string
  bodies: TargetBody[]
  disabled_for?: Partial<Record<TargetBody, string>>
  weights: Record<string, number>
  theta: number
  nms_radius_km: number
  hard_filters: HardFilter[]
  campaigns?: string[]
}
export interface VariantDef { id: VariantId; display_name: string; pool_filter: string | null; help: string; unavailable_reason?: string; source?: string }
export interface ProfilesFile {
  contract_version: string
  status?: string
  defaults: {
    theta: number
    nms_radius_km: number
    candidates_top_n_per_factor: number
    candidate_min_score?: string
    portfolio_max_sites: number
    monte_carlo: { draws: number; dirichlet_alpha_scale: number; robust_top_frac: number; robust_min_freq: number; seed: number; rule?: string }
    secondary_factors?: string[]
    variants?: VariantDef[]
    [k: string]: unknown
  }
  global_hard_filters: HardFilter[]
  profiles: Profile[]
}

export interface Factor {
  id: FactorId
  name: string
  tier: 'core' | 'secondary'
  units: string
  feature: string
  normalization: string
  direction: string
  earth_clip: boolean
  params?: { tau?: number; cap?: Partial<Record<TargetBody, number>>; [k: string]: unknown }
  layers: Partial<Record<Body, string>>
  ui_label?: string
  ui_copy?: string
  /** spec §7 matrix short name (not yet in the data) */
  ui_short?: string
  /** everyday chip word, e.g. "Cold" (proposed, not yet in the data) */
  ui_chip?: string
}
export interface LithologyClass { code: number; id: string; name: string }
export interface FactorsFile {
  contract_version: string
  factors: Factor[]
  lithology_classes: LithologyClass[]
  lithology_similarity: { default_same: number; default_other: number; pairs: [string, string, number][] }
  geomorph_flags: { bit: number; id: string; name: string }[]
  [k: string]: unknown
}

export interface Robustness { top5_freq: number; robust: boolean }
export interface Logistics { travel_time_min: number | null; within_6h?: boolean | null; continent?: string | null; airport_km?: number | null }

export interface SiteRef {
  site_id: string
  name: string
  lat: number
  lon: number
  cell_id: number
  score: number
  score_core?: number
  earth_percentile?: number
  factor_scores: Partial<Record<FactorId, number | null>>
  covers: FactorId[]
  gaps?: Partial<Record<FactorId, number>>
  robustness?: Robustness | null
  logistics?: Logistics
  known_analog?: string | null
  candidate?: boolean
  /** Natural Earth admin-0 country (announced by Project 1; absent in v1.1 mocks) */
  country?: string | null
  /** admin-1 region (state/province); `admin1` accepted as an alias */
  region?: string | null
  admin1?: string | null
}

export interface PortfolioVariant {
  id: VariantId
  available: boolean
  unavailable_reason?: string | null
  continent?: string | null
  pool_size?: number
  sites: SiteRef[]
  covers?: FactorId[]
  coverage: number
}

export interface Portfolio {
  contract_version: string
  mock?: boolean
  target_id: string
  profile_id: string
  weights: Record<string, number>
  theta: number
  universe: FactorId[]
  uncoverable: FactorId[]
  dropped_factors?: FactorId[]
  variants: PortfolioVariant[]
  top_cells?: SiteRef[]
  score_histogram?: { bins: number[]; counts: number[] }
  monte_carlo?: { draws: number; robust_top_frac: number; robust_min_freq: number; seed: number; area_weighting?: string }
  earth_thresholds?: { median: number; top5: number; top1: number }
}

export interface Gap {
  id: string
  label: string
  factors: (FactorId | 'not_scored')[]
  values: { moon?: LitValue; mars?: LitValue; earth?: LitValue; unit: string; source_urls: string[]; derived?: string }
  facility_types: string[]
  example_facilities: string[]
  handling: string
  citation_urls: string[]
  note?: string
}
export type GapTierId = 'never_on_earth' | 'beyond_earth_range' | 'coverable'
export interface Facility { name: string; type: string; operator: string; location: string; provides: string; url: string; url_alt?: string }
export interface GapsFile {
  _schema?: string
  version?: string
  generated?: string
  contract_version?: string
  tiers: Record<GapTierId, { description: string; gaps: Gap[] }>
  facilities: Record<string, Facility>
}

export interface ValidationSite {
  name: string
  lat: number
  lon: number
  body_analog: 'moon' | 'mars' | 'both' | 'none'
  mission_purposes: string[]
  why: string
  citation_url: string
  kind: 'positive' | 'negative'
  cell_id: number
  results: { target_id: string; profile_id: string; percentile: number; in_top5: boolean; in_top1: boolean }[]
}
export interface ValidationFile {
  contract_version: string
  mock?: boolean
  summary: Record<string, unknown>
  sites: ValidationSite[]
  new_candidates: unknown[]
}
