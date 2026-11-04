import type { ScoringConstants } from '../scoring/engine'
import type { FactorId, FactorsFile, GridManifest, Portfolio, ProfilesFile, TargetBody } from '../types/contract'

export interface InitMsg {
  type: 'init'
  /** absolute app base URL (the worker's own URL sits under assets/, so relative paths can't be resolved there) */
  assetBase?: string
  /** targets.json → scoring_constants (v1.2), full-precision clip and range bounds */
  constants?: ScoringConstants
  manifest: GridManifest
  buffer: ArrayBuffer
  factors: FactorsFile
  profiles: ProfilesFile
  knownCells: [number, string][]
}
export interface ScoreMsg {
  type: 'score'
  reqId: number
  target: { id: string; body: TargetBody; values: Partial<Record<FactorId, number | null>> }
  profileId: string
  weights: Record<string, number>
  /** cell_id -> continent known from the shipped portfolio; only used when earth_features has no `continent` column */
  continents: [number, string][]
  /** true: build the three variants too (custom weights). false: heatmap + percentiles only (default weights use the shipped portfolio) */
  withPortfolio: boolean
}
export interface CellMsg { type: 'cell'; reqId: number; cellId: number }
/** Several cells at once from the last scoring run (validation analogs, honest-miss factors). */
export interface CellsMsg { type: 'cells'; reqId: number; cellIds: number[] }
/** Reverse search: score one Earth cell against several targets with the same formulas as forward search. */
export interface TwinsMsg {
  type: 'twins'
  reqId: number
  cellId: number
  targets: { id: string; body: TargetBody; values: Partial<Record<FactorId, number | null>> }[]
  weights: Record<string, number>
}
/** Reverse search against a whole Moon / Mars grid (spec §11.8): grid sent once per body, then cached in the worker. */
export interface PlanetGridPayload { lat: Float64Array; lon: Float64Array; values: Partial<Record<FactorId, Float64Array>>; radiusM: number }
export interface ReverseMsg {
  type: 'reverse'
  reqId: number
  body: TargetBody
  grid?: PlanetGridPayload
  lat: number
  lon: number
  weights: Record<string, number>
  n: number
}
export type ToWorker = InitMsg | ScoreMsg | CellMsg | CellsMsg | TwinsMsg | ReverseMsg

export interface ScoredMsg {
  type: 'scored'
  reqId: number
  /** 720×360 in cell_id order: 0..100 = round(S × 100); 255 = not an Earth land cell in the grid */
  heat: Uint8Array
  /** 720×360: 0 = passes, i > 0 = 1-based index of the first failing hard filter */
  filter: Uint8Array
  portfolio: Portfolio | null
  stats: { nCells: number; nScorable: number; nInsufficient: number; nPass: number; best: number; median: number; top5: number; top1: number; unknownFilters: string[]; ms: number }
}
export interface CellDetail {
  cellId: number
  inGrid: boolean
  lat: number
  lon: number
  score: number | null
  percentile: number | null
  /** 0 passes, 1..n = failing hard filter, INSUFFICIENT_CODE = not enough data to score */
  filterCode: number
  /** present share of the active weight (contract §3.2.6) */
  coverage?: number
  factorScores: Partial<Record<FactorId, number | null>>
  features: Record<string, number | null>
}
export interface CellReplyMsg { type: 'cell'; reqId: number; detail: CellDetail }
export interface CellsReplyMsg { type: 'cells'; reqId: number; details: CellDetail[] }
export interface TwinResult { targetId: string; /** null = insufficient data (< 70% of weight measured) */ score: number | null; factorScores: Partial<Record<FactorId, number>> }
export interface TwinsReplyMsg { type: 'twins'; reqId: number; inGrid: boolean; results: TwinResult[]; features: Record<string, number | null> }
export interface ReadyMsg { type: 'ready'; nCells: number; /** earth_features has a continent column */ gridContinent: boolean }
export interface ErrorMsg { type: 'error'; reqId?: number; message: string }
export interface ReverseReplyMsg {
  type: 'reverse'
  reqId: number
  /** the Earth cell scored (the point's own land cell, else the nearest land cell among its 8 neighbours); null = open water */
  cellId: number | null
  snapped: boolean
  /** the Earth cell fails the body's candidate gate (Mars, contract v1.2 rule 8): forward search scores it 0 for this body */
  gateFail: boolean
  features: Record<string, number | null>
  twins: { lat: number; lon: number; score: number; factorScores: Partial<Record<FactorId, number | null>> }[]
}
export type FromWorker = ScoredMsg | CellReplyMsg | CellsReplyMsg | TwinsReplyMsg | ReverseReplyMsg | ReadyMsg | ErrorMsg
