/// <reference lib="webworker" />
// Live scoring worker: decodes the Earth grid once, then re-scores every land cell for the active target, purpose and
// weights with the TS port of the reference engine (src/scoring/engine.ts). Nothing here is hard-coded data.
import { decodeGrid } from '../data'
import { type ScoringConstants, aggregate, clipTargets, minActiveFrac, factorScores, INSUFFICIENT_CODE, NCELLS, prepareEarth, run, type EarthGrid, type RunOutput } from '../scoring/engine'
import type { FactorId, FactorsFile, ProfilesFile } from '../types/contract'
import { continentResolver, gridContinentLookup, type ContinentOf } from '../scoring/continent'
import type { CellDetail, FromWorker, ToWorker } from './protocol'
import { fetchRegions, type Regions } from '../lib/regions'
import type { Portfolio, SiteRef } from '../types/contract'

/** Country / admin-1 for live-built portfolios (lazy, once). */
let regions: Promise<Regions | null> | null = null
let assetBase = ''
async function nameSites(pf: Portfolio | null) {
  if (!pf || !earth) return
  const e = earth
  regions ??= fetchRegions(assetBase, e.cellId).catch(() => null)
  const r = await regions
  if (!r) return
  const fill = (x: SiteRef) => {
    const i = idxOf.get(x.cell_id)
    if (i === undefined) return
    x.country ??= r.country(i) ?? undefined
    x.admin1 ??= r.admin1(i) ?? undefined
  }
  pf.top_cells?.forEach(fill)
  pf.variants.forEach((v) => v.sites.forEach(fill))
}

let earth: EarthGrid | null = null
let factors: FactorsFile | null = null
let profiles: ProfilesFile | null = null
let knownCells = new Map<number, string>()
let constants: ScoringConstants | undefined
let idxOf = new Map<number, number>()
let gridContinent: ContinentOf | null = null
type Scores = ReturnType<typeof factorScores>
type Clips = ReturnType<typeof clipTargets>
/** Per-target factor arrays and Earth-range clips (13 × n Float64 each, ~9 MB on the real grid), kept for the
 *  CACHE_TARGETS most recently used targets (LRU) so switching purpose or weights never recomputes them. */
const CACHE_TARGETS = 3
const sCache = new Map<string, { s: Scores; clips: Clips }>()
function targetCache(key: string, make: () => { s: Scores; clips: Clips }) {
  let hit = sCache.get(key)
  if (hit) sCache.delete(key) // re-insert as most recent
  else hit = make()
  sCache.set(key, hit)
  while (sCache.size > CACHE_TARGETS) sCache.delete(sCache.keys().next().value!)
  return hit
}
let last: { out: RunOutput; s: Scores } | null = null

function cellDetail(cellId: number): CellDetail {
  const i = idxOf.get(cellId)
  const row = Math.floor(cellId / 720)
  const detail: CellDetail = {
    cellId, inGrid: i !== undefined, lat: 89.75 - 0.5 * row, lon: -179.75 + 0.5 * (cellId % 720),
    score: null, percentile: null, filterCode: 0, factorScores: {}, features: {},
  }
  if (i !== undefined && earth) {
    for (const [k, v] of Object.entries(earth.cols)) detail.features[k] = Number.isNaN(v[i]) ? null : v[i]
    if (last) {
      const ok = !!last.out.valid[i]
      detail.score = ok ? last.out.total[i] : null
      detail.percentile = ok ? last.out.pct[i] : null
      detail.filterCode = ok ? last.out.code[i] : INSUFFICIENT_CODE
      detail.coverage = last.out.coverage[i]
      for (const [f, arr] of Object.entries(last.s)) if (arr) detail.factorScores[f as FactorId] = Number.isNaN(arr[i]) ? null : arr[i]
    }
  }
  return detail
}

const post = (m: FromWorker, transfer: Transferable[] = []) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m, transfer)

