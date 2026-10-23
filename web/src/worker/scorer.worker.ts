/// <reference lib="webworker" />
// Live scoring worker: decodes the Earth grid once, then re-scores every land cell for the active target, purpose and
// weights with the TS port of the reference engine (src/scoring/engine.ts). Nothing here is hard-coded data.
import { decodeGrid } from '../data'
import { aggregate, clipTargets, factorScores, NCELLS, prepareEarth, run, type EarthGrid, type RunOutput } from '../scoring/engine'
import type { FactorId, FactorsFile, ProfilesFile } from '../types/contract'
import { continentResolver, gridContinentLookup, type ContinentOf } from '../scoring/continent'
import type { CellDetail, FromWorker, ToWorker } from './protocol'

let earth: EarthGrid | null = null
let factors: FactorsFile | null = null
let profiles: ProfilesFile | null = null
let knownCells = new Map<number, string>()
let idxOf = new Map<number, number>()
let gridContinent: ContinentOf | null = null
const sCache = new Map<string, ReturnType<typeof factorScores>>()
let last: { out: RunOutput; s: ReturnType<typeof factorScores> } | null = null

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
      detail.score = last.out.total[i]
      detail.percentile = last.out.pct[i]
      detail.filterCode = last.out.code[i]
      for (const [f, arr] of Object.entries(last.s)) if (arr) detail.factorScores[f as FactorId] = arr[i]
    }
  }
  return detail
}

const post = (m: FromWorker, transfer: Transferable[] = []) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m, transfer)

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const m = ev.data
  try {
    if (m.type === 'init') {
      const columns = decodeGrid(m.manifest, m.buffer)
      earth = prepareEarth(columns)
      gridContinent = gridContinentLookup(m.manifest, columns)
      factors = m.factors
      profiles = m.profiles
      knownCells = new Map(m.knownCells)
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
      let s = sCache.get(key)
      if (!s) { s = factorScores(earth, m.target.values, m.target.body, factors); sCache.set(key, s) }
      const continentOf = continentResolver(gridContinent, new Map(m.continents))
      const out = run({
        earth, s, clips: clipTargets(earth, m.target.values, factors), targetId: m.target.id, profile, profiles, weights: m.weights,
        knownCells, continentOf: (cid) => continentOf(cid),
      })
      last = { out, s }
      const heat = new Uint8Array(NCELLS).fill(255)
      const filter = new Uint8Array(NCELLS)
      let best = 0
      for (let i = 0; i < earth.n; i++) {
        const c = earth.cellId[i]
        heat[c] = Math.round(out.total[i] * 100)
        filter[c] = out.code[i]
        if (out.total[i] > best) best = out.total[i]
      }
      const th = out.portfolio.earth_thresholds!
      post({
        type: 'scored', reqId: m.reqId, heat, filter, portfolio: m.withPortfolio ? out.portfolio : null,
        stats: { nCells: earth.n, nPass: out.nPass, best, median: th.median, top5: th.top5, top1: th.top1, unknownFilters: out.unknownFilters, ms: performance.now() - t0 },
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
        let s = sCache.get(key)
        if (!s) { s = factorScores(earth!, t.values, t.body, factors!); sCache.set(key, s) }
        // one-cell aggregate with the engine's own formula (weighted geometric mean + tie-breaker nudge)
        const one: Partial<Record<FactorId, Float64Array>> = {}
        const fs: Partial<Record<FactorId, number>> = {}
        for (const [f, arr] of Object.entries(s)) if (arr) { one[f as FactorId] = Float64Array.of(arr[i]); fs[f as FactorId] = arr[i] }
        return { targetId: t.id, score: aggregate(one, m.weights, 1).total[0], factorScores: fs }
      })
      post({ type: 'twins', reqId: m.reqId, inGrid: true, results, features })
    }
  } catch (e) {
    post({ type: 'error', reqId: 'reqId' in m ? m.reqId : undefined, message: e instanceof Error ? e.message : String(e) })
  }
}
