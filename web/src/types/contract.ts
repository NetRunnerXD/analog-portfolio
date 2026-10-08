// TypeScript mirror of contract/schemas/*.schema.json (DATA_CONTRACT.md). Keep in sync.
export type FactorId = `F${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13}`
export type Body = 'earth' | 'moon' | 'mars'
export type TargetBody = 'moon' | 'mars'

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
  // Researcher fields (pipeline/inputs/targets.json)
  id: string // e.g. moon_shackleton_connecting_ridge, mars_jezero
  name: string
  body: TargetBody
  role: string
  anchor: { lat: number; lon: number; lon_convention?: string; source_url: string; note?: string }
  sample_radius_km: number
  values: Record<string, LitEntry>
  context_values?: Record<string, unknown>
  // Engine fields (added by the pipeline)
  status?: 'artemis-9' | 'moon-base-i' | 'mission-site' | 'starship-candidate' | 'ground-truth' | 'optional'
  window_offset?: { bearing_deg: number; distance_km: number } | null
  citations?: string[]
  features?: Partial<Record<FactorId, FeatureValue>>
  card?: Record<string, unknown>
}
export interface TargetsFile {
  _schema?: string
  version?: string
  generated?: string
  contract_version?: string
  mock?: boolean
  body_context?: Partial<Record<TargetBody, Record<string, LitEntry>>>
  targets: Target[]
}

export interface HardFilter { id: string; rule: string; reason: string }
export interface Profile {
  id: string
  code: string
  name: string
  bodies: TargetBody[]
  disabled_for?: Partial<Record<TargetBody, string>>
  weights: Record<string, number>
  theta: number
  nms_radius_km: number
  hard_filters: HardFilter[]
  campaigns?: string[]
}
export interface ProfilesFile {
  contract_version: string
  status?: string
  defaults: Record<string, unknown>
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
  params?: Record<string, unknown>
  layers: Partial<Record<Body, string>>
  ui_label?: string
  ui_copy?: string
}
export interface FactorCopy { ui_label?: string; ui_copy?: string }
export interface FactorsFile { contract_version: string; factors: Factor[]; [k: string]: unknown }

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
  robustness?: { median_rank: number; topk_freq: number; robust: boolean }
  logistics?: { travel_time_min: number | null; airport_km: number | null; nearest_airport: string | null; cost: number }
  known_analog?: string | null
  candidate?: boolean
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
  variants: { id: 'fidelity' | 'balanced' | 'accessible' | 'single-continent'; lambda: number; sites: SiteRef[]; coverage: number }[]
  top_cells?: SiteRef[]
  score_histogram?: { bins: number[]; counts: number[] }
  monte_carlo?: { draws: number; top_k: number; seed: number }
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