self.onmessage = async (ev: MessageEvent<ToWorker>) => {
  const m = ev.data
  try {
    if (m.type === 'init') {
      const columns = decodeGrid(m.manifest, m.buffer)
      earth = prepareEarth(columns)
      gridContinent = gridContinentLookup(m.manifest, columns)
      factors = m.factors
      profiles = m.profiles
      knownCells = new Map(m.knownCells)
      constants = m.constants
      assetBase = m.assetBase ?? ''
      regions = null
      idxOf = new Map()
      earth.cellId.forEach((c, i) => idxOf.set(c, i))
      sCache.clear()
      post({ type: 'ready', nCells: earth.n, gridContinent: !!gridContinent })
      return
    }
    if (!earth || !factors || !profiles) throw new Error('worker not initialised')
    if (m.type === 'score') {
      const t0 = performance.now()
      const profile = profiles.profiles.find((p) => p.id === m.profileId)
      if (!profile) throw new Error(`unknown profile ${m.profileId}`)
      const key = `${m.target.id}|${JSON.stringify(m.target.values)}`
      const e = earth, f = factors, tv = m.target.values
      const { s, clips } = targetCache(key, () => ({ s: factorScores(e, tv, m.target.body, f, constants), clips: clipTargets(e, tv, f, constants) }))
      const continentOf = continentResolver(gridContinent, new Map(m.continents))
      const out = run({
        earth, s, clips, targetId: m.target.id, profile, profiles, weights: m.weights,
        knownCells, continentOf: (cid) => continentOf(cid), withPortfolio: m.withPortfolio, body: m.target.body,
      })
      last = { out, s }
      await nameSites(out.portfolio)
      const heat = new Uint8Array(NCELLS).fill(255)
      const filter = new Uint8Array(NCELLS)
      let best = 0
      for (let i = 0; i < earth.n; i++) {
        const c = earth.cellId[i]
        if (!out.valid[i]) { filter[c] = INSUFFICIENT_CODE; continue } // heat stays 255: drawn as "not enough data"
        heat[c] = Math.round(out.total[i] * 100)
        filter[c] = out.code[i]
        if (out.total[i] > best) best = out.total[i]
      }
      const th = out.thresholds
      post({
        type: 'scored', reqId: m.reqId, heat, filter, portfolio: out.portfolio,
        stats: { nCells: earth.n, nScorable: earth.n - out.nInsufficient, nInsufficient: out.nInsufficient, nPass: out.nPass, best, median: th.median, top5: th.top5, top1: th.top1, unknownFilters: out.unknownFilters, ms: performance.now() - t0 },
      }, [heat.buffer, filter.buffer])
      return
    }
    if (m.type === 'cell') {
      post({ type: 'cell', reqId: m.reqId, detail: cellDetail(m.cellId) })
      return
    }
    if (m.type === 'cells') {
      post({ type: 'cells', reqId: m.reqId, details: m.cellIds.map(cellDetail) })
      return
    }
    if (m.type === 'twins') {
      const i = idxOf.get(m.cellId)
      const features: Record<string, number | null> = {}
      if (i === undefined) { post({ type: 'twins', reqId: m.reqId, inGrid: false, results: [], features }); return }
      for (const [k, v] of Object.entries(earth.cols)) features[k] = Number.isNaN(v[i]) ? null : v[i]
      const results = m.targets.map((t) => {
        const key = `${t.id}|${JSON.stringify(t.values)}`
        const e = earth!, f = factors!
        const { s } = targetCache(key, () => ({ s: factorScores(e, t.values, t.body, f, constants), clips: clipTargets(e, t.values, f, constants) }))
        // one-cell aggregate with the engine's own formula (missing-data floor, weighted geometric mean + tie-breaker)
        const one: Partial<Record<FactorId, Float64Array>> = {}
        const fs: Partial<Record<FactorId, number>> = {}
        for (const [f, arr] of Object.entries(s)) if (arr && !Number.isNaN(arr[i])) { one[f as FactorId] = Float64Array.of(arr[i]); fs[f as FactorId] = arr[i] }
        const agg = aggregate(one, m.weights, 1, minActiveFrac(profiles!))
        return { targetId: t.id, score: Number.isNaN(agg.total[0]) ? null : agg.total[0], factorScores: fs }
      })
      post({ type: 'twins', reqId: m.reqId, inGrid: true, results, features })
    }
  } catch (e) {
    post({ type: 'error', reqId: 'reqId' in m ? m.reqId : undefined, message: e instanceof Error ? e.message : String(e) })
  }
}
