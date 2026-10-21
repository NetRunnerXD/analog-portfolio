import type { FactorId, FactorsFile, GridManifest, Portfolio, ProfilesFile, TargetBody } from '../types/contract'

export interface InitMsg {
  type: 'init'
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
export type ToWorker = InitMsg | ScoreMsg | CellMsg

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
export interface ReadyMsg { type: 'ready'; nCells: number; /** earth_features has a continent column */ gridContinent: boolean }
export interface ErrorMsg { type: 'error'; reqId?: number; message: string }
export type FromWorker = ScoredMsg | CellReplyMsg | ReadyMsg | ErrorMsg
